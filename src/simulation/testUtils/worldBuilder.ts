/**
 * simulation/testUtils/worldBuilder.ts
 *
 * Fluent builder for constructing game-state objects in tests.
 * Provides a single, composable API that eliminates the need for
 * inline ad-hoc planet / agent / game-state construction in test files.
 *
 * Usage:
 *   const { gameState, planet, agents } = new WorldBuilder()
 *       .withPlanet({ pollution: { air: 50, water: 10, soil: 2 } })
 *       .withAgent('company-1')
 *       .build();
 */

import type { Agent, Planet, Environment, Infrastructure, EducationLevelType, Bank } from '../planet';
import type { GameState } from '../planet';
import type { StorageFacility, ProductionFacility } from '../facilities';
import { emptyCohort } from '../population/populationHelpers';
import { createWorkforceDemography } from '../workforce/workforceHelpers';
import { maxAge } from '../planet';

// ---------------------------------------------------------------------------
// Default factory helpers (private)
// ---------------------------------------------------------------------------

function defaultBank(): Bank {
    return { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
}

function defaultInfrastructure(): Infrastructure {
    return {
        primarySchools: 0,
        secondarySchools: 0,
        universities: 0,
        hospitals: 0,
        mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
        energy: { production: 0 },
    };
}

function defaultEnvironment(): Environment {
    return {
        naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
        pollution: { air: 0, water: 0, soil: 0 },
        regenerationRates: {
            air: { constant: 0, percentage: 0 },
            water: { constant: 0, percentage: 0 },
            soil: { constant: 0, percentage: 0 },
        },
    };
}

function defaultStorage(planetId: string): StorageFacility {
    return {
        planetId,
        id: `storage-${planetId}`,
        name: 'test-storage',
        scale: 1,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1e9, mass: 1e9 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {},
    } as StorageFacility;
}

// ---------------------------------------------------------------------------
// Builder options
// ---------------------------------------------------------------------------

export interface PlanetOptions {
    id?: string;
    name?: string;
    governmentId?: string;
    populationSize?: number;
    pollution?: Partial<Environment['pollution']>;
    regenerationRates?: Partial<Environment['regenerationRates']>;
    environment?: Partial<Environment>;
    infrastructure?: Partial<Infrastructure>;
    bank?: Partial<Bank>;
}

export interface AgentOptions {
    id?: string;
    planetId?: string;
    wealth?: number;
    allocatedWorkers?: Partial<Record<EducationLevelType, number>>;
    withWorkforce?: boolean;
    productionFacilities?: ProductionFacility[];
}

export interface BuildResult {
    gameState: GameState;
    planet: Planet;
    agents: Agent[];
}

// ---------------------------------------------------------------------------
// WorldBuilder
// ---------------------------------------------------------------------------

export class WorldBuilder {
    private _planetOpts: PlanetOptions = {};
    private _agentSpecs: AgentOptions[] = [];
    private _tick = 0;

    /** Configure the planet for this world. */
    withPlanet(opts: PlanetOptions = {}): this {
        this._planetOpts = opts;
        return this;
    }

    /** Add an agent to this world. */
    withAgent(idOrOpts: string | AgentOptions = {}): this {
        const opts = typeof idOrOpts === 'string' ? { id: idOrOpts } : idOrOpts;
        this._agentSpecs.push(opts);
        return this;
    }

    /** Set the starting tick. */
    atTick(tick: number): this {
        this._tick = tick;
        return this;
    }

    /** Build the GameState, Planet, and Agent objects. */
    build(): BuildResult {
        const planetId = this._planetOpts.id ?? 'p';
        const govId = this._planetOpts.governmentId ?? 'gov-1';

        // Build environment with overrides
        const env = defaultEnvironment();
        if (this._planetOpts.pollution) {
            Object.assign(env.pollution, this._planetOpts.pollution);
        }
        if (this._planetOpts.regenerationRates) {
            Object.assign(env.regenerationRates, this._planetOpts.regenerationRates);
        }
        if (this._planetOpts.environment) {
            if (this._planetOpts.environment.naturalDisasters) {
                Object.assign(env.naturalDisasters, this._planetOpts.environment.naturalDisasters);
            }
            if (this._planetOpts.environment.pollution) {
                Object.assign(env.pollution, this._planetOpts.environment.pollution);
            }
            if (this._planetOpts.environment.regenerationRates) {
                Object.assign(env.regenerationRates, this._planetOpts.environment.regenerationRates);
            }
        }

        // Build demography
        const popSize = this._planetOpts.populationSize ?? 0;
        const demography = Array.from({ length: maxAge + 1 }, () => emptyCohort());
        if (popSize > 0) {
            const workingAges = 64 - 18 + 1;
            const perAge = Math.floor(popSize / workingAges);
            let remainder = popSize - perAge * workingAges;
            for (let age = 18; age <= 64; age++) {
                demography[age].none.unoccupied = perAge + (remainder > 0 ? 1 : 0);
                if (remainder > 0) remainder--;
            }
        }

        const planet: Planet = {
            id: planetId,
            name: this._planetOpts.name ?? 'Test Planet',
            position: { x: 0, y: 0, z: 0 },
            population: { demography, starvationLevel: 0 },
            resources: {},
            governmentId: govId,
            bank: { ...defaultBank(), ...this._planetOpts.bank },
            infrastructure: { ...defaultInfrastructure(), ...this._planetOpts.infrastructure },
            environment: env,
        };

        // Always create a government agent
        const govAgent: Agent = {
            id: govId,
            name: govId,
            associatedPlanetId: planetId,
            wealth: 0,
            transportShips: [],
            assets: {
                [planetId]: {
                    resourceClaims: [],
                    resourceTenancies: [],
                    productionFacilities: [],
                    deposits: 0,
                    storageFacility: defaultStorage(planetId),
                    allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
                    workforceDemography: createWorkforceDemography(),
                },
            },
        };

        // Build additional agents
        const agents: Agent[] = [govAgent];
        for (const spec of this._agentSpecs) {
            const id = spec.id ?? `agent-${agents.length}`;
            const pid = spec.planetId ?? planetId;
            const agent: Agent = {
                id,
                name: id,
                associatedPlanetId: pid,
                wealth: spec.wealth ?? 0,
                transportShips: [],
                assets: {
                    [pid]: {
                        resourceClaims: [],
                        resourceTenancies: [],
                        productionFacilities: spec.productionFacilities ?? [],
                        deposits: 0,
                        storageFacility: defaultStorage(pid),
                        allocatedWorkers: {
                            none: 0,
                            primary: 0,
                            secondary: 0,
                            tertiary: 0,
                            quaternary: 0,
                            ...spec.allocatedWorkers,
                        },
                        ...(spec.withWorkforce !== false
                            ? { workforceDemography: createWorkforceDemography() }
                            : {}),
                    },
                },
            };
            agents.push(agent);
        }

        const gameState: GameState = {
            tick: this._tick,
            planets: new Map([[planet.id, planet]]),
            agents: new Map(agents.map((a) => [a.id, a])),
        };

        return { gameState, planet, agents };
    }
}
