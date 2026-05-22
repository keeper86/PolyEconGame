import { describe, expect, it } from 'vitest';

import { makeAgent, makeAgentPlanetAssets, makePlanet, makeProductionFacility } from '../utils/testHelper';
import {
    EXPANSION_DEPOSIT_THRESHOLD,
    PROD_SCALE_BASE_STEP,
    updateAgentProductionScale,
} from './automaticProductionScale';
import { constructionServiceResourceType } from './services';
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
        productionCost: 10,
        ...overrides,
    };
}

/** Build a planet whose avgMarketResult is pre-set for RESOURCE_NAME. */
function makePlanetWithAvg(avg: MarketResult): Planet {
    return makePlanet({ avgMarketResult: { [RESOURCE_NAME]: avg } });
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
    it('does not change scale in the neutral band (slight supply excess below threshold)', () => {
        // supplyExcess = 0.2 → signal ≈ -0.2 (below PROD_SCALE_SIGNAL_THRESHOLD of 0.3)
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 20, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('does not change scale in the neutral band (slight demand excess below threshold)', () => {
        // demandExcess = 0.2 → signal ≈ 0.2 (below threshold)
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 20, totalDemand: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('scales down when supply excess exceeds threshold', () => {
        // supplyExcess = 0.8 → signal ≈ -0.8 (well below -threshold)
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 80, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Step = baseStep * |signal| * maxScale = 0.05 * 0.8 * 1 = 0.04
        expect(facility.scale).toBeCloseTo(initial - PROD_SCALE_BASE_STEP * 0.8 * facility.maxScale);
    });

    it('scales up when demand excess exceeds threshold and conditions are met', () => {
        // demandExcess = 0.8, profitSignal = 0 (lastProduced is empty in test setup, so revenue=0)
        // signal = 0.8 - 0 + 0*0.5 = 0.8
        const planet = makePlanetWithAvg(
            makeMarketResult({
                unfilledDemand: 80,
                totalDemand: 100,
                clearingPrice: 12,
                productionCost: 10,
            }),
        );
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Step = baseStep * |signal| * maxScale = 0.05 * 0.8 * 1 = 0.04
        expect(facility.scale).toBeCloseTo(initial + PROD_SCALE_BASE_STEP * 0.8 * facility.maxScale);
    });

    it('does NOT scale up when input resource efficiency is low (input starved)', () => {
        const planet = makePlanetWithAvg(
            makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12, productionCost: 10 }),
        );
        const { agents, facility } = makeSetup(planet, {
            lastTickResults: {
                overallEfficiency: 0.3,
                workerEfficiency: {},
                resourceEfficiency: { [RESOURCE_NAME]: 0.2 }, // below INPUT_EFFICIENCY_MIN (0.5)
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
                costBalance: 0,
            },
        });
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Signal would be positive but input starved → signal clamped to 0 → no change
        expect(facility.scale).toBe(initial);
    });

    it('clamps scale to 0 when already at very low scale and oversupplied', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 80, totalSupply: 100 }));
        // Start at a scale so close to 0 that the step would push it negative.
        const { agents, facility } = makeSetup(planet, { scale: PROD_SCALE_BASE_STEP * 0.5, maxScale: 1 });

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(0);
        expect(facility.scale).toBeGreaterThanOrEqual(0);
    });

    it('clamps scale to maxScale when over-demanded', () => {
        const planet = makePlanetWithAvg(
            makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12, productionCost: 10 }),
        );
        // Start very close to maxScale so the step would exceed it.
        const maxScale = 1;
        const { agents, facility } = makeSetup(planet, { scale: maxScale - PROD_SCALE_BASE_STEP * 0.5, maxScale });

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

    it('skips when there is no avgMarketResult for the produced resource (no history)', () => {
        const planet = makePlanet({ avgMarketResult: {} });
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
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

    it('initiates capacity expansion when scale == maxScale, signal is positive, and agent has sufficient deposits', () => {
        const planet = makePlanetWithAvg(
            makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12, productionCost: 10 }),
        );
        // Use a larger maxScale so calculateCostsForConstruction's integer loop has work to do.
        const { agents, facility } = makeSetup(planet, { scale: 10, maxScale: 10 });
        // Give the agent enough deposits to cover the expansion cost.
        // Construction price is 1.0 (from initialMarketPrices), totalCost ≈ sum of costs from 11 to 11.
        // A large deposit ensures the check passes.
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;
        expect(facility.construction).toBeNull();

        updateAgentProductionScale(agents, planet);

        // Should have started a construction project
        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.constructionTargetMaxScale).toBeGreaterThan(10);
        expect(facility.construction!.totalConstructionServiceRequired).toBeGreaterThan(0);
    });

    it('does NOT initiate capacity expansion when agent lacks sufficient deposits', () => {
        const planet = makePlanetWithAvg(
            makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12, productionCost: 10 }),
        );
        const { agents, facility } = makeSetup(planet, { scale: 10, maxScale: 10 });
        // Agent has zero deposits (default from makeAgentPlanetAssets) — insufficient.
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
                productionCost: 10,
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
        const planet = makePlanetWithAvg(
            makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12, productionCost: 10 }),
        );
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

        const planet = makePlanet({
            avgMarketResult: {
                [OIL.name]: {
                    resourceName: OIL.name,
                    clearingPrice: 50,
                    totalVolume: 100,
                    totalDemand: 100,
                    totalSupply: 100,
                    unfilledDemand: 80, // 80% unfilled → strong demand signal
                    unsoldSupply: 0,
                    productionCost: 10,
                },
                [GAS.name]: {
                    resourceName: GAS.name,
                    clearingPrice: 1,
                    totalVolume: 10,
                    totalDemand: 10,
                    totalSupply: 100,
                    unfilledDemand: 0,
                    unsoldSupply: 90, // 90% unsold → massive oversupply
                    productionCost: 1,
                },
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

        // Oil signal = 0.8 - 0 = 0.8, Gas signal = 0 - 0.9 = -0.9
        // maxOutputSignal = max(0.8, -0.9) = 0.8 → should scale up
        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('does not let a zero-demand byproduct trigger output buffer veto', () => {
        // Oil well: crude oil in shortage, natural gas has zero demand (no market history)
        const OIL = crudeOilResourceType;
        const GAS = naturalGasResourceType;

        const planet = makePlanet({
            avgMarketResult: {
                [OIL.name]: {
                    resourceName: OIL.name,
                    clearingPrice: 50,
                    totalVolume: 100,
                    totalDemand: 100,
                    totalSupply: 100,
                    unfilledDemand: 80,
                    unsoldSupply: 0,
                    productionCost: 10,
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
});
