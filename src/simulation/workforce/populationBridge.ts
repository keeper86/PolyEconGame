/**
 * workforce/populationBridge.ts
 *
 * Functions that transfer workers between the population demography
 * (Cohort[]) and the workforce system (WorkforceDemography).
 *
 * - hireFromPopulation:   unoccupied → company/government
 * - returnToPopulation:   company/government → unoccupied
 * - retireToPopulation:   company/government → unableToWork
 * - totalUnoccupiedForEdu: count available labour supply
 */

import { MIN_EMPLOYABLE_AGE } from '../constants';
import type { EducationLevelType, Occupation, Planet } from '../planet';
import { DEFAULT_HIRE_AGE_MEAN, RETIREMENT_AGE } from './workforceHelpers';
import { distributeProportionally } from '../utils/distributeProportionally';

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Count total unoccupied people for a given education level across all
 * employable ages (≥ MIN_EMPLOYABLE_AGE) in a planet's population.
 */
export function totalUnoccupiedForEdu(planet: Planet, edu: EducationLevelType): number {
    let total = 0;
    const demography = planet.population.demography;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        total += demography[age][edu]?.unoccupied ?? 0;
    }
    return total;
}

/**
 * Compute the fraction of currently employed workers (company + government)
 * for a given education level that are at or above RETIREMENT_AGE in the
 * population demography.
 *
 * This uses the exact, authoritative age distribution — not the Gaussian
 * approximation stored in the workforce ageMoments — and therefore serves
 * as the ground-truth retirement-eligible fraction.
 *
 * Returns `{ totalEmployed, retirementEligible, fraction }`.
 */
export function employedRetirementFraction(
    planet: Planet,
    edu: EducationLevelType,
): { totalEmployed: number; retirementEligible: number; fraction: number } {
    const demography = planet.population.demography;
    let totalEmployed = 0;
    let retirementEligible = 0;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        const employed = (demography[age][edu]?.company ?? 0) + (demography[age][edu]?.government ?? 0);
        totalEmployed += employed;
        if (age >= RETIREMENT_AGE) {
            retirementEligible += employed;
        }
    }
    const fraction = totalEmployed > 0 ? retirementEligible / totalEmployed : 0;
    return { totalEmployed, retirementEligible, fraction };
}

// ---------------------------------------------------------------------------
// Population → Workforce (hiring)
// ---------------------------------------------------------------------------

/**
 * Remove `count` unoccupied workers of the given education level from the
 * planet's population, spreading removals proportionally across age cohorts.
 * Workers are moved from 'unoccupied' to the specified occupation.
 * Returns the number actually hired (may be less than `count` if supply is short)
 * together with raw age moments (sumAge, sumAgeSq) of the hired workers.
 */
export function hireFromPopulation(
    planet: Planet,
    edu: EducationLevelType,
    count: number,
    occupation: Occupation,
): { count: number; meanAge: number; varAge: number; sumAge: number; sumAgeSq: number } {
    if (count <= 0) {
        return { count: 0, meanAge: DEFAULT_HIRE_AGE_MEAN, varAge: 0, sumAge: 0, sumAgeSq: 0 };
    }

    const demography = planet.population.demography;
    const available = totalUnoccupiedForEdu(planet, edu);
    const toHire = Math.min(count, available);
    if (toHire <= 0) {
        return { count: 0, meanAge: DEFAULT_HIRE_AGE_MEAN, varAge: 0, sumAge: 0, sumAgeSq: 0 };
    }

    // Distribute hires proportionally across employable age cohorts
    let hired = 0;
    let sumAges = 0;
    let sumAgesSq = 0;

    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        const cohort = demography[age];
        const cohortUnoccupied = cohort[edu]?.unoccupied ?? 0;
        if (cohortUnoccupied <= 0) {
            continue;
        }
        const share = Math.floor((cohortUnoccupied / available) * toHire);
        const actual = Math.min(share, cohortUnoccupied);
        cohort[edu].unoccupied -= actual;
        cohort[edu][occupation] += actual;
        hired += actual;
        sumAges += actual * age;
        sumAgesSq += actual * age * age;
    }

    // Handle rounding remainder: pick from youngest employable available
    let remainder = toHire - hired;
    if (remainder > 0) {
        for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
            if (remainder <= 0) {
                break;
            }
            const cohort = demography[age];
            const cohortUnoccupied = cohort[edu]?.unoccupied ?? 0;
            const take = Math.min(remainder, cohortUnoccupied);
            if (take > 0) {
                cohort[edu].unoccupied -= take;
                cohort[edu][occupation] += take;
                hired += take;
                remainder -= take;
                sumAges += take * age;
                sumAgesSq += take * age * age;
            }
        }
    }

    const meanAge = hired > 0 ? sumAges / hired : DEFAULT_HIRE_AGE_MEAN;
    // Population variance: E[age²] - E[age]²
    const varAge = hired > 0 ? Math.max(0, sumAgesSq / hired - meanAge * meanAge) : 0;
    return { count: hired, meanAge, varAge, sumAge: sumAges, sumAgeSq: sumAgesSq };
}

// ---------------------------------------------------------------------------
// Workforce → Population (departing / retiring)
// ---------------------------------------------------------------------------

/**
 * Internal helper: move `count` workers of the given education level from
 * `srcOcc` to `dstOcc` in the planet's population demography.
 *
 * Workers are distributed proportionally across age cohorts based on
 * how many workers of `edu × srcOcc` each cohort has, using the
 * Hamilton (largest-remainder) method for integer rounding.
 *
 * When `preferOlder` is true the initial distribution favours older
 * cohorts for the rounding remainder (used for retirement).  When false,
 * rounding ties are broken by age ascending (used for departures back to
 * the unoccupied pool).
 *
 * If after the initial proportional pass some cohorts couldn't absorb
 * their share (because the population shifted between scheduling and
 * execution), overflow is redistributed in a second pass.  This
 * guarantees that every worker the workforce releases is accounted for
 * in the population, preventing drift between the two models.
 *
 * @returns the number of workers actually moved (may be less than `count`
 *          only if the population truly has fewer workers in `srcOcc`).
 */
function transferInPopulation(
    planet: Planet,
    edu: EducationLevelType,
    count: number,
    srcOcc: Occupation,
    dstOcc: Occupation,
    preferOlder: boolean,
): number {
    if (count <= 0) {
        return 0;
    }

    const demography = planet.population.demography;

    // Compute total available in srcOcc for this edu across all ages
    let totalAvailable = 0;
    for (let age = 0; age < demography.length; age++) {
        totalAvailable += demography[age][edu]?.[srcOcc] ?? 0;
    }

    const toMove = Math.min(count, totalAvailable);
    if (toMove <= 0) {
        return 0;
    }

    // Proportional distribution using Hamilton method
    let moved = 0;
    let overflow = 0;

    // Build per-age weights (available in srcOcc per age)
    const weights: number[] = new Array(demography.length);
    for (let age = 0; age < demography.length; age++) {
        weights[age] = demography[age][edu]?.[srcOcc] ?? 0;
    }

    // Use distributeProportionally. When preferOlder is true we reverse the
    // weight array before calling so that the deterministic index-based
    // tie-breaker favours older ages; then reverse the result back.
    let allocated = distributeProportionally(toMove, preferOlder ? weights.slice().reverse() : weights);
    if (preferOlder) {
        allocated = allocated.slice().reverse();
    }

    // Apply moves, collecting overflow
    for (let age = 0; age < demography.length; age++) {
        const wanted = allocated[age];
        if (wanted <= 0) {
            continue;
        }
        const cohort = demography[age];
        const avail = cohort[edu]?.[srcOcc] ?? 0;
        const actual = Math.min(wanted, avail);
        if (actual > 0) {
            cohort[edu][srcOcc] -= actual;
            cohort[edu][dstOcc] += actual;
            moved += actual;
        }
        overflow += wanted - actual;
    }

    // Redistribute any overflow (from cohorts that couldn't absorb their share)
    while (overflow > 0) {
        let movedThisPass = 0;
        // Scan ages — preferOlder → descending, otherwise ascending
        const start = preferOlder ? demography.length - 1 : 0;
        const end = preferOlder ? -1 : demography.length;
        const step = preferOlder ? -1 : 1;
        for (let age = start; age !== end && overflow > 0; age += step) {
            const cohort = demography[age];
            const avail = cohort[edu]?.[srcOcc] ?? 0;
            const take = Math.min(overflow, avail);
            if (take > 0) {
                cohort[edu][srcOcc] -= take;
                cohort[edu][dstOcc] += take;
                moved += take;
                overflow -= take;
                movedThisPass += take;
            }
        }
        if (movedThisPass === 0) {
            break; // no more capacity
        }
    }

    return moved;
}

/**
 * Return `count` workers of the given education level back to the planet's
 * unoccupied population pool, moving them from the specified occupation.
 * Their `wealthMoments` (if provided) are merged into the destination cells.
 *
 * Workers are distributed proportionally across age cohorts so that cohorts
 * with more employed workers contribute proportionally more returners.
 */
export function returnToPopulation(
    planet: Planet,
    edu: EducationLevelType,
    count: number,
    occupation: Occupation,
): number {
    return transferInPopulation(planet, edu, count, occupation, 'unoccupied', /* preferOlder */ false);
}

/**
 * Retire `count` workers of the given education level into the planet's
 * population as 'unableToWork', moving them from the specified occupation.
 *
 * Only workers at or above RETIREMENT_AGE are removed from the employed
 * population.  If there are fewer retirement-eligible workers than
 * `count`, we take as many as are available (never touching younger
 * workers).  This ensures the population age × occupation distribution
 * stays consistent with the workforce's statistical moments, which
 * model retirement as removing only the upper tail of the age
 * distribution.
 */
export function retireToPopulation(
    planet: Planet,
    edu: EducationLevelType,
    count: number,
    occupation: Occupation,
): number {
    if (count <= 0) {
        return 0;
    }

    const demography = planet.population.demography;

    // Count available workers at retirement-eligible ages
    let availableAtRetirement = 0;
    for (let age = RETIREMENT_AGE; age < demography.length; age++) {
        availableAtRetirement += demography[age][edu]?.[occupation] ?? 0;
    }

    const toMove = Math.min(count, availableAtRetirement);
    if (toMove <= 0) {
        return 0;
    }

    // Build per-age weights restricted to ages ≥ RETIREMENT_AGE
    const weights: number[] = new Array(demography.length).fill(0);
    for (let age = RETIREMENT_AGE; age < demography.length; age++) {
        weights[age] = demography[age][edu]?.[occupation] ?? 0;
    }

    // Use distributeProportionally (preferOlder: reverse trick for tie-breaking)
    let allocated = distributeProportionally(toMove, weights.slice().reverse());
    allocated = allocated.slice().reverse();

    // Apply moves
    let moved = 0;
    let overflow = 0;
    for (let age = RETIREMENT_AGE; age < demography.length; age++) {
        const wanted = allocated[age];
        if (wanted <= 0) {
            continue;
        }
        const cohort = demography[age];
        const avail = cohort[edu]?.[occupation] ?? 0;
        const actual = Math.min(wanted, avail);
        if (actual > 0) {
            cohort[edu][occupation] -= actual;
            cohort[edu].unableToWork += actual;
            moved += actual;
        }
        overflow += wanted - actual;
    }

    // Redistribute overflow (from cohorts that couldn't absorb their share)
    // Scan oldest → youngest within retirement-age range
    while (overflow > 0) {
        let movedThisPass = 0;
        for (let age = demography.length - 1; age >= RETIREMENT_AGE && overflow > 0; age--) {
            const cohort = demography[age];
            const avail = cohort[edu]?.[occupation] ?? 0;
            const take = Math.min(overflow, avail);
            if (take > 0) {
                cohort[edu][occupation] -= take;
                cohort[edu].unableToWork += take;
                moved += take;
                overflow -= take;
                movedThisPass += take;
            }
        }
        if (movedThisPass === 0) {
            break;
        }
    }

    if (moved > 0) {
        // Wealth no longer tracked in the workforce pipeline.
    }
    return moved;
}
