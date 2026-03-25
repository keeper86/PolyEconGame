import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK, INITIAL_FOOD_PRICE, TICKS_PER_YEAR } from '../constants';
import type { Planet, Resource } from '../planet/planet';
import {
    agriculturalProductResourceType,
    processedFoodResourceType,
    beverageResourceType,
    clothingResourceType,
    pharmaceuticalResourceType,
    furnitureResourceType,
    consumerElectronicsResourceType,
    vehicleResourceType,
    brickResourceType,
    concreteResourceType,
} from '../planet/resources';
import { forEachPopulationCohort } from '../population/population';
import type { BidOrder } from './marketTypes';

// ---------------------------------------------------------------------------
// Demand rule registry
// ---------------------------------------------------------------------------
/**
 * A demand rule returns the desired per-person purchase quantity and
 * reservation price for a cohort cell, given its *current* (post-prior-
 * settlement) wealth.  Because markets are cleared sequentially in
 * priority order and wealth is debited before moving to the next resource,
 * each rule sees only the wealth the cohort still has available.
 */
type DemandRule = (params: {
    resource: Resource;
    population: number;
    wealthMeanPerPerson: number;
    inventoryPerPerson: number;
    referencePrice: number;
}) => {
    /** Per-person desired purchase quantity (>= 0). */
    quantity: number;
    /** Reservation price (currency / unit). */
    reservationPrice: number;
};
export const demandRules = new Map<string, DemandRule>();
// ------------------------------------------------------------------
// Food (Agricultural Product) — survival priority 1
// ------------------------------------------------------------------
const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
demandRules.set(agriculturalProductResourceType.name, ({ wealthMeanPerPerson, inventoryPerPerson, referencePrice }) => {
    const desiredPerPerson = Math.max(0, foodTargetPerPerson - inventoryPerPerson);
    if (desiredPerPerson <= 0) {
        return { quantity: 0, reservationPrice: 0 };
    }
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        return { quantity: 0, reservationPrice: 0 };
    }
    if (!Number.isFinite(wealthMeanPerPerson) || wealthMeanPerPerson < 0) {
        return { quantity: 0, reservationPrice: 0 };
    }

    const affordableQty = wealthMeanPerPerson / referencePrice;
    const effectiveQty = Math.min(desiredPerPerson, Math.max(0, affordableQty));

    if (!Number.isFinite(effectiveQty) || effectiveQty < 0) {
        return { quantity: 0, reservationPrice: 0 };
    }

    const reservationPrice = desiredPerPerson > 0 ? wealthMeanPerPerson / desiredPerPerson : 0;
    return { quantity: effectiveQty, reservationPrice };
});
// ------------------------------------------------------------------
// Generic discretionary consumer-good demand rule factory.
//
// Households spend a fixed income share on each consumer good,
// capped by a per-person yearly quantity target.  Wealth passed in
// already reflects spending on higher-priority goods settled earlier
// this tick, so no scarcity suppression factor is needed.
//
// incomeSharePerTick  - fraction of remaining per-capita wealth spent
// yearlyQtyPerPerson  - physical cap on how much one person buys/year
// ------------------------------------------------------------------
function makeConsumerGoodRule(wealthPerTick: number, yearlyQtyPerPerson: number): DemandRule {
    const qtyPerTick = yearlyQtyPerPerson / TICKS_PER_YEAR;

    return ({ wealthMeanPerPerson, referencePrice }) => {
        if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }
        if (!Number.isFinite(wealthMeanPerPerson) || wealthMeanPerPerson <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const budget = wealthMeanPerPerson * wealthPerTick;
        const affordableQty = budget / referencePrice;
        const effectiveQty = Math.min(qtyPerTick, affordableQty);

        if (effectiveQty <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        return { quantity: effectiveQty, reservationPrice: budget / effectiveQty };
    };
}
// Processed Food: secondary staple, strong demand (~0.5 t/person/year).
demandRules.set(processedFoodResourceType.name, makeConsumerGoodRule(0.003, 0.5));
// Beverages: moderate demand (~0.2 t/person/year).
demandRules.set(beverageResourceType.name, makeConsumerGoodRule(0.001, 0.2));
// Clothing: 1 box of 10 garments/person/year.
demandRules.set(clothingResourceType.name, makeConsumerGoodRule(0.002, 1));
// Pharmaceuticals: 1 box of 100 pills/person/year.
demandRules.set(pharmaceuticalResourceType.name, makeConsumerGoodRule(0.001, 1));
// Furniture: 0.4 pieces/person/year (durable, 0.05 t each → 0.02 t/year).
demandRules.set(furnitureResourceType.name, makeConsumerGoodRule(0.001, 0.4));
// Consumer Electronics: 50 devices/person/year (0.002 t each → 0.1 t/year).
demandRules.set(consumerElectronicsResourceType.name, makeConsumerGoodRule(0.002, 50));
// Vehicles: 0.02 vehicles/person/year (1.5 t each → 0.03 t/year).
demandRules.set(vehicleResourceType.name, makeConsumerGoodRule(0.001, 0.02));
// Bricks: 500/person/year for construction (0.002 t each → 1 t/year).
demandRules.set(brickResourceType.name, makeConsumerGoodRule(0.001, 500));
demandRules.set(concreteResourceType.name, makeConsumerGoodRule(0.001, 0.1));
/**
 * Priority order for sequential household settlement.
 * Food is cleared and settled first; household wealth is debited before
 * discretionary bids are generated, so no cohort can over-commit.
 * Resources not in this list (agent-only markets) are cleared afterwards.
 */
export const householdDemandPriority: string[] = [
    agriculturalProductResourceType.name,
    processedFoodResourceType.name,
    pharmaceuticalResourceType.name,
    beverageResourceType.name,
    clothingResourceType.name,
    furnitureResourceType.name,
    consumerElectronicsResourceType.name,
]; // ---------------------------------------------------------------------------
// Helper to aggregate population bids for UI display
// ---------------------------------------------------------------------------
export function binHouseholdBids(bids: BidOrder[], filled: number[], costs: number[]) {
    if (bids.length === 0) {
        return [];
    }
    let totalQty = 0;
    for (const b of bids) {
        totalQty += b.quantity;
    }
    if (totalQty === 0) {
        return [];
    }

    const binSize = totalQty / 10;
    const bins = [];

    let runningQty = 0;
    let group = { quantity: 0, filled: 0, cost: 0, priceSum: 0 };
    let binTarget = binSize;

    for (let i = 0; i < bids.length; i++) {
        const b = bids[i];
        group.quantity += b.quantity;
        group.filled += filled[i] ?? 0;
        group.cost += costs[i] ?? 0;
        group.priceSum += b.bidPrice * b.quantity;
        runningQty += b.quantity;

        if (runningQty >= binTarget || i === bids.length - 1) {
            if (group.quantity > 0) {
                bins.push({
                    bidPrice: group.priceSum / group.quantity,
                    quantity: group.quantity,
                    filled: group.filled,
                    cost: group.cost,
                });
            }
            binTarget += binSize;
            group = { quantity: 0, filled: 0, cost: 0, priceSum: 0 };
        }
    }
    return bins;
} // ---------------------------------------------------------------------------
// Build population demand for a single resource, using current cohort wealth
// ---------------------------------------------------------------------------
export function buildPopulationDemandForResource(planet: Planet, resourceName: string): BidOrder[] {
    const rule = demandRules.get(resourceName);
    if (!rule) {
        return [];
    }

    const referencePrice = planet.marketPrices[resourceName] ?? INITIAL_FOOD_PRICE;
    const bidOrders: BidOrder[] = [];

    planet.population.demography.forEach((cohort, age) =>
        forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            const pop = category.total;
            if (pop <= 0) {
                return;
            }

            const wm = category.wealth;
            if (wm.mean < 0 || !Number.isFinite(wm.mean)) {
                throw new Error(
                    `Invalid mean wealth for cohort category: age=${age} occ=${occ} edu=${edu} skill=${skill} meanWealth=${wm.mean}`,
                );
            }

            const inventoryPerPerson = (category.inventory[resourceName] ?? 0) / pop;

            const { quantity: qtyPerPerson, reservationPrice } = rule({
                resource: { name: resourceName } as Resource,
                population: pop,
                wealthMeanPerPerson: wm.mean,
                inventoryPerPerson,
                referencePrice,
            });

            const totalQty = qtyPerPerson * pop;

            if (!Number.isFinite(totalQty) || totalQty < 0) {
                console.log('warn: non-finite totalQty in buildPopulationDemandForResource', {
                    age,
                    edu,
                    occ,
                    skill,
                    resourceName,
                    qtyPerPerson,
                    totalQty,
                });
                return;
            }

            if (totalQty <= 0) {
                return;
            }

            bidOrders.push({
                age,
                edu,
                occ,
                skill,
                population: pop,
                bidPrice: reservationPrice,
                quantity: totalQty,
                wealthMoments: wm,
            });
        }),
    );

    return bidOrders;
}
