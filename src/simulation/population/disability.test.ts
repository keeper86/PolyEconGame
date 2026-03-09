/**
 * population/disability.test.ts
 *
 * Unit tests for the disability sub-system: age-dependent base probability,
 * environmental disability, and population-level transitions.
 */

import { describe, it, expect } from 'vitest';
import { educationLevelKeys } from './education';
import { forEachPopulationCohort, SKILL } from './population';
import { makePopulation, makeEnvironment } from '../utils/testHelper';
import {
    ageDependentBaseDisabilityProb,
    computeEnvironmentalDisability,
    applyDisability,
    STARVATION_DISABILITY_COEFFICIENT,
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
        const env = makeEnvironment();
        const result = computeEnvironmentalDisability(env);
        expect(result.pollutionDisabilityProb).toBe(0);
        expect(result.disasterDisabilityProb).toBe(0);
    });

    it('caps pollution disability at 0.5', () => {
        const env = makeEnvironment({
            pollution: { air: 10000, water: 10000, soil: 10000 },
        });
        const result = computeEnvironmentalDisability(env);
        expect(result.pollutionDisabilityProb).toBe(0.5);
    });

    it('caps disaster disability at 0.3', () => {
        const env = makeEnvironment({
            naturalDisasters: { earthquakes: 100000, floods: 100000, storms: 100000 },
        });
        const result = computeEnvironmentalDisability(env);
        expect(result.disasterDisabilityProb).toBe(0.3);
    });
});

describe('applyDisability (population-level)', () => {
    it('moves people from active occupations to unableToWork', () => {
        const pop = makePopulation();
        // Place people at age 30 in employed slots — use large numbers for statistical stability
        pop.demography[30].employed.none.novice.total = 100000;
        pop.demography[30].employed.primary.novice.total = 100000;

        const env = makeEnvironment({
            pollution: { air: 80, water: 80, soil: 80 },
        });
        applyDisability(pop, env);

        // Some should have moved to unableToWork
        expect(pop.demography[30].employed.none.novice.total).toBeLessThan(100000);
        expect(pop.demography[30].unableToWork.none.novice.total).toBeGreaterThan(0);
        expect(pop.demography[30].employed.primary.novice.total).toBeLessThan(100000);
        expect(pop.demography[30].unableToWork.primary.novice.total).toBeGreaterThan(0);
    });

    it('does not move people already unableToWork', () => {
        const pop = makePopulation();
        pop.demography[30].unableToWork.none.novice.total = 100;

        const env = makeEnvironment();
        applyDisability(pop, env);

        // unableToWork is not a source occupation, count should stay the same
        expect(pop.demography[30].unableToWork.none.novice.total).toBe(100);
    });

    it('does nothing when population is empty', () => {
        const pop = makePopulation();
        const env = makeEnvironment({
            pollution: { air: 50, water: 50, soil: 50 },
        });
        applyDisability(pop, env);

        for (const cohort of pop.demography) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    expect(cohort.unableToWork[edu][skill].total).toBe(0);
                }
            }
        }
    });

    it('preserves total headcount (no people created or destroyed)', () => {
        const pop = makePopulation();
        pop.demography[40].employed.none.novice.total = 1000;
        pop.demography[40].employed.none.professional.total = 500;
        pop.demography[40].education.primary.novice.total = 200;
        const totalBefore = 1000 + 500 + 200;

        const env = makeEnvironment({
            pollution: { air: 25, water: 10, soil: 5 },
        });
        applyDisability(pop, env);

        let totalAfter = 0;
        forEachPopulationCohort(pop.demography[40], (cat) => {
            totalAfter += cat.total;
        });
        expect(totalAfter).toBe(totalBefore);
    });

    it('starvation increases disability transitions', () => {
        const popNoStarv = makePopulation();
        popNoStarv.demography[30].employed.none.novice.total = 100000;

        const popStarved = makePopulation();
        popStarved.demography[30].employed.none.novice.total = 100000;
        popStarved.demography[30].employed.none.novice.starvationLevel = 1;

        // With clean environment, disability comes only from base + starvation
        const env = makeEnvironment();
        applyDisability(popNoStarv, env);
        applyDisability(popStarved, env);

        // Full starvation should produce more disability than no starvation
        expect(popStarved.demography[30].unableToWork.none.novice.total).toBeGreaterThan(
            popNoStarv.demography[30].unableToWork.none.novice.total,
        );
    });

    it('STARVATION_DISABILITY_COEFFICIENT is small relative to max pollution disability', () => {
        // Max pollution term is capped at 0.5; coefficient should be well below that
        expect(STARVATION_DISABILITY_COEFFICIENT).toBeLessThan(0.5);
        expect(STARVATION_DISABILITY_COEFFICIENT).toBeGreaterThan(0);
    });

    it('records disability events in countThisMonth', () => {
        const pop = makePopulation();
        pop.demography[50].employed.none.novice.total = 100000;

        const env = makeEnvironment({
            pollution: { air: 80, water: 80, soil: 80 },
        });
        applyDisability(pop, env);

        // The source cell should have recorded disability transitions
        expect(pop.demography[50].employed.none.novice.disabilities.countThisMonth).toBeGreaterThan(0);
    });
});
