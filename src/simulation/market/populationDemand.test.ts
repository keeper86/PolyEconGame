import { describe, expect, it } from 'vitest';

import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK, INITIAL_FOOD_PRICE } from '../constants';
import { clothingResourceType, agriculturalProductResourceType } from '../planet/resources';
import { forEachPopulationCohort } from '../population/population';
import { makePlanetWithPopulation } from '../utils/testHelper';
import { buildPopulationDemandForResource } from './populationDemand';

const FOOD = agriculturalProductResourceType.name;
const CLOTHING = clothingResourceType.name;

describe('buildPopulationDemandForResource', () => {
    describe('food demand', () => {
        it('returns no bids when all cohorts already hold full buffer', () => {
            const { planet } = makePlanetWithPopulation({ none: 1_000 });
            const fullBuffer = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 100, variance: 0 };
                        cat.inventory[FOOD] = fullBuffer * cat.total;
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, FOOD);

            expect(bids.every((b) => b.quantity === 0)).toBe(true);
            expect(bids.length).toBe(0);
        });

        it('returns bids when cohorts have no food and positive wealth', () => {
            const { planet } = makePlanetWithPopulation({ none: 1_000 });
            planet.marketPrices[FOOD] = INITIAL_FOOD_PRICE;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 100, variance: 0 };
                        cat.inventory[FOOD] = 0;
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, FOOD);

            const totalDemand = bids.reduce((s, b) => s + b.quantity, 0);
            expect(totalDemand).toBeGreaterThan(0);
        });

        it('returns no bids when cohorts have zero wealth', () => {
            const { planet } = makePlanetWithPopulation({ none: 1_000 });
            planet.marketPrices[FOOD] = INITIAL_FOOD_PRICE;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    cat.wealth = { mean: 0, variance: 0 };
                    cat.inventory[FOOD] = 0;
                }),
            );

            const bids = buildPopulationDemandForResource(planet, FOOD);

            expect(bids.length).toBe(0);
        });
    });

    describe('clothing demand (pieces resource)', () => {
        it('produces only integer quantities per cohort', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[CLOTHING] = 0.01;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 0.02, variance: 0 };
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, CLOTHING);

            for (const bid of bids) {
                expect(Number.isInteger(bid.quantity)).toBe(true);
                expect(bid.quantity).toBeGreaterThan(0);
            }
        });

        it('total demand is positive with large enough population', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[CLOTHING] = 0.01;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 0.02, variance: 0 };
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, CLOTHING);
            const totalDemand = bids.reduce((s, b) => s + b.quantity, 0);

            expect(totalDemand).toBeGreaterThan(0);
        });

        it('returns no bids when clothing price is too high to afford any', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[CLOTHING] = 1_000_000;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    if (cat.total > 0) {
                        cat.wealth = { mean: 0.02, variance: 0 };
                    }
                }),
            );

            const bids = buildPopulationDemandForResource(planet, CLOTHING);

            expect(bids.length).toBe(0);
        });

        it('returns no bids when all cohorts have zero wealth', () => {
            const { planet } = makePlanetWithPopulation({ none: 50_000 });
            planet.marketPrices[CLOTHING] = 0.01;
            planet.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    cat.wealth = { mean: 0, variance: 0 };
                }),
            );

            const bids = buildPopulationDemandForResource(planet, CLOTHING);

            expect(bids.length).toBe(0);
        });
    });

    it('returns empty array for unknown resource', () => {
        const { planet } = makePlanetWithPopulation({ none: 100 });

        const bids = buildPopulationDemandForResource(planet, 'not-a-real-resource');

        expect(bids).toEqual([]);
    });
});
