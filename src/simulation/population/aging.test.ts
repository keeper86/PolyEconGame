/**
 * population/aging.test.ts
 *
 * Unit tests for the aging / education-progression sub-system.
 */

import { describe, it, expect } from 'vitest';
import { populationAdvanceYear } from './aging';
import { MAX_AGE, reducePopulationCohort } from './population';
import { makePopulation } from '../utils/testHelper';
import type { Cohort, PopulationCategory } from './population';

/** Sum total people in a single cohort across all occupations/education/skill. */
function sumCohort(cohort: Cohort<PopulationCategory>): number {
    return reducePopulationCohort(cohort).total;
}

/** Pre-compute total per age for the aging function. */
function totalInCohortArray(demography: Cohort<PopulationCategory>[]): number[] {
    return demography.map((c) => sumCohort(c));
}

describe('populationAdvanceYear', () => {
    it('shifts cohort at age N to age N+1', () => {
        const population = makePopulation();
        population.demography[10].unoccupied.none.novice.total = 100;
        const tic = totalInCohortArray(population.demography);

        populationAdvanceYear(population, tic);

        // Age 10 should be empty, age 11 should hold (roughly) 100
        expect(sumCohort(population.demography[10])).toBe(0);
        expect(sumCohort(population.demography[11])).toBe(100);
    });

    it('empties cohort 0 for future births', () => {
        const population = makePopulation();
        population.demography[0].education.none.novice.total = 50;
        const tic = totalInCohortArray(population.demography);

        populationAdvanceYear(population, tic);

        expect(sumCohort(population.demography[0])).toBe(0);
    });

    it('does not create or destroy people for non-education occupations', () => {
        const population = makePopulation();
        population.demography[30].employed.primary.novice.total = 200;
        population.demography[30].employed.secondary.novice.total = 100;
        const totalBefore = 300;
        const tic = totalInCohortArray(population.demography);

        populationAdvanceYear(population, tic);

        let totalAfter = 0;
        for (const c of population.demography) {
            totalAfter += sumCohort(c);
        }
        expect(totalAfter).toBe(totalBefore);
    });

    it('preserves total population for education cohorts (graduates + stayers)', () => {
        // Put a bunch of 8-year-olds in "none" education (about to graduate
        // from elementary school).
        const population = makePopulation();
        population.demography[8].education.none.novice.total = 1000;
        const totalBefore = 1000;
        const tic = totalInCohortArray(population.demography);

        populationAdvanceYear(population, tic);

        let totalAfter = 0;
        for (const c of population.demography) {
            totalAfter += sumCohort(c);
        }
        // Education transitions redistribute but never destroy people
        expect(totalAfter).toBe(totalBefore);
    });

    it('handles empty population gracefully', () => {
        const population = makePopulation();
        const tic = totalInCohortArray(population.demography);

        populationAdvanceYear(population, tic);

        for (const c of population.demography) {
            expect(sumCohort(c)).toBe(0);
        }
    });

    it('people at maxAge-1 move to maxAge', () => {
        const population = makePopulation();
        population.demography[MAX_AGE - 1].unoccupied.none.novice.total = 10;
        const tic = totalInCohortArray(population.demography);

        populationAdvanceYear(population, tic);

        expect(sumCohort(population.demography[MAX_AGE])).toBe(10);
    });

    it('people at maxAge are carried forward (not killed) during year advance', () => {
        const population = makePopulation();
        population.demography[MAX_AGE].unoccupied.none.novice.total = 5;
        const tic = totalInCohortArray(population.demography);

        populationAdvanceYear(population, tic);

        // maxAge people remain — mortality handles killing them per-tick.
        expect(sumCohort(population.demography[MAX_AGE])).toBe(5);
    });

    it('people at maxAge-1 who age to maxAge are merged with existing maxAge', () => {
        const population = makePopulation();
        population.demography[MAX_AGE].unoccupied.none.novice.total = 3;
        population.demography[MAX_AGE - 1].unoccupied.none.novice.total = 7;
        const tic = totalInCohortArray(population.demography);

        populationAdvanceYear(population, tic);

        // 3 existing + 7 aged up = 10
        expect(sumCohort(population.demography[MAX_AGE])).toBe(10);
    });
});
