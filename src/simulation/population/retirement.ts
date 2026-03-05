/**
 * population/retirement.ts
 *
 * Per-tick retirement transition logic.  Workers in employed occupations
 * (company, government) transition to 'unableToWork' based on age.
 *
 * Retirement is handled entirely at the population level — the
 * authoritative demography decides who retires based on a smooth
 * age-dependent rate function.  The workforce sync layer then removes
 * the corresponding headcount from agents' WorkforceDemography, exactly
 * the same way deaths and disabilities are handled.
 *
 * This approach eliminates the Gaussian-approximation drift that occurred
 * when the workforce tried to estimate retirement from statistical
 * moments and then reconcile with the population.
 */

import type { Cohort, Occupation, Population } from '../planet';
import { educationLevelKeys, maxAge, OCCUPATIONS } from '../planet';
import { RETIREMENT_AGE } from '../workforce/workforceHelpers';
import { emptyAccumulator, sumCohort } from './populationHelpers';
import { convertAnnualToPerTick } from './mortality';
import { stochasticRound } from '../utils/stochasticRound';

// ---------------------------------------------------------------------------
// Retirement rate function
// ---------------------------------------------------------------------------

/** Occupations from which people can retire. */
const RETIREMENT_SOURCE_OCCUPATIONS: Occupation[] = ['company', 'government'];

/**
 * Annual retirement probability by age.
 *
 * - Below RETIREMENT_AGE: 0 (no retirement).
 * - At RETIREMENT_AGE: begins at ~30% annual probability.
 * - Ramps linearly to 100% over 5 years beyond RETIREMENT_AGE.
 *
 * This produces a smooth bell-shaped retirement distribution centred
 * around RETIREMENT_AGE, similar to real-world retirement patterns.
 *
 * The function is intentionally aggressive: most workers retire within
 * 1–3 years of reaching RETIREMENT_AGE, with stragglers lasting up to
 * ~5 years.  Combined with per-tick compounding, the effective
 * retirement curve is smooth and realistic.
 */
export function retirementProbByAge(age: number): number {
    if (age < RETIREMENT_AGE) {
        return 0;
    }
    const yearsOver = age - RETIREMENT_AGE;
    // Linear ramp from 0.3 at age 67 to 1.0 at age 72 (over 5 years)
    return Math.min(1, 0.3 + yearsOver * 0.14);
}

/**
 * Per-tick retirement probability for a given age.
 * Converts the annual rate to a per-tick rate via geometric compounding.
 */
export function perTickRetirement(age: number): number {
    const annualProb = retirementProbByAge(age);
    if (annualProb <= 0) {
        return 0;
    }
    return convertAnnualToPerTick(annualProb);
}

// ---------------------------------------------------------------------------
// Per-cohort retirement transition
// ---------------------------------------------------------------------------

/**
 * Apply retirement transitions to a single age-cohort (in place).
 *
 * For each education × employed occupation, a fraction of workers is
 * moved to `unableToWork` based on the age-dependent retirement rate.
 */
export function applyRetirementTransitions(cohort: Cohort, age: number): void {
    const prob = perTickRetirement(age);
    if (prob <= 0) {
        return;
    }

    for (const edu of educationLevelKeys) {
        for (const occ of RETIREMENT_SOURCE_OCCUPATIONS) {
            const count = cohort[edu][occ];
            if (count <= 0) {
                continue;
            }
            const toRetire = stochasticRound(count * prob);
            if (toRetire > 0) {
                cohort[edu][occ] -= toRetire;
                cohort[edu].unableToWork += toRetire;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Population-level retirement step
// ---------------------------------------------------------------------------

/**
 * Apply retirement transitions to every age cohort of a population.
 *
 * - Moves employed workers (company, government) to 'unableToWork'
 *   based on the age-dependent retirement rate.
 * - Records new retirement transitions per education × source-occupation
 *   in `population.tickNewRetirements` for downstream consumption
 *   (workforce sync, snapshots).
 *
 * This is the **only** place where retirement transitions happen.
 */
export function applyRetirement(population: Population): void {
    const tickNewRetirements = emptyAccumulator();

    for (let age = maxAge; age >= 0; age--) {
        const cohort = population.demography[age];
        if (!cohort) {
            continue;
        }
        if (sumCohort(cohort) === 0) {
            continue;
        }

        // Snapshot occupation counts before the transition
        const before: Record<string, Record<string, number>> = {};
        for (const edu of educationLevelKeys) {
            before[edu] = {};
            for (const occ of OCCUPATIONS) {
                before[edu][occ] = cohort[edu][occ];
            }
        }

        applyRetirementTransitions(cohort, age);

        // Record net transitions per edu × source-occ
        for (const edu of educationLevelKeys) {
            for (const occ of RETIREMENT_SOURCE_OCCUPATIONS) {
                const moved = Math.max(0, before[edu][occ] - cohort[edu][occ]);
                if (moved > 0) {
                    tickNewRetirements[edu][occ] += moved;
                }
            }
        }
    }

    population.tickNewRetirements = tickNewRetirements;
}
