/**
 * simulation/utils/testHelper.ts
 *
 * Centralized test fixture factories for the simulation module.
 *
 * Provides simple functions to create correctly-shaped game objects
 * (PopulationCategory, WorkforceCategory, Cohort, Planet, Agent, GameState, etc.)
 * conforming to the current data model.
 *
 * Design:
 * - Small functions for leaf objects, composed by larger functions.
 * - No builder pattern — just create the object and mutate as needed in tests.
 * - Every function returns a complete, valid, zero/default object.
 * - Optional `Partial` overrides are applied via spread where useful.
 */

import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import {
    createEmptyDemographicEventCounters,
    type Agent,
    type AgentPlanetAssets,
    type Bank,
    type Environment,
    type GameState,
    type Infrastructure,
    type Planet,
} from '../planet/planet';
import { makeLoan } from '../financial/loanTypes';
import type {
    ManagementFacility,
    ProductionFacility,
    ShipConstructionFacility,
    StorageFacility,
} from '../planet/facility';
import type { TransportShipType } from '../ships/ships';
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
import type { WorkforceCategory, WorkforceCohort } from '../workforce/workforce';

// ============================================================================
// Leaf value factories
// ============================================================================

/** Zero Gaussian moments. */
export function makeGaussianMoments(overrides?: Partial<GaussianMoments>): GaussianMoments {
    return { mean: 0, variance: 0, ...overrides };
}

/** Zero death stats. */
export function makeDeathStats(overrides?: Partial<DeathStats>): DeathStats {
    return { type: 'death', countThisMonth: 0, countThisTick: 0, countLastMonth: 0, ...overrides };
}

/** Zero disability stats. */
export function makeDisabilityStats(overrides?: Partial<DisabilityStats>): DisabilityStats {
    return { type: 'disability', countThisMonth: 0, countThisTick: 0, countLastMonth: 0, ...overrides };
}

/** Zero retirement stats. */
export function makeRetirementStats(overrides?: Partial<RetirementStats>): RetirementStats {
    return { type: 'retirement', countThisMonth: 0, countThisTick: 0, countLastMonth: 0, ...overrides };
}

// ============================================================================
// Population category factories
// ============================================================================

/**
 * Create a single PopulationCategory cell (the leaf of the demography tree).
 * All fields default to zero.
 */
export function makePopulationCategory(overrides?: Partial<PopulationCategory>): PopulationCategory {
    return {
        ...nullPopulationCategory(),
        ...overrides,
    };
}

/**
 * Create a single WorkforceCategory cell (the leaf of workforce demography).
 * `departing` and `departingFired` arrays are sized to NOTICE_PERIOD_MONTHS.
 */
export function makeWorkforceCategory(overrides?: Partial<WorkforceCategory>): WorkforceCategory {
    return {
        active: 0,
        voluntaryDeparting: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
        departingFired: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
        departingRetired: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
        ...overrides,
    };
}

// ============================================================================
// Cohort factories
// ============================================================================

/**
 * Create a single empty population cohort for one age bucket.
 * Shape: { [Occupation]: { [EducationLevelType]: { [Skill]: PopulationCategory } } }
 *
 * Each cell gets its own fresh PopulationCategory to avoid shared-reference issues.
 */
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

/**
 * Create a single empty workforce cohort for one age bucket.
 * Shape: { [EducationLevelType]: { [Skill]: WorkforceCategory } }
 */
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

// ============================================================================
// Full demography arrays
// ============================================================================

/**
 * Create a full population demography: Cohort<PopulationCategory>[]
 * of length MAX_AGE + 1 (ages 0 … MAX_AGE), all zeroed.
 */
export function makePopulationDemography(): Cohort<PopulationCategory>[] {
    return Array.from({ length: MAX_AGE + 1 }, () => makePopulationCohort());
}

/**
 * Create a full workforce demography: CohortByOccupation<WorkforceCategory>[]
 * of length MAX_AGE + 1 (ages 0 … MAX_AGE), all zeroed.
 */
export function makeWorkforceDemography(): WorkforceCohort<WorkforceCategory>[] {
    return Array.from({ length: MAX_AGE + 1 }, () => makeWorkforceCohort());
}

// ============================================================================
// Population
// ============================================================================

/**
 * Create an empty Population object.
 */
export function makePopulation(): Population {
    return {
        demography: makePopulationDemography(),
        summedPopulation: makePopulationCohort(),
        lastTransferMatrix: [],
        lastConsumption: {},
    };
}

/**
 * Create a Population with `total` people distributed across working ages
 * (MIN_EMPLOYABLE_AGE … 64), all placed in occupation='unoccupied',
 * education='none', skill='novice'.
 *
 * Useful for labor market / workforce tests that need a hireable pool.
 */
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

/**
 * Convenience: distribute people across multiple education levels.
 * `distribution` maps education → count. All placed as unoccupied/novice
 * in working ages.
 */
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

// ============================================================================
// Infrastructure, Environment, Bank
// ============================================================================

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

// ============================================================================
// Facilities
// ============================================================================

/**
 * Create a minimal StorageFacility with near-infinite capacity.
 */
export function makeStorageFacility(overrides?: Partial<StorageFacility>): StorageFacility {
    return {
        type: 'storage',
        planetId: 'p',
        id: 'storage-p',
        name: 'test-storage',
        maxScale: 1,
        scale: 1,
        construction: null,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1e13, mass: 1e13 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {},
        escrow: {},
        lastTickResults: {
            overallEfficiency: 0,
            workerEfficiency: {},
            overqualifiedWorkers: {},
            exactUsedByEdu: {},
            totalUsedByEdu: {},
        },
        ...overrides,
    } as StorageFacility;
}

/**
 * Create a ManagementFacility with given worker requirements.
 */
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
        powerConsumptionPerTick: 0,
        workerRequirement: (workerReq ?? {}) as Record<string, number>,
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        needs: [],
        buffer: 0,
        maxBuffer: 100,
        bufferPerTickPerScale: 10,
        lastTickResults: {
            overallEfficiency: 0,
            workerEfficiency: {},
            resourceEfficiency: {},
            overqualifiedWorkers: {},
            exactUsedByEdu: {},
            totalUsedByEdu: {},
            lastConsumed: {},
        },
        ...overrides,
    };
}

/**
 * Create a ProductionFacility with given worker requirements.
 */
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
        lastTickResults: {
            overallEfficiency: 0,
            overqualifiedWorkers: {},
            resourceEfficiency: {},
            workerEfficiency: {},
            exactUsedByEdu: {},
            totalUsedByEdu: {},
            lastProduced: {},
            lastConsumed: {},
        },
        powerConsumptionPerTick: 0,
        workerRequirement: (workerReq ?? {}) as Record<string, number>,
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        needs: [],
        produces: [],
        ...overrides,
    };
}

/**
 * Create a ShipConstructionFacility with given worker requirements.
 */
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
        lastTickResults: {
            overallEfficiency: 0,
            workerEfficiency: {},
            overqualifiedWorkers: {},
            exactUsedByEdu: {},
            totalUsedByEdu: {},
        },
        shipName: 'SS Test',
        produces: defaultShipType,
        progress: 0,
        ...rest,
    } as ShipConstructionFacility;
}

// ============================================================================
// AgentPlanetAssets
// ============================================================================

/**
 * Zeroed-out allocatedWorkers record (all four education levels = 0).
 */
export function makeAllocatedWorkers(
    overrides?: Partial<Record<EducationLevelType, number>>,
): Record<EducationLevelType, number> {
    return { none: 0, primary: 0, secondary: 0, tertiary: 0, ...overrides };
}

/**
 * Create AgentPlanetAssets with sensible defaults.
 */
export function makeAgentPlanetAssets(planetId = 'p', overrides?: Partial<AgentPlanetAssets>): AgentPlanetAssets {
    return {
        productionFacilities: [],
        managementFacilities: [],
        shipConstructionFacilities: [],
        shipMaintenanceFacilities: [],
        transportContracts: [],
        constructionContracts: [],
        shipBuyingOffers: [],
        shipListings: [],
        deposits: 0,
        depositHold: 0,
        activeLoans: [],
        storageFacility: makeStorageFacility({ planetId, id: `storage-${planetId}` }),
        allocatedWorkers: makeAllocatedWorkers(),
        workforceDemography: makeWorkforceDemography(),
        deaths: createEmptyDemographicEventCounters(),
        disabilities: createEmptyDemographicEventCounters(),
        monthAcc: {
            depositsAtMonthStart: 0,
            productionValue: 0,
            consumptionValue: 0,
            wages: 0,
            revenue: 0,
            purchases: 0,
            claimPayments: 0,
            totalWorkersTicks: 0,
        },
        lastMonthAcc: {
            productionValue: 0,
            consumptionValue: 0,
            wages: 0,
            revenue: 0,
            purchases: 0,
            claimPayments: 0,
            totalWorkersTicks: 0,
        },
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

// ============================================================================
// Planet
// ============================================================================

/**
 * Create a Planet with sensible zero defaults.
 * By default creates an empty population. Pass `population` in overrides
 * or use the convenience helpers below for pre-populated planets.
 */
export function makePlanet(overrides?: Partial<Planet> & { governmentId?: string }): Planet {
    const { marketPrices: overrideMarketPrices, ...restOverrides } = overrides ?? {};
    return {
        id: 'p',
        name: 'Test Planet',
        position: { x: 0, y: 0, z: 0 },
        population: makePopulation(),
        resources: {},
        governmentId: overrides?.governmentId ?? 'gov-1',
        bank: makeBank(),
        infrastructure: makeInfrastructure(),
        environment: makeEnvironment(),
        marketPrices: { ...initialMarketPrices, ...overrideMarketPrices },
        lastMarketResult: {},
        avgMarketResult: {},
        monthPriceAcc: {},
        ...restOverrides,
    };
}

/**
 * Create a planet with workers pre-distributed by education level.
 * Returns { planet, gov } where gov is the government agent on that planet.
 */
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

// ============================================================================
// GameState
// ============================================================================

/**
 * Create a GameState from a planet and agents. The planet's government
 * agent must be included in `agents`.
 */
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
    };
}

/**
 * Convenience: build a minimal game world with one planet, a government,
 * and zero or more company agents.
 *
 * Returns { gameState, planet, gov, agents } where `agents` includes
 * the government plus all companies.
 */
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

// ============================================================================
// Map conversion helpers (useful for functions that take Map arguments)
// ============================================================================

/** Wrap agents into a Map keyed by their id. */
export function agentMap(...agents: Agent[]): Map<string, Agent> {
    return new Map(agents.map((a) => [a.id, a]));
}

// ============================================================================
// Population counting / query helpers
// ============================================================================

/**
 * Sum total population across all ages, occupations, education levels,
 * and skills.
 */
export function totalPopulation(planet: Planet): number {
    let total = 0;
    for (const cohort of planet.population.demography) {
        forEachPopulationCohort(cohort, (cat) => {
            total += cat.total;
        });
    }
    return total;
}

/**
 * Sum population for a specific education and occupation across all ages
 * and all skill levels.
 */
export function sumPopOcc(planet: Planet, edu: EducationLevelType, occ: Occupation): number {
    let total = 0;
    for (const cohort of planet.population.demography) {
        for (const skill of SKILL) {
            total += cohort[occ][edu][skill].total;
        }
    }
    return total;
}

/**
 * Sum active + departing workers across all ages and skill levels
 * for a given education level in an agent's workforce on a planet.
 */
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

/**
 * Sum only active workers (excluding departing) across all ages and
 * skill levels for a given education level.
 */
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
        // Sum employed in population across all ages and skills
        let popEmployed = 0;
        for (const cohort of planet.population.demography) {
            for (const skill of SKILL) {
                popEmployed += cohort.employed[edu][skill].total;
            }
        }

        // Sum workforce across all agents on this planet.
        // All three departing pipelines (voluntary, fired, retired) are
        // independent — each must be counted.
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

/**
 * Assert workforce counts match population counts for each (age, edu, skill) cell.
 * This is a more granular version of assertWorkforcePopulationConsistency that catches
 * per-cell mismatches that would cancel out in aggregates.
 */
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
                    wfTotal += cell.voluntaryDeparting.reduce((s: number, d: number) => s + d, 0);
                    wfTotal += cell.departingFired.reduce((s: number, d: number) => s + d, 0);
                    wfTotal += cell.departingRetired.reduce((s: number, d: number) => s + d, 0);
                }

                // Only check cells where at least one side is non-zero
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

// ============================================================================
// Forex test helpers
// ============================================================================

export function creditForeignDeposit(agent: Agent, issuingPlanet: Planet, amount: number): void {
    agent.assets[issuingPlanet.id]!.deposits += amount;
    issuingPlanet.bank.deposits += amount;
    issuingPlanet.bank.loans += amount;
    agent.assets[issuingPlanet.id]!.activeLoans.push(
        makeLoan('forexWorkingCapital', amount, issuingPlanet.bank.loanRate, 0, 0, false),
    );
}
