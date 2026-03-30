import {
    SERVICE_PER_PERSON_PER_TICK,
    INITIAL_SERVICE_PRICE,
    GROCERY_BUFFER_TARGET_TICKS,
    HEALTHCARE_BUFFER_TARGET_TICKS,
    ADMINISTRATIVE_BUFFER_TARGET_TICKS,
    LOGISTICS_BUFFER_TARGET_TICKS,
    RETAIL_BUFFER_TARGET_TICKS,
    CONSTRUCTION_BUFFER_TARGET_TICKS,
    HEALTHCARE_STARVATION_SUPPRESSION,
    LOGISTICS_STARVATION_SUPPRESSION,
    ADMINISTRATIVE_STARVATION_SUPPRESSION,
    RETAIL_STARVATION_SUPPRESSION,
    CONSTRUCTION_STARVATION_SUPPRESSION,
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
 * A demand rule returns the desired total purchase quantity for a cohort
 * and its reservation price, given the cohort's current state.
 *
 * `groceryStarvationLevel` [0, 1] carries the accumulated physiological
 * deprivation of the cohort.  Non-grocery rules use it to suppress demand:
 * starving households redirect all spending toward food and stop buying
 * discretionary services.
 */
type DemandRule = (params: {
    population: number;
    wealthMeanPerPerson: number;
    inventoryPerPerson: number;
    referencePrice: number;
    /** Accumulated grocery starvation level [0, 1] from the cohort state. */
    groceryStarvationLevel: number;
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

// ---------------------------------------------------------------------------
// Civil-only service demand rules
// Population is the sole buyer in these markets.
// ---------------------------------------------------------------------------

/**
 * Grocery service — the survival necessity.
 *
 * Households target a 3-month buffer.  No starvation suppression applies
 * (this IS the service that drives starvation).  Reservation price grows
 * proportionally with wealth, reflecting willingness to pay for food.
 */
registerDemand(
    groceryServiceResourceType,
    ({ population, wealthMeanPerPerson, inventoryPerPerson, referencePrice }) => {
        const targetPerPerson = GROCERY_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK;
        const desiredPerPerson = Math.max(0, targetPerPerson - inventoryPerPerson);
        if (desiredPerPerson <= 0 || referencePrice <= 0 || wealthMeanPerPerson < 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const quantityPerPerson = Math.min(desiredPerPerson, wealthMeanPerPerson / referencePrice);
        const reservationPrice = wealthMeanPerPerson / desiredPerPerson;
        return { quantity: quantityPerPerson * population, reservationPrice };
    },
);

/**
 * Healthcare service — medical care and treatment.
 *
 * Health needs persist even under food scarcity, but starving cohorts
 * inevitably deprioritise medical spending.
 * Suppression: {@link HEALTHCARE_STARVATION_SUPPRESSION} (30 % at full starvation).
 */
registerDemand(
    healthcareServiceResourceType,
    ({ population, wealthMeanPerPerson, inventoryPerPerson, referencePrice, groceryStarvationLevel }) => {
        const suppression = 1 - HEALTHCARE_STARVATION_SUPPRESSION * groceryStarvationLevel;
        const targetPerPerson = HEALTHCARE_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK * suppression;
        const desiredPerPerson = Math.max(0, targetPerPerson - inventoryPerPerson);
        if (desiredPerPerson <= 0 || referencePrice <= 0 || wealthMeanPerPerson < 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const quantityPerPerson = Math.min(desiredPerPerson, wealthMeanPerPerson / referencePrice);
        const reservationPrice = wealthMeanPerPerson / desiredPerPerson;
        return { quantity: quantityPerPerson * population, reservationPrice };
    },
);

/**
 * Retail service — consumer shopping for goods and personal items.
 *
 * Purely discretionary; the first service cut when starvation rises.
 * Suppression: {@link RETAIL_STARVATION_SUPPRESSION} (80 % at full starvation).
 */
registerDemand(
    retailServiceResourceType,
    ({ population, wealthMeanPerPerson, inventoryPerPerson, referencePrice, groceryStarvationLevel }) => {
        const suppression = 1 - RETAIL_STARVATION_SUPPRESSION * groceryStarvationLevel;
        const targetPerPerson = RETAIL_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK * suppression;
        const desiredPerPerson = Math.max(0, targetPerPerson - inventoryPerPerson);
        if (desiredPerPerson <= 0 || referencePrice <= 0 || wealthMeanPerPerson < 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const quantityPerPerson = Math.min(desiredPerPerson, wealthMeanPerPerson / referencePrice);
        const reservationPrice = wealthMeanPerPerson / desiredPerPerson;
        return { quantity: quantityPerPerson * population, reservationPrice };
    },
);

// ---------------------------------------------------------------------------
// Agent-shared service demand rules
// Agents (firms) also bid in these markets; household demand is independent
// but prices are jointly determined with agent demand.
// ---------------------------------------------------------------------------

/**
 * Logistics service — transport, freight and distribution for daily life.
 *
 * Households need logistics for deliveries and commuting.  Partially reduced
 * under food scarcity as fewer discretionary trips occur.
 * Also consumed by agents for supply chain operations.
 * Suppression: {@link LOGISTICS_STARVATION_SUPPRESSION} (50 % at full starvation).
 */
registerDemand(
    logisticsServiceResourceType,
    ({ population, wealthMeanPerPerson, inventoryPerPerson, referencePrice, groceryStarvationLevel }) => {
        const suppression = 1 - LOGISTICS_STARVATION_SUPPRESSION * groceryStarvationLevel;
        const targetPerPerson = LOGISTICS_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK * suppression;
        const desiredPerPerson = Math.max(0, targetPerPerson - inventoryPerPerson);
        if (desiredPerPerson <= 0 || referencePrice <= 0 || wealthMeanPerPerson < 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const quantityPerPerson = Math.min(desiredPerPerson, wealthMeanPerPerson / referencePrice);
        const reservationPrice = wealthMeanPerPerson / desiredPerPerson;
        return { quantity: quantityPerPerson * population, reservationPrice };
    },
);

/**
 * Administrative service — government, finance, legal and civic services.
 *
 * Households need administrative services for permits, banking and official
 * matters.  These are deferred but not abandoned when starving.
 * Also consumed by agents for operations and compliance.
 * Suppression: {@link ADMINISTRATIVE_STARVATION_SUPPRESSION} (70 % at full starvation).
 */
registerDemand(
    administrativeServiceResourceType,
    ({ population, wealthMeanPerPerson, inventoryPerPerson, referencePrice, groceryStarvationLevel }) => {
        const suppression = 1 - ADMINISTRATIVE_STARVATION_SUPPRESSION * groceryStarvationLevel;
        const targetPerPerson = ADMINISTRATIVE_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK * suppression;
        const desiredPerPerson = Math.max(0, targetPerPerson - inventoryPerPerson);
        if (desiredPerPerson <= 0 || referencePrice <= 0 || wealthMeanPerPerson < 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const quantityPerPerson = Math.min(desiredPerPerson, wealthMeanPerPerson / referencePrice);
        const reservationPrice = wealthMeanPerPerson / desiredPerPerson;
        return { quantity: quantityPerPerson * population, reservationPrice };
    },
);

/**
 * Construction service — housing maintenance, repair and improvement.
 *
 * The most deferrable household expenditure: housing can deteriorate for
 * months before it becomes critical.  Demand collapses almost entirely
 * when the population is starving.
 * Also consumed by agents for facility building and maintenance.
 * Suppression: {@link CONSTRUCTION_STARVATION_SUPPRESSION} (90 % at full starvation).
 */
registerDemand(
    constructionServiceResourceType,
    ({ population, wealthMeanPerPerson, inventoryPerPerson, referencePrice, groceryStarvationLevel }) => {
        const suppression = 1 - CONSTRUCTION_STARVATION_SUPPRESSION * groceryStarvationLevel;
        const targetPerPerson = CONSTRUCTION_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK * suppression;
        const desiredPerPerson = Math.max(0, targetPerPerson - inventoryPerPerson);
        if (desiredPerPerson <= 0 || referencePrice <= 0 || wealthMeanPerPerson < 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const quantityPerPerson = Math.min(desiredPerPerson, wealthMeanPerPerson / referencePrice);
        const reservationPrice = wealthMeanPerPerson / desiredPerPerson;
        return { quantity: quantityPerPerson * population, reservationPrice };
    },
);

// ---------------------------------------------------------------------------
// Service classification
// ---------------------------------------------------------------------------

/**
 * Services consumed exclusively by the population.
 * Agents do not bid in these markets.
 */
export const CIVIL_ONLY_SERVICE_NAMES: string[] = [
    groceryServiceResourceType.name,
    healthcareServiceResourceType.name,
    retailServiceResourceType.name,
];

/**
 * Services consumed by both population and agents (firms).
 * Household and firm bids compete in the same order book.
 */
export const AGENT_SHARED_SERVICE_NAMES: string[] = [
    logisticsServiceResourceType.name,
    administrativeServiceResourceType.name,
    constructionServiceResourceType.name,
];

// ---------------------------------------------------------------------------
// Priority order for sequential household settlement.
// Services are cleared and settled in this order; household wealth is debited
// before the next service's bids are generated, so no cohort can over-commit.
// Resources not in this list (agent-only markets) are cleared afterwards.
// Order: survival first, discretionary last.
// ---------------------------------------------------------------------------
export const householdDemandPriority: string[] = [
    groceryServiceResourceType.name, // survival: always first
    healthcareServiceResourceType.name, // essential: health
    logisticsServiceResourceType.name, // necessary: daily movement
    administrativeServiceResourceType.name, // necessary: civic participation
    retailServiceResourceType.name, // discretionary: shopping
    constructionServiceResourceType.name, // discretionary: most deferrable
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
                groceryStarvationLevel: category.services.grocery.starvationLevel,
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
