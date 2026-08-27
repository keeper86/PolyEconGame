import { describe, expect, it } from 'vitest';
import {
    INPUT_BUFFER_TARGET_TICKS_SERVICES,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    TARGET_FILL_RATE_SERVICES,
} from '../constants';
import { fillRateFactor } from '../market/automaticPricing';
import { makeAgent, makeAgentPlanetAssets, makePlanet, makeProductionFacility } from '../utils/testHelper';
import {
    EXPANSION_INTEGRAL_MAX,
    EXPANSION_INTEGRAL_THRESHOLD,
    PID_IMAX,
    computeFacilitySignal,
    computePidDelta,
    estimateProfitAtScale,
    getDefaultPidState,
    updateAgentProductionScale,
} from './automaticProductionScale';
import type { ProductionFacility } from './facility';
import type { GameState, MarketResult, Planet } from './planet';
import { maintenanceServiceResourceType } from './services';

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
        priceFactor = fillRateFactor(fillRate, TARGET_FILL_RATE_SERVICES, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN);
    }
    return { fillRate, priceFactor };
}

describe('fillRateFactor', () => {
    it('pushes the bid price up below target and down above target', () => {
        expect(fillRateFactor(0, TARGET_FILL_RATE_SERVICES, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN)).toBeCloseTo(
            1.05,
        );
        expect(
            fillRateFactor(
                TARGET_FILL_RATE_SERVICES,
                TARGET_FILL_RATE_SERVICES,
                PRICE_ADJUST_MAX_UP,
                PRICE_ADJUST_MAX_DOWN,
            ),
        ).toBeCloseTo(1);
        expect(fillRateFactor(1, TARGET_FILL_RATE_SERVICES, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN)).toBeCloseTo(
            0.95,
        );
    });
});

describe('bid price runaway', () => {
    it('doubles the bid price every ~14 ticks at zero fill rate', () => {
        const factor = fillRateFactor(0, TARGET_FILL_RATE_SERVICES, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN);
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
        expect(priceFactor).toBeLessThan(1);
    });

    it('buffer target of 3 ticks stalls at ~33% fill at 1x production and compounds forever', () => {
        const { fillRate, priceFactor } = simulateServiceBufferFill({ bufferTargetTicks: 3, productionRatio: 1 });
        expect(fillRate).toBeCloseTo(1 / 3, 1);
        expect(priceFactor).toBeGreaterThan(1);
    });
});

describe('computeFacilitySignal (demand-based)', () => {
    it('is positive on shortage and negative on oversupply', () => {
        const shortage = createMaintenanceChainFixture({ unfilledFrac: 0.8 });
        expect(computeFacilitySignal(shortage.facility, shortage.planet)).toBeCloseTo(0.8, 5);

        const oversupply = createMaintenanceChainFixture({ unfilledFrac: 0 });
        expect(computeFacilitySignal(oversupply.facility, oversupply.planet, { [RESOURCE_NAME]: 0.6 })).toBeCloseTo(
            -0.4,
            5,
        );
    });

    it('treats full sell-through as no surplus regardless of market stock', () => {
        const fixture = createMaintenanceChainFixture({ unfilledFrac: 0 });
        fixture.planet.lastMarketResult[RESOURCE_NAME] = makeMarketResult({
            totalSupply: 1000,
            unsoldSupply: 900,
            totalDemand: 100,
            unfilledDemand: 0,
        });
        expect(computeFacilitySignal(fixture.facility, fixture.planet, { [RESOURCE_NAME]: 1 })).toBe(0);
    });

    it('is zero when supply and demand are balanced', () => {
        const fixture = createMaintenanceChainFixture({ unfilledFrac: 0 });
        expect(computeFacilitySignal(fixture.facility, fixture.planet, { [RESOURCE_NAME]: 1 })).toBeCloseTo(0, 5);
    });

    it('is zero when there is no market data', () => {
        const { facility, planet } = createMaintenanceChainFixture({});
        planet.lastMarketResult = {};
        expect(computeFacilitySignal(facility, planet, { [RESOURCE_NAME]: 1 })).toBe(0);
    });

    it('does not contract a surplus producer while the market is under-served', () => {
        const fixture = createMaintenanceChainFixture({ unfilledFrac: 0.4 });
        // the producer sold only 20% of its output (flowDeviation −0.8) while 40% of the
        // demand went unfilled: the scarcity caps the negative deviation → neutral signal
        expect(computeFacilitySignal(fixture.facility, fixture.planet, { [RESOURCE_NAME]: 0.2 })).toBe(0);
    });

    it('still contracts oversupply when the market is fully served', () => {
        const fixture = createMaintenanceChainFixture({ unfilledFrac: 0 });
        expect(computeFacilitySignal(fixture.facility, fixture.planet, { [RESOURCE_NAME]: 0.2 })).toBeCloseTo(-0.8, 5);
    });

    it('treats a missing sell-through as fully sold', () => {
        const fixture = createMaintenanceChainFixture({ unfilledFrac: 0.3 });
        expect(computeFacilitySignal(fixture.facility, fixture.planet)).toBeCloseTo(0.3, 5);
    });
});

describe('PID utilization response', () => {
    it('converges scale to maxScale in well under 100 ticks of sustained shortage', () => {
        const { facility, planet } = createMaintenanceChainFixture({ unfilledFrac: 0.8, scale: 0.5, maxScale: 1 });
        const state = getDefaultPidState();
        let ticks = 0;
        while (facility.scale < facility.maxScale - 1e-9 && ticks < 10_000) {
            const signal = computeFacilitySignal(facility, planet);
            const delta = computePidDelta(signal, state) * facility.maxScale;
            facility.scale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));
            ticks++;
        }
        expect(facility.scale).toBeCloseTo(facility.maxScale);
        expect(ticks).toBeLessThan(100);
    });

    it('stays bounded over 10_000 ticks', () => {
        const { facility, planet } = createMaintenanceChainFixture({ unfilledFrac: 0.3, scale: 0.5, maxScale: 1 });
        const state = getDefaultPidState();
        for (let tick = 0; tick < 10_000; tick++) {
            const signal = computeFacilitySignal(facility, planet);
            const delta = computePidDelta(signal, state) * facility.maxScale;
            facility.scale = Math.max(facility.maxScale * 0.1, Math.min(facility.maxScale, facility.scale + delta));
            expect(Number.isFinite(facility.scale)).toBe(true);
            expect(Number.isFinite(state.integral)).toBe(true);
        }
        expect(state.integral).toBeGreaterThanOrEqual(-PID_IMAX);
        expect(state.integral).toBeLessThanOrEqual(PID_IMAX);
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

describe('the race between price and supply', () => {
    it('price more than quadruples during the time it takes to arm one <=30% expansion', () => {
        const factor = fillRateFactor(0, TARGET_FILL_RATE_SERVICES, PRICE_ADJUST_MAX_UP, PRICE_ADJUST_MAX_DOWN);
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

describe('estimateProfitAtScale (marginal profit)', () => {
    it('price-response: a higher output price raises profit at expansion scale', () => {
        const cheap = createMaintenanceChainFixture({ price: 10, scale: 100, maxScale: 100, producesQuantity: 1 });
        const expensive = createMaintenanceChainFixture({ price: 20, scale: 100, maxScale: 100, producesQuantity: 1 });
        const target = 100 * 1.025;

        expect(estimateProfitAtScale(expensive.facility, expensive.planet, target)).toBeGreaterThan(
            estimateProfitAtScale(cheap.facility, cheap.planet, target),
        );
    });

    it('input-scarcity non-linearity: expansion does not raise profit for an input-starved facility', () => {
        const fixture = createMaintenanceChainFixture({
            scale: 100,
            maxScale: 100,
            producesQuantity: 1,
            wageCosts: 100,
            resourceEfficiency: { Steel: 0.5 },
            overallEfficiency: 0.5,
        });

        const current = estimateProfitAtScale(fixture.facility, fixture.planet, 100);
        const expanded = estimateProfitAtScale(fixture.facility, fixture.planet, 100 * 1.025);

        expect(expanded).toBeLessThan(current);
    });

    it('expand decision: a non-starved profitable facility is more profitable at expansion scale', () => {
        const fixture = createMaintenanceChainFixture({
            unfilledFrac: 0.8,
            price: 12,
            scale: 50,
            maxScale: 100,
            producesQuantity: 1,
        });

        expect(estimateProfitAtScale(fixture.facility, fixture.planet, 50 * 1.025)).toBeGreaterThan(
            estimateProfitAtScale(fixture.facility, fixture.planet, 50),
        );
    });

    it('contract decision: an unprofitable facility is more profitable at contraction scale', () => {
        const fixture = createMaintenanceChainFixture({
            scale: 100,
            maxScale: 100,
            producesQuantity: 1,
            wageCosts: 1000,
        });

        expect(estimateProfitAtScale(fixture.facility, fixture.planet, 100 * 0.975)).toBeGreaterThan(
            estimateProfitAtScale(fixture.facility, fixture.planet, 100),
        );
    });
});
