/**
 * population/nutrition.ts
 *
 * Handles food consumption and starvation level tracking for a planet's
 * population.  Separated from the main population tick so it can be tested
 * and reasoned about independently.
 *
 * ## Starvation model
 *
 * `starvationLevel` (S) represents how severely the population is starving.
 * It converges towards an **equilibrium** equal to the food shortfall:
 *
 *     equilibrium = 1 − min(1, nutritionalFactor)
 *
 * - With 100 % food → equilibrium = 0   (no starvation)
 * - With  50 % food → equilibrium = 0.5
 * - With  10 % food → equilibrium = 0.9
 * - With   0 % food → equilibrium = 1   (total starvation)
 *
 * S moves towards the equilibrium with a time-constant of
 * `STARVATION_ADJUST_TICKS` ticks (~30 ticks ≈ 1 month), providing an
 * inertia buffer so that a single bad tick doesn't instantly spike
 * mortality.  The downstream mortality formula uses `S⁴` which keeps the
 * non-linearity: partial food shortages cause *some* deaths but not a
 * population collapse.
 */

import { FOOD_PER_PERSON_PER_TICK } from '../constants';
import { agriculturalProductResourceType, queryStorageFacility, removeFromStorageFacility } from '../facilities';
import type { Planet, Population } from '../planet';

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
export function consumeFood(planet: Planet, population: Population, populationTotal: number): NutritionResult {
    // FOOD_PER_PERSON_PER_TICK is already per-tick; compute per-tick demand
    const perTickFoodDemand = populationTotal * FOOD_PER_PERSON_PER_TICK;

    const availableFood = Math.max(
        1.2 * perTickFoodDemand,
        queryStorageFacility(
            planet.government.assets[planet.id]?.storageFacility,
            agriculturalProductResourceType.name,
        ),
    );

    const foodConsumed = removeFromStorageFacility(
        planet.government.assets[planet.id]?.storageFacility,
        agriculturalProductResourceType.name,
        availableFood,
    );

    const nutritionalFactor = foodConsumed / perTickFoodDemand;

    const starvationLevel = updateStarvationLevel(population.starvationLevel, nutritionalFactor);
    population.starvationLevel = starvationLevel;

    return { foodConsumed, nutritionalFactor, starvationLevel };
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
