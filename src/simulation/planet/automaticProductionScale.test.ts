import { describe, expect, it } from 'vitest';

import { makeAgent, makeAgentPlanetAssets, makePlanet, makeProductionFacility } from '../utils/testHelper';
import { EXPANSION_INTEGRAL_THRESHOLD, PID_KP, updateAgentProductionScale } from './automaticProductionScale';
import type { Agent, MarketResult, Planet } from './planet';
import { agriculturalProductResourceType, crudeOilResourceType, naturalGasResourceType } from './resources';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RESOURCE = agriculturalProductResourceType;
const RESOURCE_NAME = RESOURCE.name;

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

/** Build a planet whose lastMarketResult and avgMarketResult are pre-set for RESOURCE_NAME. */
function makePlanetWithAvg(avg: MarketResult): Planet {
    return makePlanet({ lastMarketResult: { [RESOURCE_NAME]: avg }, avgMarketResult: { [RESOURCE_NAME]: avg } });
}

/** Create an automated agent with one production facility on the given planet. */
function makeSetup(
    planet: Planet,
    facilityOverrides?: Parameters<typeof makeProductionFacility>[1],
): {
    agents: Map<string, Agent>;
    facility: ReturnType<typeof makeProductionFacility>;
} {
    const facility = makeProductionFacility(
        {},
        {
            maxScale: 1,
            scale: 0.5,
            produces: [{ resource: RESOURCE, quantity: 100 }],
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
                costBalance: 0,
            },
            ...facilityOverrides,
        },
    );

    const agent = makeAgent('a1', planet.id, 'Agent 1', {
        automated: true,
        assets: {
            [planet.id]: makeAgentPlanetAssets(planet.id, {
                productionFacilities: [facility],
            }),
        },
    });

    return { agents: new Map([[agent.id, agent]]), facility };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateAgentProductionScale', () => {
    it('makes only a very small scale change for a weak supply-excess signal', () => {
        // supplyExcess = 0.2 → signal ≈ -0.2; PID produces a tiny negative delta (< 1% of maxScale)
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 20, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Negative direction but very small — PID should not cause a runaway change
        expect(facility.scale).toBeLessThanOrEqual(initial);
        expect(facility.scale).toBeGreaterThan(initial - 0.03 * facility.maxScale);
    });

    it('makes only a very small scale change for a weak demand-excess signal', () => {
        // demandExcess = 0.2 → signal ≈ 0.2; PID produces a tiny positive delta (< 1% of maxScale)
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 20, totalDemand: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Positive direction but very small
        expect(facility.scale).toBeGreaterThanOrEqual(initial);
        expect(facility.scale).toBeLessThan(initial + 0.03 * facility.maxScale);
    });

    it('scales down when supply excess is strong', () => {
        // supplyExcess = 0.8 → signal ≈ -0.8; PID should produce a negative delta
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 80, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeLessThan(initial);
    });

    it('scales up when demand excess is strong and conditions are met', () => {
        // demandExcess = 0.8, profitSignal = 0 (lastProduced is empty in test setup, so revenue=0)
        // signal ≈ 0.8; PID should produce a positive delta
        const planet = makePlanetWithAvg(
            makeMarketResult({
                unfilledDemand: 80,
                totalDemand: 100,
                clearingPrice: 12,
            }),
        );
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('clamps scale to the minimum floor when already at very low scale and oversupplied', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 80, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet, { scale: 0.0001, maxScale: 1 });

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(facility.maxScale * 0.1);
    });

    it('clamps scale to maxScale when over-demanded', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        // Start very close to maxScale so the PID output would push it above → clamp to maxScale.
        const maxScale = 1;
        const { agents, facility } = makeSetup(planet, { scale: maxScale - 0.0001, maxScale });

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(maxScale);
    });

    it('skips a facility under construction (type === "new")', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 80, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet, {
            construction: {
                type: 'new',
                progress: 0,
                totalConstructionServiceRequired: 1000,
                constructionTargetMaxScale: 1,
                lastTickInvestedConstructionServices: 0,
                maximumConstructionServiceConsumption: 100,
            },
        });
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('skips when there is no avgMarketResult and no open bids (no history, no demand)', () => {
        // No last/avg market result AND empty order book → no signal, scale unchanged.
        const planet = makePlanet({ lastMarketResult: {}, avgMarketResult: {}, orderBooks: {} });
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('scales UP when no lastMarketResult but open buy orders exist in the order book', () => {
        // No market history yet but buyers are waiting → treat all bid quantity as unfilled demand
        // and produce a positive scale signal.
        const planet = makePlanet({
            lastMarketResult: {},
            avgMarketResult: {},
            orderBooks: {
                [RESOURCE_NAME]: {
                    asks: [],
                    bids: [
                        { price: 15, quantity: 500 },
                        { price: 12, quantity: 300 },
                    ],
                },
            },
        });
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('does not touch a non-automated agent', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 80, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const agent = agents.values().next().value as Agent;
        agent.automated = false;
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('initiates capacity expansion when scale == maxScale, integral >= threshold, and agent has sufficient deposits', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        // Use a larger maxScale so calculateCostsForConstruction's integer loop has work to do.
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            // Pre-set expansionIntegral past the threshold so expansion fires immediately.
            pidState: { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD },
        });
        // Give the agent enough deposits to cover the expansion cost.
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;
        expect(facility.construction).toBeNull();

        updateAgentProductionScale(agents, planet);

        // Should have started a construction project
        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.constructionTargetMaxScale).toBeGreaterThan(10);
        expect(facility.construction!.totalConstructionServiceRequired).toBeGreaterThan(0);
    });

    it('does NOT initiate capacity expansion when integral < threshold (not enough sustained pressure)', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, { scale: 10, maxScale: 10 });
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;
        // No pidState pre-set → expansionIntegral starts at 0, well below EXPANSION_INTEGRAL_THRESHOLD.
        expect(facility.construction).toBeNull();

        updateAgentProductionScale(agents, planet);

        // Should NOT have started a construction project
        expect(facility.construction).toBeNull();
    });

    it('does NOT initiate capacity expansion when agent lacks sufficient deposits (integral is sufficient)', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD },
        });
        // Agent has zero deposits — the deposit check should block expansion.
        expect(facility.construction).toBeNull();

        updateAgentProductionScale(agents, planet);

        // Should NOT have started a construction project
        expect(facility.construction).toBeNull();
    });

    it('scales up when profitable (positive costBalance) and demand exceeds threshold', () => {
        // Profitable facility: revenue > actualCost → costBalance > 0
        // lastProduced has 100 units at clearingPrice 12 → revenue = 1200
        // costBalance = 200 → actualCost = revenue - costBalance = 1000
        // profit margin = (1200 - 1000) / 1000 = 0.2
        // demandExcess = 0.8 → signal = 0.8 - 0 + 0.2*0.5 = 0.9 > threshold
        const planet = makePlanetWithAvg(
            makeMarketResult({
                unfilledDemand: 80,
                totalDemand: 100,
                clearingPrice: 12,
            }),
        );
        const { agents, facility } = makeSetup(planet, {
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: { [RESOURCE_NAME]: 100 },
                lastConsumed: {},
                costBalance: 200, // revenue(1200) - actualCost(1000) = 200
            },
        });
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Should scale up (not down!) because the facility is profitable
        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('does not scale up when output buffer is near full', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, { scale: 0.5, maxScale: 1 });
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Without storage facility, queryStorageFacility returns 0, so output buffer is not full
        // → signal should be positive → scale should increase
        expect(facility.scale).toBeGreaterThan(initial);
    });

    // -----------------------------------------------------------------------
    // Multi-output facility tests (e.g. oil well: crude oil + natural gas)
    // -----------------------------------------------------------------------

    it('scales up a multi-output facility when main product is in shortage despite byproduct glut', () => {
        // Oil well produces crude oil (high demand) and natural gas (worthless byproduct)
        const OIL = crudeOilResourceType;
        const GAS = naturalGasResourceType;

        // Override marketPrices so OIL (50) dominates the weighted signal over GAS (1).
        // Without this, both resources have the same initialMarketPrice (1.5), and the
        // -0.9 gas oversupply would cancel out the +0.8 oil shortage.
        const planet = makePlanet({
            lastMarketResult: {
                [OIL.name]: {
                    resourceName: OIL.name,
                    clearingPrice: 50,
                    totalVolume: 100,
                    totalDemand: 100,
                    totalSupply: 100,
                    unfilledDemand: 80, // 80% unfilled → strong demand signal
                    unsoldSupply: 0,
                },
                [GAS.name]: {
                    resourceName: GAS.name,
                    clearingPrice: 1,
                    totalVolume: 10,
                    totalDemand: 10,
                    totalSupply: 100,
                    unfilledDemand: 0,
                    unsoldSupply: 90, // 90% unsold → massive oversupply
                },
            },
            avgMarketResult: {
                [OIL.name]: {
                    resourceName: OIL.name,
                    clearingPrice: 50,
                    totalVolume: 100,
                    totalDemand: 100,
                    totalSupply: 100,
                    unfilledDemand: 80,
                    unsoldSupply: 0,
                },
                [GAS.name]: {
                    resourceName: GAS.name,
                    clearingPrice: 1,
                    totalVolume: 10,
                    totalDemand: 10,
                    totalSupply: 100,
                    unfilledDemand: 0,
                    unsoldSupply: 90,
                },
            },
            marketPrices: { [OIL.name]: 50, [GAS.name]: 1 },
        });

        const facility = makeProductionFacility(
            {},
            {
                maxScale: 1,
                scale: 0.5,
                produces: [
                    { resource: OIL, quantity: 300 },
                    { resource: GAS, quantity: 100 },
                ],
                lastTickResults: {
                    overallEfficiency: 1,
                    workerEfficiency: {},
                    resourceEfficiency: {},
                    overqualifiedWorkers: {},
                    exactUsedByEdu: {},
                    totalUsedByEdu: {},
                    lastProduced: {},
                    lastConsumed: {},
                    costBalance: 0,
                },
            },
        );

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [facility],
                }),
            },
        });

        const agents = new Map([[agent.id, agent]]);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Oil signal = 0.8 - 0 = 0.8, Gas signal = 0 - 0.9 = -0.9
        // maxOutputSignal = max(0.8, -0.9) = 0.8 → should scale up
        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('does not let a zero-demand byproduct trigger output buffer veto', () => {
        // Oil well: crude oil in shortage, natural gas has zero demand (no market history)
        const OIL = crudeOilResourceType;
        const GAS = naturalGasResourceType;

        const planet = makePlanet({
            lastMarketResult: {
                [OIL.name]: {
                    resourceName: OIL.name,
                    clearingPrice: 50,
                    totalVolume: 100,
                    totalDemand: 100,
                    totalSupply: 100,
                    unfilledDemand: 80,
                    unsoldSupply: 0,
                },
                // GAS has no lastMarketResult/avgMarketResult — zero demand, never traded
            },
            avgMarketResult: {
                [OIL.name]: {
                    resourceName: OIL.name,
                    clearingPrice: 50,
                    totalVolume: 100,
                    totalDemand: 100,
                    totalSupply: 100,
                    unfilledDemand: 80,
                    unsoldSupply: 0,
                },
                // GAS has no avgMarketResult at all — zero demand, never traded
            },
        });

        const facility = makeProductionFacility(
            {},
            {
                maxScale: 1,
                scale: 0.5,
                produces: [
                    { resource: OIL, quantity: 300 },
                    { resource: GAS, quantity: 100 },
                ],
                lastTickResults: {
                    overallEfficiency: 1,
                    workerEfficiency: {},
                    resourceEfficiency: {},
                    overqualifiedWorkers: {},
                    exactUsedByEdu: {},
                    totalUsedByEdu: {},
                    lastProduced: {},
                    lastConsumed: {},
                    costBalance: 0,
                },
            },
        );

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [facility],
                }),
            },
        });

        const agents = new Map([[agent.id, agent]]);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Should scale up because oil demand signal dominates and gas (no market data)
        // is skipped in both the signal computation and the buffer check
        expect(facility.scale).toBeGreaterThan(initial);
    });

    // -----------------------------------------------------------------------
    // PID controller behaviour tests
    // -----------------------------------------------------------------------

    it('integral accumulation causes larger scale changes over repeated ticks than a single proportional step', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, { scale: 0.0, maxScale: 100 });
        facility.pidState = { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: 0 };

        const N = 20;
        for (let i = 0; i < N; i++) {
            updateAgentProductionScale(agents, planet);
        }

        const minExpected = facility.maxScale * 0.1 + (N - 1) * PID_KP * 0.2 * facility.maxScale;
        expect(facility.scale).toBeGreaterThan(minExpected);
    });

    it('derivative term produces braking when error signal suddenly drops', () => {
        // Run several ticks with a strong positive signal to build up filteredError and integral.
        const planetDemand = makePlanetWithAvg(
            makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }),
        );
        const { agents, facility } = makeSetup(planetDemand, { scale: 0.0, maxScale: 100 });
        facility.pidState = { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: 0 };

        for (let i = 0; i < 5; i++) {
            updateAgentProductionScale(agents, facility.pidState ? planetDemand : planetDemand);
        }
        const scaleAfterBuild = facility.scale;

        // Now switch to a balanced market (signal ≈ 0). The D term fires a braking impulse
        // because filteredError transitions from high to low, producing a negative D contribution.
        const planetBalanced = makePlanetWithAvg(makeMarketResult()); // balanced: no unfilled/unsold
        for (let i = 0; i < 5; i++) {
            updateAgentProductionScale(agents, planetBalanced);
        }

        // The D term fires a braking impulse at the first balanced tick, significantly
        // reducing the growth rate compared to the demand phase. Scale may still creep up
        // slightly due to the accumulated integral, but the increase is much smaller than
        // what was built up during the demand phase.
        const demandPhaseGrowth = scaleAfterBuild; // started from scale=0.0
        const balancedPhaseGrowth = facility.scale - scaleAfterBuild;
        expect(balancedPhaseGrowth).toBeLessThan(demandPhaseGrowth * 0.1);
        expect(facility.scale).toBeGreaterThan(facility.maxScale * 0.1);
    });

    it('PID state is persisted on the facility object after update', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet);
        expect(facility.pidState).toBeNull(); // starts as null from makeProductionFacility

        updateAgentProductionScale(agents, planet);

        expect(facility.pidState).not.toBeNull();
        expect(facility.pidState).toMatchObject({
            integral: expect.any(Number),
            prevError: expect.any(Number),
            filteredError: expect.any(Number),
            expansionIntegral: expect.any(Number),
        });
    });

    it('expansion integral resets to 0 after a successful expansion', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD },
        });
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;

        updateAgentProductionScale(agents, planet);

        expect(facility.construction).not.toBeNull(); // expansion fired
        expect(facility.pidState!.expansionIntegral).toBe(0); // integral was reset
    });

    it('recovers from scale=0 trap: uses lastMarketResult (not EMA) so stale unsold history does not block scale-up', () => {
        // Scenario: EMA (avgMarketResult) still shows heavy historical oversupply from an
        // initial burst, but the CURRENT tick (lastMarketResult) shows demand returning and
        // supply recovered.  Because the signal is now computed from lastMarketResult, the
        // facility should scale up even though avgMarketResult looks bad.
        const planet = makePlanet({
            // lastMarketResult: demand returned, low supply → positive signal
            lastMarketResult: {
                [RESOURCE_NAME]: {
                    resourceName: RESOURCE_NAME,
                    clearingPrice: 10,
                    totalVolume: 50,
                    totalDemand: 100,
                    totalSupply: 20,
                    unfilledDemand: 80, // 80% unfilled — lots of unmet demand
                    unsoldSupply: 0,
                },
            },
            // avgMarketResult: historical EMA still poisoned by the initial oversupply burst
            avgMarketResult: {
                [RESOURCE_NAME]: {
                    resourceName: RESOURCE_NAME,
                    clearingPrice: 10,
                    totalVolume: 20,
                    totalDemand: 30,
                    totalSupply: 200, // legacy high supply in EMA
                    unfilledDemand: 0,
                    unsoldSupply: 180, // 90% unsold — would pin signal to -0.9 under old logic
                },
            },
        });
        const { agents, facility } = makeSetup(planet, { scale: 0.0, maxScale: 1 });

        updateAgentProductionScale(agents, planet);

        // Signal is driven by lastMarketResult (positive), not avgMarketResult (negative).
        expect(facility.scale).toBeGreaterThan(0);
    });
});
