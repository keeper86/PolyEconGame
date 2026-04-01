import { test, expect, describe, it } from 'vitest';
import { binHouseholdBids, buildPopulationDemand } from './populationDemand';
import { createEmptyPopulationCohort, forEachPopulationCohort } from '../population/population';
import { groceryServiceResourceType, healthcareServiceResourceType } from '../planet/services';
import { GROCERY_BUFFER_TARGET_TICKS, INITIAL_SERVICE_PRICE, SERVICE_PER_PERSON_PER_TICK } from '../constants';
import type { Planet } from '../planet/planet';
import { makePlanet, makePlanetWithPopulation } from '../utils/testHelper';
import type { BidOrder } from './marketTypes';

test('buildPopulationDemand produces finite reservation prices for empty buffers', () => {
    // Minimal planet stub for the test
    const planet: Planet = makePlanet();

    // create two age cohorts: newborns (age 0) and adults (age 30)
    const newbornCohort = createEmptyPopulationCohort({
        total: 100,
        wealth: { mean: 50, variance: 1 },
        services: {
            grocery: { buffer: 0, starvationLevel: 0 },
            retail: { buffer: 0, starvationLevel: 0 },
            logistics: { buffer: 0, starvationLevel: 0 },
            healthcare: { buffer: 0, starvationLevel: 0 },
            construction: { buffer: 0, starvationLevel: 0 },
            administrative: { buffer: 0, starvationLevel: 0 },
        },
    });
    const adultCohort = createEmptyPopulationCohort({
        total: 100,
        wealth: { mean: 1000, variance: 1 },
        services: {
            grocery: { buffer: 1000, starvationLevel: 0 },
            retail: { buffer: 1000, starvationLevel: 0 },
            logistics: { buffer: 1000, starvationLevel: 0 },
            healthcare: { buffer: 1000, starvationLevel: 0 },
            construction: { buffer: 1000, starvationLevel: 0 },
            administrative: { buffer: 1000, starvationLevel: 0 },
        },
    });

    // demography is an array indexed by age
    planet.population.demography[0] = newbornCohort;
    planet.population.demography[30] = adultCohort;

    const bidsMap = buildPopulationDemand(planet);
    const bids = bidsMap.get(groceryServiceResourceType.name) ?? [];
    expect(bids.length).toBeGreaterThan(0);
    for (const b of bids) {
        expect(typeof b.bidPrice).toBe('number');
        expect(Number.isFinite(b.bidPrice)).toBe(true);
        expect(b.bidPrice).toBeGreaterThanOrEqual(0);
    }
});

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
                        cat.services.grocery.buffer = GROCERY_BUFFER_TARGET_TICKS;
                    }
                }),
            );

            const bids = buildPopulationDemand(planet).get(GROCERY_SERVICE) ?? [];

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

            const bids = buildPopulationDemand(planet).get(GROCERY_SERVICE) ?? [];

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

            const bids = buildPopulationDemand(planet).get(GROCERY_SERVICE) ?? [];

            expect(bids.length).toBe(0);
        });
    });

    describe('healthcare service demand', () => {
        // Set grocery price very cheap so grocery does not consume all budget,
        // leaving wealth available for healthcare.
        const CHEAP_GROCERY_PRICE = 0.0001;

        it('produces positive quantities per cohort', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[GROCERY_SERVICE] = CHEAP_GROCERY_PRICE;
            planet.marketPrices[HEALTHCARE_SERVICE] = 0.01;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 0.02, variance: 0 };
                    }
                }),
            );

            const bids = buildPopulationDemand(planet).get(HEALTHCARE_SERVICE) ?? [];

            for (const bid of bids) {
                expect(bid.quantity).toBeGreaterThan(0);
            }
        });

        it('total demand is positive with large enough population', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[GROCERY_SERVICE] = CHEAP_GROCERY_PRICE;
            planet.marketPrices[HEALTHCARE_SERVICE] = 0.01;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 0.02, variance: 0 };
                    }
                }),
            );

            const bids = buildPopulationDemand(planet).get(HEALTHCARE_SERVICE) ?? [];
            const totalDemand = bids.reduce((s, b) => s + b.quantity, 0);

            expect(totalDemand).toBeGreaterThan(0);
        });

        it('total demand is negligible when healthcare service price is too high to afford any', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[GROCERY_SERVICE] = CHEAP_GROCERY_PRICE;
            planet.marketPrices[HEALTHCARE_SERVICE] = 1_000_000;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 0.02, variance: 0 };
                    }
                }),
            );

            const bids = buildPopulationDemand(planet).get(HEALTHCARE_SERVICE) ?? [];
            const totalDemand = bids.reduce((s, b) => s + b.quantity, 0);

            expect(totalDemand).toBeLessThan(1.1e-3);
        });

        it('returns no bids when all cohorts have zero wealth', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[GROCERY_SERVICE] = CHEAP_GROCERY_PRICE;
            planet.marketPrices[HEALTHCARE_SERVICE] = 0.01;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    cat.wealth = { mean: 0, variance: 0 };
                }),
            );

            const bids = buildPopulationDemand(planet).get(HEALTHCARE_SERVICE) ?? [];

            expect(bids.length).toBe(0);
        });
    });

    it('returns empty array for unknown resource', () => {
        const { planet } = makePlanetWithPopulation({ none: 100 });

        const bids = buildPopulationDemand(planet).get('not-a-real-resource') ?? [];

        expect(bids).toEqual([]);
    });
});

describe('buildPopulationDemand', () => {
    it('grocery consumes budget before healthcare', () => {
        const { planet } = makePlanetWithPopulation({ none: 1_000 });
        // Grocery is expensive — should consume most/all of the wealth
        const groceryPrice = 10;
        const healthcarePrice = 0.01;
        planet.marketPrices[GROCERY_SERVICE] = groceryPrice;
        planet.marketPrices[HEALTHCARE_SERVICE] = healthcarePrice;

        const groceryTarget = GROCERY_BUFFER_TARGET_TICKS * SERVICE_PER_PERSON_PER_TICK;

        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                if (cat.total > 0) {
                    // Wealth just enough for a fraction of grocery — nothing left for healthcare
                    cat.wealth = { mean: groceryPrice * (groceryTarget / 2), variance: 0 };
                    cat.services.grocery.buffer = 0;
                    cat.services.healthcare.buffer = 0;
                }
            }),
        );

        const allBids = buildPopulationDemand(planet);
        const groceryDemand = (allBids.get(GROCERY_SERVICE) ?? []).reduce((s, b) => s + b.quantity, 0);
        const healthcareDemand = (allBids.get(HEALTHCARE_SERVICE) ?? []).reduce((s, b) => s + b.quantity, 0);

        expect(groceryDemand).toBeGreaterThan(0);
        // Healthcare budget is zero since grocery consumed all wealth
        expect(healthcareDemand).toBe(0);
    });

    it('healthcare gets budget when grocery is fully stocked', () => {
        const { planet } = makePlanetWithPopulation({ none: 1_000 });
        planet.marketPrices[GROCERY_SERVICE] = INITIAL_SERVICE_PRICE;
        planet.marketPrices[HEALTHCARE_SERVICE] = INITIAL_SERVICE_PRICE;

        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                if (cat.total > 0) {
                    cat.wealth = { mean: 100, variance: 0 };
                    // Grocery buffer full — no grocery demand, all wealth goes to healthcare
                    cat.services.grocery.buffer = GROCERY_BUFFER_TARGET_TICKS;
                    cat.services.healthcare.buffer = 0;
                }
            }),
        );

        const allBids = buildPopulationDemand(planet);
        const groceryDemand = (allBids.get(GROCERY_SERVICE) ?? []).reduce((s, b) => s + b.quantity, 0);
        const healthcareDemand = (allBids.get(HEALTHCARE_SERVICE) ?? []).reduce((s, b) => s + b.quantity, 0);

        expect(groceryDemand).toBe(0);
        expect(healthcareDemand).toBeGreaterThan(0);
    });

    it('returns empty arrays for all priority services when wealth is zero', () => {
        const { planet } = makePlanetWithPopulation({ none: 1_000 });
        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                cat.wealth = { mean: 0, variance: 0 };
            }),
        );

        const allBids = buildPopulationDemand(planet);
        for (const bids of allBids.values()) {
            expect(bids.length).toBe(0);
        }
    });
});
