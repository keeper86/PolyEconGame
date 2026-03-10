/**
 * population/retirement.ts
 *
 * Per-tick retirement transition logic.  Workers in active occupations
 * (employed, unoccupied, education) transition to 'unableToWork' based
 * on age.
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

import { stochasticRound } from '../utils/stochasticRound';
import { RETIREMENT_AGE } from '../workforce/laborMarketTick';
import type { Population } from './population';
import { convertAnnualToPerTick, forEachPopulationCohort, transferPopulation } from './population';

// ---------------------------------------------------------------------------
// Retirement rate function
// ---------------------------------------------------------------------------

/** Occupations from which people can retire. */
const RETIREMENT_SOURCE_OCCUPATIONS = ['employed', 'unoccupied', 'education'] as const;

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
    // Linear ramp from 0.1 at age 67 to 1.0 at age 72 (over 10 years)
    return Math.min(1, 0.1 + (yearsOver * 0.9) / 15);
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
// Population-level retirement step
// ---------------------------------------------------------------------------

/**
 * Apply retirement transitions to every age cohort of a population.
 *
 * - Moves workers from source occupations (employed, unoccupied,
 *   education) to 'unableToWork' based on the age-dependent retirement
 *   rate.
 * - Records new retirement transitions on each cell's
 *   `retirements.countThisMonth` for downstream consumption
 *   (workforce sync, snapshots).
 *
 * This is the **only** place where retirement transitions happen.
 *
 * Follows the same direct per-cell pattern as disability and mortality:
 * for each occupation × education × skill cell, a fraction retires
 * according to the per-tick retirement probability.
 */
export function applyRetirement(population: Population): void {
    population.demography.forEach((cohort, age) => {
        const prob = perTickRetirement(age);
        if (prob <= 0) {
            return;
        }

        forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            if (!RETIREMENT_SOURCE_OCCUPATIONS.includes(occ as (typeof RETIREMENT_SOURCE_OCCUPATIONS)[number])) {
                return; // skip occupations that don't retire
            }
            if (category.total <= 0) {
                category.retirements.countThisTick = 0;
                return;
            }

            const toRetire = stochasticRound(category.total * prob);
            const retired = transferPopulation(
                population.demography,
                { age, occ, edu, skill },
                { age, occ: 'unableToWork', edu, skill },
                toRetire,
            ).count;
            category.retirements.countThisMonth += retired;
            category.retirements.countThisTick = retired;
        });
    });
}
