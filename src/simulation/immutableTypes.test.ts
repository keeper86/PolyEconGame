/**
 * immutableTypes.test.ts
 *
 * Unit tests for the Immutable.js Record wrappers defined in immutableTypes.ts.
 */

import { describe, it, expect } from 'vitest';
import { Map } from 'immutable';

import {
    PlanetRecord,
    AgentRecord,
    GameStateRecord,
    toImmutableGameState,
    fromImmutableGameState,
} from './immutableTypes';
import type { Planet, Agent } from './planet';
import type { GameState } from './engine';
import type { ProductionFacility, StorageFacility } from './facilities';

// ---------------------------------------------------------------------------
// Minimal test fixtures
// ---------------------------------------------------------------------------

function makeStorage(): StorageFacility {
    return {
        planetId: 'p',
        id: 's',
        name: 'storage',
        scale: 1,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1e9, mass: 1e9 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {},
    } as StorageFacility;
}

function makeAgent(id: string): Agent {
    return {
        id,
        name: `agent-${id}`,
        associatedPlanetId: 'planet-1',
        wealth: 1000,
        transportShips: [],
        assets: {
            'planet-1': {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [] as ProductionFacility[],
                deposits: 0,
                storageFacility: makeStorage(),
                allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
            },
        },
    };
}

function makePlanet(id = 'planet-1'): Planet {
    const government = makeAgent('gov');
    return {
        id,
        name: `Planet ${id}`,
        position: { x: 0, y: 0, z: 0 },
        population: { demography: [], starvationLevel: 0 },
        resources: {},
        governmentId: government.id,
        bank: { depositRate: 0, loanRate: 0, deposits: 0, loans: 0, equity: 0, householdDeposits: 0 },
        infrastructure: {
            primarySchools: 0,
            secondarySchools: 0,
            universities: 0,
            hospitals: 0,
            mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
            energy: { production: 0 },
        },
        environment: {
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            pollution: { air: 0, water: 0, soil: 0 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        },
    };
}

function makeGameState(): GameState {
    const planet = makePlanet();
    const agent = makeAgent('agent-1');
    return {
        tick: 5,
        planets: Map([[planet.id, planet]]),
        agents: Map([[agent.id, agent]]),
    };
}

// ---------------------------------------------------------------------------
// PlanetRecord
// ---------------------------------------------------------------------------

describe('PlanetRecord', () => {
    it('constructs with expected values', () => {
        const planet = makePlanet();
        const record = new PlanetRecord({ id: planet.id, name: planet.name, data: planet });

        expect(record.id).toBe('planet-1');
        expect(record.name).toBe('Planet planet-1');
        expect(record.data).toBe(planet);
    });

    it('is an Immutable Record (has get / set)', () => {
        const planet = makePlanet();
        const record = new PlanetRecord({ id: planet.id, name: planet.name, data: planet });

        const updated = record.set('name', 'Updated');
        expect(updated.name).toBe('Updated');
        // original is unchanged (immutable)
        expect(record.name).toBe('Planet planet-1');
    });

    it('uses structural sharing on set', () => {
        const planet = makePlanet();
        const record = new PlanetRecord({ id: planet.id, name: planet.name, data: planet });
        const updated = record.set('name', 'New Name');
        // `data` reference is shared
        expect(updated.data).toBe(record.data);
    });
});

// ---------------------------------------------------------------------------
// AgentRecord
// ---------------------------------------------------------------------------

describe('AgentRecord', () => {
    it('constructs with expected values', () => {
        const agent = makeAgent('agent-1');
        const record = new AgentRecord({ id: agent.id, name: agent.name, data: agent });

        expect(record.id).toBe('agent-1');
        expect(record.name).toBe('agent-agent-1');
        expect(record.data).toBe(agent);
    });

    it('produces a new record on set without mutating original', () => {
        const agent = makeAgent('agent-1');
        const record = new AgentRecord({ id: agent.id, name: agent.name, data: agent });
        const updated = record.set('id', 'agent-2');

        expect(updated.id).toBe('agent-2');
        expect(record.id).toBe('agent-1');
    });
});

// ---------------------------------------------------------------------------
// GameStateRecord
// ---------------------------------------------------------------------------

describe('GameStateRecord', () => {
    it('constructs with default empty maps', () => {
        const record = new GameStateRecord();
        expect(record.tick).toBe(0);
        expect(record.planets.size).toBe(0);
        expect(record.agents.size).toBe(0);
    });

    it('constructs with provided planets and agents Maps', () => {
        const planet = makePlanet();
        const agent = makeAgent('agent-1');
        const planetRecord = new PlanetRecord({ id: planet.id, name: planet.name, data: planet });
        const agentRecord = new AgentRecord({ id: agent.id, name: agent.name, data: agent });

        const gs = new GameStateRecord({
            tick: 10,
            planets: Map([[planet.id, planetRecord]]),
            agents: Map([[agent.id, agentRecord]]),
        });

        expect(gs.tick).toBe(10);
        expect(gs.planets.size).toBe(1);
        expect(gs.planets.get(planet.id)?.name).toBe(planet.name);
        expect(gs.agents.size).toBe(1);
        expect(gs.agents.get(agent.id)?.name).toBe(agent.name);
    });

    it('allows O(1) lookup by planet id', () => {
        const p1 = makePlanet('p1');
        const p2 = makePlanet('p2');
        const gs = new GameStateRecord({
            tick: 1,
            planets: Map({
                p1: new PlanetRecord({ id: p1.id, name: p1.name, data: p1 }),
                p2: new PlanetRecord({ id: p2.id, name: p2.name, data: p2 }),
            }),
            agents: Map(),
        });

        expect(gs.planets.get('p1')?.id).toBe('p1');
        expect(gs.planets.get('p2')?.id).toBe('p2');
        expect(gs.planets.get('unknown')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// toImmutableGameState
// ---------------------------------------------------------------------------

describe('toImmutableGameState', () => {
    it('converts a GameState to a GameStateRecord', () => {
        const state = makeGameState();
        const record = toImmutableGameState(state);

        expect(record).toBeInstanceOf(GameStateRecord);
        expect(record.tick).toBe(state.tick);
        expect(record.planets.size).toBe(state.planets.size);
        expect(record.agents.size).toBe(state.agents.size);
    });

    it('indexes planets by their id', () => {
        const state = makeGameState();
        const record = toImmutableGameState(state);

        const planetId = [...state.planets.keys()][0];
        expect(record.planets.has(planetId)).toBe(true);
        expect(record.planets.get(planetId)?.name).toBe(state.planets.get(planetId)!.name);
    });

    it('indexes agents by their id', () => {
        const state = makeGameState();
        const record = toImmutableGameState(state);

        const agentId = [...state.agents.keys()][0];
        expect(record.agents.has(agentId)).toBe(true);
        expect(record.agents.get(agentId)?.name).toBe(state.agents.get(agentId)!.name);
    });

    it('converts multiple planets correctly', () => {
        const p1 = makePlanet('alpha');
        const p2 = makePlanet('beta');
        const state: GameState = {
            tick: 3,
            planets: Map([
                [p1.id, p1],
                [p2.id, p2],
            ]),
            agents: Map(),
        };

        const record = toImmutableGameState(state);
        expect(record.planets.size).toBe(2);
        expect(record.planets.get('alpha')?.id).toBe('alpha');
        expect(record.planets.get('beta')?.id).toBe('beta');
    });
});

// ---------------------------------------------------------------------------
// fromImmutableGameState
// ---------------------------------------------------------------------------

describe('fromImmutableGameState', () => {
    it('round-trips a GameState through toImmutable / fromImmutable', () => {
        const original = makeGameState();
        const record = toImmutableGameState(original);
        const restored = fromImmutableGameState(record);

        expect(restored.tick).toBe(original.tick);
        expect(restored.planets.size).toBe(original.planets.size);
        expect(restored.agents.size).toBe(original.agents.size);

        const origPlanetId = [...original.planets.keys()][0];
        expect(restored.planets.get(origPlanetId)!.id).toBe(original.planets.get(origPlanetId)!.id);

        const origAgentId = [...original.agents.keys()][0];
        expect(restored.agents.get(origAgentId)!.id).toBe(original.agents.get(origAgentId)!.id);
    });

    it('returns planet data objects that are identical to originals', () => {
        const original = makeGameState();
        const record = toImmutableGameState(original);
        const restored = fromImmutableGameState(record);

        const planetId = [...original.planets.keys()][0];
        const agentId = [...original.agents.keys()][0];

        // data references should be the same objects (no copying in conversion)
        expect(restored.planets.get(planetId)).toBe(original.planets.get(planetId));
        expect(restored.agents.get(agentId)).toBe(original.agents.get(agentId));
    });
});
