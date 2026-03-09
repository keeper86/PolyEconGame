/**
 * simulation/queries.test.ts
 *
 * Unit tests for the worker query protocol types and handler logic.
 * Tests verify that the query handler (extracted from worker.ts logic)
 * correctly reads from an immutable snapshot and returns the expected data.
 */

import { describe, it, expect } from 'vitest';

import { toImmutableGameState, type GameStateRecord } from './immutableTypes';
import type { Planet, Agent, GameState } from './planet/planet';
import type { ProductionFacility, StorageFacility } from './planet/facilities';
import type { WorkerQuery, WorkerQueryMessage, WorkerQueryResult } from './queries';

// ---------------------------------------------------------------------------
// Test fixtures (same pattern as immutableTypes.test.ts)
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

function makeAgent(id: string, planetId = 'planet-1'): Agent {
    return {
        id,
        name: `agent-${id}`,
        associatedPlanetId: planetId,
        wealth: 1000,
        transportShips: [],
        assets: {
            [planetId]: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [] as ProductionFacility[],
                storageFacility: makeStorage(),
                allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
            },
        },
    };
}

function makePlanet(id = 'planet-1'): Planet {
    const government = makeAgent('gov', id);
    return {
        id,
        name: `Planet ${id}`,
        position: { x: 0, y: 0, z: 0 },
        population: { demography: [], starvationLevel: 0 },
        resources: {},
        government,
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
    const planet = makePlanet('earth');
    const agent1 = makeAgent('agent-1', 'earth');
    const agent2 = makeAgent('agent-2', 'earth');
    return {
        tick: 42,
        planets: new Map([[planet.id, planet]]),
        agents: new Map([
            [agent1.id, agent1],
            [agent2.id, agent2],
        ]),
    };
}

// ---------------------------------------------------------------------------
// Extracted query handler (mirrors the logic in worker.ts handleQuery)
// ---------------------------------------------------------------------------

/**
 * Pure query handler that takes a snapshot and a query, returns the result.
 * This mirrors the switch in worker.ts but is isolated for unit testing
 * without needing to spawn a real worker.
 */
function handleQueryPure(snap: GameStateRecord, query: WorkerQuery): WorkerQueryResult[WorkerQuery['type']] {
    switch (query.type) {
        case 'getCurrentTick': {
            return { tick: snap.tick };
        }
        case 'getFullState': {
            const planets = snap.planets
                .valueSeq()
                .map((pr) => pr.data)
                .toArray();
            const agents = snap.agents
                .valueSeq()
                .map((ar) => ar.data)
                .toArray();
            return { tick: snap.tick, planets, agents };
        }
        case 'getPlanet': {
            const pr = snap.planets.get(query.planetId);
            return { planet: pr ? pr.data : null };
        }
        case 'getAllPlanets': {
            const planets = snap.planets
                .valueSeq()
                .map((pr) => pr.data)
                .toArray();
            return { tick: snap.tick, planets };
        }
        case 'getAgent': {
            const ar = snap.agents.get(query.agentId);
            return { agent: ar ? ar.data : null };
        }
        case 'getAllAgents': {
            const agents = snap.agents
                .valueSeq()
                .map((ar) => ar.data)
                .toArray();
            return { tick: snap.tick, agents };
        }
        case 'getAgentsByPlanet': {
            const agents = snap.agents
                .valueSeq()
                .filter((ar) => ar.data.associatedPlanetId === query.planetId)
                .map((ar) => ar.data)
                .toArray();
            return { agents };
        }
        default: {
            const _exhaustive: never = query;
            throw new Error(`Unknown query type: ${(_exhaustive as { type: string }).type}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Query protocol types', () => {
    it('WorkerQueryMessage includes requestId', () => {
        const msg: WorkerQueryMessage = {
            type: 'getCurrentTick',
            requestId: 'req-1',
        };
        expect(msg.requestId).toBe('req-1');
        expect(msg.type).toBe('getCurrentTick');
    });

    it('WorkerQueryMessage with parameters', () => {
        const msg: WorkerQueryMessage = {
            type: 'getPlanet',
            planetId: 'earth',
            requestId: 'req-2',
        };
        expect(msg.planetId).toBe('earth');
    });
});

describe('Query handler: getCurrentTick', () => {
    it('returns the tick from the snapshot', () => {
        const snap = toImmutableGameState(makeGameState());
        const result = handleQueryPure(snap, { type: 'getCurrentTick' });
        expect(result).toEqual({ tick: 42 });
    });
});

describe('Query handler: getFullState', () => {
    it('returns all planets and agents', () => {
        const gs = makeGameState();
        const snap = toImmutableGameState(gs);
        const result = handleQueryPure(snap, { type: 'getFullState' }) as WorkerQueryResult['getFullState'];

        expect(result.tick).toBe(42);
        expect(result.planets).toHaveLength(1);
        expect(result.agents).toHaveLength(2);
        expect(result.planets[0].id).toBe('earth');
    });
});

describe('Query handler: getPlanet', () => {
    it('returns the planet when it exists', () => {
        const snap = toImmutableGameState(makeGameState());
        const result = handleQueryPure(snap, {
            type: 'getPlanet',
            planetId: 'earth',
        }) as WorkerQueryResult['getPlanet'];
        expect(result.planet).not.toBeNull();
        expect(result.planet!.id).toBe('earth');
    });

    it('returns null when planet does not exist', () => {
        const snap = toImmutableGameState(makeGameState());
        const result = handleQueryPure(snap, { type: 'getPlanet', planetId: 'mars' }) as WorkerQueryResult['getPlanet'];
        expect(result.planet).toBeNull();
    });
});

describe('Query handler: getAllPlanets', () => {
    it('returns all planets with tick', () => {
        const snap = toImmutableGameState(makeGameState());
        const result = handleQueryPure(snap, { type: 'getAllPlanets' }) as WorkerQueryResult['getAllPlanets'];
        expect(result.tick).toBe(42);
        expect(result.planets).toHaveLength(1);
    });
});

describe('Query handler: getAgent', () => {
    it('returns the agent when it exists', () => {
        const snap = toImmutableGameState(makeGameState());
        const result = handleQueryPure(snap, { type: 'getAgent', agentId: 'agent-1' }) as WorkerQueryResult['getAgent'];
        expect(result.agent).not.toBeNull();
        expect(result.agent!.id).toBe('agent-1');
    });

    it('returns null when agent does not exist', () => {
        const snap = toImmutableGameState(makeGameState());
        const result = handleQueryPure(snap, {
            type: 'getAgent',
            agentId: 'nonexistent',
        }) as WorkerQueryResult['getAgent'];
        expect(result.agent).toBeNull();
    });
});

describe('Query handler: getAllAgents', () => {
    it('returns all agents with tick', () => {
        const snap = toImmutableGameState(makeGameState());
        const result = handleQueryPure(snap, { type: 'getAllAgents' }) as WorkerQueryResult['getAllAgents'];
        expect(result.tick).toBe(42);
        expect(result.agents).toHaveLength(2);
    });
});

describe('Query handler: getAgentsByPlanet', () => {
    it('returns agents for the specified planet', () => {
        const snap = toImmutableGameState(makeGameState());
        const result = handleQueryPure(snap, {
            type: 'getAgentsByPlanet',
            planetId: 'earth',
        }) as WorkerQueryResult['getAgentsByPlanet'];
        expect(result.agents).toHaveLength(2);
    });

    it('returns empty array for a planet with no agents', () => {
        const snap = toImmutableGameState(makeGameState());
        const result = handleQueryPure(snap, {
            type: 'getAgentsByPlanet',
            planetId: 'mars',
        }) as WorkerQueryResult['getAgentsByPlanet'];
        expect(result.agents).toHaveLength(0);
    });
});

describe('Query handler: snapshot consistency', () => {
    it('returns data objects that reference the original snapshot data', () => {
        const gs = makeGameState();
        const snap = toImmutableGameState(gs);

        // The returned planet should be the exact same object reference
        const planetResult = handleQueryPure(snap, {
            type: 'getPlanet',
            planetId: 'earth',
        }) as WorkerQueryResult['getPlanet'];
        expect(planetResult.planet).toBe(gs.planets.get('earth'));

        // Same for agents
        const agentResult = handleQueryPure(snap, {
            type: 'getAgent',
            agentId: 'agent-1',
        }) as WorkerQueryResult['getAgent'];
        expect(agentResult.agent).toBe(gs.agents.get('agent-1'));
    });

    it('snapshot is isolated from subsequent mutations to the mutable state', () => {
        const gs = makeGameState();
        const snap = toImmutableGameState(gs);

        // Mutate the mutable state
        gs.tick = 999;
        gs.planets.set('mars', makePlanet('mars'));

        // Snapshot should be unchanged
        const result = handleQueryPure(snap, { type: 'getCurrentTick' });
        expect(result).toEqual({ tick: 42 });

        const planetsResult = handleQueryPure(snap, { type: 'getAllPlanets' }) as WorkerQueryResult['getAllPlanets'];
        expect(planetsResult.planets).toHaveLength(1);
    });
});

describe('Query handler: multi-planet state', () => {
    it('handles multiple planets correctly', () => {
        const earth = makePlanet('earth');
        const mars = makePlanet('mars');
        const a1 = makeAgent('a1', 'earth');
        const a2 = makeAgent('a2', 'mars');
        const gs: GameState = {
            tick: 10,
            planets: new Map([
                [earth.id, earth],
                [mars.id, mars],
            ]),
            agents: new Map([
                [a1.id, a1],
                [a2.id, a2],
            ]),
        };
        const snap = toImmutableGameState(gs);

        const allPlanets = handleQueryPure(snap, { type: 'getAllPlanets' }) as WorkerQueryResult['getAllPlanets'];
        expect(allPlanets.planets).toHaveLength(2);

        const earthAgents = handleQueryPure(snap, {
            type: 'getAgentsByPlanet',
            planetId: 'earth',
        }) as WorkerQueryResult['getAgentsByPlanet'];
        expect(earthAgents.agents).toHaveLength(1);
        expect(earthAgents.agents[0].id).toBe('a1');

        const marsAgents = handleQueryPure(snap, {
            type: 'getAgentsByPlanet',
            planetId: 'mars',
        }) as WorkerQueryResult['getAgentsByPlanet'];
        expect(marsAgents.agents).toHaveLength(1);
        expect(marsAgents.agents[0].id).toBe('a2');
    });
});
