import { createRecyclerAgent } from '../../src/simulation/agents/recycler';
import {
    createPopulation,
    humanResourcesScaleForWorkers,
    makeAgent,
    makeDefaultEnvironment,
    makeStorage,
    prefillAgentStorageFromFacilities,
    storageScaleForFacilities,
} from '../../src/simulation/initialUniverse/helpers';
import { initialMarketPrices } from '../../src/simulation/initialUniverse/initialMarketPrices';
import {
    buildBuyAutoConfigForResource,
    buildSellAutoConfigForResource,
    generateAgentPersonality,
} from '../../src/simulation/initialUniverse/personalities';
import { getNamesFor } from '../../src/simulation/initialUniverse/preConfiguredCompanies';
import { splitScale } from '../../src/simulation/initialUniverse/proceduralWorld';
import { makePool } from '../../src/simulation/initialUniverse/resourceClaimFactory';
import { nextRandom } from '../../src/simulation/utils/stochasticRound';
import { FACILITY_SCALE_PER_BILLION } from '../../src/simulation/initialUniverse/targets';
import { computeSolverScales } from './solverDiagnostic';
import {
    arableLandResourceType,
    coalDepositResourceType,
    copperDepositResourceType,
    forestResourceType,
    ironOreDepositResourceType,
    limestoneDepositResourceType,
    oilReservoirResourceType,
    sandDepositResourceType,
    stoneDepositResourceType,
    waterSourceResourceType,
} from '../../src/simulation/planet/landBoundResources';
import type { Agent, AutomatedPricingConfig, GameState, Planet } from '../../src/simulation/planet/planet';
import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import {
    ALL_PRODUCTION_FACILITY_ENTRIES,
    neededWorkersByFacility,
    type FacilityType,
} from '../../src/simulation/planet/productionFacilities';
import { ESTIMATED_HR_OVERHEAD, HR_WORLD_BUFFER, humanResourcesOfficeFacilityType } from '../../src/simulation/planet/specialFacilities';
import {
    constructionServiceResourceType,
    groceryServiceResourceType,
    maintenanceServiceResourceType,
} from '../../src/simulation/planet/services';
import type { EducationLevelType } from '../../src/simulation/population/education';
import { educationLevelKeys } from '../../src/simulation/population/education';

export const BENCHMARK_PLANET_ID = 'benchmark-earth';
const GOV = 'benchmark-government';

export interface BenchmarkWorldConfig {
    population?: number;
    agentsPerProduct?: number;
    lowTierScaleFactor?: number;
    highTierScaleFactor?: number;
    rawPoolFactor?: number;
    waterPoolQuantity?: number;
    employableFraction?: number;
    groceryBuffer?: number;
    solverSeedSlack?: number;
    maintenanceScaleFactor?: number;
    maintenanceBufferTicks?: number;
    govStarterLoanBillions?: number;
}

interface FacilityTarget {
    totalScale: number;
    agentCount: number;
}

const SOLVER_SEED_BASELINE_FLOOR_KEYS: ReadonlySet<string> = new Set([
    'maintenanceFacility',
    'administrativeCenter',
]);

function computeTargets(
    population: number,
    agentsPerProduct: number,
    solverSeedSlack?: number,
    maintenanceScaleFactor?: number,
): Record<string, FacilityTarget> {
    const popB = population / 1_000_000_000;
    const solverScales = solverSeedSlack !== undefined ? computeSolverScales(population) : undefined;
    const targets: Record<string, FacilityTarget> = {};
    for (const key of Object.keys(FACILITY_SCALE_PER_BILLION)) {
        const useSolver = solverScales !== undefined && !SOLVER_SEED_BASELINE_FLOOR_KEYS.has(key);
        const baseScale = useSolver
            ? Math.max(1, Math.round((solverScales[key] ?? 0) * (solverSeedSlack ?? 1)))
            : Math.max(1, Math.round(FACILITY_SCALE_PER_BILLION[key] * popB));
        const totalScale =
            key === 'maintenanceFacility' ? Math.max(1, Math.round(baseScale * (maintenanceScaleFactor ?? 1))) : baseScale;
        targets[key] = {
            totalScale,
            agentCount: Math.min(totalScale, Math.max(1, agentsPerProduct)),
        };
    }
    return targets;
}

function scaleFactorForFacility(facilityType: FacilityType, config: BenchmarkWorldConfig): number {
    const level = ALL_PRODUCTION_FACILITY_ENTRIES[facilityType].primaryOutputLevel;
    if (level === 'raw' || level === 'refined') {
        return config.lowTierScaleFactor ?? 1;
    }
    return config.highTierScaleFactor ?? 1;
}

function rescaleEmployable(pop: Planet['population'], employableFraction: number): void {
    if (employableFraction >= 1) {
        return;
    }
    for (const cohort of pop.demography) {
        for (const edu of educationLevelKeys) {
            const unoccupied = cohort.unoccupied[edu];
            if (unoccupied.total <= 0) {
                continue;
            }
            const keep = Math.floor(unoccupied.total * employableFraction);
            const move = unoccupied.total - keep;
            unoccupied.total = keep;
            cohort.unableToWork[edu].total += move;
        }
    }
}

const BASE_RESOURCES: Array<{ resource: ReturnType<typeof makePool>['resource']; quantity: number; renewable: boolean }> = [
    { resource: arableLandResourceType, quantity: 1_000_000_000, renewable: true },
    { resource: waterSourceResourceType, quantity: 1_000_000_000, renewable: true },
    { resource: ironOreDepositResourceType, quantity: 1_000_000_000, renewable: false },
    { resource: coalDepositResourceType, quantity: 1_000_000_000, renewable: false },
    { resource: oilReservoirResourceType, quantity: 1_000_000_000, renewable: false },
    { resource: forestResourceType, quantity: 500_000_000, renewable: true },
    { resource: copperDepositResourceType, quantity: 500_000_000, renewable: false },
    { resource: sandDepositResourceType, quantity: 5_000_000_000, renewable: false },
    { resource: limestoneDepositResourceType, quantity: 500_000_000, renewable: false },
    { resource: stoneDepositResourceType, quantity: 1_000_000_000, renewable: false },
];

function buildResources(config: BenchmarkWorldConfig): Planet['resources'] {
    const resources: Planet['resources'] = {};
    const rawPoolFactor = config.rawPoolFactor ?? 1;
    for (const { resource, quantity, renewable } of BASE_RESOURCES) {
        let qty = quantity * rawPoolFactor;
        if (resource.name === waterSourceResourceType.name && config.waterPoolQuantity !== undefined) {
            qty = config.waterPoolQuantity;
        }
        resources[resource.name] = {
            pool: makePool({ type: resource, quantity: Math.max(1, Math.round(qty)), renewable }),
            claims: [],
        };
    }
    return resources;
}

export function buildBenchmarkWorld(
    config: BenchmarkWorldConfig = {},
): { gameState: GameState; planet: Planet; agents: Agent[] } {
    const population = config.population ?? 10_000_000;
    const agentsPerProduct = config.agentsPerProduct ?? 3;
    const groceryBuffer = config.groceryBuffer ?? 6;

    const TARGETS = computeTargets(population, agentsPerProduct, config.solverSeedSlack, config.maintenanceScaleFactor);
    const agents: Agent[] = [];

    for (const [facilityType, target] of Object.entries(TARGETS)) {
        const names = getNamesFor(facilityType as FacilityType, target.agentCount);
        const splits = splitScale(target.totalScale, names.length, facilityType);
        const levelFactor = scaleFactorForFacility(facilityType as FacilityType, config);

        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const scale = Math.max(1, Math.round(splits[i] * levelFactor));

            const entry = ALL_PRODUCTION_FACILITY_ENTRIES[facilityType as FacilityType];
            const fac = entry.factory(BENCHMARK_PLANET_ID, `${id}-${facilityType}`);
            fac.scale = scale;
            fac.maxScale = scale;

            const hrDepartment = humanResourcesOfficeFacilityType(BENCHMARK_PLANET_ID, `${id}-hr-department`);
            const storageScale = storageScaleForFacilities([fac]);
            const storage = makeStorage({ planetId: BENCHMARK_PLANET_ID, id: `${id}-storage`, scale: storageScale });
            const neededWorkers =
                1.1 *
                HR_WORLD_BUFFER *
                ESTIMATED_HR_OVERHEAD *
                (neededWorkersByFacility(fac) + neededWorkersByFacility(storage.department!));

            hrDepartment.scale = humanResourcesScaleForWorkers(neededWorkers);
            hrDepartment.maxScale = hrDepartment.scale;

            const agent = makeAgent({
                id,
                name,
                associatedPlanetId: BENCHMARK_PLANET_ID,
                planetId: BENCHMARK_PLANET_ID,
                facilities: [fac],
                storage,
                hrDepartment,
            });

            const personality = generateAgentPersonality();
            const assets = agent.assets[BENCHMARK_PLANET_ID];

            assets.market.buy[constructionServiceResourceType.name] = {
                resource: constructionServiceResourceType,
                automated: true,
                autoConfig: buildBuyAutoConfigForResource(personality.buyAutoConfig, constructionServiceResourceType),
            };

            for (const { resource } of fac.produces) {
                if (assets.market.sell[resource.name]) {
                    continue;
                }
                if (resource.name === groceryServiceResourceType.name) {
                    const groceryStrategy: AutomatedPricingConfig = {
                        priceAdjustMaxUp: 1.02,
                        priceAdjustMaxDown: 0.98,
                        targetSellThrough: 0.8,
                    };
                    assets.market.sell[resource.name] = { resource, automated: true, autoConfig: groceryStrategy };
                } else {
                    assets.market.sell[resource.name] = {
                        resource,
                        automated: true,
                        autoConfig: buildSellAutoConfigForResource(personality.sellAutoConfig, resource),
                    };
                }
            }

            for (const { resource } of fac.needs) {
                if (resource.form === 'landBoundResource') {
                    continue;
                }
                if (!assets.market.buy[resource.name]) {
                    assets.market.buy[resource.name] = {
                        resource,
                        automated: true,
                        autoConfig: buildBuyAutoConfigForResource(personality.buyAutoConfig, resource),
                    };
                }
            }

            if (config.maintenanceBufferTicks !== undefined && !assets.market.buy[maintenanceServiceResourceType.name]) {
                assets.market.buy[maintenanceServiceResourceType.name] = {
                    resource: maintenanceServiceResourceType,
                    automated: true,
                    autoConfig: {
                        ...buildBuyAutoConfigForResource(personality.buyAutoConfig, maintenanceServiceResourceType),
                        inputBufferTargetTicks: config.maintenanceBufferTicks,
                    },
                };
            }

            agents.push(agent);
        }
    }

    const govAgent = makeAgent({
        id: GOV,
        name: 'Benchmark Government',
        associatedPlanetId: BENCHMARK_PLANET_ID,
        planetId: BENCHMARK_PLANET_ID,
        facilities: [],
        storage: makeStorage({ planetId: BENCHMARK_PLANET_ID, id: 'benchmark-gov-storage' }),
        hrDepartment: null,
    });
    agents.unshift(govAgent);


    const populationShape = createPopulation(population, groceryBuffer);
    if ((config.employableFraction ?? 1) < 1) {
        rescaleEmployable(populationShape, config.employableFraction ?? 1);
    }

    const planetBase = {
        id: BENCHMARK_PLANET_ID,
        name: 'Benchmark Earth',
        position: { x: 10, y: 0, z: 0 },
        population: populationShape,
        governmentId: GOV,
        bank: {
            loans: 0,
            deposits: 0,
            householdDeposits: 0,
            equity: 0,
            loanRate: 0,
            depositRate: 0,
        },
        wagePerEdu: { none: 10.0, primary: 10.0, secondary: 10.0, tertiary: 10.0 } as Record<EducationLevelType, number>,
        marketPrices: { ...initialMarketPrices },
        monthTransferVolume: 0,
        governmentSupportVolume: 0,
        rolloverDenials: 0,
        debtWriteOffs: 0,
        bankruptcies: 0,
        refoundCount: 0,
        loanInterestCollected: 0,
        emergencyLoansGranted: 0,
        transportPipeline: {},
        orderBooks: {},
        lastMarketResult: {},
        avgMarketResult: {},
        monthPriceAcc: {},
        consumedResources: {},
        producedResources: {},
        constructionBalanceEMA: 0,
        productionCosts: {},
        lastProductionCostFloors: {},
        landBoundCostPerUnit: {},
        resources: buildResources(config),
        infrastructure: {
            primarySchools: 1_000,
            secondarySchools: 500,
            universities: 200,
            hospitals: 300,
            mobility: { roads: 10_000, railways: 5_000, airports: 100, seaports: 50, spaceports: 1 },
            energy: { production: 100_000 },
        },
        environment: makeDefaultEnvironment({
            air: 5,
            water: 2,
            soil: 1,
            airRegen: 1,
            waterRegen: 1,
            soilRegen: 0.1,
            earthquakes: 10,
            floods: 20,
            storms: 30,
        }),
    };

    const recycler = createRecyclerAgent(planetBase.id, planetBase.name);
    const planet: Planet = { ...planetBase, recycler };

    const govStarterLoanBillions = config.govStarterLoanBillions ?? 0;
    if (govStarterLoanBillions > 0) {
        const amount = govStarterLoanBillions * 1e9;
        planet.govStarterLoanRemaining = amount;
        planet.govStarterLoanPerTick = amount / (10 * TICKS_PER_YEAR);
    }

    const allAgents = [...agents, recycler];

    const gameState: GameState = {
        tick: 0,
        planets: new Map([[planet.id, planet]]),
        agents: new Map(allAgents.map((a) => [a.id, a])),
        shipCapitalMarket: { tradeHistory: [], emaPrice: {} },
        forexMarketMakers: new Map(),
        shipbuilderAgents: new Map(),
        arbitrageTraders: new Map(),
        tickerEvents: [],
        nextEventId: 1,
    };

    prefillAgentStorageFromFacilities(gameState);

    return { gameState, planet, agents: allAgents };
}

