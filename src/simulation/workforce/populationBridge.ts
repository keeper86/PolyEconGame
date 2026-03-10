/**
 * workforce/populationBridge.ts
 *
 * Functions that transfer workers between the population demography
 * (Cohort<PopulationCategory>[]) and the age-resolved workforce system
 * (CohortByOccupation<WorkforceCategory>[]).
 *
 * Population demography shape (new model):
 *   demography[age][occupation][education][skill] → PopulationCategory
 *
 * Workforce demography shape:
 *   workforceDemography[age][education][skill] → WorkforceCategory
 *
 * With both structures indexed by age, transfers are trivially exact:
 * add/subtract at the same age index in both structures.
 *
 * Skills are summed across when computing totals (emulating the pre-skill
 * world) and distributed proportionally when moving population.
 *
 * - hireFromPopulation:     unoccupied → employed (in population)
 * - returnToPopulation:     employed → unoccupied (in population)
 * - returnToPopulationAtAge: same, at a specific age
 * - retireToPopulation:     employed → unableToWork (in population)
 * - totalUnoccupiedForEdu:  count available labour supply
 */

import { MIN_EMPLOYABLE_AGE } from '../constants';
import type { Agent, Planet } from '../planet/planet';

import type { Cohort, EducationLevelType, Occupation, PopulationCategory, Skill } from '../population/population';
import { SKILL, transferPopulation } from '../population/population';
import { educationLevelKeys } from '../population/education';
import { distributeProportionally } from '../utils/distributeProportionally';
import { RETIREMENT_AGE } from './laborMarketTick';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Sum `.total` across all skill levels for a given age × occupation × education.
 */
function sumSkills(
    demography: Cohort<PopulationCategory>[],
    age: number,
    occ: Occupation,
    edu: EducationLevelType,
): number {
    let total = 0;
    for (const skill of SKILL) {
        total += demography[age][occ][edu][skill].total;
    }
    return total;
}

// ---------------------------------------------------------------------------
// Consistency assertion (SIM_DEBUG only)
// ---------------------------------------------------------------------------

/**
 * Assert that the total 'employed' population for each education level
 * matches the sum of workforce (active + departing) across all agents on
 * that planet.
 *
 * This is the population↔workforce balance-sheet check, analogous to the
 * balance-sheet assertion in financialTick.ts.  In debug mode (SIM_DEBUG=1)
 * it throws on mismatch; in production it silently warns.
 */
export function assertPopulationWorkforceConsistency(agents: Map<string, Agent>, planet: Planet, label: string): void {
    for (const edu of educationLevelKeys) {
        // Sum employed in population across all ages and skills
        let popEmployed = 0;
        for (const cohort of planet.population.demography) {
            for (const skill of SKILL) {
                popEmployed += cohort.employed[edu][skill].total;
            }
        }

        // Sum workforce across all agents on this planet.
        // NOTE: departingFired is a *subset tag* on departing — not an
        // additional pool.  Only active + departing are counted.
        let wfTotal = 0;
        for (const agent of agents.values()) {
            const wf = agent.assets[planet.id]?.workforceDemography;
            if (!wf) {
                continue;
            }
            for (let age = 0; age < wf.length; age++) {
                for (const skill of SKILL) {
                    const cell = wf[age][edu][skill];
                    wfTotal += cell.active;
                    wfTotal += cell.departing.reduce((s: number, d: number) => s + d, 0);
                }
            }
        }

        if (popEmployed !== wfTotal) {
            const msg =
                `[populationBridge] workforce consistency violation after ${label}: ` +
                `planet=${planet.id} edu=${edu}: population(employed)=${popEmployed} ≠ workforce=${wfTotal}`;
            if (process.env.SIM_DEBUG === '1') {
                throw new Error(msg);
            }
            console.warn(msg);
        }
    }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Count total unoccupied people for a given education level across all
 * employable ages (≥ MIN_EMPLOYABLE_AGE) in a planet's population.
 * Sums across all skill levels.
 */
export function totalUnoccupiedForEdu(planet: Planet, edu: EducationLevelType): number {
    let total = 0;
    const demography = planet.population.demography;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        total += sumSkills(demography, age, 'unoccupied', edu);
    }
    return total;
}

/**
 * Compute the fraction of currently employed workers for a given education
 * level that are at or above RETIREMENT_AGE in the population demography.
 * Sums across all skill levels.
 */
export function employedRetirementFraction(
    planet: Planet,
    edu: EducationLevelType,
): { totalEmployed: number; retirementEligible: number; fraction: number } {
    const demography = planet.population.demography;
    let totalEmployed = 0;
    let retirementEligible = 0;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        const employed = sumSkills(demography, age, 'employed', edu);
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
 * Remove `count` unoccupied workers of the given education level and skill
 * from the planet's population, spreading removals proportionally across
 * age cohorts.  Workers are moved from 'unoccupied' to 'employed'.
 *
 * Returns the number actually hired (may be less than `count` if supply is
 * short) together with per-age hire counts so the caller can update the
 * age-resolved workforce demography.
 */
export function hireFromPopulation(
    planet: Planet,
    edu: EducationLevelType,
    skill: Skill,
    count: number,
): { count: number; hiredByAge: number[] } {
    if (count <= 0) {
        return { count: 0, hiredByAge: [] };
    }

    const demography = planet.population.demography;

    // Count available unoccupied workers for this edu × skill
    let available = 0;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        available += demography[age].unoccupied[edu][skill].total;
    }

    const toHire = Math.min(count, available);
    if (toHire <= 0) {
        return { count: 0, hiredByAge: [] };
    }

    // Build per-age weights for proportional distribution
    const weights: number[] = new Array(demography.length).fill(0);
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        weights[age] = demography[age].unoccupied[edu][skill].total;
    }

    const allocated = distributeProportionally(toHire, weights);

    // Apply moves and collect per-age hire counts
    const hiredByAge: number[] = new Array(demography.length).fill(0);
    let hired = 0;

    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        const wanted = allocated[age];
        if (wanted <= 0) {
            continue;
        }
        const avail = demography[age].unoccupied[edu][skill].total;
        const actual = Math.min(wanted, avail);
        if (actual > 0) {
            transferPopulation(
                demography,
                { age, occ: 'unoccupied', edu, skill },
                { age, occ: 'employed', edu, skill },
                actual,
            );
            hiredByAge[age] = actual;
            hired += actual;
        }
    }

    // Handle rounding remainder
    let remainder = toHire - hired;
    if (remainder > 0) {
        for (let age = MIN_EMPLOYABLE_AGE; age < demography.length && remainder > 0; age++) {
            const avail = demography[age].unoccupied[edu][skill].total;
            const take = Math.min(remainder, avail);
            if (take > 0) {
                transferPopulation(
                    demography,
                    { age, occ: 'unoccupied', edu, skill },
                    { age, occ: 'employed', edu, skill },
                    take,
                );
                hiredByAge[age] += take;
                hired += take;
                remainder -= take;
            }
        }
    }

    return { count: hired, hiredByAge };
}

// ---------------------------------------------------------------------------
// Workforce → Population (departing / retiring)
// ---------------------------------------------------------------------------

/**
 * Return `count` workers of the given education level back to the planet's
 * unoccupied population pool, moving them from 'employed'.
 *
 * Workers are distributed proportionally across age cohorts and skill
 * levels based on existing employed population counts.
 *
 * Returns the number of workers actually moved.
 */
export function returnToPopulation(planet: Planet, edu: EducationLevelType, count: number): number {
    return transferInPopulation(planet, edu, count, 'employed', 'unoccupied', false);
}

/**
 * Return `count` workers of the given education level at a **specific age**
 * back to the planet's unoccupied population pool, moving them from
 * 'employed'.
 *
 * This is the age-exact variant of `returnToPopulation`.  With age-resolved
 * workforce cohorts, the caller knows exactly which age each departing
 * worker is at, so we can avoid the proportional-distribution approximation
 * and instead do a direct per-age subtraction — zero drift.
 *
 * Workers are distributed proportionally across skill levels at that age.
 *
 * Returns the number of workers actually moved (may be less than `count`
 * if the population at that age has fewer workers than expected).
 */
export function returnToPopulationAtAge(
    planet: Planet,
    edu: EducationLevelType,
    count: number,
    _occupation: Occupation,
    age: number,
): number {
    if (count <= 0 || age < 0 || age >= planet.population.demography.length) {
        return 0;
    }

    const demography = planet.population.demography;
    const srcOcc: Occupation = 'employed';
    const dstOcc: Occupation = 'unoccupied';

    // Distribute across skills proportionally
    const skillWeights: number[] = SKILL.map((s) => demography[age][srcOcc][edu][s].total);
    const skillTotal = skillWeights.reduce((a, b) => a + b, 0);
    const toMove = Math.min(count, skillTotal);
    if (toMove <= 0) {
        if (count > 0) {
            console.warn(
                `[returnToPopulationAtAge] age=${age} edu=${edu}: ` +
                    `requested=${count}, available=${skillTotal}, moved=0`,
            );
        }
        return 0;
    }

    const perSkill = distributeProportionally(toMove, skillWeights);
    let moved = 0;

    for (let si = 0; si < SKILL.length; si++) {
        const skill = SKILL[si];
        const amount = perSkill[si];
        if (amount > 0) {
            const actual = transferPopulation(
                demography,
                { age, occ: srcOcc, edu, skill },
                { age, occ: dstOcc, edu, skill },
                amount,
            ).count;
            moved += actual;
        }
    }

    if (moved < count) {
        console.warn(`[returnToPopulationAtAge] age=${age} edu=${edu}: ` + `requested=${count}, moved=${moved}`);
    }
    return moved;
}

/**
 * Retire `count` workers of the given education level into the planet's
 * population as 'unableToWork', moving them from 'employed'.
 *
 * Only workers at or above RETIREMENT_AGE are removed from the employed
 * population.  Workers are distributed across skill levels proportionally.
 */
export function retireToPopulation(planet: Planet, edu: EducationLevelType, count: number): number {
    if (count <= 0) {
        return 0;
    }

    const demography = planet.population.demography;
    const srcOcc: Occupation = 'employed';
    const dstOcc: Occupation = 'unableToWork';

    // Count available workers at retirement-eligible ages (all skills)
    let availableAtRetirement = 0;
    for (let age = RETIREMENT_AGE; age < demography.length; age++) {
        availableAtRetirement += sumSkills(demography, age, srcOcc, edu);
    }

    const toMove = Math.min(count, availableAtRetirement);
    if (toMove <= 0) {
        return 0;
    }

    // Build per-age weights restricted to ages ≥ RETIREMENT_AGE
    const weights: number[] = new Array(demography.length).fill(0);
    for (let age = RETIREMENT_AGE; age < demography.length; age++) {
        weights[age] = sumSkills(demography, age, srcOcc, edu);
    }

    // Reverse trick for preferring older ages in tie-breaking
    let allocated = distributeProportionally(toMove, weights.slice().reverse());
    allocated = allocated.slice().reverse();

    let moved = 0;
    let overflow = 0;

    for (let age = RETIREMENT_AGE; age < demography.length; age++) {
        const wanted = allocated[age];
        if (wanted <= 0) {
            continue;
        }
        const ageTotal = sumSkills(demography, age, srcOcc, edu);
        const actual = Math.min(wanted, ageTotal);
        if (actual > 0) {
            moved += moveAcrossSkills(demography, age, edu, srcOcc, dstOcc, actual);
        }
        overflow += wanted - actual;
    }

    // Redistribute overflow (oldest → youngest within retirement range)
    while (overflow > 0) {
        let movedThisPass = 0;
        for (let age = demography.length - 1; age >= RETIREMENT_AGE && overflow > 0; age--) {
            const avail = sumSkills(demography, age, srcOcc, edu);
            const take = Math.min(overflow, avail);
            if (take > 0) {
                const m = moveAcrossSkills(demography, age, edu, srcOcc, dstOcc, take);
                moved += m;
                overflow -= m;
                movedThisPass += m;
            }
        }
        if (movedThisPass === 0) {
            break;
        }
    }

    return moved;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Move `count` people at a given age × edu from srcOcc to dstOcc,
 * distributing proportionally across skill levels.
 * Returns the number actually moved.
 */
function moveAcrossSkills(
    demography: Cohort<PopulationCategory>[],
    age: number,
    edu: EducationLevelType,
    srcOcc: Occupation,
    dstOcc: Occupation,
    count: number,
): number {
    const skillWeights = SKILL.map((s) => demography[age][srcOcc][edu][s].total);
    const perSkill = distributeProportionally(count, skillWeights);
    let moved = 0;
    for (let si = 0; si < SKILL.length; si++) {
        const skill = SKILL[si];
        if (perSkill[si] > 0) {
            moved += transferPopulation(
                demography,
                { age, occ: srcOcc, edu, skill },
                { age, occ: dstOcc, edu, skill },
                perSkill[si],
            ).count;
        }
    }
    return moved;
}

/**
 * General-purpose transfer of `count` workers of a given education level
 * from srcOcc to dstOcc across all ages, distributing proportionally.
 * When `preferOlder` is true, tie-breaking favours older ages.
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

    let totalAvailable = 0;
    for (let age = 0; age < demography.length; age++) {
        totalAvailable += sumSkills(demography, age, srcOcc, edu);
    }

    const toMove = Math.min(count, totalAvailable);
    if (toMove <= 0) {
        return 0;
    }

    const weights: number[] = new Array(demography.length).fill(0);
    for (let age = 0; age < demography.length; age++) {
        weights[age] = sumSkills(demography, age, srcOcc, edu);
    }

    let allocated = distributeProportionally(toMove, preferOlder ? weights.slice().reverse() : weights);
    if (preferOlder) {
        allocated = allocated.slice().reverse();
    }

    let moved = 0;
    let overflow = 0;

    for (let age = 0; age < demography.length; age++) {
        const wanted = allocated[age];
        if (wanted <= 0) {
            continue;
        }
        const avail = sumSkills(demography, age, srcOcc, edu);
        const actual = Math.min(wanted, avail);
        if (actual > 0) {
            moved += moveAcrossSkills(demography, age, edu, srcOcc, dstOcc, actual);
        }
        overflow += wanted - actual;
    }

    while (overflow > 0) {
        let movedThisPass = 0;
        const start = preferOlder ? demography.length - 1 : 0;
        const end = preferOlder ? -1 : demography.length;
        const step = preferOlder ? -1 : 1;
        for (let age = start; age !== end && overflow > 0; age += step) {
            const avail = sumSkills(demography, age, srcOcc, edu);
            const take = Math.min(overflow, avail);
            if (take > 0) {
                const m = moveAcrossSkills(demography, age, edu, srcOcc, dstOcc, take);
                moved += m;
                overflow -= m;
                movedThisPass += m;
            }
        }
        if (movedThisPass === 0) {
            break;
        }
    }

    return moved;
}
