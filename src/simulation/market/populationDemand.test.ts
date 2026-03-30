import { describe, expect, it } from 'vitest';

import { FOOD_BUFFER_TARGET_TICKS, INITIAL_SERVICE_PRICE } from '../constants';
import { groceryServiceResourceType, healthcareServiceResourceType } from '../planet/services';
import { forEachPopulationCohort } from '../population/population';
import { makePlanetWithPopulation } from '../utils/testHelper';
import type { BidOrder } from './marketTypes';
import { binHouseholdBids, buildPopulationDemandForResource } from './populationDemand';

function makeBid(bidPrice: number, quantity: number): BidOrder {
    return {
        age: 0,
        edu: 'none',
        occ: 'unoccupied',
        skill: 'novice',
        population: quantity,
        bidPrice,
        quantity,
        wealthMoments: { mean: bidPrice, variance: 0 },
    };
}

describe('binHouseholdBids', () => {
    it('returns empty array for no bids', () => {
        expect(binHouseholdBids([], [], [])).toEqual([]);
    });

    it('returns empty array when all bid quantities are zero', () => {
        const bids = [makeBid(10, 0), makeBid(5, 0)];
        expect(binHouseholdBids(bids, [0, 0], [0, 0])).toEqual([]);
    });

    it('produces exactly 10 bins for uniform bids', () => {
        const bids = Array.from({ length: 100 }, (_, i) => makeBid(100 - i, 10));
        const bins = binHouseholdBids(bids, new Array(100).fill(0), new Array(100).fill(0));
        expect(bins.length).toBe(10);
    });

    it('each bin has equal quantity when bids are uniform', () => {
        const bids = Array.from({ length: 100 }, (_, i) => makeBid(100 - i, 10));
        const totalQty = 1000;
        const bins = binHouseholdBids(bids, new Array(100).fill(0), new Array(100).fill(0));
        const expectedBinQty = totalQty / 10;
        for (const bin of bins) {
            expect(bin.quantity).toBeCloseTo(expectedBinQty, 5);
        }
    });

    it('total quantity across bins equals total input quantity', () => {
        const bids = [makeBid(100, 265), makeBid(90, 14), makeBid(80, 140), makeBid(70, 81)];
        const bins = binHouseholdBids(bids, [0, 0, 0, 0], [0, 0, 0, 0]);
        const inputTotal = bids.reduce((s, b) => s + b.quantity, 0);
        const outputTotal = bins.reduce((s, b) => s + b.quantity, 0);
        expect(outputTotal).toBeCloseTo(inputTotal, 5);
    });

    it('bin quantities are approximately equal even when a single bid is larger than binSize', () => {
        const bids = [makeBid(100, 265), makeBid(90, 14), makeBid(80, 140), makeBid(70, 81)];
        const bins = binHouseholdBids(bids, [0, 0, 0, 0], [0, 0, 0, 0]);
        const totalQty = bids.reduce((s, b) => s + b.quantity, 0);
        const expectedBinQty = totalQty / 10;
        for (const bin of bins) {
            expect(bin.quantity).toBeCloseTo(expectedBinQty, 5);
        }
    });

    it('produces at most 10 bins', () => {
        const bids = [makeBid(50, 7)];
        const bins = binHouseholdBids(bids, [0], [0]);
        expect(bins.length).toBeLessThanOrEqual(10);
    });

    it('bid price is higher in earlier bins (sorted highest bid first)', () => {
        const bids = [makeBid(100, 100), makeBid(80, 100), makeBid(60, 100), makeBid(40, 100), makeBid(20, 100)];
        const bins = binHouseholdBids(bids, new Array(5).fill(0), new Array(5).fill(0));
        for (let i = 1; i < bins.length; i++) {
            expect(bins[i - 1].bidPrice).toBeGreaterThanOrEqual(bins[i].bidPrice);
        }
    });
});

const GROCERY_SERVICE = groceryServiceResourceType.name;
const HEALTHCARE_SERVICE = healthcareServiceResourceType.name;

describe('buildPopulationDemandForResource', () => {
    describe('grocery service demand', () => {
        it('returns no bids when all cohorts already hold full buffer', () => {
            const { planet } = makePlanetWithPopulation({ none: 1_000 });
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 100, variance: 0 };
                        cat.services.grocery.buffer = FOOD_BUFFER_TARGET_TICKS;
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, GROCERY_SERVICE);

            expect(bids.every((b) => b.quantity === 0)).toBe(true);
            expect(bids.length).toBe(0);
        });

        it('returns bids when cohorts have no grocery service and positive wealth', () => {
            const { planet } = makePlanetWithPopulation({ none: 1_000 });
            planet.marketPrices[GROCERY_SERVICE] = INITIAL_SERVICE_PRICE;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 100, variance: 0 };
                        cat.services.grocery.buffer = 0;
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, GROCERY_SERVICE);

            const totalDemand = bids.reduce((s, b) => s + b.quantity, 0);
            expect(totalDemand).toBeGreaterThan(0);
        });

        it('returns no bids when cohorts have zero wealth', () => {
            const { planet } = makePlanetWithPopulation({ none: 1_000 });
            planet.marketPrices[GROCERY_SERVICE] = INITIAL_SERVICE_PRICE;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    cat.wealth = { mean: 0, variance: 0 };
                    cat.services.grocery.buffer = 0;
                }),
            );

            const bids = buildPopulationDemandForResource(planet, GROCERY_SERVICE);

            expect(bids.length).toBe(0);
        });
    });

    describe('healthcare service demand', () => {
        it('produces positive quantities per cohort', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[HEALTHCARE_SERVICE] = 0.01;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 0.02, variance: 0 };
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, HEALTHCARE_SERVICE);

            for (const bid of bids) {
                expect(bid.quantity).toBeGreaterThan(0);
            }
        });

        it('total demand is positive with large enough population', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[HEALTHCARE_SERVICE] = 0.01;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 0.02, variance: 0 };
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, HEALTHCARE_SERVICE);
            const totalDemand = bids.reduce((s, b) => s + b.quantity, 0);

            expect(totalDemand).toBeGreaterThan(0);
        });

        it('total demand is negligible when healthcare service price is too high to afford any', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[HEALTHCARE_SERVICE] = 1_000_000;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 0.02, variance: 0 };
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, HEALTHCARE_SERVICE);
            const totalDemand = bids.reduce((s, b) => s + b.quantity, 0);

            expect(totalDemand).toBeLessThan(1.1e-3); // Slightly more tolerant due to floating point
        });

        it('returns no bids when all cohorts have zero wealth', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[HEALTHCARE_SERVICE] = 0.01;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    cat.wealth = { mean: 0, variance: 0 };
                }),
            );

            const bids = buildPopulationDemandForResource(planet, HEALTHCARE_SERVICE);

            expect(bids.length).toBe(0);
        });
    });

    it('returns empty array for unknown resource', () => {
        const { planet } = makePlanetWithPopulation({ none: 100 });

        const bids = buildPopulationDemandForResource(planet, 'not-a-real-resource');

        expect(bids).toEqual([]);
    });
});
