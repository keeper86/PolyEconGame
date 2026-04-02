import {
    SERVICE_PER_PERSON_PER_TICK,
    MIN_SERVICE_BUFFER_FILL,
    GROCERY_BUFFER_TARGET_TICKS,
    HEALTHCARE_BUFFER_TARGET_TICKS,
    ADMINISTRATIVE_BUFFER_TARGET_TICKS,
    LOGISTICS_BUFFER_TARGET_TICKS,
    RETAIL_BUFFER_TARGET_TICKS,
    CONSTRUCTION_BUFFER_TARGET_TICKS,
    EDUCATION_BUFFER_TARGET_TICKS,
} from '../constants';
import type { Planet, Resource } from '../planet/planet';
import {
    groceryServiceResourceType,
    healthcareServiceResourceType,
    administrativeServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
    constructionServiceResourceType,
    educationServiceResourceType,
} from '../planet/services';
import { forEachPopulationCohort } from '../population/population';
import type { ServiceName } from '../population/population';
import type { BidOrder } from './marketTypes';

export type ServiceDefinition = {
    readonly resource: Resource;
    readonly serviceKey: ServiceName;
    readonly bufferTargetTicks: number;
    readonly consumptionRatePerPersonPerTick: number;
    /**
     * Base willingness-to-pay factor at full buffer.
     * Effective reservation price = marketPrice × willingnessMultiplier / bufferFill,
     * capped by MIN_SERVICE_BUFFER_FILL (≈ 100× at empty buffer, 1× at full).
     * > 1 = inelastic (households pay above market), < 1 = elastic.
     */
    readonly willingnessMultiplier: number;
};

export const SERVICE_DEFINITIONS: readonly ServiceDefinition[] = [
    {
        resource: groceryServiceResourceType,
        serviceKey: 'grocery',
        bufferTargetTicks: GROCERY_BUFFER_TARGET_TICKS,
        consumptionRatePerPersonPerTick: SERVICE_PER_PERSON_PER_TICK,
        willingnessMultiplier: 4.0, // survival necessity — highly inelastic
    },
    {
        resource: healthcareServiceResourceType,
        serviceKey: 'healthcare',
        bufferTargetTicks: HEALTHCARE_BUFFER_TARGET_TICKS,
        consumptionRatePerPersonPerTick: SERVICE_PER_PERSON_PER_TICK,
        willingnessMultiplier: 2.0, // essential health — inelastic
    },
    {
        resource: logisticsServiceResourceType,
        serviceKey: 'logistics',
        bufferTargetTicks: LOGISTICS_BUFFER_TARGET_TICKS,
        consumptionRatePerPersonPerTick: SERVICE_PER_PERSON_PER_TICK,
        willingnessMultiplier: 1.0, // necessary — moderately inelastic
    },
    {
        resource: educationServiceResourceType,
        serviceKey: 'education',
        bufferTargetTicks: EDUCATION_BUFFER_TARGET_TICKS,
        consumptionRatePerPersonPerTick: SERVICE_PER_PERSON_PER_TICK,
        willingnessMultiplier: 1.0, // important but deferrable — elastic
    },
    {
        resource: retailServiceResourceType,
        serviceKey: 'retail',
        bufferTargetTicks: RETAIL_BUFFER_TARGET_TICKS,
        consumptionRatePerPersonPerTick: SERVICE_PER_PERSON_PER_TICK,
        willingnessMultiplier: 0.9, // discretionary — unit-elastic
    },
    {
        resource: constructionServiceResourceType,
        serviceKey: 'construction',
        bufferTargetTicks: CONSTRUCTION_BUFFER_TARGET_TICKS,
        consumptionRatePerPersonPerTick: SERVICE_PER_PERSON_PER_TICK / 2,
        willingnessMultiplier: 0.6, // most deferrable — elastic
    },
    {
        resource: administrativeServiceResourceType,
        serviceKey: 'administrative',
        bufferTargetTicks: ADMINISTRATIVE_BUFFER_TARGET_TICKS,
        consumptionRatePerPersonPerTick: SERVICE_PER_PERSON_PER_TICK / 1.5,
        willingnessMultiplier: 0.5, // necessary — mildly inelastic
    },
];

/** O(1) lookup by resource name — used by settlement and consumption. */
export const SERVICE_DEFINITION_BY_RESOURCE_NAME = new Map<string, ServiceDefinition>(
    SERVICE_DEFINITIONS.map((def) => [def.resource.name, def]),
);

// Priority order derived from the definition array order.
export const householdDemandPriority: string[] = SERVICE_DEFINITIONS.map((d) => d.resource.name);

// ---------------------------------------------------------------------------
// Helper to aggregate population bids for UI display
// Bins bids by price using logarithmic spacing so the chart can show
// quantity on the Y-axis and price on the X-axis.
// ---------------------------------------------------------------------------
export function binHouseholdBids(
    bids: BidOrder[],
    filled: number[],
    costs: number[],
    numBins = 20,
): { priceMin: number; priceMax: number; priceMid: number; quantity: number; filled: number; cost: number }[] {
    if (bids.length === 0) {
        return [];
    }

    const eps = 1e-9;
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const b of bids) {
        if (b.quantity <= 0) {
            continue;
        }
        const p = Math.max(eps, b.bidPrice);
        if (p < minPrice) {
            minPrice = p;
        }
        if (p > maxPrice) {
            maxPrice = p;
        }
    }
    if (!Number.isFinite(minPrice)) {
        return [];
    }

    // Single-price case: one bin
    if (minPrice >= maxPrice) {
        let totalQty = 0;
        let totalFilled = 0;
        let totalCost = 0;
        for (let i = 0; i < bids.length; i++) {
            totalQty += bids[i].quantity;
            totalFilled += filled[i] ?? 0;
            totalCost += costs[i] ?? 0;
        }
        if (totalQty <= 0) {
            return [];
        }
        return [
            {
                priceMin: minPrice,
                priceMax: maxPrice,
                priceMid: minPrice,
                quantity: totalQty,
                filled: totalFilled,
                cost: totalCost,
            },
        ];
    }

    // Build log-spaced bin edges
    const logMin = Math.log10(minPrice);
    const logMax = Math.log10(maxPrice);
    const edges: number[] = [];
    for (let i = 0; i <= numBins; i++) {
        edges.push(Math.pow(10, logMin + (i / numBins) * (logMax - logMin)));
    }

    const bins: {
        priceMin: number;
        priceMax: number;
        priceMid: number;
        quantity: number;
        filled: number;
        cost: number;
    }[] = edges.slice(0, -1).map((lo, i) => ({
        priceMin: lo,
        priceMax: edges[i + 1],
        priceMid: Math.sqrt(lo * edges[i + 1]), // geometric mean of bin edges
        quantity: 0,
        filled: 0,
        cost: 0,
    }));

    for (let i = 0; i < bids.length; i++) {
        const b = bids[i];
        if (b.quantity <= 0) {
            continue;
        }
        const price = Math.max(eps, b.bidPrice);

        // Find the bin whose range contains this price (last bin with priceMin <= price)
        let lo = 0;
        let hi = bins.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (bins[mid].priceMin <= price) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        bins[lo].quantity += b.quantity;
        bins[lo].filled += filled[i] ?? 0;
        bins[lo].cost += costs[i] ?? 0;
    }

    return bins.filter((b) => b.quantity > 0);
}

// ---------------------------------------------------------------------------
// Build all population demand in a single sequential-budget pass
//
// For each cohort the services are processed in householdDemandPriority order.
// Each service draws from the cohort's remaining wealth after higher-priority
// purchases, so food always wins over healthcare, healthcare over retail, etc.
// Reservation price = referencePrice × willingnessMultiplier (stable signal).
// ---------------------------------------------------------------------------
export function buildPopulationDemand(planet: Planet): Map<string, BidOrder[]> {
    const allBids = new Map<string, BidOrder[]>(SERVICE_DEFINITIONS.map((def) => [def.resource.name, []]));

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

            let remainingWealth = wm.mean;

            for (const def of SERVICE_DEFINITIONS) {
                if (remainingWealth <= 0) {
                    break;
                }

                if (def.serviceKey === 'education' && occ !== 'education') {
                    continue; // Only education group buys education services
                }

                const referencePrice = planet.marketPrices[def.resource.name];
                if (referencePrice <= 0) {
                    continue;
                }

                const serviceBuffer = category.services[def.serviceKey]?.buffer ?? 0;
                const rate = def.consumptionRatePerPersonPerTick;
                const desiredPerPerson = rate * Math.max(0, def.bufferTargetTicks - serviceBuffer);

                if (desiredPerPerson <= 0) {
                    continue;
                }

                const affordable = remainingWealth / referencePrice;
                const quantityPerPerson = Math.min(desiredPerPerson, affordable);
                if (quantityPerPerson <= 0) {
                    continue;
                }

                remainingWealth -= quantityPerPerson * referencePrice;

                // When the buffer is depleted, households bid above the baseline multiplier
                // so they can match sellers even during scarcity or price-discovery bootstrap.
                // At bufferFill=0 (empty): price = willingnessMultiplier / MIN_SERVICE_BUFFER_FILL (~100× base)
                // At bufferFill=1 (full):  price = willingnessMultiplier × referencePrice (normal)
                const bufferFill = def.bufferTargetTicks > 0 ? Math.min(1, serviceBuffer / def.bufferTargetTicks) : 1;
                const effectiveBufferFill = Math.max(bufferFill, MIN_SERVICE_BUFFER_FILL);
                const reservationPrice = (referencePrice * def.willingnessMultiplier) / effectiveBufferFill;

                const bids = allBids.get(def.resource.name)!;
                bids.push({
                    age,
                    edu,
                    occ,
                    skill,
                    population: pop,
                    bidPrice: reservationPrice,
                    quantity: quantityPerPerson * pop,
                    wealthMoments: wm,
                });
            }
        }),
    );

    return allBids;
}
