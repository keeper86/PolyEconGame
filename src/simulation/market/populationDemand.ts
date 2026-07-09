import type { ProductionFacility } from '../planet/facility';
import type { Planet } from '../planet/planet';
import { educationCenter, groceryChain, hospital, logisticsHub, retailChain } from '../planet/productionFacilities';
import type { ServiceName } from '../population/population';
import { forEachPopulationCohort } from '../population/population';
import type { BidOrder } from './marketTypes';
import { allServices, householdDemandPriority, serviceKeyOf } from './serviceDefinitions';
export { householdDemandPriority, SERVICE_DEFINITIONS } from './serviceDefinitions';
export type { ServiceDefinition } from './serviceDefinitions';

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

    const edges: number[] = [];
    for (let i = 0; i <= numBins; i++) {
        edges.push(minPrice + (i / numBins) * (maxPrice - minPrice));
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
        priceMid: (lo + edges[i + 1]) / 2,
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
const logisticsTemplate: ProductionFacility = logisticsHub('', '');

export const serviceFacilityTemplate: Record<ServiceName, { template: ProductionFacility; produced: number }> = {
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

                if (serviceKeyOf(service) === 'education' && occ !== 'education') {
                    continue;
                }

                const referencePrice = planet.marketPrices[service.resource.name] ?? 0;

                if (referencePrice <= 0) {
                    continue;
                }

                const serviceBuffer = category.services[serviceKeyOf(service)]?.buffer ?? 0;
                const rate = service.consumptionRatePerPersonPerTick;

                // Apply age multiplier to effective consumption rate
                const ageMult = service.ageMultiplier(age, occ);
                const effectiveRate = rate * ageMult;

                if (effectiveRate <= 0) {
                    continue;
                }

                const bufferFillDeficit = (service.bufferTargetTicks - serviceBuffer) / service.bufferTargetTicks;

                if (bufferFillDeficit <= 0) {
                    continue;
                }

                let willingPrice = referencePrice * (1 + bufferFillDeficit);
                if (willingPrice <= 0) {
                    continue;
                }

                let quantityPerPerson = effectiveRate * service.bufferTargetTicks * bufferFillDeficit;

                if (remainingWealth < 1.2 * effectiveRate * willingPrice) {
                    willingPrice = remainingWealth / effectiveRate / 1.2;
                    quantityPerPerson = 1.2 * effectiveRate;
                } else if (remainingWealth < quantityPerPerson * willingPrice) {
                    const affordableQuantity = remainingWealth / willingPrice;
                    quantityPerPerson = Math.min(quantityPerPerson, affordableQuantity);
                }

                if (willingPrice <= 0 || quantityPerPerson <= 0) {
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
