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
 * A demand rule returns the desired total purchase quantity for a whole cohort
 * and its reservation price, given the cohort's current wealth.
 */
type DemandRule = (params: {
    population: number;
    wealthMeanPerPerson: number;
    inventoryPerPerson: number;
    referencePrice: number;
}) => {
    /** Total desired purchase quantity for the cohort (>= 0). */
    quantity: number;
    /** Reservation price (currency / unit). */
    reservationPrice: number;
};
type DemandEntry = { rule: DemandRule };
export const demandRules = new Map<string, DemandEntry>();

function registerDemand(resource: Resource, rule: DemandRule): void {
    demandRules.set(resource.name, { rule });
}
// ------------------------------------------------------------------
// Food (Agricultural Product) — survival priority 1
// ------------------------------------------------------------------
const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
registerDemand(
    agriculturalProductResourceType,
    ({ population, wealthMeanPerPerson, inventoryPerPerson, referencePrice }) => {
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
        const effectiveQtyPerPerson = Math.min(desiredPerPerson, Math.max(0, affordableQty));

        if (!Number.isFinite(effectiveQtyPerPerson) || effectiveQtyPerPerson < 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const reservationPrice = desiredPerPerson > 0 ? wealthMeanPerPerson / desiredPerPerson : 0;
        return { quantity: effectiveQtyPerPerson * population, reservationPrice };
    },
);
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
    const qtyPerTickPerPerson = yearlyQtyPerPerson / TICKS_PER_YEAR;

    return ({ population, wealthMeanPerPerson, referencePrice }) => {
        if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }
        if (!Number.isFinite(wealthMeanPerPerson) || wealthMeanPerPerson <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const budget = wealthMeanPerPerson * wealthPerTick;
        const affordableQtyPerPerson = budget / referencePrice;
        const qtyPerPerson = Math.min(qtyPerTickPerPerson, affordableQtyPerPerson);

        if (qtyPerPerson <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const totalQty = qtyPerPerson * population;

        if (totalQty <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        return { quantity: totalQty, reservationPrice: budget / qtyPerPerson };
    };
}
// Processed Food: secondary staple, strong demand (~0.5 t/person/year).
registerDemand(processedFoodResourceType, makeConsumerGoodRule(0.003, 0.5));
// Beverages: moderate demand (~0.2 t/person/year).
registerDemand(beverageResourceType, makeConsumerGoodRule(0.001, 0.2));
// Clothing: 1 box of 10 garments/person/year.
// Clothing: 0.01 t/person/year.
registerDemand(clothingResourceType, makeConsumerGoodRule(0.002, 0.01));
// Pharmaceuticals: 0.001 t/person/year.
registerDemand(pharmaceuticalResourceType, makeConsumerGoodRule(0.001, 0.001));
// Furniture: 0.02 t/person/year.
registerDemand(furnitureResourceType, makeConsumerGoodRule(0.001, 0.02));
// Consumer Electronics: 0.1 t/person/year.
registerDemand(consumerElectronicsResourceType, makeConsumerGoodRule(0.002, 0.1));
// Vehicles: 0.03 t/person/year.
registerDemand(vehicleResourceType, makeConsumerGoodRule(0.001, 0.03));
// Bricks: 1 t/person/year for construction.
registerDemand(brickResourceType, makeConsumerGoodRule(0.001, 1));
registerDemand(concreteResourceType, makeConsumerGoodRule(0.001, 0.1));
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

    let group = { quantity: 0, filled: 0, cost: 0, priceSum: 0 };
    let binTarget = binSize;
    let runningQty = 0;

    for (let i = 0; i < bids.length; i++) {
        const b = bids[i];
        const bidFilled = filled[i] ?? 0;
        const bidCost = costs[i] ?? 0;
        const fillRatio = b.quantity > 0 ? bidFilled / b.quantity : 0;
        const costRatio = b.quantity > 0 ? bidCost / b.quantity : 0;

        let remaining = b.quantity;
        let filledRemaining = bidFilled;
        let costRemaining = bidCost;

        while (remaining > 0) {
            const spaceInBin = binTarget - runningQty;
            const isLast = i === bids.length - 1 && remaining <= spaceInBin;

            if (remaining <= spaceInBin || isLast) {
                group.quantity += remaining;
                group.filled += filledRemaining;
                group.cost += costRemaining;
                group.priceSum += b.bidPrice * remaining;
                runningQty += remaining;
                remaining = 0;

                if (runningQty >= binTarget) {
                    bins.push({
                        bidPrice: group.priceSum / group.quantity,
                        quantity: group.quantity,
                        filled: group.filled,
                        cost: group.cost,
                    });
                    binTarget += binSize;
                    group = { quantity: 0, filled: 0, cost: 0, priceSum: 0 };
                }
            } else {
                const slice = spaceInBin;
                const sliceFilled = slice * fillRatio;
                const sliceCost = slice * costRatio;
                group.quantity += slice;
                group.filled += sliceFilled;
                group.cost += sliceCost;
                group.priceSum += b.bidPrice * slice;
                runningQty += slice;
                remaining -= slice;
                filledRemaining -= sliceFilled;
                costRemaining -= sliceCost;

                bins.push({
                    bidPrice: group.priceSum / group.quantity,
                    quantity: group.quantity,
                    filled: group.filled,
                    cost: group.cost,
                });
                binTarget += binSize;
                group = { quantity: 0, filled: 0, cost: 0, priceSum: 0 };
            }
        }
    }

    if (group.quantity > 0) {
        bins.push({
            bidPrice: group.priceSum / group.quantity,
            quantity: group.quantity,
            filled: group.filled,
            cost: group.cost,
        });
    }

    return bins;
} // ---------------------------------------------------------------------------
// Build population demand for a single resource, using current cohort wealth
// ---------------------------------------------------------------------------
export function buildPopulationDemandForResource(planet: Planet, resourceName: string): BidOrder[] {
    const entry = demandRules.get(resourceName);
    if (!entry) {
        return [];
    }
    const { rule } = entry;

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

            const { quantity: totalQty, reservationPrice } = rule({
                population: pop,
                wealthMeanPerPerson: wm.mean,
                inventoryPerPerson,
                referencePrice,
            });

            if (!Number.isFinite(totalQty) || totalQty < 0) {
                console.log('warn: non-finite totalQty in buildPopulationDemandForResource', {
                    age,
                    edu,
                    occ,
                    skill,
                    resourceName,
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
