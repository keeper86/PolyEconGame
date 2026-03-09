/**
 * population/demographics.test.ts
 *
 * Unit tests for demographic statistics calculation.
 */

import { describe, it, expect } from 'vitest';
import { MAX_AGE } from './population';
import { calculateDemographicStats } from './demographics';
import { START_FERTILE_AGE, END_FERTILE_AGE } from './fertility';
import { makePopulation } from '../utils/testHelper';

describe('calculateDemographicStats', () => {
    it('returns zero stats for empty population', () => {
        const pop = makePopulation();
        const stats = calculateDemographicStats(pop);
        expect(stats.populationTotal).toBe(0);
        expect(stats.fertileWomen).toBe(0);
        expect(stats.totalInCohort.every((c) => c === 0)).toBe(true);
    });

    it('counts total population across all ages', () => {
        const pop = makePopulation();
        pop.demography[0].education.none.novice.total = 10;
        pop.demography[20].employed.primary.novice.total = 50;
        pop.demography[80].unableToWork.none.novice.total = 5;
        const stats = calculateDemographicStats(pop);
        expect(stats.populationTotal).toBe(65);
    });

    it('computes totalInCohort per age', () => {
        const pop = makePopulation();
        pop.demography[5].education.none.novice.total = 20;
        pop.demography[5].education.primary.novice.total = 30;
        const stats = calculateDemographicStats(pop);
        expect(stats.totalInCohort[5]).toBe(50);
        expect(stats.totalInCohort[0]).toBe(0);
    });

    it('counts fertile women only in fertile age range (50% of cohort)', () => {
        const pop = makePopulation();
        // age 20 (fertile): 100 people → 50 fertile women
        pop.demography[20].unoccupied.none.novice.total = 100;
        // age 10 (not fertile): 200 people → 0 fertile women
        pop.demography[10].education.none.novice.total = 200;
        const stats = calculateDemographicStats(pop);
        expect(stats.fertileWomen).toBe(50);
    });

    it('includes both boundary ages of fertile range', () => {
        const pop = makePopulation();
        pop.demography[START_FERTILE_AGE].unoccupied.none.novice.total = 100;
        pop.demography[END_FERTILE_AGE].unoccupied.none.novice.total = 100;
        const stats = calculateDemographicStats(pop);
        // Each 100 people → 50 fertile women, both boundaries included
        expect(stats.fertileWomen).toBe(100);
    });

    it('totalInCohort has correct length', () => {
        const pop = makePopulation();
        const stats = calculateDemographicStats(pop);
        expect(stats.totalInCohort.length).toBe(MAX_AGE + 1);
    });
});
