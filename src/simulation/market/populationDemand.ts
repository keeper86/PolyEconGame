import { RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY } from '../constants';
import type { ProductionFacility } from '../planet/facility';
import type { Planet } from '../planet/planet';
import {
    administrativeCenter,
    constructionFacility,
    educationCenter,
    groceryChain,
    hospital,
    logisticsHub,
    maintenanceFacility,
    retailChain,
} from '../planet/productionFacilities';
import { forEachPopulationCohort } from '../population/population';
import type { BidOrder } from './marketTypes';
import type { ServiceKey } from './serviceDefinitions';
import { allServices, householdDemandPriority } from './serviceDefinitions';
export { householdDemandPriority, SERVICE_DEFINITIONS } from './serviceDefinitions';
export type { ServiceDefinition, ServiceKey } from './serviceDefinitions';

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

const groceryChainTemplate: ProductionFacility = groceryChain('', '');
const retailTemplate: ProductionFacility = retailChain('', '');
const healthcareTemplate: ProductionFacility = hospital('', '');
const educationTemplate: ProductionFacility = educationCenter('', '');
const constructionTemplate: ProductionFacility = constructionFacility('', '');
const maintenanceTemplate: ProductionFacility = maintenanceFacility('', '');
const administrativeTemplate: ProductionFacility = administrativeCenter('', '');
const logisticsTemplate: ProductionFacility = logisticsHub('', '');

export const serviceFacilityTemplate: Record<ServiceKey, { template: ProductionFacility; produced: number }> = {
    grocery: {
        template: groceryChainTemplate,
        produced: groceryChainTemplate.produces[0].quantity,
    },
    retail: {
        template: retailTemplate,
        produced: retailTemplate.produces[0].quantity,
    },
    healthcare: {
        template: healthcareTemplate,
        produced: healthcareTemplate.produces[0].quantity,
    },
    education: {
        template: educationTemplate,
        produced: educationTemplate.produces[0].quantity,
    },
    construction: {
        template: constructionTemplate,
        produced: constructionTemplate.produces[0].quantity,
    },
    maintenance: {
        template: maintenanceTemplate,
        produced: maintenanceTemplate.produces[0].quantity,
    },
    administrative: {
        template: administrativeTemplate,
        produced: administrativeTemplate.produces[0].quantity,
    },
    logistics: {
        template: logisticsTemplate,
        produced: logisticsTemplate.produces[0].quantity,
    },
};

export function buildPopulationDemand(planet: Planet): Map<string, BidOrder[]> {
    const allBids = new Map<string, BidOrder[]>(householdDemandPriority.map((resourceName) => [resourceName, []]));

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

            for (const service of allServices) {
                if (remainingWealth <= 0) {
                    break;
                }

                if (service.serviceKey === 'education' && occ !== 'education') {
                    continue; // Only education group buys education services
                }

                let currentProductionCost = Number.MAX_SAFE_INTEGER;
                const serviceFacility = serviceFacilityTemplate[service.serviceKey];

                serviceFacility.template.needs.forEach((need) => {
                    currentProductionCost = need.quantity * (planet.marketPrices[need.resource.name] ?? 0);
                });
                currentProductionCost +=
                    (serviceFacility.template.workerRequirement.none ?? 0) +
                    (serviceFacility.template.workerRequirement.primary ?? 0) +
                    (serviceFacility.template.workerRequirement.secondary ?? 0) +
                    (serviceFacility.template.workerRequirement.tertiary ?? 0);
                currentProductionCost /= serviceFacility.produced;

                const referencePrice =
                    Math.min(planet.marketPrices[service.resource.name], currentProductionCost * 2) *
                    RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY;
                if (referencePrice <= 0) {
                    continue;
                }

                const serviceBuffer = category.services[service.serviceKey]?.buffer ?? 0;
                const rate = service.consumptionRatePerPersonPerTick;
                const bufferFillDeficit = Math.max(0, service.bufferTargetTicks - serviceBuffer);
                const willingPrice = referencePrice * (bufferFillDeficit / service.bufferTargetTicks);
                if (willingPrice <= 0) {
                    continue;
                }
                const desiredPerPerson = rate * bufferFillDeficit;

                if (desiredPerPerson <= 0) {
                    continue;
                }

                const affordable = remainingWealth / willingPrice;
                const quantityPerPerson = Math.min(desiredPerPerson, affordable);

                if (quantityPerPerson <= 0) {
                    continue;
                }

                remainingWealth -= quantityPerPerson * willingPrice;

                const bids = allBids.get(service.resource.name)!;
                bids.push({
                    age,
                    edu,
                    occ,
                    skill,
                    population: pop,
                    bidPrice: willingPrice,
                    quantity: quantityPerPerson * pop,
                    wealthMoments: wm,
                });
            }
        }),
    );

    return allBids;
}
