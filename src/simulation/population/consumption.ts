/**
 * population/consumption.ts
 *
 * Handles service consumption and starvation level tracking for a planet's
 * population.  Separated from the main population tick so it can be tested
 * and reasoned about independently.
 *
 * ## Starvation model
 *
 * `starvationLevel` (S) is a **physiological malnutrition index** in [0, 1].
 * It is NOT an instantaneous service gap — it represents the accumulated bodily
 * state of the population and responds *gradually* to grocery service deficit or surplus:
 *
 *     S_next = S + α × (serviceShortfall − S)
 *
 * where α = 1 / STARVATION_ADJUST_TICKS and
 *
 *     serviceShortfall = clamp(1 − consumptionFactor, 0, 1)
 *
 * - With 100 % grocery service → shortfall = 0, S decays towards 0
 * - With  50 % grocery service → shortfall = 0.5, S converges to 0.5
 * - With   0 % grocery service → shortfall = 1,   S converges to 1
 *
 * The 30-tick time-constant (~1 month) ensures that both famine onset and
 * post-famine recovery are gradual, so recovery lag emerges automatically
 * without any additional state variables.
 *
 * Service intake strictly equals available supply — there is no guaranteed
 * over-consumption.  Starvation results purely from supply-demand imbalance.
 *
 * Note: Only grocery service deficiency causes starvation. Other service
 * deficiencies may have other effects in the future.
 */

import { SERVICE_PER_PERSON_PER_TICK, TICKS_PER_YEAR } from '../constants';
import {
    groceryServiceResourceType,
    healthcareServiceResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
    constructionServiceResourceType,
} from '../planet/services';
import { forEachPopulationCohort, type Population } from './population';

// ---------------------------------------------------------------------------
// Service constants
// ---------------------------------------------------------------------------

/**
 * Number of ticks for S to move ~63 % of the way from its current value
 * to the new equilibrium (exponential approach time-constant).
 * 30 ticks ≈ 1 month.
 */
export const STARVATION_ADJUST_TICKS = 30;

/** Maximum starvation level. */
export const STARVATION_MAX_LEVEL = 1;

/** All service resource types that population consumes */
export const ALL_SERVICE_RESOURCES = [
    groceryServiceResourceType,
    healthcareServiceResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
    constructionServiceResourceType,
] as const;

// ---------------------------------------------------------------------------
// Consumption helpers
// ---------------------------------------------------------------------------

export interface ConsumptionResult {
    /** How much of each service was actually consumed this tick. */
    servicesConsumed: Record<string, number>;
    /** Ratio of grocery service consumed to demanded (≥ 0). */
    consumptionFactor: number;
    /** Updated starvation level for the population. */
    starvationLevel: number;
}

/**
 * Compute how much of each service a population consumes this tick and update the
 * population's starvation level accordingly.
 *
 * The function *mutates* the population's inventory (removes consumed services)
 * and the population's `starvationLevel`.
 */
export function consumeServices(population: Population) {
    population.demography.forEach((cohort) => {
        return forEachPopulationCohort(cohort, (category) => {
            if (category.total === 0) {
                return; // skip empty cells
            }

            const populationCount = category.total;
            const serviceDemand = populationCount * SERVICE_PER_PERSON_PER_TICK;

            // Track grocery service consumption for starvation calculation
            const groceryStock = category.inventory[groceryServiceResourceType.name] ?? 0;
            const groceryConsumed = Math.min(groceryStock, serviceDemand);
            const consumptionFactor = groceryConsumed / serviceDemand;

            // Update grocery service inventory and starvation level
            category.inventory[groceryServiceResourceType.name] = groceryStock - groceryConsumed;
            category.starvationLevel = updateStarvationLevel(category.starvationLevel, consumptionFactor);

            // Consume all other services (but only grocery affects starvation)
            for (const serviceResource of ALL_SERVICE_RESOURCES) {
                if (serviceResource.name === groceryServiceResourceType.name) {
                    continue; // Already handled above
                }

                const serviceStock = category.inventory[serviceResource.name] ?? 0;
                const serviceConsumed = Math.min(serviceStock, serviceDemand);
                category.inventory[serviceResource.name] = serviceStock - serviceConsumed;
            }
        });
    });
}

/**
 * Pure function: compute the next starvation level given the current level
 * and the consumption factor for this tick.
 *
 * S exponentially approaches the equilibrium shortfall:
 *
 *     equilibrium = clamp(1 − consumptionFactor, 0, 1)
 *     S_next = S + (equilibrium − S) / STARVATION_ADJUST_TICKS
 *
 * This means:
 * - If grocery service is insufficient, S *rises* towards the shortfall (not to 1).
 * - If grocery service is sufficient (or surplus), S *falls* towards 0.
 * - The 30-tick buffer smooths both directions equally.
 */
export function updateStarvationLevel(currentLevel: number, consumptionFactor: number): number {
    const equilibrium = Math.max(0, Math.min(STARVATION_MAX_LEVEL, 1 - Math.min(1, consumptionFactor)));
    const delta = (equilibrium - currentLevel) / STARVATION_ADJUST_TICKS;
    return Math.max(0, Math.min(STARVATION_MAX_LEVEL, currentLevel + delta));
}

/**
 * Get the current buffer level for a specific service in a population category.
 * Returns the number of ticks worth of service available.
 */
export function getServiceBufferTicks(
    category: { inventory: Record<string, number> },
    serviceName: string,
    population: number,
): number {
    if (population === 0) {
        return 0;
    }
    const stock = category.inventory[serviceName] ?? 0;
    return stock / (population * SERVICE_PER_PERSON_PER_TICK);
}
