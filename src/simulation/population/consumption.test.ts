import { describe, expect, it } from 'vitest';
import { makePlanet } from '../utils/testHelper';
import { STARVATION_ADJUST_TICKS, STARVATION_MAX_LEVEL, consumeServices, updateStarvationLevel } from './consumption';

describe('updateStarvationLevel', () => {
    it('returns 0 when fully served and not starving', () => {
        expect(updateStarvationLevel(0, 1.0)).toBe(0);
    });

    it('increases starvation when consumptionFactor < 1', () => {
        const result = updateStarvationLevel(0, 0);
        expect(result).toBeGreaterThan(0);

        expect(result).toBeCloseTo(1 / STARVATION_ADJUST_TICKS, 10);
    });

    it('converges towards equilibrium = shortfall', () => {
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
        const result = updateStarvationLevel(0.8, 0.8);
        expect(result).toBeLessThan(0.8);
    });

    it('does not recover below 0', () => {
        const result = updateStarvationLevel(0.001, 10);
        expect(result).toBeGreaterThanOrEqual(0);
    });

    it('reaches ~63% of equilibrium in STARVATION_ADJUST_TICKS (exponential approach)', () => {
        let level = 0;
        for (let t = 0; t < STARVATION_ADJUST_TICKS; t++) {
            level = updateStarvationLevel(level, 0);
        }

        expect(level).toBeGreaterThan(0.6);
        expect(level).toBeLessThan(0.7);
    });

    it('recovers symmetrically — reaches ~63% recovery in STARVATION_ADJUST_TICKS', () => {
        let level = STARVATION_MAX_LEVEL;
        for (let t = 0; t < STARVATION_ADJUST_TICKS; t++) {
            level = updateStarvationLevel(level, 1.0);
        }

        expect(level).toBeGreaterThan(0.3);
        expect(level).toBeLessThan(0.4);
    });

    it('stays at current level when service matches current starvation (equilibrium = current)', () => {
        const result = updateStarvationLevel(0.3, 0.7);
        expect(result).toBeCloseTo(0.3, 10);
    });

    it('rises when service gets worse than current equilibrium', () => {
        const result = updateStarvationLevel(0.2, 0.5);
        expect(result).toBeGreaterThan(0.2);
    });
});

describe('consumeServices (per-category model)', () => {
    it('consumes grocery service from category buffer and updates starvation', () => {
        const planet = makePlanet();
        const { population: pop } = planet;
        const populationCount = 360;

        pop.demography[30].unoccupied.none.novice.total = populationCount;
        pop.demography[30].unoccupied.none.novice.services.grocery.buffer = 10;
        pop.demography[30].unoccupied.none.novice.services.grocery.starvationLevel = 0.5;

        consumeServices(planet);

        const cat = pop.demography[30].unoccupied.none.novice;

        // Buffer (in ticks) now depletes by exactly the demanded amount (age-adjusted).
        // At age 30 with unoccupied occ, standardAgeMultiplier ≈ 0.9715.
        // Demand = pop * rate * ageMult = 360 * (1/TICKS_PER_MONTH) * 0.9715.
        // Buffer starts at 10 ticks.  Consumed = demand (since buffer covers it).
        // bufferConsumed = consumed / (effectiveRate * pop) = 1.0 tick exactly.
        expect(cat.services.grocery.buffer).toBeCloseTo(9.0, 3);

        expect(cat.services.grocery.starvationLevel).toBeLessThan(0.5);
    });

    it('increases starvation when grocery service buffer is insufficient', () => {
        const planet = makePlanet();
        const { population: pop } = planet;
        const populationCount = 360;

        pop.demography[30].unoccupied.none.novice.total = populationCount;
        pop.demography[30].unoccupied.none.novice.services.grocery.buffer = 0;
        pop.demography[30].unoccupied.none.novice.services.grocery.starvationLevel = 0;

        consumeServices(planet);

        const cat = pop.demography[30].unoccupied.none.novice;

        expect(cat.services.grocery.buffer).toBe(0);

        expect(cat.services.grocery.starvationLevel).toBeGreaterThan(0);
    });

    it('handles zero population in a category gracefully', () => {
        const planet = makePlanet();
        const { population: pop } = planet;

        consumeServices(planet);

        expect(pop.demography[0].education.none.novice.services.grocery.starvationLevel).toBe(0);
    });

    it('handles zero service buffer gracefully', () => {
        const planet = makePlanet();
        const { population: pop } = planet;
        pop.demography[20].unoccupied.none.novice.total = 100;
        pop.demography[20].unoccupied.none.novice.services.grocery.buffer = 0;
        pop.demography[20].unoccupied.none.novice.services.grocery.starvationLevel = 0;

        consumeServices(planet);

        const cat = pop.demography[20].unoccupied.none.novice;
        expect(cat.services.grocery.buffer).toBe(0);

        expect(cat.services.grocery.starvationLevel).toBeGreaterThan(0);
    });

    it('consumes all services, not just grocery', () => {
        const planet = makePlanet();
        const { population: pop } = planet;
        const populationCount = 100;

        pop.demography[25].employed.tertiary.expert.total = populationCount;

        pop.demography[25].employed.tertiary.expert.services.grocery.buffer = 10;
        pop.demography[25].employed.tertiary.expert.services.healthcare.buffer = 8;
        pop.demography[25].employed.tertiary.expert.services.retail.buffer = 6;
        pop.demography[25].employed.tertiary.expert.services.logistics.buffer = 4;

        consumeServices(planet);

        const cat = pop.demography[25].employed.tertiary.expert;

        // With age-adjusted buffer consumption, each service's buffer decreases by exactly
        // 1 tick when the buffer covers the age-adjusted demand.
        expect(cat.services.grocery.buffer).toBeCloseTo(9.0, 3);
        expect(cat.services.healthcare.buffer).toBeCloseTo(7.0, 3);
        expect(cat.services.retail.buffer).toBeCloseTo(5.0, 3);
        expect(cat.services.logistics.buffer).toBeCloseTo(3.0, 3);
    });
});
