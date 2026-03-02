/**
 * population/nutrition.test.ts
 *
 * Unit tests for the nutrition sub-system: starvation level tracking
 * with equilibrium-convergence model.
 *
 * S converges towards the food shortfall (1 − nutritionalFactor) with a
 * time-constant of STARVATION_ADJUST_TICKS.
 */

import { describe, it, expect } from 'vitest';
import { updateStarvationLevel, STARVATION_ADJUST_TICKS, STARVATION_MAX_LEVEL, consumeFood } from './nutrition';
import { agriculturalProductResourceType } from '../facilities';
import { FOOD_PER_PERSON_PER_TICK } from '../constants';

import { createStorageFacility, createPlanetWithStorage, createPopulation } from './testFixtures';

describe('updateStarvationLevel', () => {
    it('returns 0 when fully fed and not starving', () => {
        expect(updateStarvationLevel(0, 1.0)).toBe(0);
    });

    it('increases starvation when nutritionalFactor < 1', () => {
        const result = updateStarvationLevel(0, 0);
        expect(result).toBeGreaterThan(0);
        // First tick: delta = (1 − 0) / STARVATION_ADJUST_TICKS
        expect(result).toBeCloseTo(1 / STARVATION_ADJUST_TICKS, 10);
    });

    it('converges towards equilibrium = shortfall', () => {
        // With 50% food, equilibrium = 0.5
        let level = 0;
        for (let t = 0; t < 300; t++) {
            level = updateStarvationLevel(level, 0.5);
        }
        expect(level).toBeCloseTo(0.5, 2);
    });

    it('converges to 0.9 with 10% food', () => {
        let level = 0;
        for (let t = 0; t < 300; t++) {
            level = updateStarvationLevel(level, 0.1);
        }
        expect(level).toBeCloseTo(0.9, 2);
    });

    it('does not exceed STARVATION_MAX_LEVEL', () => {
        const result = updateStarvationLevel(STARVATION_MAX_LEVEL, 0);
        expect(result).toBeLessThanOrEqual(STARVATION_MAX_LEVEL);
    });

    it('recovers when fully fed', () => {
        const startLevel = 0.5;
        const result = updateStarvationLevel(startLevel, 1.0);
        expect(result).toBeLessThan(startLevel);
    });

    it('recovers when food exceeds equilibrium', () => {
        // Currently at S=0.8, now getting 80% food (equilibrium=0.2)
        const result = updateStarvationLevel(0.8, 0.8);
        expect(result).toBeLessThan(0.8);
    });

    it('does not recover below 0', () => {
        const result = updateStarvationLevel(0.001, 10); // over-fed
        expect(result).toBeGreaterThanOrEqual(0);
    });

    it('reaches ~63% of equilibrium in STARVATION_ADJUST_TICKS (exponential approach)', () => {
        // Starting from 0, with no food (equilibrium=1), after STARVATION_ADJUST_TICKS
        // ticks we should be near 1 − (1 − 1/N)^N ≈ 1 − 1/e ≈ 0.632
        let level = 0;
        for (let t = 0; t < STARVATION_ADJUST_TICKS; t++) {
            level = updateStarvationLevel(level, 0);
        }
        // ~63.2% of the way to 1.0
        expect(level).toBeGreaterThan(0.6);
        expect(level).toBeLessThan(0.7);
    });

    it('recovers symmetrically — reaches ~63% recovery in STARVATION_ADJUST_TICKS', () => {
        let level = STARVATION_MAX_LEVEL;
        for (let t = 0; t < STARVATION_ADJUST_TICKS; t++) {
            level = updateStarvationLevel(level, 1.0);
        }
        // Should be ~0.368 (37% remaining)
        expect(level).toBeGreaterThan(0.3);
        expect(level).toBeLessThan(0.4);
    });

    it('stays at current level when food matches current starvation (equilibrium = current)', () => {
        // If S=0.3 and nutritionalFactor=0.7, equilibrium=0.3, delta=0
        const result = updateStarvationLevel(0.3, 0.7);
        expect(result).toBeCloseTo(0.3, 10);
    });

    it('rises when food gets worse than current equilibrium', () => {
        // S=0.2, food drops to 50% (equilibrium=0.5), S should rise
        const result = updateStarvationLevel(0.2, 0.5);
        expect(result).toBeGreaterThan(0.2);
    });
});

describe('consumeFood', () => {
    it('consumes up to demand and updates storage when enough food', () => {
        // Use populationTotal = 360 so per-tick demand = 1 ton (1/360 * 360)
        const populationTotal = 360;
        const perTickDemand = populationTotal * FOOD_PER_PERSON_PER_TICK;

        // Storage initially contains 5 tons
        const storage = createStorageFacility(5);
        const population = createPopulation(0.5);
        const planet = createPlanetWithStorage(storage, population);

        const res = consumeFood(planet, population, populationTotal);

        // consumed should equal demand (1 ton)
        expect(res.foodConsumed).toBeCloseTo(perTickDemand, 10);
        // nutritionalFactor should be ≈ 1
        expect(res.nutritionalFactor).toBeGreaterThanOrEqual(1);
        // storage should be reduced by the consumed amount
        expect(storage.currentInStorage[agriculturalProductResourceType.name].quantity).toBeCloseTo(
            5 - perTickDemand,
            10,
        );
        // population starvation level should have been updated (recovered)
        expect(population.starvationLevel).toBeLessThan(0.5);
    });

    it('consumes what is available when storage insufficient and increases starvation', () => {
        const populationTotal = 360;

        const storage = createStorageFacility(0.2);
        const population = createPopulation(0);
        const planet = createPlanetWithStorage(storage, population);

        const res = consumeFood(planet, population, populationTotal);

        // consumed should equal available (0.2)
        expect(res.foodConsumed).toBeCloseTo(0.2, 10);
        // nutritionalFactor should be < 1
        expect(res.nutritionalFactor).toBeLessThan(1);
        // storage should be emptied for that resource
        expect(storage.currentInStorage[agriculturalProductResourceType.name].quantity).toBeCloseTo(0, 10);
        // starvation level should increase from 0
        expect(population.starvationLevel).toBeGreaterThan(0);
    });

    it('handles missing storage gracefully (no consumption)', () => {
        const populationTotal = 360;
        const population = createPopulation(0);
        const planet = createPlanetWithStorage(createStorageFacility(0), population);

        const res = consumeFood(planet, population, populationTotal);
        expect(res.foodConsumed).toBe(0);
        expect(res.nutritionalFactor).toBe(0);
        // starvation should increase since no food
        expect(population.starvationLevel).toBeGreaterThan(0);
    });
});
