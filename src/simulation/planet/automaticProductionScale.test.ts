import { describe, expect, it } from 'vitest';

import { STORAGE_BUFFER_CAPACITY_MULTIPLIER } from '../constants';
import {
    makeAgent,
    makeAgentPlanetAssets,
    makeHRFacility,
    makePlanet,
    makePopulationByEducation,
    makeProductionFacility,
    makeStorageFacility,
    setStorageResourceQuantity,
} from '../utils/testHelper';
import { computeBufferCapacity, computeMaxDailyHROutput } from '../workforce/hrBuffer';
import {
    EXPANSION_INTEGRAL_THRESHOLD,
    PID_KP,
    STORAGE_TARGET_FILL_RATE,
    computeStorageExpansionTarget,
    computeStorageSignal,
    findMaxAffordableScale,
    findMaxScaleForCSBudget,
    findMaxScaleForLandboundResources,
    updateAgentProductionScale,
} from './automaticProductionScale';
import { DYNAMIC_EXPANSION_CAP_FRACTION, STORAGE_TARGET_MONTHS } from './automaticProductionScale/constants';
import type { Agent, GameState, MarketResult, Planet } from './planet';
import { crudeOilResourceType, naturalGasResourceType, produceResourceType } from './resources';
import { constructionServiceResourceType } from './services';
import { makePool } from '../initialUniverse/resourceClaimFactory';
import { arableLandResourceType, waterSourceResourceType } from './landBoundResources';
import { PRODUCED_HR_QUANTITY, PRODUCED_STORAGE_QUANTITY } from './specialFacilities';

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
            produces: [{ resource: RESOURCE, quantity: 1 }],
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

    const assets = makeAgentPlanetAssets(planet.id, {
        productionFacilities: [facility],
    });
    // Fill storage up to the current own-production target (STORAGE_TARGET_MONTHS months) so the
    // baseline storage signal is ~0 rather than oversupplied against the (now shorter) target.
    setStorageResourceQuantity(
        assets.storage,
        RESOURCE,
        STORAGE_TARGET_MONTHS * 30 * facility.maxScale * (facility.produces[0]?.quantity ?? 1),
    );

    const agent = makeAgent('a1', planet.id, 'Agent 1', {
        automated: true,
        assets: {
            [planet.id]: assets,
        },
    });

    return { agents: new Map([[agent.id, agent]]), facility };
}

function makeOversupplySetup(
    planet: Planet,
    facilityOverrides?: Parameters<typeof makeProductionFacility>[1],
    opts?: { produced?: number; sold?: number },
): ReturnType<typeof makeSetup> {
    const setup = makeSetup(planet, facilityOverrides);
    const produced = opts?.produced ?? 100;
    const sold = opts?.sold ?? 20;
    setup.facility.lastTickResults.lastProduced[RESOURCE_NAME] = produced;
    const agent = setup.agents.values().next().value as Agent;
    agent.assets[planet.id].market.sell[RESOURCE_NAME] = { resource: RESOURCE, lastSold: sold };
    return setup;
}

function makeGameState(agents: Map<string, Agent>): GameState {
    return {
        tick: 0,
        planets: new Map(),
        agents,
        shipCapitalMarket: { tradeHistory: [], emaPrice: {} },
        forexMarketMakers: new Map(),
        shipbuilderAgents: new Map(),
        arbitrageTraders: new Map(),
        tickerEvents: [],
        bankruptcies: [],
        nextEventId: 1,
    };
}

function setStorageQuantity(agents: Map<string, Agent>, quantity: number): void {
    const agent = agents.values().next().value as Agent;
    const assets = agent.assets[Object.keys(agent.assets)[0]];
    setStorageResourceQuantity(assets.storage, RESOURCE, quantity);
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
    it('holds scale when the market is balanced regardless of profitability', () => {
        const planet = makePlanetWithAvg(makeMarketResult());
        const { agents, facility } = makeSetup(planet);
        facility.lastTickResults.wageCosts = 6;
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeCloseTo(initial, 10);
    });

    it('makes only a very small scale change for a weak demand-excess signal', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 20, totalDemand: 100 }));
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeGreaterThanOrEqual(initial);
        expect(facility.scale).toBeLessThan(initial + 0.07 * facility.maxScale);
    });

    it('scales down when oversupplied', () => {
        const planet = makePlanetWithAvg(makeMarketResult({}));
        const { agents, facility } = makeOversupplySetup(planet);
        setStorageQuantity(agents, 18000);
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeLessThan(initial);
    });

    it('contracts when strongly oversupplied even when profitable', () => {
        const planet = makePlanetWithAvg(makeMarketResult({}));
        const { agents, facility } = makeOversupplySetup(planet, undefined, { sold: 0 });
        setStorageQuantity(agents, 18000);
        facility.lastTickResults.revenue = 1000;
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeLessThan(initial);
    });

    it('contracts when the storage sits far above the 3-month target', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 20, totalDemand: 100 }));
        const { agents, facility } = makeOversupplySetup(planet, undefined, { produced: 100, sold: 20 });
        setStorageQuantity(agents, 18000);
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

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
        setStorageQuantity(agents, 0);
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('still initiates capacity expansion when maintenance is below the old 0.95 threshold (maintenance no longer gates growth)', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,

            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
            workerRequirement: { none: 1 },
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
                revenue: 1_000_000,
                wageCosts: 0,
                inputCosts: 0,
                costBalance: 0,
            },
        });
        facility.maintenanceStatus = 0.8;

        setStorageQuantity(agents, 0);
        const agent = agents.values().next().value as Agent;
        const assets = agent.assets[planet.id];
        assets.deposits = 1_000_000;
        assets.lastMonthAcc.revenue = 1_000_000;
        expect(facility.construction).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).not.toBeNull();
    });

    it('clamps scale to the minimum floor when already at very low scale and oversupplied', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 80, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet, { scale: 0.0001, maxScale: 1 });

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBe(facility.maxScale * 0.1);
    });

    it('clamps scale to maxScale when over-demanded', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));

        const maxScale = 1;
        const { agents, facility } = makeSetup(planet, { scale: maxScale - 0.0001, maxScale });
        setStorageQuantity(agents, 0);

        updateAgentProductionScale(makeGameState(agents), planet);

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

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBe(initial);
    });

    it('skips when there is no avgMarketResult and no open bids (no history, no demand)', () => {
        const planet = makePlanet({ lastMarketResult: {}, avgMarketResult: {}, orderBooks: {} });
        const { agents, facility } = makeSetup(planet);
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBe(initial);
    });

    it('skips facility when no lastMarketResult is available even with open buy orders', () => {
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

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBe(initial);
    });

    it('does not touch a non-automated agent', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unsoldSupply: 80, totalSupply: 100 }));
        const { agents, facility } = makeSetup(planet);
        const agent = agents.values().next().value as Agent;
        agent.automated = false;
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBe(initial);
    });

    it('initiates capacity expansion when scale == maxScale, integral >= threshold, and agent has sufficient funds', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,

            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
            // Need a worker requirement so hasSufficientUnemployedWorkers passes
            workerRequirement: { none: 1 },
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
                revenue: 1_000_000,
                wageCosts: 0,
                inputCosts: 0,
                costBalance: 0,
            },
        });

        setStorageQuantity(agents, 0);
        const agent = agents.values().next().value as Agent;
        const assets = agent.assets[planet.id];
        assets.deposits = 1_000_000;
        assets.lastMonthAcc.revenue = 1_000_000;
        expect(facility.construction).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

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

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).toBeNull();
    });

    it('does NOT initiate capacity expansion when agent lacks sufficient deposits (integral is sufficient)', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
            workerRequirement: { none: 1 },
        });

        expect(facility.construction).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).toBeNull();
    });

    it('does not cap expansion target below current maxScale when labor is limited', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.population = makePopulationByEducation({ none: 10 });
        planet.lastMarketResult[RESOURCE_NAME].totalDemand = 1000;
        planet.lastMarketResult[RESOURCE_NAME].unfilledDemand = 800;

        const { agents, facility } = makeSetup(planet, {
            scale: 100,
            maxScale: 100,
            workerRequirement: { none: 1 },
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
        });
        setStorageQuantity(agents, 0);
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;
        agent.assets[planet.id].lastMonthAcc.revenue = 1_000_000;

        expect(facility.construction).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.constructionTargetMaxScale).toBeGreaterThan(100);
    });

    it('staffs expansion with overqualified workers when the required education tier is scarce', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.population = makePopulationByEducation({ secondary: 100 });
        planet.lastMarketResult[RESOURCE_NAME].totalDemand = 1000;
        planet.lastMarketResult[RESOURCE_NAME].unfilledDemand = 800;

        const { agents, facility } = makeSetup(planet, {
            scale: 100,
            maxScale: 100,
            workerRequirement: { primary: 1 },
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
        });
        setStorageQuantity(agents, 0);
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;
        agent.assets[planet.id].lastMonthAcc.revenue = 1_000_000;

        expect(facility.construction).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.constructionTargetMaxScale).toBeGreaterThan(100);
    });

    it('initiates capacity expansion for agents with own construction facility even without sufficient funds', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);

        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
            workerRequirement: { none: 1 },
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
                revenue: 1_000_000,
                wageCosts: 0,
                inputCosts: 0,
                costBalance: 0,
            },
        });

        setStorageQuantity(agents, 0);
        const agent = agents.values().next().value as Agent;
        const assets = agent.assets[planet.id];
        assets.deposits = 0;
        assets.lastMonthAcc.revenue = 0;
        assets.lastMonthAcc.wages = 0;
        assets.lastMonthAcc.purchases = 0;
        assets.lastMonthAcc.claimPayments = 0;
        const constructionFacility = makeProductionFacility(
            {},
            {
                id: 'construction-1',
                name: 'Construction Facility',
                produces: [{ resource: constructionServiceResourceType, quantity: 50 }],
            },
        );
        assets.productionFacilities.push(constructionFacility);

        expect(facility.construction).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.constructionTargetMaxScale).toBeGreaterThan(10);
    });

    it('does NOT initiate capacity expansion when cashflow is insufficient even with sufficient deposits', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
            workerRequirement: { none: 1 },
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
                revenue: 1_000_000,
                wageCosts: 0,
                inputCosts: 0,
                costBalance: 0,
            },
        });

        const agent = agents.values().next().value as Agent;
        const assets = agent.assets[planet.id];
        // Plenty of deposits, but cashflow is negative (high expenses, no revenue)
        assets.deposits = 1_000_000_000;
        assets.lastMonthAcc.revenue = 0;
        assets.lastMonthAcc.wages = 1_000_000;
        assets.lastMonthAcc.purchases = 1_000_000;
        assets.lastMonthAcc.claimPayments = 1_000_000;

        expect(facility.construction).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).toBeNull();
    });

    it('raises production expansion threshold when construction price is inflated', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 6, [RESOURCE_NAME]: 12 };
        planet.lastProductionCostFloors.Construction = 1;

        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
            workerRequirement: { none: 1 },
        });

        setStorageQuantity(agents, 0);
        const agent = agents.values().next().value as Agent;
        const assets = agent.assets[planet.id];
        assets.deposits = 1_000_000_000_000;
        assets.lastMonthAcc.revenue = 1_000_000_000_000;

        expect(facility.construction).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).toBeNull();
    });

    it('initiates production expansion despite inflated construction price once integral clears the dynamic threshold', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 6, [RESOURCE_NAME]: 12 };
        planet.lastProductionCostFloors.Construction = 1;

        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD * 3,
                smoothedSignal: 0,
            },
            workerRequirement: { none: 1 },
        });

        setStorageQuantity(agents, 0);
        const agent = agents.values().next().value as Agent;
        const assets = agent.assets[planet.id];
        assets.deposits = 1_000_000_000_000;
        assets.lastMonthAcc.revenue = 1_000_000_000_000;

        expect(facility.construction).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.constructionTargetMaxScale).toBeGreaterThan(10);
    });

    it('continues PID scale adjustment during active expansion construction', () => {
        const planet = makePlanetWithAvg(makeMarketResult({}));
        const { agents, facility } = makeOversupplySetup(planet, {
            scale: 0.5,
            maxScale: 1,
            construction: {
                type: 'expansion',
                constructionTargetMaxScale: 2,
                totalConstructionServiceRequired: 1000,
                maximumConstructionServiceConsumption: 100,
                progress: 100,
                lastTickInvestedConstructionServices: 0,
            },
        });
        setStorageQuantity(agents, 18000);
        facility.lastTickResults.wageCosts = 100;
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeLessThan(initial);
        // Construction is unchanged
        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.type).toBe('expansion');
    });

    it('does NOT start a second expansion while an expansion is already active', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const existingConstruction = {
            type: 'expansion' as const,
            constructionTargetMaxScale: 11,
            totalConstructionServiceRequired: 1000,
            maximumConstructionServiceConsumption: 100,
            progress: 100,
            lastTickInvestedConstructionServices: 0,
        };

        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            construction: existingConstruction,
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
            workerRequirement: { none: 1 },
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
                revenue: 1_000_000,
                wageCosts: 0,
                inputCosts: 0,
                costBalance: 0,
            },
        });

        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].deposits = 1_000_000;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).toEqual(existingConstruction);
    });

    it('accumulates contraction integral with negative signal only once the operating capacity is low', () => {
        const planet = makePlanetWithAvg(makeMarketResult({}));
        const { agents, facility } = makeOversupplySetup(planet, {
            scale: 10,
            maxScale: 100,
            pidState: {
                contractionIntegral: 10,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 0,
                smoothedSignal: 0,
            },
        });
        setStorageQuantity(agents, 18000);
        facility.lastTickResults.wageCosts = 1000;
        const before = facility.pidState!.contractionIntegral;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.pidState!.contractionIntegral).toBeGreaterThan(before);
    });

    it('contracts (reduces maxScale) with sustained negative signal', () => {
        const planet = makePlanetWithAvg(makeMarketResult({}));
        const { agents, facility } = makeOversupplySetup(planet, {
            scale: 10,
            maxScale: 100,
            pidState: {
                contractionIntegral: 30,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 0,
                smoothedSignal: 0,
            },
        });
        setStorageQuantity(agents, 18000);
        facility.lastTickResults.wageCosts = 1000;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.maxScale).toBeLessThan(100);
    });

    it('scales up when profitable and demand is short', () => {
        const planet = makePlanetWithAvg(
            makeMarketResult({
                unfilledDemand: 80,
                totalDemand: 100,
                clearingPrice: 12,
            }),
        );
        const { agents, facility } = makeSetup(planet);
        setStorageQuantity(agents, 0);
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('scales down when the storage sits above the 3-month target', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, { scale: 0.5, maxScale: 1 });
        setStorageQuantity(agents, 18000);
        const initial = facility.scale;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeLessThan(initial);
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
                    { resource: OIL, quantity: 1 },
                    { resource: GAS, quantity: 1 },
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

        updateAgentProductionScale(makeGameState(agents), planet);

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
                    { resource: OIL, quantity: 1 },
                    { resource: GAS, quantity: 1 },
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

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeGreaterThan(initial);
    });

    it('integral accumulation causes larger scale changes over repeated ticks than a single proportional step', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, { scale: 0.0, maxScale: 100 });
        setStorageQuantity(agents, 0);
        facility.pidState = {
            contractionIntegral: 0,
            integral: 0,
            prevError: 0,
            filteredError: 0,
            expansionIntegral: 0,
            smoothedSignal: 0,
        };

        const N = 20;
        for (let i = 0; i < N; i++) {
            updateAgentProductionScale(makeGameState(agents), planet);
        }

        const minExpected = facility.maxScale * 0.1 + (N - 1) * PID_KP * 0.2 * facility.maxScale;
        expect(facility.scale).toBeGreaterThan(minExpected);
    });

    it('does NOT accumulate expansion integral while HR productivity is dragged', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            maintenanceStatus: 1,
            workerRequirement: { none: 1 },
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 0,
                smoothedSignal: 0,
            },
        });
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].hrProductivityMultiplier = 0.5;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.pidState!.expansionIntegral).toBe(0);
    });

    it('does NOT accumulate expansion integral while storage is starved', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            maintenanceStatus: 1,
            workerRequirement: { none: 1 },
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 0,
                smoothedSignal: 0,
            },
        });
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].storage.department!.storageStarvation = 0.5;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.pidState!.expansionIntegral).toBe(0);
    });

    it('accumulates expansion integral when HR and storage are healthy', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            maintenanceStatus: 1,
            workerRequirement: { none: 1 },
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 0,
                smoothedSignal: 0,
            },
        });
        setStorageQuantity(agents, 0);

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.pidState!.expansionIntegral).toBeGreaterThan(0);
    });

    it('derivative term produces braking when smoothed signal suddenly drops', () => {
        const planetBalanced = makePlanetWithAvg(makeMarketResult());
        const { agents, facility } = makeSetup(planetBalanced, { scale: 0.5, maxScale: 1 });
        facility.pidState = {
            smoothedSignal: 0.8,
            filteredError: 0.8,
            prevError: 0.8,
            integral: 0,
            expansionIntegral: 0,
            contractionIntegral: 0,
        };
        updateAgentProductionScale(makeGameState(agents), planetBalanced);
        const scaleWithoutSuddenDrop = facility.scale;

        const { agents: agentsB, facility: facilityB } = makeSetup(planetBalanced, { scale: 0.5, maxScale: 1 });
        facilityB.pidState = {
            smoothedSignal: 0.8,
            filteredError: 0.8,
            prevError: 1.0,
            integral: 0,
            expansionIntegral: 0,
            contractionIntegral: 0,
        };
        updateAgentProductionScale(makeGameState(agentsB), planetBalanced);
        const scaleAfterSuddenDrop = facilityB.scale;

        expect(scaleAfterSuddenDrop).toBeLessThan(scaleWithoutSuddenDrop);
    });

    it('PID state is persisted on the facility object after update', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet);
        expect(facility.pidState).toBeNull();

        updateAgentProductionScale(makeGameState(agents), planet);

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
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };
        const { agents, facility } = makeSetup(planet, {
            scale: 10,
            maxScale: 10,
            pidState: {
                contractionIntegral: 0,
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                smoothedSignal: 0,
            },
            workerRequirement: { none: 1 },
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: {},
                revenue: 1_000_000,
                wageCosts: 0,
                inputCosts: 0,
                costBalance: 0,
            },
        });
        setStorageQuantity(agents, 0);
        const agent = agents.values().next().value as Agent;
        const assets = agent.assets[planet.id];
        assets.deposits = 1_000_000;
        assets.lastMonthAcc.revenue = 1_000_000;

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.construction).not.toBeNull();
        expect(facility.pidState!.expansionIntegral).toBe(0);
    });

    it('asymmetric PID: does not crash to floor under oscillating oversupply/undersupply', () => {
        const planet = makePlanetWithAvg(makeMarketResult());
        const { agents, facility } = makeSetup(planet, { scale: 0.5, maxScale: 1 });

        const N = 30;
        for (let i = 0; i < N; i++) {
            if (i % 2 === 0) {
                // Strong oversupply
                Object.assign(planet.lastMarketResult[RESOURCE_NAME], {
                    unsoldSupply: 90,
                    totalSupply: 100,
                    unfilledDemand: 0,
                });
                Object.assign(planet.avgMarketResult[RESOURCE_NAME], {
                    unsoldSupply: 90,
                    totalSupply: 100,
                    unfilledDemand: 0,
                });
            } else {
                // Strong undersupply
                Object.assign(planet.lastMarketResult[RESOURCE_NAME], {
                    unsoldSupply: 0,
                    totalSupply: 100,
                    unfilledDemand: 90,
                    totalDemand: 100,
                });
                Object.assign(planet.avgMarketResult[RESOURCE_NAME], {
                    unsoldSupply: 0,
                    totalSupply: 100,
                    unfilledDemand: 90,
                    totalDemand: 100,
                });
            }
            updateAgentProductionScale(makeGameState(agents), planet);
        }

        // Scale should not have crashed to 10% — the slow-down rate (PID_OUT_MAX_DOWN = 0.02) prevents
        // the full 0.1 per-tick drop from oversupply ticks from overwhelming the 0.1 per-tick build-up
        expect(facility.scale).toBeGreaterThan(0.3);
    });

    it('persists the storage error as the smoothed signal', () => {
        const planet = makePlanetWithAvg(makeMarketResult({ unfilledDemand: 80, totalDemand: 100, clearingPrice: 12 }));
        const { agents, facility } = makeSetup(planet, { scale: 0.5, maxScale: 1 });
        setStorageQuantity(agents, 0);

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.pidState!.smoothedSignal).toBe(1);
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

        updateAgentProductionScale(makeGameState(agents), planet);

        expect(facility.scale).toBeGreaterThan(0);
    });

    it('initiates HR department expansion when workforce demand exceeds HR scale', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 1,
            scale: 1,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                    deposits: 1_000_000,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        assets.usedWorkers = 1000;
        hrDepartment.hrBuffer = 0;
        assets.lastMonthAcc.revenue = 1_000_000;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).not.toBeNull();
        expect(hrDepartment.construction!.constructionTargetMaxScale).toBeGreaterThan(hrDepartment.maxScale);
        expect(hrDepartment.construction!.type).toBe('expansion');
    });

    it('initiates HR expansion on workforce demand alone without a cleared integral', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 1,
            scale: 1,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 0,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                    deposits: 1_000_000,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        assets.usedWorkers = 3000;
        assets.lastMonthAcc.revenue = 1_000_000;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).not.toBeNull();
        expect(hrDepartment.construction!.constructionTargetMaxScale).toBeGreaterThan(hrDepartment.maxScale);
    });

    it('does NOT initiate HR department expansion when demand is within HR scale', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 10,
            construction: null,
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        assets.usedWorkers = 1000;
        hrDepartment.hrBuffer = computeBufferCapacity(computeMaxDailyHROutput(hrDepartment.maxScale));

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).toBeNull();
    });

    it('does NOT initiate HR expansion when HR department is already under construction', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const existingConstruction = {
            type: 'expansion' as const,
            constructionTargetMaxScale: 5,
            totalConstructionServiceRequired: 1000,
            maximumConstructionServiceConsumption: 100,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
        };

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 1,
            scale: 1,
            construction: existingConstruction,
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        assets.usedWorkers = 1000;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).toEqual(existingConstruction);
    });
    it('increases HR department scale when buffer is below target fill rate', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 5,
            construction: null,
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                }),
            },
        });

        hrDepartment.hrBuffer = 0;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.scale).toBeGreaterThan(5);
    });

    it('decreases HR department scale when buffer is above target fill rate', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 5,
            construction: null,
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                }),
            },
        });

        hrDepartment.hrBuffer = computeBufferCapacity(computeMaxDailyHROutput(hrDepartment.maxScale));

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.scale).toBeLessThan(5);
    });

    it('accumulates HR expansion integral at 80% utilization with positive signal', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 8,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 0,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                }),
            },
        });

        hrDepartment.hrBuffer = 0;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.pidState!.expansionIntegral).toBeGreaterThan(0);
    });

    it('decays HR expansion integral below 80% utilization despite positive signal', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 5,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 10,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                }),
            },
        });

        hrDepartment.hrBuffer = 0;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.pidState!.expansionIntegral).toBeLessThan(10);
    });

    it('does NOT initiate HR expansion when expansion integral is below threshold', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 10,
            construction: null,
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                    deposits: 1_000_000,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        hrDepartment.hrBuffer = 0;
        assets.lastMonthAcc.revenue = 1_000_000;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).toBeNull();
    });

    it('does NOT initiate HR expansion when agent lacks sufficient funds', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 1,
            scale: 1,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                }),
            },
        });

        hrDepartment.hrBuffer = 0;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).toBeNull();
    });

    it('raises HR expansion threshold when construction price is inflated', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 6, [RESOURCE_NAME]: 12 };
        planet.lastProductionCostFloors.Construction = 1;

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 8,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                    deposits: 1_000_000_000_000,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        hrDepartment.hrBuffer = 0;
        assets.lastMonthAcc.revenue = 1_000_000_000_000;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).toBeNull();
    });

    it('initiates HR expansion despite inflated construction price once integral clears the dynamic threshold', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 6, [RESOURCE_NAME]: 12 };
        planet.lastProductionCostFloors.Construction = 1;

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 8,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD * 3,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                    deposits: 1_000_000_000_000,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        hrDepartment.hrBuffer = 0;
        assets.lastMonthAcc.revenue = 1_000_000_000_000;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).not.toBeNull();
        expect(hrDepartment.construction!.constructionTargetMaxScale).toBeGreaterThan(hrDepartment.maxScale);
    });

    it('targets HR scale proportional to usedWorkers with HR_EXPANSION_FACTOR slack', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 6,
            scale: 6,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                    deposits: 10_000_000,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        const HR_EXPANSION_FACTOR = 1.4;
        assets.usedWorkers = 10_000;
        hrDepartment.hrBuffer = 0;
        assets.lastMonthAcc.revenue = 10_000_000;

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        const expectedDemandScale = Math.max(1, Math.ceil((10_000 * HR_EXPANSION_FACTOR) / PRODUCED_HR_QUANTITY));
        expect(expectedDemandScale).toBe(7);

        expect(hrDepartment.construction).not.toBeNull();
        expect(hrDepartment.construction!.type).toBe('expansion');
        expect(hrDepartment.construction!.constructionTargetMaxScale).toBe(expectedDemandScale);
    });

    it('caps HR expansion target at DYNAMIC_EXPANSION_CAP_FRACTION', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 5,
            scale: 5,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                    deposits: 1_000_000_000,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        assets.usedWorkers = 200_000;
        assets.lastMonthAcc.revenue = 1_000_000_000;

        const maxAllowed =
            hrDepartment.maxScale + Math.max(1, Math.ceil(hrDepartment.maxScale * DYNAMIC_EXPANSION_CAP_FRACTION));
        expect(maxAllowed).toBe(6);

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).not.toBeNull();
        expect(hrDepartment.construction!.constructionTargetMaxScale).toBe(maxAllowed);
    });

    it('does NOT expand HR when findMaxAffordableScale limits target to current scale', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        planet.marketPrices = { Construction: 1, [RESOURCE_NAME]: 12 };

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 1,
            scale: 1,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                    deposits: 1,
                }),
            },
        });

        const assets = agent.assets[planet.id];
        assets.usedWorkers = 4000;
        hrDepartment.hrBuffer = 0;
        assets.lastMonthAcc.revenue = 0;

        const affordable = findMaxAffordableScale(hrDepartment, assets, planet, hrDepartment.maxScale, 100);
        expect(affordable).toBe(hrDepartment.maxScale);

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.construction).toBeNull();
    });

    it('accumulates HR contraction integral with negative signal regardless of capacity', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 1,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 0,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                }),
            },
        });

        hrDepartment.hrBuffer = computeBufferCapacity(computeMaxDailyHROutput(hrDepartment.maxScale));

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.pidState!.contractionIntegral).toBeGreaterThan(0);
    });

    it('resets HR contraction integral when contraction triggers', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);

        const hrDepartment = makeHRFacility(undefined, {
            maxScale: 10,
            scale: 5,
            construction: null,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: 0,
                contractionIntegral: 30,
                smoothedSignal: 0,
            },
        });

        const agent = makeAgent('a1', planet.id, 'Agent 1', {
            automated: true,
            assets: {
                [planet.id]: makeAgentPlanetAssets(planet.id, {
                    productionFacilities: [],
                    humanResourcesDepartment: hrDepartment,
                }),
            },
        });

        hrDepartment.hrBuffer = computeBufferCapacity(computeMaxDailyHROutput(hrDepartment.maxScale));

        updateAgentProductionScale(makeGameState(new Map([[agent.id, agent]])), planet);

        expect(hrDepartment.pidState!.contractionIntegral).toBeLessThan(30);
    });
});

describe('findMaxScaleForCSBudget', () => {
    it('returns currentMax when budget is zero', () => {
        const facility = makeProductionFacility({}, { maxScale: 10 });
        const result = findMaxScaleForCSBudget(facility, 10, 15, 0);
        expect(result).toBe(10);
    });

    it('returns maxDesiredScale when budget is sufficient for one step', () => {
        const facility = makeProductionFacility({}, { maxScale: 10 });
        const result = findMaxScaleForCSBudget(facility, 10, 11, 1_000_000);
        expect(result).toBe(11);
    });

    it('returns intermediate scale when budget is limited', () => {
        const facility = makeProductionFacility({}, { maxScale: 1 });
        const result = findMaxScaleForCSBudget(facility, 1, 3, 1);
        expect(result).toBe(1);
    });
});

describe('construction budget constraint', () => {
    it('does not constrain expansion when no construction production exists', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        const { agents, facility } = makeSetup(planet, {
            maxScale: 1,
            scale: 1,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });
        planet.producedResources.Construction = 0;
        planet.marketPrices.Construction = 5;
        planet.lastProductionCostFloors.Construction = 3;
        setStorageQuantity(agents, 0);
        assetsDeposits(agents, planet, 1_000_000);

        updateAgentProductionScale(makeGameState(agents), planet);
        expect(facility.construction).not.toBeNull();
    });

    it('blocks expansion when construction market is in deficit and budget is zero', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        const { agents, facility } = makeSetup(planet, {
            maxScale: 1,
            scale: 1,
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });
        planet.producedResources.Construction = 50;
        planet.consumedResources.Construction = 100;
        planet.constructionBalanceEMA = -20;
        planet.marketPrices.Construction = 5;
        planet.lastProductionCostFloors.Construction = 3;
        setStorageQuantity(agents, 0);
        assetsDeposits(agents, planet, 1_000_000);

        updateAgentProductionScale(makeGameState(agents), planet);
        // Budget is 0, so expansion should be blocked
        expect(facility.construction).toBeNull();
    });

    it('allows expansion when construction market has budget available', () => {
        const planet = makePlanetWithWorkersAndCostFloor(12, 10);
        const { agents, facility } = makeSetup(planet, {
            maxScale: 1,
            scale: 1,
            produces: [
                { resource: RESOURCE, quantity: 1 },
                { resource: constructionServiceResourceType, quantity: 1 },
            ],
            pidState: {
                integral: 0,
                prevError: 0,
                filteredError: 0,
                expansionIntegral: EXPANSION_INTEGRAL_THRESHOLD,
                contractionIntegral: 0,
                smoothedSignal: 0,
            },
        });
        planet.lastMarketResult.Construction = {
            resourceName: 'Construction',
            clearingPrice: 5,
            totalVolume: 100,
            totalDemand: 100,
            totalSupply: 100,
            unfilledDemand: 0,
            unsoldSupply: 0,
        };
        planet.producedResources.Construction = 500;
        planet.consumedResources.Construction = 0;
        planet.constructionBalanceEMA = 100;
        planet.marketPrices.Construction = 5;
        planet.lastProductionCostFloors.Construction = 3;
        setStorageQuantity(agents, 0);
        assetsDeposits(agents, planet, 1_000_000);

        facility.lastTickResults.lastProduced[constructionServiceResourceType.name] = 100;
        const agent = agents.values().next().value as Agent;
        agent.assets[planet.id].market.sell[constructionServiceResourceType.name] = {
            resource: constructionServiceResourceType,
            lastSold: 100,
        };
        planet.lastMarketResult.Construction.unfilledDemand = 20;

        updateAgentProductionScale(makeGameState(agents), planet);
        expect(facility.construction).not.toBeNull();
    });
});

describe('computeStorageSignal', () => {
    it('returns a positive signal when buffer is below target fill rate', () => {
        const storage = makeStorageFacility();
        storage.department!.maxScale = 1;
        storage.department!.scale = 1;
        storage.department!.storageBuffer = 0;

        const signal = computeStorageSignal(storage.department!);
        expect(signal).toBeCloseTo(1, 5);
    });

    it('returns a negative signal when buffer is above target fill rate', () => {
        const storage = makeStorageFacility();
        storage.department!.maxScale = 1;
        storage.department!.scale = 1;
        const maxBuffer = 1 * PRODUCED_STORAGE_QUANTITY * STORAGE_BUFFER_CAPACITY_MULTIPLIER;
        storage.department!.storageBuffer = maxBuffer;

        const signal = computeStorageSignal(storage.department!);
        expect(signal).toBeLessThan(0);
    });

    it('returns signal near zero when buffer is exactly at target fill rate', () => {
        const storage = makeStorageFacility();
        storage.department!.maxScale = 1;
        storage.department!.scale = 1;
        const maxBuffer = 1 * PRODUCED_STORAGE_QUANTITY * STORAGE_BUFFER_CAPACITY_MULTIPLIER;
        storage.department!.storageBuffer = maxBuffer * STORAGE_TARGET_FILL_RATE;

        const signal = computeStorageSignal(storage.department!);
        expect(Math.abs(signal)).toBeLessThan(0.001);
    });

    it('returns signal 1 when maxBuffer is zero (maxScale is 0)', () => {
        const storage = makeStorageFacility();
        storage.department!.maxScale = 0;
        storage.department!.scale = 0;
        storage.department!.storageBuffer = 100;

        const signal = computeStorageSignal(storage.department!);
        expect(signal).toBe(1);
    });

    it('clamps signal to [-1, 1] range', () => {
        const storage = makeStorageFacility();
        storage.department!.maxScale = 1;
        storage.department!.scale = 1;
        storage.department!.storageBuffer = -100000;

        const signal = computeStorageSignal(storage.department!);
        expect(signal).toBeGreaterThanOrEqual(-1);
        expect(signal).toBeLessThanOrEqual(1);
    });

    it('buffer near full produces negative signal approaching -1', () => {
        const storage = makeStorageFacility();
        storage.department!.maxScale = 1;
        storage.department!.scale = 1;
        const maxBuffer = 1 * PRODUCED_STORAGE_QUANTITY * STORAGE_BUFFER_CAPACITY_MULTIPLIER;
        storage.department!.storageBuffer = maxBuffer * 0.99;

        const signal = computeStorageSignal(storage.department!);
        expect(signal).toBeLessThan(0);
        expect(signal).toBeGreaterThan(-1);
    });
});

describe('computeStorageExpansionTarget', () => {
    function makeStorageWithAssets(maxScale: number, storageBuffer: number) {
        const storage = makeStorageFacility();
        storage.department!.maxScale = maxScale;
        storage.department!.scale = maxScale;
        storage.department!.storageBuffer = storageBuffer;

        const planet = makePlanet();
        const assets = makeAgentPlanetAssets('p', {
            storage: storage,
            deposits: 1_000_000,
        });
        assets.lastMonthAcc.revenue = 100_000;
        assets.lastMonthAcc.wages = 0;
        assets.lastMonthAcc.purchases = 0;
        assets.lastMonthAcc.claimPayments = 0;

        return { storage: storage.department!, assets, planet };
    }

    it('returns expansion target >= current maxScale + 1 when buffer is below target', () => {
        const { storage, assets, planet } = makeStorageWithAssets(1, 0);
        const target = computeStorageExpansionTarget(storage, assets, planet, false, Infinity);
        expect(target).toBeGreaterThanOrEqual(2);
    });

    it('caps expansion at DYNAMIC_EXPANSION_CAP_FRACTION', () => {
        const maxScale = 10;
        const { storage, assets, planet } = makeStorageWithAssets(maxScale, 0);
        const target = computeStorageExpansionTarget(storage, assets, planet, false, Infinity);
        const absoluteCap = maxScale + Math.max(1, Math.ceil(maxScale * DYNAMIC_EXPANSION_CAP_FRACTION));
        expect(target).toBeLessThanOrEqual(absoluteCap);
    });

    it('respects constructionBudget limit', () => {
        const maxScale = 10;
        const { storage, assets, planet } = makeStorageWithAssets(maxScale, 0);
        const target = computeStorageExpansionTarget(storage, assets, planet, false, 0);
        expect(target).toBe(maxScale);
    });

    it('skips affordability checks when hasOwnConstruction is true', () => {
        const maxScale = 10;
        const { storage, assets, planet } = makeStorageWithAssets(maxScale, 0);
        assets.deposits = 0;
        const target = computeStorageExpansionTarget(storage, assets, planet, true, Infinity);
        expect(target).toBeGreaterThan(maxScale);
    });

    it('limits expansion when deposits are insufficient', () => {
        const maxScale = 10;
        const { storage, assets, planet } = makeStorageWithAssets(maxScale, 0);
        assets.deposits = 1;
        assets.lastMonthAcc.revenue = 0;
        const target = computeStorageExpansionTarget(storage, assets, planet, false, Infinity);
        expect(target).toBe(maxScale);
    });
});

describe('findMaxScaleForLandboundResources', () => {
    it('caps expansion at current maxScale when pool is exhausted (renewable)', () => {
        const planet = makePlanet();
        planet.resources[waterSourceResourceType.name] = {
            pool: makePool({ type: waterSourceResourceType, quantity: 0, renewable: true }),
            claims: [],
        };

        const facility = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                maxScale: 10,
                scale: 10,
                needs: [{ resource: waterSourceResourceType, quantity: 100 }],
                produces: [{ resource: produceResourceType, quantity: 50 }],
            },
        );

        const result = findMaxScaleForLandboundResources(facility, planet, 20);
        expect(result).toBe(10);
    });

    it('caps expansion at current maxScale when pool is exhausted (non-renewable)', () => {
        const planet = makePlanet();
        planet.resources[waterSourceResourceType.name] = {
            pool: makePool({ type: waterSourceResourceType, quantity: 0, renewable: false }),
            claims: [],
        };

        const facility = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                maxScale: 10,
                scale: 10,
                needs: [{ resource: waterSourceResourceType, quantity: 100 }],
                produces: [{ resource: produceResourceType, quantity: 50 }],
            },
        );

        const result = findMaxScaleForLandboundResources(facility, planet, 20);
        expect(result).toBe(10);
    });

    it('allows expansion when pool has sufficient capacity (renewable)', () => {
        const planet = makePlanet();
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 10_000, renewable: true }),
            claims: [],
        };

        const facility = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                maxScale: 10,
                scale: 10,
                needs: [{ resource: arableLandResourceType, quantity: 100 }],
                produces: [{ resource: produceResourceType, quantity: 50 }],
            },
        );

        const result = findMaxScaleForLandboundResources(facility, planet, 20);
        expect(result).toBe(20);
    });

    it('caps expansion at available pool capacity when partial shortage exists', () => {
        const planet = makePlanet();
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 500, renewable: true }),
            claims: [],
        };

        const facility = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                maxScale: 10,
                scale: 10,
                needs: [{ resource: arableLandResourceType, quantity: 100 }],
                produces: [{ resource: produceResourceType, quantity: 50 }],
            },
        );

        const result = findMaxScaleForLandboundResources(facility, planet, 25);
        expect(result).toBe(15);
    });

    it('returns desiredScale unchanged when facility has no landbound needs', () => {
        const planet = makePlanet();
        planet.resources[waterSourceResourceType.name] = {
            pool: makePool({ type: waterSourceResourceType, quantity: 0, renewable: true }),
            claims: [],
        };

        const facility = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                maxScale: 10,
                scale: 10,
                needs: [{ resource: crudeOilResourceType, quantity: 100 }],
                produces: [{ resource: produceResourceType, quantity: 50 }],
            },
        );

        const result = findMaxScaleForLandboundResources(facility, planet, 20);
        expect(result).toBe(20);
    });

    it('returns desiredScale when maxScale is already at or above desiredScale', () => {
        const planet = makePlanet();
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 0, renewable: true }),
            claims: [],
        };

        const facility = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                maxScale: 10,
                scale: 10,
                needs: [{ resource: arableLandResourceType, quantity: 100 }],
                produces: [{ resource: produceResourceType, quantity: 50 }],
            },
        );

        const result = findMaxScaleForLandboundResources(facility, planet, 10);
        expect(result).toBe(10);
    });

    it('caps by the most constraining landbound resource', () => {
        const planet = makePlanet();
        planet.resources[waterSourceResourceType.name] = {
            pool: makePool({ type: waterSourceResourceType, quantity: 500, renewable: true }),
            claims: [],
        };
        planet.resources[arableLandResourceType.name] = {
            pool: makePool({ type: arableLandResourceType, quantity: 200, renewable: true }),
            claims: [],
        };

        const facility = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                maxScale: 10,
                scale: 10,
                needs: [
                    { resource: waterSourceResourceType, quantity: 100 },
                    { resource: arableLandResourceType, quantity: 100 },
                ],
                produces: [{ resource: produceResourceType, quantity: 50 }],
            },
        );

        const result = findMaxScaleForLandboundResources(facility, planet, 25);
        expect(result).toBe(12);
    });

    it('is not affected by non-landbound resource entries in planet.resources', () => {
        const planet = makePlanet();
        planet.resources[waterSourceResourceType.name] = {
            pool: makePool({ type: waterSourceResourceType, quantity: 10_000, renewable: true }),
            claims: [],
        };

        const facility = makeProductionFacility(
            {},
            {
                planetId: planet.id,
                maxScale: 10,
                scale: 10,
                needs: [
                    { resource: waterSourceResourceType, quantity: 100 },
                    { resource: crudeOilResourceType, quantity: 200 },
                ],
                produces: [{ resource: produceResourceType, quantity: 50 }],
            },
        );

        const result = findMaxScaleForLandboundResources(facility, planet, 20);
        expect(result).toBe(20);
    });
});

function assetsDeposits(agents: Map<string, Agent>, planet: Planet, amount: number) {
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (assets) {
            assets.deposits = amount;
            assets.lastMonthAcc.revenue = amount / 10;
            assets.lastMonthAcc.wages = 0;
            assets.lastMonthAcc.purchases = 0;
            assets.lastMonthAcc.claimPayments = 0;
        }
    }
}
