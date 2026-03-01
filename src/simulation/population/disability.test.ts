/**
 * population/disability.test.ts
 *
 * Unit tests for the disability sub-system: age-dependent base probability,
 * environmental disability, and cohort-level transitions.
 */

import { describe, it, expect } from 'vitest';
import { emptyCohort } from '../populationHelpers';
import { educationLevelKeys } from '../planet';
import {
    ageDependentBaseDisabilityProb,
    computeEnvironmentalDisability,
    applyDisabilityTransitions,
} from './disability';

describe('ageDependentBaseDisabilityProb', () => {
    it('returns low probability for children (< 15)', () => {
        expect(ageDependentBaseDisabilityProb(5)).toBe(0.001);
        expect(ageDependentBaseDisabilityProb(14)).toBe(0.001);
    });

    it('returns lower probability for working-age adults (15-49)', () => {
        expect(ageDependentBaseDisabilityProb(30)).toBe(0.0005);
    });

    it('increases for 50-59', () => {
        expect(ageDependentBaseDisabilityProb(55)).toBe(0.005);
    });

    it('increases for 60-69', () => {
        expect(ageDependentBaseDisabilityProb(65)).toBe(0.01);
    });

    it('ramps linearly from 70 to 90', () => {
        const at70 = ageDependentBaseDisabilityProb(70);
        const at80 = ageDependentBaseDisabilityProb(80);
        const at90 = ageDependentBaseDisabilityProb(90);
        expect(at70).toBeCloseTo(0.01, 5);
        expect(at80).toBeCloseTo(0.01 + (10 / 20) * (0.33 - 0.01), 5);
        expect(at90).toBeCloseTo(0.33, 5);
    });

    it('caps at 0.33 for age > 90', () => {
        expect(ageDependentBaseDisabilityProb(95)).toBe(0.33);
        expect(ageDependentBaseDisabilityProb(100)).toBe(0.33);
    });
});

describe('computeEnvironmentalDisability', () => {
    it('returns zero for clean environment', () => {
        const env = {
            pollution: { air: 0, water: 0, soil: 0 },
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        };
        const result = computeEnvironmentalDisability(env);
        expect(result.pollutionDisabilityProb).toBe(0);
        expect(result.disasterDisabilityProb).toBe(0);
    });

    it('caps pollution disability at 0.5', () => {
        const env = {
            pollution: { air: 10000, water: 10000, soil: 10000 },
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        };
        const result = computeEnvironmentalDisability(env);
        expect(result.pollutionDisabilityProb).toBe(0.5);
    });

    it('caps disaster disability at 0.3', () => {
        const env = {
            pollution: { air: 0, water: 0, soil: 0 },
            naturalDisasters: { earthquakes: 100000, floods: 100000, storms: 100000 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        };
        const result = computeEnvironmentalDisability(env);
        expect(result.disasterDisabilityProb).toBe(0.3);
    });
});

describe('applyDisabilityTransitions', () => {
    it('moves people from active occupations to unableToWork', () => {
        const cohort = emptyCohort();
        cohort.none.company = 10000;
        cohort.primary.government = 5000;

        const envDisability = { pollutionDisabilityProb: 0.1, disasterDisabilityProb: 0.1 };
        applyDisabilityTransitions(cohort, 30, envDisability);

        // Some should have moved to unableToWork
        expect(cohort.none.company).toBeLessThan(10000);
        expect(cohort.none.unableToWork).toBeGreaterThan(0);
        expect(cohort.primary.government).toBeLessThan(5000);
        expect(cohort.primary.unableToWork).toBeGreaterThan(0);
    });

    it('does not move people already unableToWork back', () => {
        const cohort = emptyCohort();
        cohort.none.unableToWork = 100;

        const envDisability = { pollutionDisabilityProb: 0, disasterDisabilityProb: 0 };
        applyDisabilityTransitions(cohort, 30, envDisability);

        // unableToWork is not a source occupation, count should stay the same
        expect(cohort.none.unableToWork).toBe(100);
    });

    it('does nothing when cohort is empty', () => {
        const cohort = emptyCohort();
        const envDisability = { pollutionDisabilityProb: 0.1, disasterDisabilityProb: 0.1 };
        applyDisabilityTransitions(cohort, 50, envDisability);

        for (const edu of educationLevelKeys) {
            expect(cohort[edu].unableToWork).toBe(0);
        }
    });

    it('preserves total headcount (no people created or destroyed)', () => {
        const cohort = emptyCohort();
        cohort.none.company = 1000;
        cohort.none.government = 500;
        cohort.primary.education = 200;
        const totalBefore = 1000 + 500 + 200;

        const envDisability = { pollutionDisabilityProb: 0.05, disasterDisabilityProb: 0.02 };
        applyDisabilityTransitions(cohort, 40, envDisability);

        let totalAfter = 0;
        for (const edu of educationLevelKeys) {
            for (const occ of ['company', 'government', 'education', 'unoccupied', 'unableToWork'] as const) {
                totalAfter += cohort[edu][occ];
            }
        }
        expect(totalAfter).toBe(totalBefore);
    });
});
