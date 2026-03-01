/**
 * population/aging.test.ts
 *
 * Unit tests for the aging / education-progression sub-system.
 */

import { describe, it, expect } from 'vitest';
import { emptyCohort, sumCohort } from '../populationHelpers';
import type { Cohort, Population } from '../planet';
import { maxAge } from '../planet';
import { populationAdvanceYear } from './aging';

function makePopulation(demography: Cohort[]): Population {
    return { demography, starvationLevel: 0 };
}

function totalInCohortArray(demography: Cohort[]): number[] {
    return demography.map((c) => sumCohort(c));
}

describe('populationAdvanceYear', () => {
    it('shifts cohort at age N to age N+1', () => {
        const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
        demography[10].none.unoccupied = 100;
        const population = makePopulation(demography);
        const tic = totalInCohortArray(demography);

        populationAdvanceYear(population, tic);

        // Age 10 should be empty, age 11 should hold (roughly) 100
        expect(sumCohort(population.demography[10])).toBe(0);
        expect(sumCohort(population.demography[11])).toBe(100);
    });

    it('empties cohort 0 for future births', () => {
        const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
        demography[0].none.education = 50;
        const population = makePopulation(demography);
        const tic = totalInCohortArray(demography);

        populationAdvanceYear(population, tic);

        expect(sumCohort(population.demography[0])).toBe(0);
    });

    it('does not create or destroy people for non-education occupations', () => {
        const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
        demography[30].primary.company = 200;
        demography[30].secondary.government = 100;
        const totalBefore = 300;
        const population = makePopulation(demography);
        const tic = totalInCohortArray(demography);

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
        const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
        demography[8].none.education = 1000;
        const totalBefore = 1000;
        const population = makePopulation(demography);
        const tic = totalInCohortArray(demography);

        populationAdvanceYear(population, tic);

        let totalAfter = 0;
        for (const c of population.demography) {
            totalAfter += sumCohort(c);
        }
        // Education transitions redistribute but never destroy people
        expect(totalAfter).toBe(totalBefore);
    });

    it('handles empty population gracefully', () => {
        const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
        const population = makePopulation(demography);
        const tic = totalInCohortArray(demography);

        populationAdvanceYear(population, tic);

        for (const c of population.demography) {
            expect(sumCohort(c)).toBe(0);
        }
    });

    it('people at maxAge-1 move to maxAge', () => {
        const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
        demography[maxAge - 1].none.unoccupied = 10;
        const population = makePopulation(demography);
        const tic = totalInCohortArray(demography);

        populationAdvanceYear(population, tic);

        expect(sumCohort(population.demography[maxAge])).toBe(10);
    });

    it('people at maxAge are lost (age cap)', () => {
        const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
        demography[maxAge].none.unoccupied = 5;
        const population = makePopulation(demography);
        const tic = totalInCohortArray(demography);

        populationAdvanceYear(population, tic);

        // The loop only processes ages 0..maxAge-1, so maxAge inhabitants
        // are not shifted (they die of old age effectively).
        let totalAfter = 0;
        for (const c of population.demography) {
            totalAfter += sumCohort(c);
        }
        expect(totalAfter).toBe(0);
    });
});
