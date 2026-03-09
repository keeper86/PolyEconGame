/**
 * population/nutrition.ts
 *
 * Handles food consumption and starvation level tracking for a planet's
 * population.  Separated from the main population tick so it can be tested
 * and reasoned about independently.
 *
 * ## Starvation model
 *
 * `starvationLevel` (S) is a **physiological malnutrition index** in [0, 1].
 * It is NOT an instantaneous food gap — it represents the accumulated bodily
 * state of the population and responds *gradually* to food deficit or surplus:
 *
 *     S_next = S + α × (foodShortfall − S)
 *
 * where α = 1 / STARVATION_ADJUST_TICKS and
 *
 *     foodShortfall = clamp(1 − nutritionalFactor, 0, 1)
 *
 * - With 100 % food → shortfall = 0, S decays towards 0
 * - With  50 % food → shortfall = 0.5, S converges to 0.5
 * - With   0 % food → shortfall = 1,   S converges to 1
 *
 * The 30-tick time-constant (~1 month) ensures that both famine onset and
 * post-famine recovery are gradual, so recovery lag emerges automatically
 * without any additional state variables.
 *
 * Food intake strictly equals available supply — there is no guaranteed
 * over-consumption.  Starvation results purely from supply-demand imbalance.
 */

import { FOOD_PER_PERSON_PER_TICK } from '../constants';
import { forEachPopulationCohort, type Population } from './population';

// ---------------------------------------------------------------------------
// Starvation constants
// ---------------------------------------------------------------------------

/**
 * Number of ticks for S to move ~63 % of the way from its current value
 * to the new equilibrium (exponential approach time-constant).
 * 30 ticks ≈ 1 month.
 */
export const STARVATION_ADJUST_TICKS = 30;

/** Maximum starvation level. */
export const STARVATION_MAX_LEVEL = 1;

// ---------------------------------------------------------------------------
// Nutrition helpers
// ---------------------------------------------------------------------------

export interface NutritionResult {
    /** How much food was actually consumed this tick. */
    foodConsumed: number;
    /** Ratio of food consumed to food demanded (≥ 0). */
    nutritionalFactor: number;
    /** Updated starvation level for the population. */
    starvationLevel: number;
}

/**
 * Compute how much food a planet consumes this tick and update the
 * population's starvation level accordingly.
 *
 * The function *mutates* the planet's storage facility (removes consumed
 * food) and the population's `starvationLevel`.
 */
export function consumeFood(population: Population) {
    population.demography.forEach((cohort) => {
        return forEachPopulationCohort(cohort, (category) => {
            if (category.total === 0) {
                return; // skip empty cells
            }
            const foodDemand = category.total * FOOD_PER_PERSON_PER_TICK;
            const foodConsumed = Math.min(category.foodStock, foodDemand);
            const nutritionalFactor = foodConsumed / foodDemand;
            category.foodStock -= foodConsumed;
            category.starvationLevel = updateStarvationLevel(category.starvationLevel, nutritionalFactor);
        });
    });
}

/**
 * Pure function: compute the next starvation level given the current level
 * and the nutritional factor for this tick.
 *
 * S exponentially approaches the equilibrium shortfall:
 *
 *     equilibrium = clamp(1 − nutritionalFactor, 0, 1)
 *     S_next = S + (equilibrium − S) / STARVATION_ADJUST_TICKS
 *
 * This means:
 * - If food is insufficient, S *rises* towards the shortfall (not to 1).
 * - If food is sufficient (or surplus), S *falls* towards 0.
 * - The 30-tick buffer smooths both directions equally.
 */
export function updateStarvationLevel(currentLevel: number, nutritionalFactor: number): number {
    const equilibrium = Math.max(0, Math.min(STARVATION_MAX_LEVEL, 1 - Math.min(1, nutritionalFactor)));
    const delta = (equilibrium - currentLevel) / STARVATION_ADJUST_TICKS;
    return Math.max(0, Math.min(STARVATION_MAX_LEVEL, currentLevel + delta));
}
