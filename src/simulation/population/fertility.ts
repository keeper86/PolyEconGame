/**
 * population/fertility.ts
 *
 * Birth-rate calculation and newborn generation.  Separated from the main
 * population tick so fertility mechanics can be tested in isolation.
 *
 * ## Starvation → fertility mapping
 *
 * Fertility uses a nonlinear suppression factor `(1 − S^1.5)` so that:
 *   - Small S → small fertility drop   (consistent curvature with mortality)
 *   - Large S → near-collapse of births
 * This is more realistic than a linear reduction because famine affects
 * reproduction disproportionately at high stress levels.
 */

import { TICKS_PER_YEAR } from '../constants';
import type { Environment } from '../planet/planet';
import { stochasticRound } from '../utils/stochasticRound';
import type { Population } from './population';
import { forEachPopulationCohort } from './population';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the population-weighted average starvation level across all
 * cohorts.  Each category's starvationLevel is weighted by its total.
 */
function averageStarvationLevel(population: Population): number {
    let totalPop = 0;
    let weightedStarvation = 0;
    for (const cohort of population.demography) {
        forEachPopulationCohort(cohort, (cat) => {
            if (cat.total > 0) {
                weightedStarvation += cat.starvationLevel * cat.total;
                totalPop += cat.total;
            }
        });
    }
    return totalPop > 0 ? weightedStarvation / totalPop : 0;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum age (inclusive) at which women are considered fertile. */
export const START_FERTILE_AGE = 18;

/** Maximum age (inclusive) at which women are considered fertile. */
export const END_FERTILE_AGE = 45;

/**
 * Baseline lifetime fertility — slightly above replacement to allow for
 * child mortality.  The simulation applies additional reductions from
 * pollution and starvation on top of this.
 */
export const LIFETIME_FERTILITY = 3.0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the fertility reduction factor from pollution (annual, capped at 1).
 * At 100 air pollution this yields a 50 % fertility reduction.
 */
export function fertReductionFromPollution(pollution: Environment['pollution']): number {
    return Math.min(1, pollution.air * 0.01 + pollution.water * 0.002 + pollution.soil * 0.0005);
}

/**
 * Compute the number of births for this tick.
 *
 * @param fertileWomen   estimated number of fertile women in the population
 * @param starvationLevel current starvation level (0–1)
 * @param pollution      planet pollution levels
 * @returns number of newborns to add to age-cohort 0 this tick
 */
export function computeBirthsThisTick(
    fertileWomen: number,
    starvationLevel: number,
    pollution: Environment['pollution'],
): number {
    if (fertileWomen === 0) {
        return 0;
    }

    const fertReduction = fertReductionFromPollution(pollution);
    // Nonlinear starvation suppression: S^1.5 gives steeper drop under severe famine
    const lifetimeFertilityAdjusted =
        LIFETIME_FERTILITY * (1 - Math.pow(starvationLevel, 1.5)) * (1 - 0.5 * fertReduction);

    const birthsPerYear = (lifetimeFertilityAdjusted * fertileWomen) / (END_FERTILE_AGE - START_FERTILE_AGE + 1);

    // Single stochastic round at the end — avoids the systematic downward
    // bias of the previous double-floor which would permanently suppress
    // births on small planets (e.g. expected 0.8 → always 0).
    return stochasticRound(birthsPerYear / TICKS_PER_YEAR);
}

/**
 * Apply births to the population's demography (mutates in place).
 * New-borns are placed into cohort 0 with occupation='education',
 * education='none', skill='novice'.
 */
export function applyBirths(population: Population, birthsThisTick: number): void {
    if (birthsThisTick > 0) {
        const cat = population.demography[0].education.none.novice;
        const prevTotal = cat.total;
        const newTotal = prevTotal + birthsThisTick;
        // Newborns arrive with zero wealth.  Preserve existing aggregate wealth
        // (prevTotal × mean) by scaling the mean down — do NOT touch
        // bank.householdDeposits because no money entered or left the system.
        cat.wealth.mean = prevTotal > 0 ? (prevTotal * cat.wealth.mean) / newTotal : 0;
        cat.total = newTotal;
    }
}

// ---------------------------------------------------------------------------
// Population-level fertility step
// ---------------------------------------------------------------------------

/**
 * Compute and apply births for a single tick.
 *
 * This is the top-level entry point called by the population orchestrator.
 * It combines `computeBirthsThisTick` and `applyBirths` so that the
 * orchestrator does not need to know about fertile-women counts or
 * pollution details.
 */
export function populationBirthsTick(
    population: Population,
    fertileWomen: number,
    pollution: Environment['pollution'],
): void {
    const births = computeBirthsThisTick(fertileWomen, averageStarvationLevel(population), pollution);
    applyBirths(population, births);
}
