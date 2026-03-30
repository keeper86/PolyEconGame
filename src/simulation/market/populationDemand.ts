import {
    SERVICE_PER_PERSON_PER_TICK,
    INITIAL_SERVICE_PRICE,
    GROCERY_BUFFER_TARGET_TICKS,
    HEALTHCARE_BUFFER_TARGET_TICKS,
    ADMINISTRATIVE_BUFFER_TARGET_TICKS,
    LOGISTICS_BUFFER_TARGET_TICKS,
    RETAIL_BUFFER_TARGET_TICKS,
    CONSTRUCTION_BUFFER_TARGET_TICKS,
} from '../constants';
import type { Planet, Resource } from '../planet/planet';
import {
    groceryServiceResourceType,
    healthcareServiceResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
    constructionServiceResourceType,
} from '../planet/services';
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
// Service demand rules
// ------------------------------------------------------------------

/**
 * Service demand rule factory with service-specific buffer targets.
 * Households try to maintain a buffer of service units (capped at target ticks worth).
 * Only grocery service deficiency causes starvation; other services may have
 * other effects in the future.
 */
function makeServiceDemandRule(bufferTargetTicks: number): DemandRule {
    const serviceTargetPerPerson = bufferTargetTicks * SERVICE_PER_PERSON_PER_TICK;

    return ({ population, wealthMeanPerPerson, inventoryPerPerson, referencePrice }) => {
        const desiredPerPerson = Math.max(0, serviceTargetPerPerson - inventoryPerPerson);
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
    };
}

// Register all service demand rules with their specific buffer targets
registerDemand(groceryServiceResourceType, makeServiceDemandRule(GROCERY_BUFFER_TARGET_TICKS));
registerDemand(healthcareServiceResourceType, makeServiceDemandRule(HEALTHCARE_BUFFER_TARGET_TICKS));
registerDemand(administrativeServiceResourceType, makeServiceDemandRule(ADMINISTRATIVE_BUFFER_TARGET_TICKS));
registerDemand(logisticsServiceResourceType, makeServiceDemandRule(LOGISTICS_BUFFER_TARGET_TICKS));
registerDemand(retailServiceResourceType, makeServiceDemandRule(RETAIL_BUFFER_TARGET_TICKS));
registerDemand(constructionServiceResourceType, makeServiceDemandRule(CONSTRUCTION_BUFFER_TARGET_TICKS));

// Note: Consumer goods have been phased out in favor of services.
// The makeConsumerGoodRule function has been removed as services are now
// the primary consumption layer for the population.
// ---------------------------------------------------------------------------
// Priority order for sequential household settlement.
// Services are cleared and settled first; household wealth is debited before
// discretionary bids are generated, so no cohort can over-commit.
// Resources not in this list (agent-only markets) are cleared afterwards.
// ---------------------------------------------------------------------------
export const householdDemandPriority: string[] = [
    groceryServiceResourceType.name,
    healthcareServiceResourceType.name,
    administrativeServiceResourceType.name,
    logisticsServiceResourceType.name,
    retailServiceResourceType.name,
    constructionServiceResourceType.name,
];

// ---------------------------------------------------------------------------
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
}

// ---------------------------------------------------------------------------
// Build population demand for a single resource, using current cohort wealth
// ---------------------------------------------------------------------------
export function buildPopulationDemandForResource(planet: Planet, resourceName: string): BidOrder[] {
    const entry = demandRules.get(resourceName);
    if (!entry) {
        return [];
    }
    const { rule } = entry;

    const referencePrice = planet.marketPrices[resourceName] ?? INITIAL_SERVICE_PRICE;
    const bidOrders: BidOrder[] = [];

    // Map resource name to service name
    let serviceName: string;
    switch (resourceName) {
        case groceryServiceResourceType.name:
            serviceName = 'grocery';
            break;
        case healthcareServiceResourceType.name:
            serviceName = 'healthcare';
            break;
        case administrativeServiceResourceType.name:
            serviceName = 'administrative';
            break;
        case logisticsServiceResourceType.name:
            serviceName = 'logistics';
            break;
        case retailServiceResourceType.name:
            serviceName = 'retail';
            break;
        case constructionServiceResourceType.name:
            serviceName = 'construction';
            break;
        default:
            // Not a service resource
            return [];
    }

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

            // Calculate inventory per person from service buffer
            // Buffer is stored as ticks worth of service, convert to units per person
            const serviceBuffer = category.services[serviceName as keyof typeof category.services]?.buffer ?? 0;
            const inventoryPerPerson = serviceBuffer * SERVICE_PER_PERSON_PER_TICK;

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
