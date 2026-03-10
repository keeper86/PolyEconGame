/**
 * simulation/snapshotCompression.test.ts
 *
 * Unit tests for the snapshot serialization helpers.
 * Verifies round-trip fidelity: serialize → deserialize → compare.
 *
 * These tests do NOT require a database — they test the pure serialization
 * pipeline using mock GameStateRecords.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { fromImmutableGameState, toImmutableGameState } from './immutableTypes';
import type { ProductionFacility, StorageFacility } from './planet/facilities';
import type { Agent, GameState, Planet } from './planet/planet';
import { deserializeSnapshot, serializeSnapshot } from './snapshotCompression';
import { makeGameState } from './utils/testHelper';

// ---------------------------------------------------------------------------
// Minimal test fixtures (same pattern as immutableTypes.test.ts)
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
        transportShips: [],
        assets: {
            'planet-1': {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [] as ProductionFacility[],
                deposits: 0,
                workforceDemography: [],
                storageFacility: makeStorage(),
                allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
            },
        },
    };
}

function makePlanet(id = 'planet-1'): Planet {
    const government = makeAgent('gov');
    return {
        id,
        name: `Planet ${id}`,
        position: { x: 1, y: 2, z: 3 },
        population: { demography: [] , lastTransferMatrix: [] },
        resources: {},
        governmentId: government.id,
        bank: {
            depositRate: 0,
            loans: 0,
            deposits: 0,
            equity: 0,
            householdDeposits: 0,
            loanRate: 0,
        },
        infrastructure: {
            primarySchools: 10,
            secondarySchools: 5,
            universities: 2,
            hospitals: 3,
            mobility: { roads: 100, railways: 50, airports: 2, seaports: 1, spaceports: 0 },
            energy: { production: 500 },
        },
        environment: {
            naturalDisasters: { earthquakes: 0.1, floods: 0.2, storms: 0.3 },
            pollution: { air: 10, water: 5, soil: 3 },
            regenerationRates: {
                air: { constant: 0.01, percentage: 0.001 },
                water: { constant: 0.02, percentage: 0.002 },
                soil: { constant: 0.03, percentage: 0.003 },
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('snapshotCompression', () => {
    describe('serializeSnapshot / deserializeSnapshot', () => {
        it('round-trips a GameStateRecord through serialization', () => {
            const gs = makeGameState();
            gs.tick = 42; // non-default tick to verify it's preserved
            const record = toImmutableGameState(gs);

            const serialized = serializeSnapshot(record);
            expect(serialized).toBeInstanceOf(Buffer);
            expect(serialized.length).toBeGreaterThan(0);

            const restored = deserializeSnapshot(serialized);
            expect(restored.tick).toBe(42);
            expect(restored.planets.size).toBe(1);
            expect(restored.agents.size).toBe(1);
        });

        it('preserves full game state data through serialization', () => {
            const gs = makeGameState();
            const firstPlanetName = gs.planets.keys().next().value;
            expect(firstPlanetName).toBeDefined();
            const firstAgentName = gs.agents.keys().next().value;
            expect(firstAgentName).toBeDefined();
            const record = toImmutableGameState(gs);

            const serialized = serializeSnapshot(record);
            const restored = deserializeSnapshot(serialized);
            const restoredGs = fromImmutableGameState(restored);

            // Tick
            expect(restoredGs.tick).toBe(gs.tick);

            // Planet
            const origPlanet = gs.planets.get(firstPlanetName!)!;
            expect(origPlanet).toBeDefined();
            const resPlanet = restoredGs.planets.get(firstPlanetName!)!;
            expect(resPlanet.id).toBe(origPlanet.id);
            expect(resPlanet.name).toBe(origPlanet.name);
            expect(resPlanet.position).toEqual(origPlanet.position);
            expect(resPlanet.infrastructure.primarySchools).toBe(origPlanet.infrastructure.primarySchools);
            expect(resPlanet.environment.pollution.air).toBe(origPlanet.environment.pollution.air);

            // Agent
            const origAgent = gs.agents.get(firstAgentName!)!;
            const resAgent = restoredGs.agents.get(firstAgentName!)!;
            expect(resAgent.id).toBe(origAgent.id);
            expect(resAgent.name).toBe(origAgent.name);
        });

        it('produces serialized output smaller than raw JSON', () => {
            const gs = makeGameState();
            const record = toImmutableGameState(gs);

            // Build a JSON-safe representation for size comparison
            const jsonObj = {
                tick: gs.tick,
                planets: [...gs.planets.values()],
                agents: [...gs.agents.values()],
            };
            const jsonSize = Buffer.byteLength(JSON.stringify(jsonObj));
            const serialized = serializeSnapshot(record);

            // MessagePack is typically smaller than JSON
            expect(serialized.length).toBeLessThan(jsonSize);
            expect(serialized.length).toBeGreaterThan(0);
        });
    });

    describe('multi-planet / multi-agent', () => {
        it('handles multiple planets and agents', () => {
            const planetIds = ['p1', 'p2', 'p3'].sort();
            const agentIds = ['a1', 'a2'].sort();
            const gs: GameState = {
                tick: 100,
                planets: new Map(planetIds.map((id) => [id, makePlanet(id)])),
                agents: new Map(agentIds.map((id) => [id, makeAgent(id)])),
            };
            const record = toImmutableGameState(gs);

            const serialized = serializeSnapshot(record);
            const restored = deserializeSnapshot(serialized);
            const restoredGs = fromImmutableGameState(restored);

            expect(restoredGs.tick).toBe(100);
            expect(restoredGs.planets.size).toBe(3);
            expect(restoredGs.agents.size).toBe(2);
            expect([...restoredGs.planets.values()].map((p) => p.id).sort()).toEqual(planetIds);
            expect([...restoredGs.agents.values()].map((a) => a.id).sort()).toEqual(agentIds);
        });
    });
});
