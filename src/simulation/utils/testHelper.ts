import { createRecyclerAgent } from '../agents/recycler';
import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import { DEFAULT_WAGE_PER_EDU } from '../financial/financialTick';
import { makeLoan } from '../financial/loanTypes';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import {
    createLastTickResults,
    type ManagementFacility,
    type ProductionFacility,
    type ShipConstructionFacility,
    type StorageFacility,
} from '../planet/facility';
import {
    createEmptyAccumulator,
    createEmptyDemographicEventCounters,
    type Agent,
    type AgentPlanetAssets,
    type Bank,
    type Environment,
    type GameState,
    type Infrastructure,
    type Planet,
} from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import type {
    Cohort,
    DeathStats,
    DisabilityStats,
    GaussianMoments,
    Occupation,
    Population,
    PopulationCategory,
    RetirementStats,
    Skill,
} from '../population/population';
import { forEachPopulationCohort, MAX_AGE, nullPopulationCategory, OCCUPATIONS, SKILL } from '../population/population';
import type { TransportShipType } from '../ships/ships';
import type { WorkforceCategory, WorkforceCohort } from '../workforce/workforce';

export function makeGaussianMoments(overrides?: Partial<GaussianMoments>): GaussianMoments {
    return { mean: 0, variance: 0, ...overrides };
}

export function makeDeathStats(overrides?: Partial<DeathStats>): DeathStats {
    return { type: 'death', countThisMonth: 0, countThisTick: 0, countLastMonth: 0, ...overrides };
}

export function makeDisabilityStats(overrides?: Partial<DisabilityStats>): DisabilityStats {
    return { type: 'disability', countThisMonth: 0, countThisTick: 0, countLastMonth: 0, ...overrides };
}

export function makeRetirementStats(overrides?: Partial<RetirementStats>): RetirementStats {
    return { type: 'retirement', countThisMonth: 0, countThisTick: 0, countLastMonth: 0, ...overrides };
}

export function makePopulationCategory(overrides?: Partial<PopulationCategory>): PopulationCategory {
    return {
        ...nullPopulationCategory(),
        ...overrides,
    };
}

export function makeWorkforceCategory(overrides?: Partial<WorkforceCategory>): WorkforceCategory {
    return {
        active: 0,
        onboarding: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
        voluntaryDeparting: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
        departingFired: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
        departingRetired: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
        workforceExperience: 0,
        ...overrides,
    };
}

export function makePopulationCohort(): Cohort<PopulationCategory> {
    const cohort = {} as Cohort<PopulationCategory>;
    for (const occ of OCCUPATIONS) {
        cohort[occ] = {} as WorkforceCohort<PopulationCategory>;
        for (const edu of educationLevelKeys) {
            cohort[occ][edu] = {} as Record<Skill, PopulationCategory>;
            for (const skill of SKILL) {
                cohort[occ][edu][skill] = nullPopulationCategory();
            }
        }
    }
    return cohort;
}

export function makeWorkforceCohort(): WorkforceCohort<WorkforceCategory> {
    const cohort = {} as WorkforceCohort<WorkforceCategory>;
    for (const edu of educationLevelKeys) {
        cohort[edu] = {} as Record<Skill, WorkforceCategory>;
        for (const skill of SKILL) {
            cohort[edu][skill] = makeWorkforceCategory();
        }
    }
    return cohort;
}

export function makePopulationDemography(): Cohort<PopulationCategory>[] {
    return Array.from({ length: MAX_AGE + 1 }, () => makePopulationCohort());
}

export function makeWorkforceDemography(): WorkforceCohort<WorkforceCategory>[] {
    return Array.from({ length: MAX_AGE + 1 }, () => makeWorkforceCohort());
}

export function makePopulation(): Population {
    return {
        demography: makePopulationDemography(),
        summedPopulation: makePopulationCohort(),
        lastTransferMatrix: [],
    };
}

export function makePopulationWithWorkers(
    total: number,
    opts?: {
        edu?: EducationLevelType;
        skill?: Skill;
        occ?: Occupation;
        minAge?: number;
        maxAge?: number;
    },
): Population {
    const edu = opts?.edu ?? 'none';
    const skill = opts?.skill ?? 'novice';
    const occ = opts?.occ ?? 'unoccupied';
    const minAge = opts?.minAge ?? MIN_EMPLOYABLE_AGE;
    const maxAge = opts?.maxAge ?? 64;
    const workingAges = maxAge - minAge + 1;

    const pop = makePopulation();
    const perAge = Math.floor(total / workingAges);
    let remainder = total - perAge * workingAges;

    for (let age = minAge; age <= maxAge; age++) {
        const extra = remainder > 0 ? 1 : 0;
        pop.demography[age][occ][edu][skill].total = perAge + extra;
        if (remainder > 0) {
            remainder--;
        }
    }
    return pop;
}

export function makePopulationByEducation(distribution: Partial<Record<EducationLevelType, number>>): Population {
    const pop = makePopulation();
    for (const [edu, total] of Object.entries(distribution) as [EducationLevelType, number][]) {
        if (!total || total <= 0) {
            continue;
        }
        const minAge = MIN_EMPLOYABLE_AGE;
        const maxAge = 64;
        const workingAges = maxAge - minAge + 1;
        const perAge = Math.floor(total / workingAges);
        let remainder = total - perAge * workingAges;
        for (let age = minAge; age <= maxAge; age++) {
            const extra = remainder > 0 ? 1 : 0;
            pop.demography[age].unoccupied[edu].novice.total = perAge + extra;
            if (remainder > 0) {
                remainder--;
            }
        }
    }
    return pop;
}

export function makeBank(overrides?: Partial<Bank>): Bank {
    return {
        loans: 0,
        deposits: 0,
        householdDeposits: 0,
        equity: 0,
        loanRate: 0,
        depositRate: 0,
        ...overrides,
    };
}

export function makeInfrastructure(overrides?: Partial<Infrastructure>): Infrastructure {
    return {
        primarySchools: 0,
        secondarySchools: 0,
        universities: 0,
        hospitals: 0,
        mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
        energy: { production: 0 },
        ...overrides,
    };
}

export function makeEnvironment(overrides?: Partial<Environment>): Environment {
    return {
        naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
        pollution: { air: 0, water: 0, soil: 0 },
        regenerationRates: {
            air: { constant: 0, percentage: 0 },
            water: { constant: 0, percentage: 0 },
            soil: { constant: 0, percentage: 0 },
        },
        ...overrides,
    };
}

export function makeStorageFacility(overrides?: Partial<StorageFacility>): StorageFacility {
    return {
        type: 'storage',
        planetId: 'p',
        id: 'storage-p',
        name: 'test-storage',
        maxScale: 1,
        scale: 1,
        construction: null,
        lastConstructionCompletedTick: 0,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1e13, mass: 1e13 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {},
        escrow: {},
        lastTickResults: createLastTickResults(),
        ...overrides,
    } as StorageFacility;
}

export function makeManagementFacility(
    workerReq?: Partial<Record<EducationLevelType, number>>,
    overrides?: Partial<ManagementFacility>,
): ManagementFacility {
    return {
        type: 'management',
        planetId: 'p',
        id: 'mgmt-1',
        name: 'Test Management',
        maxScale: 1,
        scale: 1,
        construction: null,
        lastConstructionCompletedTick: 0,
        powerConsumptionPerTick: 0,
        workerRequirement: (workerReq ?? {}) as Record<string, number>,
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        needs: [],
        buffer: 0,
        maxBuffer: 100,
        bufferPerTickPerScale: 10,
        lastTickResults: createLastTickResults(),
        ...overrides,
    };
}

export function makeProductionFacility(
    workerReq?: Partial<Record<EducationLevelType, number>>,
    overrides?: Partial<ProductionFacility>,
): ProductionFacility {
    return {
        type: 'production',
        planetId: 'p',
        id: 'facility-1',
        name: 'Test Facility',
        maxScale: 1,
        scale: 1,
        construction: null,
        lastConstructionCompletedTick: 0,
        lastTickResults: {
            ...createLastTickResults(),
            lastProduced: {},
            revenue: 0,
        },
        powerConsumptionPerTick: 0,
        workerRequirement: (workerReq ?? {}) as Record<string, number>,
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        needs: [],
        produces: [],
        pidState: null,
        ...overrides,
    };
}

export function makeShipConstructionFacility(
    workerReq?: Partial<Record<EducationLevelType, number>>,
    overrides?: Partial<ShipConstructionFacility> & { shipType?: TransportShipType },
): ShipConstructionFacility {
    const { shipType, ...rest } = overrides ?? {};
    const defaultShipType: TransportShipType = shipType ?? {
        type: 'transport',
        name: 'Test Ship',
        scale: 'small',
        speed: 1,
        cargoSpecification: { type: 'solid', volume: 1000, mass: 1000 },
        requiredCrew: { none: 0, primary: 0, secondary: 1, tertiary: 0 },
        buildingCost: [],
        buildingTime: 90,
    };
    return {
        type: 'ship_construction',
        planetId: 'p',
        id: 'shipyard-1',
        name: 'Test Shipyard',
        maxScale: 1,
        scale: 1,
        construction: null,
        powerConsumptionPerTick: 0,
        workerRequirement: (workerReq ?? {}) as Record<string, number>,
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        lastTickResults: createLastTickResults(),
        shipName: 'SS Test',
        produces: defaultShipType,
        progress: 0,
        ...rest,
    } as ShipConstructionFacility;
}

export function makeAllocatedWorkers(
    overrides?: Partial<Record<EducationLevelType, number>>,
): Record<EducationLevelType, number> {
    return { none: 0, primary: 0, secondary: 0, tertiary: 0, ...overrides };
}

export function makeAgentPlanetAssets(planetId = 'p', overrides?: Partial<AgentPlanetAssets>): AgentPlanetAssets {
    return {
        productionFacilities: [],
        managementFacilities: [],
        shipConstructionFacilities: [],
        transportContracts: [],
        constructionContracts: [],
        shipBuyingOffers: [],
        shipListings: [],
        deposits: 0,
        depositHold: 0,
        activeLoans: [],
        storageFacility: makeStorageFacility({ planetId, id: `storage-${planetId}` }),
        wagePerEdu: {
            none: DEFAULT_WAGE_PER_EDU,
            primary: DEFAULT_WAGE_PER_EDU,
            secondary: DEFAULT_WAGE_PER_EDU,
            tertiary: DEFAULT_WAGE_PER_EDU,
        },
        allocatedWorkers: makeAllocatedWorkers(),
        totalSlotCapacity: makeAllocatedWorkers(),
        unusedWorkers: makeAllocatedWorkers(),
        overqualifiedWorkers: {},
        workforceDemography: makeWorkforceDemography(),
        deaths: createEmptyDemographicEventCounters(),
        disabilities: createEmptyDemographicEventCounters(),
        profitShareBonus: 0,
        lastDepreciatedPerTick: {},
        monthAcc: {
            depositsAtMonthStart: 0,
            ...createEmptyAccumulator(),
        },
        lastMonthAcc: createEmptyAccumulator(),
        licenses: {
            commercial: { acquiredTick: 0, frozen: false },
            workforce: { acquiredTick: 0, frozen: false },
        },
        ...overrides,
    };
}

export function makeAgent(id = 'agent-1', planetId = 'p', name = 'Agent 1', overrides?: Partial<Agent>): Agent {
    return {
        id,
        name,
        foundedTick: 0,
        starterLoanTaken: false,
        associatedPlanetId: planetId,
        ships: [],
        automated: true,
        automateWorkerAllocation: true,
        assets: {
            [planetId]: makeAgentPlanetAssets(planetId),
        },
        ...overrides,
    };
}

export function makeGovernmentAgent(id = 'gov-1', planetId = 'p'): Agent {
    return makeAgent(id, planetId);
}

export function makePlanet(overrides?: Partial<Planet> & { governmentId?: string }): Planet {
    const { marketPrices: overrideMarketPrices, ...restOverrides } = overrides ?? {};
    const planet = {
        id: 'p',
        name: 'Test Planet',
        position: { x: 0, y: 0, z: 0 },
        population: makePopulation(),
        resources: {},
        governmentId: overrides?.governmentId ?? 'gov-1',
        bank: makeBank(),
        recycler: null!,
        infrastructure: makeInfrastructure(),
        environment: makeEnvironment(),
        marketPrices: { ...initialMarketPrices, ...overrideMarketPrices },
        wagePerEdu: {
            none: DEFAULT_WAGE_PER_EDU,
            primary: DEFAULT_WAGE_PER_EDU,
            secondary: DEFAULT_WAGE_PER_EDU,
            tertiary: DEFAULT_WAGE_PER_EDU,
        },
        transportPipeline: {},
        monthTransferVolume: 0,
        orderBooks: {},
        lastMarketResult: {},
        avgMarketResult: {},
        monthPriceAcc: {},
        consumedResources: {},
        producedResources: {},
        productionCosts: {},
        lastProductionCostFloors: {},
        landBoundCostPerUnit: {},
        ...restOverrides,
    };
    createRecyclerAgent(planet);
    return planet;
}

export function makePlanetWithPopulation(
    unoccupiedByEdu: Partial<Record<EducationLevelType, number>>,
    overrides?: Partial<Planet>,
): { planet: Planet; gov: Agent } {
    const gov = makeGovernmentAgent();
    const planet = makePlanet({
        population: makePopulationByEducation(unoccupiedByEdu),
        governmentId: gov.id,
        ...overrides,
    });
    return { planet, gov };
}

export function makeGameState(
    planets: Planet[] | Planet = [makePlanet()],
    agents: Agent[] = [makeGovernmentAgent()],
    tick = 0,
): GameState {
    if (!Array.isArray(planets)) {
        planets = [planets];
    }
    return {
        tick,
        planets: new Map(planets.map((p) => [p.id, p])),
        agents: new Map(agents.map((a) => [a.id, a])),
        shipCapitalMarket: { tradeHistory: [], emaPrice: {} },
        forexMarketMakers: new Map(),
        shipbuilderAgents: new Map(),
        arbitrageTraders: new Map(),
        tickerEvents: [],
        nextEventId: 1,
    };
}

export function makeWorld(opts?: {
    populationByEdu?: Partial<Record<EducationLevelType, number>>;
    companyIds?: string[];
    tick?: number;
    planetOverrides?: Partial<Planet>;
}): { gameState: GameState; planet: Planet; gov: Agent; agents: Agent[] } {
    const gov = makeGovernmentAgent();
    const population = opts?.populationByEdu ? makePopulationByEducation(opts.populationByEdu) : makePopulation();
    const planet = makePlanet({
        population,
        governmentId: gov.id,
        ...opts?.planetOverrides,
    });

    const companies = (opts?.companyIds ?? []).map((id) => makeAgent(id, planet.id));
    const agents = [gov, ...companies];

    return {
        gameState: makeGameState([planet], agents, opts?.tick),
        planet,
        gov,
        agents,
    };
}

export function agentMap(...agents: Agent[]): Map<string, Agent> {
    return new Map(agents.map((a) => [a.id, a]));
}

export function totalPopulation(planet: Planet): number {
    let total = 0;
    for (const cohort of planet.population.demography) {
        forEachPopulationCohort(cohort, (cat) => {
            total += cat.total;
        });
    }
    return total;
}

export function sumPopOcc(planet: Planet, edu: EducationLevelType, occ: Occupation): number {
    let total = 0;
    for (const cohort of planet.population.demography) {
        for (const skill of SKILL) {
            total += cohort[occ][edu][skill].total;
        }
    }
    return total;
}

export function sumWorkforceForEdu(agent: Agent, planetId: string, edu: EducationLevelType): number {
    const wf = agent.assets[planetId]?.workforceDemography;
    if (!wf) {
        return 0;
    }
    let total = 0;
    for (const cohort of wf) {
        for (const skill of SKILL) {
            const cell = cohort[edu][skill];
            total += cell.active;
            for (const dep of cell.onboarding) {
                total += dep;
            }
            for (const dep of cell.voluntaryDeparting) {
                total += dep;
            }
            for (const dep of cell.departingFired) {
                total += dep;
            }
            for (const dep of cell.departingRetired) {
                total += dep;
            }
        }
    }
    return total;
}

export function sumActiveForEdu(agent: Agent, planetId: string, edu: EducationLevelType): number {
    const wf = agent.assets[planetId]?.workforceDemography;
    if (!wf) {
        return 0;
    }
    let total = 0;
    for (const cohort of wf) {
        for (const skill of SKILL) {
            total += cohort[edu][skill].active;
        }
    }
    return total;
}
export function assertPopulationWorkforceConsistency(agents: Map<string, Agent>, planet: Planet, label: string): void {
    for (const edu of educationLevelKeys) {
        let popEmployed = 0;
        for (const cohort of planet.population.demography) {
            for (const skill of SKILL) {
                popEmployed += cohort.employed[edu][skill].total;
            }
        }

        let wfTotal = 0;
        for (const agent of agents.values()) {
            const wf = agent.assets[planet.id]?.workforceDemography;
            if (!wf) {
                continue;
            }
            for (let age = 0; age < wf.length; age++) {
                for (const skill of SKILL) {
                    const cell = wf[age][edu][skill];
                    wfTotal += cell.active;
                    wfTotal += cell.onboarding.reduce((s: number, d: number) => s + d, 0);
                    wfTotal += cell.voluntaryDeparting.reduce((s: number, d: number) => s + d, 0);
                    wfTotal += cell.departingFired.reduce((s: number, d: number) => s + d, 0);
                    wfTotal += cell.departingRetired.reduce((s: number, d: number) => s + d, 0);
                }
            }
        }

        if (popEmployed !== wfTotal) {
            const msg =
                `[populationBridge] workforce consistency violation after ${label}: ` +
                `planet=${planet.id} edu=${edu}: population(employed)=${popEmployed} ≠ workforce=${wfTotal}`;
            if (process.env.SIM_DEBUG === '1') {
                throw new Error(msg);
            }
            console.warn(msg);
        }
    }
}

export function assertPerCellWorkforcePopulationConsistency(
    agents: Map<string, Agent>,
    planet: Planet,
    label = '',
): void {
    for (let age = 0; age < planet.population.demography.length; age++) {
        for (const edu of educationLevelKeys) {
            for (const skill of SKILL) {
                const popEmployed = planet.population.demography[age].employed[edu][skill].total;

                let wfTotal = 0;
                for (const [_id, agent] of agents) {
                    const wf = agent.assets[planet.id]?.workforceDemography;
                    if (!wf || age >= wf.length) {
                        continue;
                    }
                    const cell = wf[age][edu][skill];
                    wfTotal += cell.active;
                    wfTotal += cell.onboarding.reduce((s: number, d: number) => s + d, 0);
                    wfTotal += cell.voluntaryDeparting.reduce((s: number, d: number) => s + d, 0);
                    wfTotal += cell.departingFired.reduce((s: number, d: number) => s + d, 0);
                    wfTotal += cell.departingRetired.reduce((s: number, d: number) => s + d, 0);
                }

                if (popEmployed !== 0 || wfTotal !== 0) {
                    if (wfTotal !== popEmployed) {
                        console.error(
                            `${label} per-cell mismatch at age=${age}, edu=${edu}, skill=${skill}: wf=${wfTotal} ≠ pop(employed)=${popEmployed}`,
                        );
                    }
                }
            }
        }
    }
}

export function creditForeignDeposit(agent: Agent, issuingPlanet: Planet, amount: number): void {
    const assets = agent.assets[issuingPlanet.id]!;
    assets.deposits += amount;
    issuingPlanet.bank.deposits += amount;
    issuingPlanet.bank.loans += amount;
    assets.activeLoans.push(makeLoan('forexWorkingCapital', amount, issuingPlanet.bank.loanRate, 0, 0, false));
}
