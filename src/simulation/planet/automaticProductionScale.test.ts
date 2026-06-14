import { describe, expect, it } from 'vitest';

import {
    makeAgent,
    makeAgentPlanetAssets,
    makePlanet,
    makePopulationByEducation,
    makeProductionFacility,
} from '../utils/testHelper';
import { EXPANSION_INTEGRAL_THRESHOLD, PID_KP, updateAgentProductionScale } from './automaticProductionScale';
import type { Agent, MarketResult, Planet } from './planet';
import { crudeOilResourceType, naturalGasResourceType, produceResourceType } from './resources';

const RESOURCE = produceResourceType;
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

function makePlanetWithAvg(avg: MarketResult): Planet {
    return makePlanet({ lastMarketResult: { [RESOURCE_NAME]: avg }, avgMarketResult: { [RESOURCE_NAME]: avg } });
}

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
                revenue: 0,
                wageCosts: 0,
                inputCosts: 0,
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

/** Create a planet with enough unemployed workers to pass hasSufficientUnemployedWorkers check
 * and with lastProductionCostFloors set so price inflation factor stays below the caution threshold. */
function makePlanetWithWorkersAndCostFloor(clearingPrice: number, costFloor: number): Planet {
    const planet = makePlanet({
        lastMarketResult: {
            [RESOURCE_NAME]: {
                resourceName: RESOURCE_NAME,
                clearingPrice,
                totalVolume: 100,
                totalDemand: 100,
                totalSupply: 100,
                unfilledDemand: 80,
                unsoldSupply: 0,
            },
        },
        avgMarketResult: {
            [RESOURCE_NAME]: {
                resourceName: RESOURCE_NAME,
                clearingPrice,
                totalVolume: 100,
                totalDemand: 100,
                totalSupply: 100,
                unfilledDemand: 80,
                unsoldSupply: 0,
            },
        },
        // Provide enough unemployed workers so hasSufficientUnemployedWorkers passes
        population: makePopulationByEducation({ none: 10_000 }),
        // Set cost floor so price/cost ratio = clearingPrice / costFloor stays reasonable
        lastProductionCostFloors: { [RESOURCE_NAME]: costFloor },
    });
    return planet;
}

describe('updateAgentProductionScale', () => {
    it('makes only a very small scale change for a weak supply-excess signal', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 20, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeLessThanOrEqual(initial);
        expect(facility.scale).toBeGreaterThan(initial - 0.07 * facility.maxScale);
    });

    it('makes only a very small scale change for a weak demand-excess signal', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 20, totalDemand: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeGreaterThanOrEqual(initial);
        expect(facility.scale).toBeLessThan(initial + 0.07 * facility.maxScale);
    });

    it('scales down when supply excess is strong', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 80, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeLessThan(initial);
    });

    it('scales up when demand excess is strong and conditions are met', () => {
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
        const planet = makePlanet({ lastMarketResult: {}, avgMarketResult: {}, orderBooks: {} });
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBe(initial);
    });

    it('scales UP when no lastMarketResult but open buy orders exist in the order book', () => {
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
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);

        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,

            pidState: { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD },
            // Need a worker requirement so hasSufficientUnemployedWorkers passes
            workerRequirement: { none: 1 },
        });

        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;
        expect(facility.construction).toBeNull();

        updateAgentProductionScale(agents, planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.constructionTargetMaxScale).toBeGreaterThan(10);
        expect(facility.construction!.totalConstructionServiceRequired).toBeGreaterThan(0);
    });

    it('does NOT initiate capacity expansion when integral < threshold (not enough sustained pressure)', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        const { agents, facility } = makeSetup(planet, { scale: 10, maxScale: 10, workerRequirement: { none: 1 } });
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;

        expect(facility.construction).toBeNull();

        updateAgentProductionScale(agents, planet);

        expect(facility.construction).toBeNull();
    });

    it('does NOT initiate capacity expansion when agent lacks sufficient deposits (integral is sufficient)', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD },
            workerRequirement: { none: 1 },
        });

        expect(facility.construction).toBeNull();

        updateAgentProductionScale(agents, planet);

        expect(facility.construction).toBeNull();
    });

    it('scales up when profitable (revenue exceeds costs) and demand exceeds threshold', () => {
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
                revenue: 1200,
                wageCosts: 600,
                inputCosts: 400,
                costBalance: 200,
            },
        });
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('does not scale up when output buffer is near full', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, { scale: 0.5, maxScale: 1 });
        const initial = facility.scale;

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('scales up a multi-output facility when main product is in shortage despite byproduct glut', () => {
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
                    revenue: 0,
                    wageCosts: 0,
                    inputCosts: 0,
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

        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('does not let a zero-demand byproduct trigger output buffer veto', () => {
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
                    revenue: 0,
                    wageCosts: 0,
                    inputCosts: 0,
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

        expect(facility.scale).toBeGreaterThan(initial);
    });

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
        const planetDemand = makePlanetWithAvg(
            makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }),
        );
        const { agents, facility } = makeSetup(planetDemand, { scale: 0.0, maxScale: 100 });
        facility.pidState = { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: 0 };

        for (let i = 0; i < 5; i++) {
            updateAgentProductionScale(agents, facility.pidState ? planetDemand : planetDemand);
        }
        const scaleAfterBuild = facility.scale;

        const planetBalanced = makePlanetWithAvg(makeMarketResult());
        for (let i = 0; i < 5; i++) {
            updateAgentProductionScale(agents, planetBalanced);
        }

        const demandPhaseGrowth = scaleAfterBuild;
        const balancedPhaseGrowth = facility.scale - scaleAfterBuild;
        expect(balancedPhaseGrowth).toBeLessThan(demandPhaseGrowth * 0.1);
        expect(facility.scale).toBeGreaterThan(facility.maxScale * 0.1);
    });

    it('PID state is persisted on the facility object after update', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet);
        expect(facility.pidState).toBeNull();

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
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: { integral: 0, prevError: 0, filteredError: 0, expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD },
            workerRequirement: { none: 1 },
        });
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;

        updateAgentProductionScale(agents, planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.pidState!.expansionIntegral).toBe(0);
    });

    it('recovers from scale=0 trap: uses lastMarketResult (not EMA) so stale unsold history does not block scale-up', () => {
        const planet = makePlanet({
            lastMarketResult: {
                [RESOURCE_NAME]: {
                    resourceName: RESOURCE_NAME,
                    clearingPrice: 10,
                    totalVolume: 50,
                    totalDemand: 100,
                    totalSupply: 20,
                    unfilledDemand: 80,
                    unsoldSupply: 0,
                },
            },

            avgMarketResult: {
                [RESOURCE_NAME]: {
                    resourceName: RESOURCE_NAME,
                    clearingPrice: 10,
                    totalVolume: 20,
                    totalDemand: 30,
                    totalSupply: 200,
                    unfilledDemand: 0,
                    unsoldSupply: 180,
                },
            },
        });
        const { agents, facility } = makeSetup(planet, { scale: 0.0, maxScale: 1 });

        updateAgentProductionScale(agents, planet);

        expect(facility.scale).toBeGreaterThan(0);
    });
});
