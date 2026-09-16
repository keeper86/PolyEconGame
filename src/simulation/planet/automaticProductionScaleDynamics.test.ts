import { describe, expect, it } from 'vitest';
import {
    INPUT_BUFFER_TARGET_TICKS_SERVICES,
    INVENTORY_SMOOTHING_MAX_EXTRA,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    TARGET_FILL_RATE_SERVICES,
} from '../constants';
import { fillRateFactor } from '../market/automaticPricing';
import {
    makeAgent,
    makeAgentPlanetAssets,
    makePlanet,
    makeProductionFacility,
    setStorageResourceQuantity,
} from '../utils/testHelper';
import {
    EXPANSION_INTEGRAL_MAX,
    EXPANSION_INTEGRAL_THRESHOLD,
    PID_IMAX,
    PID_OUT_MAX_DOWN,
    PID_OUT_MAX_UP,
    STORAGE_CAPACITY_MONTHS,
    STORAGE_TARGET_MONTHS,
    checkLimitCycleBand,
    computeDynamicExpansionTarget,
    computeFacilityStorageSignal,
    computePidDelta,
    getDefaultPidState,
    softClip,
    updateAgentProductionScale,
} from './automaticProductionScale';
import type { ProductionFacility } from './facility';
import type { GameState, MarketResult, Planet } from './planet';
import { constructionServiceResourceType, maintenanceServiceResourceType } from './services';

const RESOURCE_NAME = maintenanceServiceResourceType.name;

type ChainFixture = {
    facility: ProductionFacility;
    planet: Planet;
};

function makeMarketResult(overrides?: Partial<MarketResult>): MarketResult {
    return {
        resourceName: RESOURCE_NAME,
        clearingPrice: 10,
        totalVolume: 100,
        totalDemand: 100,
        totalSupply: 100,
        unfilledDemand: 0,
        unsoldSupply: 0,
        ...overrides,
    };
}

function createMaintenanceChainFixture(overrides?: {
    unfilledFrac?: number;
    price?: number;
    scale?: number;
    maxScale?: number;
    producesQuantity?: number;
    revenue?: number;
    wageCosts?: number;
    inputCosts?: number;
    resourceEfficiency?: Record<string, number>;
    overallEfficiency?: number;
}): ChainFixture {
    const unfilledFrac = overrides?.unfilledFrac ?? 0;
    const price = overrides?.price ?? 10;
    const demand = 1000;
    const marketResult = makeMarketResult({
        clearingPrice: price,
        totalDemand: demand,
        unfilledDemand: unfilledFrac * demand,
    });

    const planet = makePlanet({
        lastMarketResult: { [RESOURCE_NAME]: marketResult },
        avgMarketResult: { [RESOURCE_NAME]: marketResult },
    });

    const facility = makeProductionFacility(undefined, {
        name: 'Maintenance Facility',
        maxScale: overrides?.maxScale ?? 1,
        scale: overrides?.scale ?? 1,
        produces: [{ resource: maintenanceServiceResourceType, quantity: overrides?.producesQuantity ?? 100 }],
    });
    facility.lastTickResults.revenue = overrides?.revenue ?? 0;
    facility.lastTickResults.wageCosts = overrides?.wageCosts ?? 0;
    facility.lastTickResults.inputCosts = overrides?.inputCosts ?? 0;
    facility.lastTickResults.resourceEfficiency = overrides?.resourceEfficiency ?? {};
    facility.lastTickResults.overallEfficiency = overrides?.overallEfficiency ?? 1;

    return { facility, planet };
}

function makeStorageSignalFixture(inventory: number): {
    facility: ProductionFacility;
    assets: ReturnType<typeof makeAgentPlanetAssets>;
} {
    const facility = makeProductionFacility(undefined, {
        maxScale: 1,
        scale: 1,
        produces: [{ resource: maintenanceServiceResourceType, quantity: 100 }],
    });
    const assets = makeAgentPlanetAssets('p');
    setStorageResourceQuantity(assets.storage, maintenanceServiceResourceType, inventory);
    return { facility, assets };
}

function makeChainGameState(planet: Planet, facility: ProductionFacility): GameState {
    const agent = makeAgent('maint-agent', planet.id, 'Maintenance Co', {
        automated: true,
        assets: {
            [planet.id]: makeAgentPlanetAssets(planet.id, { productionFacilities: [facility] }),
        },
    });
    return {
        tick: 0,
        planets: new Map([[planet.id, planet]]),
        agents: new Map([[agent.id, agent]]),
        shipCapitalMarket: { tradeHistory: [], emaPrice: {} },
        forexMarketMakers: new Map(),
        shipbuilderAgents: new Map(),
        arbitrageTraders: new Map(),
        tickerEvents: [],
        bankruptcies: [],
        nextEventId: 1,
    };
}

function simulateServiceBufferFill({
    bufferTargetTicks,
    productionRatio,
    ticks = 1000,
}: {
    bufferTargetTicks: number;
    productionRatio: number;
    ticks?: number;
}): { fillRate: number; priceFactor: number } {
    const consumption = 100;
    const capacity = bufferTargetTicks * consumption;
    const production = productionRatio * consumption;
    let buffer = 0;
    let fillRate = 1;
    let priceFactor = 1;
    for (let t = 0; t < ticks; t++) {
        buffer = Math.max(0, buffer - consumption);
        const shortfall = Math.max(0, capacity - buffer);
        const filled = Math.min(shortfall, production);
        buffer = Math.min(capacity, buffer + filled);
        fillRate = shortfall > 0 ? filled / shortfall : 1;
        priceFactor = fillRateFactor(
            fillRate,
            TARGET_FILL_RATE_SERVICES,
            PRICE_ADJUST_MAX_UP,
            PRICE_ADJUST_MAX_DOWN,
            1,
        );
    }
    return { fillRate, priceFactor };
}

describe('fillRateFactor', () => {
    it('pushes the bid price up below target, neutral at target, and down above target', () => {
        const target = TARGET_FILL_RATE_SERVICES;
        const goodsSmoothing = 1 + INVENTORY_SMOOTHING_MAX_EXTRA;
        expect(fillRateFactor(0, target, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN, goodsSmoothing)).toBeCloseTo(1.05);
        expect(fillRateFactor(target, target, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN, goodsSmoothing)).toBeCloseTo(
            1,
        );
        expect(
            fillRateFactor(goodsSmoothing, target, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN, goodsSmoothing),
        ).toBeCloseTo(0.95);
    });
});

describe('bid price runaway', () => {
    it('doubles the bid price every ~14 ticks at zero fill rate', () => {
        const factor = fillRateFactor(0, TARGET_FILL_RATE_SERVICES, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN, 1);
        const doublingTicks = Math.log(2) / Math.log(factor);
        expect(doublingTicks).toBeCloseTo(14.2, 0);
    });
});

describe('service buffer fill dynamics', () => {
    it('current default buffer target (3) is un-fillable at steady-state production', () => {
        const steadyStateFillRate = 1 / INPUT_BUFFER_TARGET_TICKS_SERVICES;
        expect(steadyStateFillRate).toBeLessThan(TARGET_FILL_RATE_SERVICES);
    });

    it('buffer target of 1 tick fills to 100% at 1x production and stops compounding', () => {
        const { fillRate, priceFactor } = simulateServiceBufferFill({ bufferTargetTicks: 1, productionRatio: 1 });
        expect(fillRate).toBeCloseTo(1);
        expect(priceFactor).toBeLessThanOrEqual(1);
    });

    it('buffer target of 3 ticks stalls at ~33% fill at 1x production and compounds forever', () => {
        const { fillRate, priceFactor } = simulateServiceBufferFill({ bufferTargetTicks: 3, productionRatio: 1 });
        expect(fillRate).toBeCloseTo(1 / 3, 1);
        expect(priceFactor).toBeGreaterThan(1);
    });
});

describe('computeFacilityStorageSignal (own-production storage error)', () => {
    // Storage target is STORAGE_TARGET_MONTHS months × 30 ticks/month × maxScale 1 × produce 100/tick.
    const target = STORAGE_TARGET_MONTHS * 30 * 100;

    function makeStorageFixture(overrides?: { inventory?: number; producesTwoOutputs?: boolean }): {
        facility: ProductionFacility;
        assets: ReturnType<typeof makeAgentPlanetAssets>;
    } {
        const produces = overrides?.producesTwoOutputs
            ? [
                  { resource: maintenanceServiceResourceType, quantity: 100 },
                  { resource: constructionServiceResourceType, quantity: 100 },
              ]
            : [{ resource: maintenanceServiceResourceType, quantity: 100 }];
        const facility = makeProductionFacility(undefined, { maxScale: 1, scale: 1, produces });
        const assets = makeAgentPlanetAssets('p');
        setStorageResourceQuantity(assets.storage, maintenanceServiceResourceType, overrides?.inventory ?? 0);
        return { facility, assets };
    }

    it('is positive when the storage is below the 12-month target and negative above', () => {
        const below = makeStorageFixture({ inventory: target / 2 });
        expect(computeFacilityStorageSignal(below.facility, below.assets).maxError).toBeCloseTo(Math.tanh(6), 5);

        const above = makeStorageFixture({ inventory: target * 2 });
        expect(computeFacilityStorageSignal(above.facility, above.assets).maxError).toBeCloseTo(Math.tanh(-12), 5);
    });

    it('is zero when the storage is exactly at the 12-month target', () => {
        const fixture = makeStorageFixture({ inventory: target });
        expect(computeFacilityStorageSignal(fixture.facility, fixture.assets).maxError).toBe(0);
    });

    it('anchors the target to the facility own production, not the market demand', () => {
        const fixture = makeStorageFixture({ inventory: target });
        expect(computeFacilityStorageSignal(fixture.facility, fixture.assets).maxError).toBe(0);

        fixture.facility.maxScale = 2;
        expect(computeFacilityStorageSignal(fixture.facility, fixture.assets).maxError).toBeGreaterThan(0);
    });

    it('maxError tracks the most starved output', () => {
        const fixture = makeStorageFixture({ producesTwoOutputs: true, inventory: target * 2 });
        setStorageResourceQuantity(fixture.assets.storage, constructionServiceResourceType, target / 4);
        const signal = computeFacilityStorageSignal(fixture.facility, fixture.assets);
        expect(signal.maxError).toBeCloseTo(Math.tanh(9), 5);
    });

    it('maxError is negative only when every output is above the target', () => {
        const fixture = makeStorageFixture({ producesTwoOutputs: true, inventory: target * 2 });
        setStorageResourceQuantity(fixture.assets.storage, constructionServiceResourceType, target * 2);
        const bothFull = computeFacilityStorageSignal(fixture.facility, fixture.assets);
        expect(bothFull.maxError).toBeLessThan(0);

        setStorageResourceQuantity(fixture.assets.storage, constructionServiceResourceType, target / 2);
        const oneStarved = computeFacilityStorageSignal(fixture.facility, fixture.assets);
        expect(oneStarved.maxError).toBeGreaterThan(0);
    });
});

describe('PID utilization response', () => {
    it('converges scale to maxScale in well under 100 ticks of sustained shortage', () => {
        const { facility, assets } = makeStorageSignalFixture(0);
        const state = getDefaultPidState();
        let ticks = 0;
        while (facility.scale < facility.maxScale - 1e-9 && ticks < 10_000) {
            const signal = computeFacilityStorageSignal(facility, assets).maxError;
            const delta = computePidDelta(signal, state) * facility.maxScale;
            facility.scale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));
            ticks++;
        }
        expect(facility.scale).toBeCloseTo(facility.maxScale);
        expect(ticks).toBeLessThan(100);
    });

    it('stays bounded over 10_000 ticks', () => {
        const { facility, assets } = makeStorageSignalFixture(3 * 30 * 100 * 0.5);
        const state = getDefaultPidState();
        for (let tick = 0; tick < 10_000; tick++) {
            const signal = computeFacilityStorageSignal(facility, assets).maxError;
            const delta = computePidDelta(signal, state) * facility.maxScale;
            facility.scale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));
            expect(Number.isFinite(facility.scale)).toBe(true);
            expect(Number.isFinite(state.integral)).toBe(true);
        }
        expect(state.integral).toBeGreaterThanOrEqual(-PID_IMAX);
        expect(state.integral).toBeLessThanOrEqual(PID_IMAX);
    });
    describe('soft clip removes the describing-function gain collapse', () => {
        it('attenuates a saturated error instead of pinning it at the clamp', () => {
            expect(softClip(0.5)).toBeCloseTo(Math.tanh(0.5), 10);
            expect(softClip(1)).toBeLessThan(0.77);
            expect(softClip(1)).toBeGreaterThan(0.76);
            expect(softClip(-1)).toBeGreaterThan(-0.77);
            expect(softClip(-1)).toBeLessThan(-0.76);
            expect(softClip(Number.POSITIVE_INFINITY)).toBe(1);
            expect(softClip(Number.NEGATIVE_INFINITY)).toBe(-1);
        });

        it('keeps the small-signal gain at unity so the loop stays in the linear region', () => {
            for (const value of [0.01, 0.05, 0.1, 0.2]) {
                expect(softClip(value) / value).toBeGreaterThan(0.98);
            }
        });

        it('converges to a constant scale under a constant saturating error instead of limit cycling', () => {
            const { facility, assets } = makeStorageSignalFixture(0);
            const state = getDefaultPidState();
            const error = computeFacilityStorageSignal(facility, assets).maxError;
            expect(error).toBeCloseTo(Math.tanh(12), 5);

            const afterSettling = facility.scale;
            for (let tick = 0; tick < 2_000; tick++) {
                const signal = computeFacilityStorageSignal(facility, assets).maxError;
                const delta = computePidDelta(signal, state) * facility.maxScale;
                facility.scale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));
            }
            expect(facility.scale).toBeCloseTo(afterSettling, 9);
        });

        it('drives scale monotonically once the proportional term alone can hold it', () => {
            const { facility, assets } = makeStorageSignalFixture(0);
            const state = getDefaultPidState();
            const trajectory: number[] = [];
            for (let tick = 0; tick < 30; tick++) {
                const signal = computeFacilityStorageSignal(facility, assets).maxError;
                const delta = computePidDelta(signal, state) * facility.maxScale;
                facility.scale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));
                trajectory.push(facility.scale);
            }
            const diffs = trajectory.slice(1).map((value, index) => value - trajectory[index]);
            expect(diffs.every((diff) => diff >= 0)).toBe(true);
            expect(diffs.every((diff) => diff <= PID_OUT_MAX_UP * facility.maxScale + 1e-9)).toBe(true);
        });

        it('never overshoots the rate limit in either direction', () => {
            expect(PID_OUT_MAX_UP).toBe(PID_OUT_MAX_DOWN);
            const { facility, assets } = makeStorageSignalFixture(3 * 30 * 100 * 0.5);
            const state = getDefaultPidState();
            let previous = facility.scale;
            for (let tick = 0; tick < 500; tick++) {
                const signal = computeFacilityStorageSignal(facility, assets).maxError;
                const delta = computePidDelta(signal, state) * facility.maxScale;
                facility.scale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));
                expect(Math.abs(facility.scale - previous)).toBeLessThanOrEqual(
                    PID_OUT_MAX_UP * facility.maxScale + 1e-9,
                );
                previous = facility.scale;
            }
        });
    });
});

describe('storage lead time keeps the loop out of the limit-cycle band', () => {
    it('keeps the target above the capacity horizon so shells can hold the buffer', () => {
        expect(STORAGE_TARGET_MONTHS).toBeLessThanOrEqual(STORAGE_CAPACITY_MONTHS);
    });
});

describe('capacity expansion arming', () => {
    it('needs at least EXPANSION_INTEGRAL_THRESHOLD ticks at full signal to arm one expansion', () => {
        let integral = 0;
        let ticks = 0;
        while (integral < EXPANSION_INTEGRAL_THRESHOLD) {
            integral = Math.min(EXPANSION_INTEGRAL_MAX, integral + 1);
            ticks++;
        }
        expect(ticks).toBe(EXPANSION_INTEGRAL_THRESHOLD);
    });
});

describe('computeDynamicExpansionTarget sizes the expansion to the storage deficit', () => {
    it('targets the scale that refills the 12-month own-production storage target', () => {
        const { facility, planet } = createMaintenanceChainFixture({
            maxScale: 100,
            scale: 100,
            producesQuantity: 1,
        });
        const assets = makeAgentPlanetAssets(planet.id, {
            productionFacilities: [facility],
        });
        setStorageResourceQuantity(assets.storage, maintenanceServiceResourceType, 4500);
        // target = 12 months * 30 ticks * 100 maxScale * 1 quantity = 36000; inventory 4500 → deficit 31500.
        // scaleForDemand = 31500 / 1 = 31500 → capped at the +10% absolute cap (110).
        const target = computeDynamicExpansionTarget(facility, assets, planet, true, Infinity);

        expect(target).toBe(110);
    });

    it('does not expand when the storage is already at the 12-month target', () => {
        const { facility, planet } = createMaintenanceChainFixture({
            maxScale: 100,
            scale: 100,
            producesQuantity: 1,
        });
        const assets = makeAgentPlanetAssets(planet.id, {
            productionFacilities: [facility],
        });
        setStorageResourceQuantity(assets.storage, maintenanceServiceResourceType, STORAGE_TARGET_MONTHS * 30 * 100);

        const target = computeDynamicExpansionTarget(facility, assets, planet, true, Infinity);

        expect(target).toBe(100);
    });
});

describe('the race between price and supply', () => {
    it('price more than quadruples during the time it takes to arm one <=30% expansion', () => {
        const factor = fillRateFactor(0, TARGET_FILL_RATE_SERVICES, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN, 1);
        const doublingTicks = Math.log(2) / Math.log(factor);
        expect(EXPANSION_INTEGRAL_THRESHOLD / doublingTicks).toBeGreaterThan(2);
    });
});

describe('profitable-but-input-starved maintenance facility must not spuriously contract', () => {
    it('holds capacity when the output market is short and the facility is profitable', () => {
        const { facility, planet } = createMaintenanceChainFixture({
            unfilledFrac: 0.8,
            maxScale: 100,
            scale: 100,
            producesQuantity: 1,
            revenue: 200,
            wageCosts: 100,
            inputCosts: 50,
            resourceEfficiency: { Steel: 0.5 },
            overallEfficiency: 0.5,
        });
        const gameState = makeChainGameState(planet, facility);

        for (let tick = 0; tick < 60; tick++) {
            updateAgentProductionScale(gameState, planet);
        }

        expect(facility.maxScale).toBe(100);
    });

    it('holds capacity when the output market is short and the facility is input-starved and momentarily unprofitable', () => {
        const { facility, planet } = createMaintenanceChainFixture({
            unfilledFrac: 0.8,
            maxScale: 100,
            scale: 100,
            producesQuantity: 1,
            revenue: 0,
            wageCosts: 100,
            inputCosts: 0,
            resourceEfficiency: { Steel: 0.5 },
            overallEfficiency: 0.5,
        });
        const gameState = makeChainGameState(planet, facility);

        for (let tick = 0; tick < 60; tick++) {
            updateAgentProductionScale(gameState, planet);
        }

        expect(facility.maxScale).toBe(100);
    });
});
