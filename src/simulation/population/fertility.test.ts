/**
 * population/fertility.test.ts
 *
 * Unit tests for the fertility sub-system: birth-rate calculation,
 * pollution reduction, and newborn placement.
 */

import { describe, it, expect } from 'vitest';
import { fertReductionFromPollution, computeBirthsThisTick, applyBirths } from './fertility';
import { makePopulation } from '../utils/testHelper';

describe('fertReductionFromPollution', () => {
    it('returns 0 for zero pollution', () => {
        expect(fertReductionFromPollution({ air: 0, water: 0, soil: 0 })).toBe(0);
    });

    it('returns 1 (max) for very high pollution', () => {
        expect(fertReductionFromPollution({ air: 200, water: 0, soil: 0 })).toBe(1);
    });

    it('scales with air pollution', () => {
        const result = fertReductionFromPollution({ air: 50, water: 0, soil: 0 });
        expect(result).toBeCloseTo(50 * 0.01, 8);
    });

    it('combines all pollution sources', () => {
        const result = fertReductionFromPollution({ air: 10, water: 20, soil: 30 });
        const expected = 10 * 0.01 + 20 * 0.002 + 30 * 0.0005;
        expect(result).toBeCloseTo(expected, 8);
    });
});

describe('computeBirthsThisTick', () => {
    it('returns 0 when there are no fertile women', () => {
        expect(computeBirthsThisTick(0, 0, { air: 0, water: 0, soil: 0 })).toBe(0);
    });

    it('returns positive births for a substantial fertile-women population', () => {
        // 100000 fertile women, no starvation, no pollution
        const births = computeBirthsThisTick(100000, 0, { air: 0, water: 0, soil: 0 });
        expect(births).toBeGreaterThan(0);
    });

    it('starvation reduces births', () => {
        const normal = computeBirthsThisTick(100000, 0, { air: 0, water: 0, soil: 0 });
        const starved = computeBirthsThisTick(100000, 1, { air: 0, water: 0, soil: 0 });
        expect(starved).toBeLessThan(normal);
    });

    it('severe starvation (S=1) eliminates births entirely', () => {
        // fertilityFactor = 1 - 1^1.5 = 0, so births must be 0
        expect(computeBirthsThisTick(100000, 1, { air: 0, water: 0, soil: 0 })).toBe(0);
    });

    it('moderate starvation (S=0.5) reduces births more than linear model would', () => {
        // nonlinear: factor = 1 - 0.5^1.5 ≈ 1 - 0.354 = 0.646
        // old linear: factor = 1 - 0.5*0.5 = 0.75 — so nonlinear gives fewer births
        const moderateStarved = computeBirthsThisTick(100000, 0.5, { air: 0, water: 0, soil: 0 });
        const normal = computeBirthsThisTick(100000, 0, { air: 0, water: 0, soil: 0 });
        expect(moderateStarved).toBeLessThan(normal * 0.75); // stricter than old linear
    });

    it('pollution reduces births', () => {
        const clean = computeBirthsThisTick(100000, 0, { air: 0, water: 0, soil: 0 });
        const polluted = computeBirthsThisTick(100000, 0, { air: 80, water: 0, soil: 0 });
        expect(polluted).toBeLessThan(clean);
    });

    it('births are integer (floored)', () => {
        const births = computeBirthsThisTick(1234, 0, { air: 0, water: 0, soil: 0 });
        expect(Number.isInteger(births)).toBe(true);
    });
});

describe('applyBirths', () => {
    it('adds newborns to cohort 0 education/none/novice slot', () => {
        const pop = makePopulation();
        applyBirths(pop, 10);
        expect(pop.demography[0].education.none.novice.total).toBe(10);
    });

    it('accumulates births over multiple calls', () => {
        const pop = makePopulation();
        applyBirths(pop, 5);
        applyBirths(pop, 3);
        expect(pop.demography[0].education.none.novice.total).toBe(8);
    });

    it('does nothing when births = 0', () => {
        const pop = makePopulation();
        applyBirths(pop, 0);
        expect(pop.demography[0].education.none.novice.total).toBe(0);
    });
});
