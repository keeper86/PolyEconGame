/**
 * population/aging.test.ts
 *
 * Unit tests for the aging / education-progression sub-system.
 */

import { describe, it, expect } from 'vitest';
import { populationAdvanceYear } from './aging';
import { MAX_AGE, reducePopulationCohort } from './population';
import { makePlanet } from '../utils/testHelper';
import type { Cohort, PopulationCategory } from './population';

/** Sum total people in a single cohort across all occupations/education/skill. */
function sumCohort(cohort: Cohort<PopulationCategory>): number {
    return reducePopulationCohort(cohort).total;
}

describe('populationAdvanceYear', () => {
    it('shifts cohort at age N to age N+1', () => {
        const planet = makePlanet();
        planet.population.demography[10].unoccupied.none.novice.total = 100;

        populationAdvanceYear(planet);

        // Age 10 should be empty, age 11 should hold (roughly) 100
        expect(sumCohort(planet.population.demography[10])).toBe(0);
        expect(sumCohort(planet.population.demography[11])).toBe(100);
    });

    it('empties cohort 0 for future births', () => {
        const planet = makePlanet();
        planet.population.demography[0].education.none.novice.total = 50;

        populationAdvanceYear(planet);

        expect(sumCohort(planet.population.demography[0])).toBe(0);
    });

    it('does not create or destroy people for non-education occupations', () => {
        const planet = makePlanet();
        planet.population.demography[30].employed.primary.novice.total = 200;
        planet.population.demography[30].employed.secondary.novice.total = 100;
        const totalBefore = 300;

        populationAdvanceYear(planet);

        let totalAfter = 0;
        for (const c of planet.population.demography) {
            totalAfter += sumCohort(c);
        }
        expect(totalAfter).toBe(totalBefore);
    });

    it('preserves total population for education cohorts (graduates + stayers)', () => {
        // Put a bunch of 8-year-olds in "none" education (about to graduate
        // from elementary school).
        const planet = makePlanet();
        planet.population.demography[8].education.none.novice.total = 1000;
        const totalBefore = 1000;

        populationAdvanceYear(planet);

        let totalAfter = 0;
        for (const c of planet.population.demography) {
            totalAfter += sumCohort(c);
        }
        // Education transitions redistribute but never destroy people
        expect(totalAfter).toBe(totalBefore);
    });

    it('handles empty population gracefully', () => {
        const planet = makePlanet();

        populationAdvanceYear(planet);

        for (const c of planet.population.demography) {
            expect(sumCohort(c)).toBe(0);
        }
    });

    it('people at maxAge-1 move to maxAge', () => {
        const planet = makePlanet();
        planet.population.demography[MAX_AGE - 1].unoccupied.none.novice.total = 10;

        populationAdvanceYear(planet);

        expect(sumCohort(planet.population.demography[MAX_AGE])).toBe(10);
    });

    it('people at maxAge are carried forward (not killed) during year advance', () => {
        const planet = makePlanet();
        planet.population.demography[MAX_AGE].unoccupied.none.novice.total = 5;

        populationAdvanceYear(planet);

        // maxAge people remain — mortality handles killing them per-tick.
        expect(sumCohort(planet.population.demography[MAX_AGE])).toBe(5);
    });

    it('people at maxAge-1 who age to maxAge are merged with existing maxAge', () => {
        const planet = makePlanet();
        planet.population.demography[MAX_AGE].unoccupied.none.novice.total = 3;
        planet.population.demography[MAX_AGE - 1].unoccupied.none.novice.total = 7;

        populationAdvanceYear(planet);

        // 3 existing + 7 aged up = 10
        expect(sumCohort(planet.population.demography[MAX_AGE])).toBe(10);
    });

    it('householdDeposits stays consistent with population wealth after aging', () => {
        const planet = makePlanet();
        // Place people with non-zero wealth across several ages
        planet.population.demography[20].unoccupied.none.novice.total = 500;
        planet.population.demography[20].unoccupied.none.novice.wealth = { mean: 100, variance: 10 };
        planet.population.demography[50].employed.primary.novice.total = 200;
        planet.population.demography[50].employed.primary.novice.wealth = { mean: 300, variance: 20 };
        // Sync householdDeposits to match initial population wealth
        planet.bank.householdDeposits = 500 * 100 + 200 * 300;

        populationAdvanceYear(planet);

        // Recompute expected wealth sum from demography
        let populationWealth = 0;
        for (const cohort of planet.population.demography) {
            for (const occ of ['education', 'employed', 'unoccupied', 'unableToWork'] as const) {
                for (const edu of ['none', 'primary', 'secondary', 'tertiary'] as const) {
                    for (const skill of ['novice', 'professional', 'expert'] as const) {
                        const cat = cohort[occ][edu][skill];
                        populationWealth += cat.total * cat.wealth.mean;
                    }
                }
            }
        }
        expect(planet.bank.householdDeposits).toBeCloseTo(populationWealth, 2);
    });
});
