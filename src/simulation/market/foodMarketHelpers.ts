/**
 * market/foodMarketHelpers.ts
 *
 * Helper functions for initialising and accessing household food buffers
 * and food market state.
 */

import type { FoodBuffer, FoodBufferCohort, FoodBufferDemography, FoodMarket, Occupation, Population } from '../planet';
import { educationLevelKeys, OCCUPATIONS } from '../planet';
import { INITIAL_FOOD_PRICE } from '../constants';

// ---------------------------------------------------------------------------
// Food buffer helpers
// ---------------------------------------------------------------------------

/** Zero food buffer: no stock. */
export const ZERO_FOOD_BUFFER: Readonly<FoodBuffer> = Object.freeze({ foodStock: 0 });

/** Create an empty FoodBufferCohort with all cells zeroed. */
export function emptyFoodBufferCohort(): FoodBufferCohort {
    const fc = {} as FoodBufferCohort;
    for (const l of educationLevelKeys) {
        fc[l] = {} as Record<Occupation, FoodBuffer>;
        for (const o of OCCUPATIONS) {
            fc[l][o] = { foodStock: 0 };
        }
    }
    return fc;
}

/**
 * Get (or lazily initialise) the FoodBufferDemography for a FoodMarket.
 * Ensures the array length matches the population demography length.
 */
export function getFoodBufferDemography(foodMarket: FoodMarket, population: Population): FoodBufferDemography {
    if (!foodMarket.householdFoodBuffers || foodMarket.householdFoodBuffers.length !== population.demography.length) {
        foodMarket.householdFoodBuffers = Array.from({ length: population.demography.length }, () =>
            emptyFoodBufferCohort(),
        );
    }
    return foodMarket.householdFoodBuffers;
}

// ---------------------------------------------------------------------------
// Food market initialisation
// ---------------------------------------------------------------------------

/**
 * Ensure a planet has a FoodMarket object, creating it with sensible defaults
 * if absent.
 */
export function ensureFoodMarket(population: Population, existingMarket?: FoodMarket): FoodMarket {
    if (existingMarket) {
        // Ensure household buffers are initialised
        getFoodBufferDemography(existingMarket, population);
        return existingMarket;
    }
    const market: FoodMarket = {
        foodPrice: INITIAL_FOOD_PRICE,
    };
    getFoodBufferDemography(market, population);
    return market;
}

// ---------------------------------------------------------------------------
// Truncated expectation under lognormal wealth distribution
// ---------------------------------------------------------------------------

/**
 * Compute the expected purchase quantity for a cohort-class under the
 * assumption that wealth is lognormally distributed.
 *
 * E[min(w / price, desiredPurchase)] where w ~ LogNormal(μ_ln, σ_ln²)
 *
 * For the initial implementation we use a simpler mean-field approximation:
 * all members of the cohort-class have exactly meanWealth.  This is exact
 * when wealthVariance = 0 and a reasonable first-order approximation
 * otherwise.
 *
 * TODO: Replace with closed-form truncated lognormal expectation when
 *       variance tracking is well-calibrated.
 */
export function expectedPurchaseQuantity(
    meanWealth: number,
    _wealthVariance: number,
    foodPrice: number,
    desiredPurchase: number,
): number {
    if (foodPrice <= 0 || desiredPurchase <= 0) {
        return 0;
    }
    const affordableQuantity = meanWealth / foodPrice;
    return Math.min(desiredPurchase, Math.max(0, affordableQuantity));
}
