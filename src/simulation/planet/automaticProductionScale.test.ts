import { describe, expect, it } from 'vitest';

import { makeAgent, makeAgentPlanetAssets, makePlanet, makeProductionFacility } from '../utils/testHelper';
import {
    PROD_SCALE_DOWN_THRESHOLD,
    PROD_SCALE_STEP_MAX,
    PROD_SCALE_UP_MIN_EFFICIENCY,
    PROD_SCALE_UP_THRESHOLD,
    updateAgentProductionScale,
} from './automaticProductionScale';
import type { Agent, MarketResult, Planet } from './planet';
import { agriculturalProductResourceType } from './resources';

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
    const MAX_STEP = PROD_SCALE_STEP_MAX; // 0.01 × maxScale

    it('does not change scale in the neutral band (slight supply excess below threshold)', () => {
        const supplyExcess = PROD_SCALE_DOWN_THRESHOLD * 0.8; // below threshold
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: supplyExcess * 100, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('does not change scale in the neutral band (slight demand excess below threshold)', () => {
        const demandExcess = PROD_SCALE_UP_THRESHOLD * 0.8; // below threshold
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: demandExcess * 100, totalDemand: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('scales down by exactly MAX_STEP when supply excess exceeds threshold', () => {
        const supplyExcess = (PROD_SCALE_DOWN_THRESHOLD + 0.05) * 100; // clearly over threshold
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: supplyExcess, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeCloseTo(initial - MAX_STEP * facility.maxScale);
    });

    it('scales up by exactly MAX_STEP when demand excess exceeds threshold and conditions are met', () => {
        const unfilledDemand = (PROD_SCALE_UP_THRESHOLD + 0.05) * 100; // clearly over threshold
        const planet = makePlanetWithAvg(
            makeMarketResult({
                unfilledDemand,
                totalDemand: 100,
                clearingPrice: 12, // positive margin over cost of 10
                productionCost: 10,
            }),
        );
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeCloseTo(initial + MAX_STEP * facility.maxScale);
    });

    it('does NOT scale up when overallEfficiency is below PROD_SCALE_UP_MIN_EFFICIENCY', () => {
        const unfilledDemand = (PROD_SCALE_UP_THRESHOLD + 0.05) * 100;
        const planet = makePlanetWithAvg(
            makeMarketResult({ unfilledDemand, totalDemand: 100, clearingPrice: 12, productionCost: 10 }),
        );
        const { agents, facility } = makeSetup(planet, {
            lastTickResults: {
                overallEfficiency: PROD_SCALE_UP_MIN_EFFICIENCY - 0.1, // bottlenecked
                workerEfficiency: {},
                resourceEfficiency: {},
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

        expect(facility.scale).toBe(initial);
    });

    it('does NOT scale up when clearing price margin is below PROD_SCALE_UP_MIN_MARGIN', () => {
        const unfilledDemand = (PROD_SCALE_UP_THRESHOLD + 0.05) * 100;
        // margin = (clearingPrice - productionCost) / productionCost = (7 - 10) / 10 = -0.3  → below -0.10
        const planet = makePlanetWithAvg(
            makeMarketResult({
                unfilledDemand,
                totalDemand: 100,
                clearingPrice: 7,
                productionCost: 10,
            }),
        );
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('clamps scale to 0 when already at very low scale and oversupplied', () => {
        const supplyExcess = (PROD_SCALE_DOWN_THRESHOLD + 0.05) * 100;
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: supplyExcess, totalSupply: 100 }));
        // Start at a scale so close to 0 that MAX_STEP would push it negative.
        const { agents, facility } = makeSetup(planet, { scale: MAX_STEP * 0.5, maxScale: 1 });

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(0);
        expect(facility.scale).toBeGreaterThanOrEqual(0);
    });

    it('clamps scale to maxScale when over-demanded', () => {
        const unfilledDemand = (PROD_SCALE_UP_THRESHOLD + 0.05) * 100;
        const planet = makePlanetWithAvg(
            makeMarketResult({ unfilledDemand, totalDemand: 100, clearingPrice: 12, productionCost: 10 }),
        );
        // Start very close to maxScale so the step would exceed it.
        const maxScale = 1;
        const { agents, facility } = makeSetup(planet, { scale: maxScale - MAX_STEP * 0.5, maxScale });

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(maxScale);
    });

    it('skips a facility under construction', () => {
        const supplyExcess = (PROD_SCALE_DOWN_THRESHOLD + 0.05) * 100;
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: supplyExcess, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet, {
            construction: {
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
        // Planet has empty avgMarketResult — no history yet for this facility's output.
        const planet = makePlanet({ avgMarketResult: {} });
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('does not touch a non-automated agent', () => {
        const supplyExcess = (PROD_SCALE_DOWN_THRESHOLD + 0.05) * 100;
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: supplyExcess, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        // Make the agent non-automated.
        const agent = agents.values().next().value as Agent;
        agent.automated = false;
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('averages signals across multiple outputs (up when avg crosses threshold)', () => {
        // Facility produces two resources:
        //   - RESOURCE: well-supplied, no unfilled demand
        //   - RESOURCE_B: strongly under-supplied
        // Average demand excess should cross PROD_SCALE_UP_THRESHOLD.
        const resourceB = { ...RESOURCE, name: 'resource-b' };
        const strongDemandExcess = (PROD_SCALE_UP_THRESHOLD + 0.05) * 2 * 100; // strong signal on resource B

        const planet = makePlanet({
            avgMarketResult: {
                [RESOURCE_NAME]: makeMarketResult({ unfilledDemand: 0, totalDemand: 100 }),
                'resource-b': {
                    resourceName: 'resource-b',
                    clearingPrice: 12,
                    totalVolume: 100,
                    totalDemand: 100,
                    totalSupply: 100,
                    unfilledDemand: strongDemandExcess,
                    unsoldSupply: 0,
                    productionCost: 10,
                },
            },
        });

        const facility = makeProductionFacility(
            {},
            {
                maxScale: 1,
                scale: 0.5,
                produces: [
                    { resource: RESOURCE, quantity: 100 },
                    { resource: resourceB, quantity: 100 },
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
                [planet.id]: makeAgentPlanetAssets(planet.id, { productionFacilities: [facility] }),
            },
        });
        const agents = new Map([[agent.id, agent]]);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        // Average demandExcess > threshold → scale should increase.
        expect(facility.scale).toBeGreaterThan(initial);
    });
});
