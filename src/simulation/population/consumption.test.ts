    /**
 * population/consumption.test.ts
 *
 * Unit tests for the consumption sub-system: starvation level tracking
 * with equilibrium-convergence model and per-category service consumption.
 *
 * S converges towards the grocery service shortfall (1 − consumptionFactor) with a
 * time-constant of STARVATION_ADJUST_TICKS.
 */

import { describe, it, expect } from 'vitest';
import { updateStarvationLevel, STARVATION_ADJUST_TICKS, STARVATION_MAX_LEVEL, consumeServices } from './consumption';
import { SERVICE_PER_PERSON_PER_TICK } from '../constants';
import { makePopulation } from '../utils/testHelper';
import { groceryServiceResourceType } from '../planet/services';

const GROCERY_SERVICE = groceryServiceResourceType.name;

describe('updateStarvationLevel', () => {
    it('returns 0 when fully served and not starving', () => {
        expect(updateStarvationLevel(0, 1.0)).toBe(0);
    });

    it('increases starvation when consumptionFactor < 1', () => {
        const result = updateStarvationLevel(0, 0);
        expect(result).toBeGreaterThan(0);
        // First tick: delta = (1 − 0) / STARVATION_ADJUST_TICKS
        expect(result).toBeCloseTo(1 / STARVATION_ADJUST_TICKS, 10);
    });

    it('converges towards equilibrium = shortfall', () => {
        // With 50% grocery service, equilibrium = 0.5
        let level = 0;
        for (let t = 0; t < 300; t++) {
            level = updateStarvationLevel(level, 0.5);
        }
        expect(level).toBeCloseTo(0.5, 2);
    });

    it('converges to 0.9 with 10% grocery service', () => {
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

    it('recovers when fully served', () => {
        const startLevel = 0.5;
        const result = updateStarvationLevel(startLevel, 1.0);
        expect(result).toBeLessThan(startLevel);
    });

    it('recovers when service exceeds equilibrium', () => {
        // Currently at S=0.8, now getting 80% service (equilibrium=0.2)
        const result = updateStarvationLevel(0.8, 0.8);
        expect(result).toBeLessThan(0.8);
    });

    it('does not recover below 0', () => {
        const result = updateStarvationLevel(0.001, 10); // over-served
        expect(result).toBeGreaterThanOrEqual(0);
    });

    it('reaches ~63% of equilibrium in STARVATION_ADJUST_TICKS (exponential approach)', () => {
        // Starting from 0, with no service (equilibrium=1), after STARVATION_ADJUST_TICKS
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

    it('stays at current level when service matches current starvation (equilibrium = current)', () => {
        // If S=0.3 and consumptionFactor=0.7, equilibrium=0.3, delta=0
        const result = updateStarvationLevel(0.3, 0.7);
        expect(result).toBeCloseTo(0.3, 10);
    });

    it('rises when service gets worse than current equilibrium', () => {
        // S=0.2, service drops to 50% (equilibrium=0.5), S should rise
        const result = updateStarvationLevel(0.2, 0.5);
        expect(result).toBeGreaterThan(0.2);
    });
});

describe('consumeServices (per-category model)', () => {
    it('consumes grocery service from category buffer and updates starvation', () => {
        const pop = makePopulation();
        const populationCount = 360;

        // Place people and give them enough grocery service buffer
        pop.demography[30].unoccupied.none.novice.total = populationCount;
        pop.demography[30].unoccupied.none.novice.services.grocery.buffer = 10; // 10 ticks worth
        pop.demography[30].unoccupied.none.novice.services.grocery.starvationLevel = 0.5;

        consumeServices(pop);

        const cat = pop.demography[30].unoccupied.none.novice;
        // buffer should be reduced by 1 tick
        expect(cat.services.grocery.buffer).toBeCloseTo(9, 10);
        // starvation level should recover (was 0.5, now well-served)
        expect(cat.services.grocery.starvationLevel).toBeLessThan(0.5);
    });

    it('increases starvation when grocery service buffer is insufficient', () => {
        const pop = makePopulation();
        const populationCount = 360;

        pop.demography[30].unoccupied.none.novice.total = populationCount;
        pop.demography[30].unoccupied.none.novice.services.grocery.buffer = 0; // no buffer
        pop.demography[30].unoccupied.none.novice.services.grocery.starvationLevel = 0;

        consumeServices(pop);

        const cat = pop.demography[30].unoccupied.none.novice;
        // buffer should remain 0
        expect(cat.services.grocery.buffer).toBe(0);
        // starvation should increase from 0
        expect(cat.services.grocery.starvationLevel).toBeGreaterThan(0);
    });

    it('handles zero population in a category gracefully', () => {
        const pop = makePopulation();
        // All categories are zero by default
        consumeServices(pop);

        // Should not throw; starvation should remain 0
        expect(pop.demography[0].education.none.novice.services.grocery.starvationLevel).toBe(0);
    });

    it('handles zero service buffer gracefully', () => {
        const pop = makePopulation();
        pop.demography[20].unoccupied.none.novice.total = 100;
        pop.demography[20].unoccupied.none.novice.services.grocery.buffer = 0;
        pop.demography[20].unoccupied.none.novice.services.grocery.starvationLevel = 0;

        consumeServices(pop);

        const cat = pop.demography[20].unoccupied.none.novice;
        expect(cat.services.grocery.buffer).toBe(0);
        // starvation should increase since no service
        expect(cat.services.grocery.starvationLevel).toBeGreaterThan(0);
    });

    it('consumes all services, not just grocery', () => {
        const pop = makePopulation();
        const populationCount = 100;

        pop.demography[25].employed.tertiary.expert.total = populationCount;
        // Set buffers for all services
        pop.demography[25].employed.tertiary.expert.services.grocery.buffer = 10;
        pop.demography[25].employed.tertiary.expert.services.healthcare.buffer = 8;
        pop.demography[25].employed.tertiary.expert.services.retail.buffer = 6;
        pop.demography[25].employed.tertiary.expert.services.logistics.buffer = 4;
        pop.demography[25].employed.tertiary.expert.services.construction.buffer = 2;

        consumeServices(pop);

        const cat = pop.demography[25].employed.tertiary.expert;
        // All service buffers should be reduced by 1 tick
        expect(cat.services.grocery.buffer).toBeCloseTo(9, 10);
        expect(cat.services.healthcare.buffer).toBeCloseTo(7, 10);
        expect(cat.services.retail.buffer).toBeCloseTo(5, 10);
        expect(cat.services.logistics.buffer).toBeCloseTo(3, 10);
        expect(cat.services.construction.buffer).toBeCloseTo(1, 10);
    });
});