/**
 * population/retirement.test.ts
 *
 * Unit tests for the population-driven retirement sub-system:
 * age-dependent probability, per-cohort transitions, and population-level
 * retirement orchestration.
 */

import { describe, expect, it } from 'vitest';
import type { Population } from '../planet';
import { educationLevelKeys, maxAge } from '../planet';
import { RETIREMENT_AGE } from '../workforce/workforceHelpers';
import { emptyCohort } from './populationHelpers';

import { applyRetirement, applyRetirementTransitions, perTickRetirement } from './retirement';

// ---------------------------------------------------------------------------
// perTickRetirement
// ---------------------------------------------------------------------------

describe('perTickRetirement', () => {
    it('returns 0 for ages below RETIREMENT_AGE', () => {
        expect(perTickRetirement(30)).toBe(0);
        expect(perTickRetirement(66)).toBe(0);
    });

    it('returns a small positive per-tick rate at RETIREMENT_AGE', () => {
        const rate = perTickRetirement(RETIREMENT_AGE);
        expect(rate).toBeGreaterThan(0);
        // 30% annual → small per-tick rate
        expect(rate).toBeLessThan(0.01);
    });

    it('increases with age', () => {
        expect(perTickRetirement(68)).toBeGreaterThan(perTickRetirement(67));
        expect(perTickRetirement(70)).toBeGreaterThan(perTickRetirement(68));
    });
});

// ---------------------------------------------------------------------------
// applyRetirementTransitions
// ---------------------------------------------------------------------------

describe('applyRetirementTransitions', () => {
    it('does nothing for ages below RETIREMENT_AGE', () => {
        const cohort = emptyCohort();
        cohort.none.company = 100;
        cohort.none.government = 50;

        applyRetirementTransitions(cohort, 30);

        expect(cohort.none.company).toBe(100);
        expect(cohort.none.government).toBe(50);
        expect(cohort.none.unableToWork).toBe(0);
    });

    it('moves some company workers to unableToWork at RETIREMENT_AGE', () => {
        const cohort = emptyCohort();
        cohort.primary.company = 1000;

        // Run many ticks to expect at least some retirements
        let totalRetired = 0;
        for (let tick = 0; tick < 360; tick++) {
            const before = cohort.primary.company;
            applyRetirementTransitions(cohort, RETIREMENT_AGE);
            totalRetired += before - cohort.primary.company;
        }

        expect(totalRetired).toBeGreaterThan(0);
        expect(cohort.primary.unableToWork).toBe(totalRetired);
        expect(cohort.primary.company + cohort.primary.unableToWork).toBe(1000);
    });

    it('moves government workers to unableToWork', () => {
        const cohort = emptyCohort();
        cohort.secondary.government = 500;

        for (let tick = 0; tick < 360; tick++) {
            applyRetirementTransitions(cohort, 70);
        }

        expect(cohort.secondary.unableToWork).toBeGreaterThan(0);
        expect(cohort.secondary.government + cohort.secondary.unableToWork).toBe(500);
    });

    it('does not touch unoccupied or unableToWork', () => {
        const cohort = emptyCohort();
        cohort.none.unoccupied = 200;
        cohort.none.unableToWork = 50;

        applyRetirementTransitions(cohort, 70);

        expect(cohort.none.unoccupied).toBe(200);
        expect(cohort.none.unableToWork).toBe(50);
    });

    it('retires everyone at age 82+ (annual prob = 1.0) over enough ticks', () => {
        const cohort = emptyCohort();
        cohort.tertiary.company = 100;

        for (let tick = 0; tick < 720; tick++) {
            applyRetirementTransitions(cohort, 82);
        }

        // At 100% annual rate, 2 years of ticks should retire everyone
        expect(cohort.tertiary.company).toBe(0);
        expect(cohort.tertiary.unableToWork).toBe(100);
    });

    it('conserves total people in the cohort', () => {
        const cohort = emptyCohort();
        cohort.none.company = 300;
        cohort.none.government = 200;
        cohort.none.unoccupied = 100;
        cohort.none.unableToWork = 50;
        const total = 650;

        for (let tick = 0; tick < 360; tick++) {
            applyRetirementTransitions(cohort, 69);
        }

        const after = cohort.none.company + cohort.none.government + cohort.none.unoccupied + cohort.none.unableToWork;
        expect(after).toBe(total);
    });
});

// ---------------------------------------------------------------------------
// applyRetirement — population-level
// ---------------------------------------------------------------------------

describe('applyRetirement', () => {
    function makePopulation(config: { age: number; edu: string; occ: string; count: number }[]): Population {
        const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
        for (const { age, edu, occ, count } of config) {
            (demography[age] as Record<string, Record<string, number>>)[edu][occ] = count;
        }
        return { demography, starvationLevel: 0 };
    }

    it('writes tickNewRetirements accumulator', () => {
        const pop = makePopulation([{ age: 70, edu: 'none', occ: 'company', count: 1000 }]);

        applyRetirement(pop);

        expect(pop.tickNewRetirements).toBeDefined();
        // At age 70, retirement probability is high, so there should be some retirements
        expect(pop.tickNewRetirements!.none.company).toBeGreaterThan(0);
    });

    it('does not record retirements for ages below RETIREMENT_AGE', () => {
        const pop = makePopulation([{ age: 30, edu: 'primary', occ: 'company', count: 500 }]);

        applyRetirement(pop);

        expect(pop.tickNewRetirements!.primary.company).toBe(0);
    });

    it('records both company and government retirements', () => {
        const pop = makePopulation([
            { age: 70, edu: 'none', occ: 'company', count: 1000 },
            { age: 70, edu: 'none', occ: 'government', count: 500 },
        ]);

        // Run many ticks to get some retirements from both
        for (let tick = 0; tick < 100; tick++) {
            applyRetirement(pop);
        }

        expect(pop.demography[70].none.unableToWork).toBeGreaterThan(0);
        const totalBefore = 1500;
        const totalAfter =
            pop.demography[70].none.company + pop.demography[70].none.government + pop.demography[70].none.unableToWork;
        expect(totalAfter).toBe(totalBefore);
    });

    it('does not move unoccupied to unableToWork', () => {
        const pop = makePopulation([{ age: 70, edu: 'tertiary', occ: 'unoccupied', count: 300 }]);

        applyRetirement(pop);

        expect(pop.demography[70].tertiary.unoccupied).toBe(300);
        expect(pop.demography[70].tertiary.unableToWork).toBe(0);
    });

    it('conserves population across all ages', () => {
        const pop = makePopulation([
            { age: 30, edu: 'none', occ: 'company', count: 5000 },
            { age: 67, edu: 'none', occ: 'company', count: 1000 },
            { age: 70, edu: 'primary', occ: 'government', count: 500 },
            { age: 80, edu: 'secondary', occ: 'company', count: 200 },
        ]);

        let totalBefore = 0;
        for (const cohort of pop.demography) {
            for (const edu of educationLevelKeys) {
                for (const occ of ['company', 'government', 'unoccupied', 'unableToWork'] as const) {
                    totalBefore += cohort[edu][occ];
                }
            }
        }

        for (let tick = 0; tick < 360; tick++) {
            applyRetirement(pop);
        }

        let totalAfter = 0;
        for (const cohort of pop.demography) {
            for (const edu of educationLevelKeys) {
                for (const occ of ['company', 'government', 'unoccupied', 'unableToWork'] as const) {
                    totalAfter += cohort[edu][occ];
                }
            }
        }

        expect(totalAfter).toBe(totalBefore);
    });
});
