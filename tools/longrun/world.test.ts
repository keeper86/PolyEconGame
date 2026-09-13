import { describe, expect, it } from 'vitest';
import type { AutomatedPricingConfig } from '../../src/simulation/planet/planet';
import { oilReservoirResourceType } from '../../src/simulation/planet/landBoundResources';
import { seedRng } from '../../src/simulation/utils/stochasticRound';
import { applyRefinerySellOverride, buildBenchmarkWorld, type BenchmarkWorldConfig } from './world';

const base: AutomatedPricingConfig = {
    priceAdjustMaxUp: 1.05,
    priceAdjustMaxDown: 0.95,
    targetSellThrough: 0.8,
    automatedCostFloorBuffer: 1.3,
};

describe('applyRefinerySellOverride', () => {
    it('leaves non-refinery facilities untouched', () => {
        const config: BenchmarkWorldConfig = { refineryMinAskMultiplier: 3 };
        const result = applyRefinerySellOverride({ ...base }, 'maintenanceFacility', config);
        expect(result).toEqual(base);
    });

    it('leaves the refinery untouched when no override is configured', () => {
        const result = applyRefinerySellOverride({ ...base }, 'fuelRefinery', {});
        expect(result).toEqual(base);
    });

    it('raises the soft-min ask (automatedCostFloorBuffer) for the refinery', () => {
        const config: BenchmarkWorldConfig = { refineryMinAskMultiplier: 3 };
        const result = applyRefinerySellOverride({ ...base }, 'fuelRefinery', config);
        expect(result.automatedCostFloorBuffer).toBe(3);
        expect(result.priceAdjustMaxDown).toBe(base.priceAdjustMaxDown);
        expect(result.targetSellThrough).toBe(base.targetSellThrough);
    });

    it('caps price cuts (priceAdjustMaxDown) for the refinery', () => {
        const config: BenchmarkWorldConfig = { refineryPriceAdjustMaxDown: 0.99 };
        const result = applyRefinerySellOverride({ ...base }, 'fuelRefinery', config);
        expect(result.priceAdjustMaxDown).toBe(0.99);
    });

    it('lowers the sell-through target for the refinery', () => {
        const config: BenchmarkWorldConfig = { refineryTargetSellThrough: 0.5 };
        const result = applyRefinerySellOverride({ ...base }, 'fuelRefinery', config);
        expect(result.targetSellThrough).toBe(0.5);
    });

    it('merges all refinery knobs without mutating the input', () => {
        const config: BenchmarkWorldConfig = {
            refineryMinAskMultiplier: 3,
            refineryPriceAdjustMaxDown: 0.99,
            refineryTargetSellThrough: 0.5,
        };
        const result = applyRefinerySellOverride({ ...base }, 'fuelRefinery', config);
        expect(result.automatedCostFloorBuffer).toBe(3);
        expect(result.priceAdjustMaxDown).toBe(0.99);
        expect(result.targetSellThrough).toBe(0.5);
        expect(result.priceAdjustMaxUp).toBe(base.priceAdjustMaxUp);
        expect(base.automatedCostFloorBuffer).toBe(1.3);
    });
});

describe('buildBenchmarkWorld resource pools', () => {
    it('scales every pool by resourceMultiplier', () => {
        seedRng(1001);
        const base = buildBenchmarkWorld({ resourceMultiplier: 1 });
        seedRng(1001);
        const scaled = buildBenchmarkWorld({ resourceMultiplier: 10 });
        const basePool = base.planet.resources;
        const scaledPool = scaled.planet.resources;
        const names = Object.keys(basePool);
        expect(names.length).toBeGreaterThan(3);
        for (const name of names) {
            expect(scaledPool[name].pool.quantity).toBe(basePool[name].pool.quantity * 10);
        }
    });

    it('applies oilReservoirMultiplier on top of resourceMultiplier for oil', () => {
        seedRng(1001);
        const world = buildBenchmarkWorld({ resourceMultiplier: 10, oilReservoirMultiplier: 2 });
        expect(world.planet.resources[oilReservoirResourceType.name].pool.quantity).toBe(1_000_000_000 * 10 * 2);
    });
});
