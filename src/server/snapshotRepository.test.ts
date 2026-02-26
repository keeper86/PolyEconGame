/**
 * snapshotRepository.test.ts
 *
 * Integration tests for the snapshot repository layer.
 * Verifies that planet and agent snapshots can be saved and queried correctly.
 */

import { describe, it, expect } from 'vitest';
import { getDb } from 'tests/vitest/setupTestcontainer';
import {
    savePlanetSnapshots,
    saveAgentSnapshots,
    getLatestPlanetSnapshots,
    getLatestAgentSnapshots,
    getPlanetPopulationHistory,
    getAgentResourceHistory,
} from './snapshotRepository';
import type { Planet, Agent } from '../simulation/planet';
import { earth, earthGovernment } from '../simulation/entities';

const makePlanet = (id: string, populationOverride?: Planet['population']): Planet => ({
    ...earth,
    id,
    name: `Planet ${id}`,
    population: populationOverride ?? earth.population,
});

const makeAgent = (id: string): Agent => ({
    ...earthGovernment,
    id,
    name: `Agent ${id}`,
});

describe('snapshotRepository', () => {
    it('saves and retrieves planet snapshots', async () => {
        const db = getDb();
        const planet = makePlanet('test-planet-1');

        await savePlanetSnapshots(db, 1, [planet]);

        const rows = await getLatestPlanetSnapshots(db);
        const row = rows.find((r) => r.planet_id === 'test-planet-1');

        expect(row).toBeDefined();
        expect(row?.tick).toBe(1);
        expect(row?.population_total).toBeGreaterThan(0);
        expect(row?.snapshot).toBeDefined();
    });

    it('returns only the latest snapshot per planet', async () => {
        const db = getDb();
        const planet = makePlanet('test-planet-multi');

        // Insert snapshots at ticks 10 and 20
        await savePlanetSnapshots(db, 10, [planet]);
        await savePlanetSnapshots(db, 20, [planet]);

        const rows = await getLatestPlanetSnapshots(db);
        const planetRows = rows.filter((r) => r.planet_id === 'test-planet-multi');

        expect(planetRows).toHaveLength(1);
        expect(planetRows[0].tick).toBe(20);
    });

    it('saves and retrieves agent snapshots', async () => {
        const db = getDb();
        const agent = makeAgent('test-agent-1');

        await saveAgentSnapshots(db, 1, [agent]);

        const rows = await getLatestAgentSnapshots(db);
        const row = rows.find((r) => r.agent_id === 'test-agent-1');

        expect(row).toBeDefined();
        expect(row?.tick).toBe(1);
        expect(row?.wealth).toBe(agent.wealth);
        expect(row?.agent_summary).toBeDefined();
    });

    it('returns population history for a planet', async () => {
        const db = getDb();
        const planet = makePlanet('test-planet-history');

        await savePlanetSnapshots(db, 5, [planet]);
        await savePlanetSnapshots(db, 6, [planet]);
        await savePlanetSnapshots(db, 7, [planet]);

        const history = await getPlanetPopulationHistory(db, 'test-planet-history', 10);

        expect(history.length).toBe(3);
        // Results should be ordered newest-first
        expect(history[0].tick).toBe(7);
        expect(history[1].tick).toBe(6);
        expect(history[2].tick).toBe(5);
    });

    it('returns agent resource history', async () => {
        const db = getDb();
        const agent = makeAgent('test-agent-history');

        await saveAgentSnapshots(db, 11, [agent]);
        await saveAgentSnapshots(db, 12, [agent]);

        const history = await getAgentResourceHistory(db, 'test-agent-history', 10);

        expect(history.length).toBe(2);
        expect(history[0].tick).toBe(12);
        expect(history[1].tick).toBe(11);
        expect(history[0].storage).toBeDefined();
        expect(history[0].production).toBeDefined();
        expect(history[0].consumption).toBeDefined();
    });

    it('is idempotent – duplicate inserts are silently ignored', async () => {
        const db = getDb();
        const planet = makePlanet('test-planet-idempotent');

        await savePlanetSnapshots(db, 99, [planet]);
        // Insert the same tick + planet again; should not throw
        await expect(savePlanetSnapshots(db, 99, [planet])).resolves.not.toThrow();

        const history = await getPlanetPopulationHistory(db, 'test-planet-idempotent', 10);
        expect(history.length).toBe(1);
    });
});
