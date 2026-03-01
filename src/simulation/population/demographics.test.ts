/**
 * population/demographics.test.ts
 *
 * Unit tests for demographic statistics calculation.
 */

import { describe, it, expect } from 'vitest';
import { emptyCohort } from '../populationHelpers';
import { maxAge } from '../planet';
import { calculateDemographicStats } from './demographics';
import { START_FERTILE_AGE, END_FERTILE_AGE } from './fertility';
import type { Population } from '../planet';

function makePopulation(setup: (demography: ReturnType<typeof emptyCohort>[]) => void): Population {
    const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
    setup(demography);
    return { demography, starvationLevel: 0 };
}

describe('calculateDemographicStats', () => {
    it('returns zero stats for empty population', () => {
        const pop = makePopulation(() => {});
        const stats = calculateDemographicStats(pop);
        expect(stats.populationTotal).toBe(0);
        expect(stats.fertileWomen).toBe(0);
        expect(stats.totalInCohort.every((c) => c === 0)).toBe(true);
    });

    it('counts total population across all ages', () => {
        const pop = makePopulation((d) => {
            d[0].none.education = 10;
            d[20].primary.company = 50;
            d[80].none.unableToWork = 5;
        });
        const stats = calculateDemographicStats(pop);
        expect(stats.populationTotal).toBe(65);
    });

    it('computes totalInCohort per age', () => {
        const pop = makePopulation((d) => {
            d[5].none.education = 20;
            d[5].primary.education = 30;
        });
        const stats = calculateDemographicStats(pop);
        expect(stats.totalInCohort[5]).toBe(50);
        expect(stats.totalInCohort[0]).toBe(0);
    });

    it('counts fertile women only in fertile age range (50% of cohort)', () => {
        const pop = makePopulation((d) => {
            // age 20 (fertile): 100 people → 50 fertile women
            d[20].none.unoccupied = 100;
            // age 10 (not fertile): 200 people → 0 fertile women
            d[10].none.education = 200;
        });
        const stats = calculateDemographicStats(pop);
        expect(stats.fertileWomen).toBe(50);
    });

    it('includes both boundary ages of fertile range', () => {
        const pop = makePopulation((d) => {
            d[START_FERTILE_AGE].none.unoccupied = 100;
            d[END_FERTILE_AGE].none.unoccupied = 100;
        });
        const stats = calculateDemographicStats(pop);
        // Each 100 people → 50 fertile women, both boundaries included
        expect(stats.fertileWomen).toBe(100);
    });

    it('totalInCohort has correct length', () => {
        const pop = makePopulation(() => {});
        const stats = calculateDemographicStats(pop);
        expect(stats.totalInCohort.length).toBe(maxAge + 1);
    });
});
