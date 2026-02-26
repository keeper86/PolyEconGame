/**
 * simulation.test.ts
 *
 * Integration tests for the simulation tRPC controller endpoints.
 * Verifies that the endpoints return the expected shape and data.
 */

import { describe, it, expect } from 'vitest';
import { getDb, getUnauthenticatedCaller } from 'tests/vitest/setupTestcontainer';
import { savePlanetSnapshots, saveAgentSnapshots } from '../snapshotRepository';
import { earth, earthGovernment } from '../../simulation/entities';

describe('simulation tRPC controller', () => {
    it('getLatestPlanets returns empty result when no snapshots exist', async () => {
        const caller = getUnauthenticatedCaller();
        const result = await caller.simulation.getLatestPlanets();
        expect(result).toBeDefined();
        expect(result.tick).toBe(0);
        expect(Array.isArray(result.planets)).toBe(true);
    });

    it('getLatestPlanets returns snapshot data', async () => {
        const db = getDb();
        await savePlanetSnapshots(db, 50, [earth]);

        const caller = getUnauthenticatedCaller();
        const result = await caller.simulation.getLatestPlanets();

        const earthEntry = result.planets.find((p) => p.planetId === 'earth');
        expect(earthEntry).toBeDefined();
        expect(result.tick).toBe(50);
        expect(earthEntry?.populationTotal).toBeGreaterThan(0);
        expect(earthEntry?.snapshot).toBeDefined();
    });

    it('getLatestAgents returns snapshot data', async () => {
        const db = getDb();
        await saveAgentSnapshots(db, 50, [earthGovernment]);

        const caller = getUnauthenticatedCaller();
        const result = await caller.simulation.getLatestAgents();

        const agentEntry = result.agents.find((a) => a.agentId === 'earth-government');
        expect(agentEntry).toBeDefined();
        expect(agentEntry?.wealth).toBe(earthGovernment.wealth);
        expect(agentEntry?.storage).toBeDefined();
        expect(agentEntry?.production).toBeDefined();
        expect(agentEntry?.consumption).toBeDefined();
        expect(agentEntry?.agentSummary).toBeDefined();
    });

    it('getPlanetHistory returns population time series', async () => {
        const db = getDb();
        await savePlanetSnapshots(db, 100, [earth]);
        await savePlanetSnapshots(db, 101, [earth]);

        const caller = getUnauthenticatedCaller();
        const result = await caller.simulation.getPlanetHistory({ planetId: 'earth' });

        expect(result.history.length).toBeGreaterThanOrEqual(2);
        // Should be ordered newest-first
        const ticks = result.history.map((h) => h.tick);
        expect(ticks[0]).toBeGreaterThanOrEqual(ticks[1]);
        expect(result.history[0].populationTotal).toBeGreaterThan(0);
    });

    it('getAgentHistory returns resource time series', async () => {
        const db = getDb();
        await saveAgentSnapshots(db, 100, [earthGovernment]);
        await saveAgentSnapshots(db, 101, [earthGovernment]);

        const caller = getUnauthenticatedCaller();
        const result = await caller.simulation.getAgentHistory({ agentId: 'earth-government' });

        expect(result.history.length).toBeGreaterThanOrEqual(2);
        const ticks = result.history.map((h) => h.tick);
        expect(ticks[0]).toBeGreaterThanOrEqual(ticks[1]);
        expect(result.history[0].storage).toBeDefined();
        expect(result.history[0].production).toBeDefined();
        expect(result.history[0].consumption).toBeDefined();
    });

    it('getPlanetHistory respects the limit parameter', async () => {
        const db = getDb();
        // Insert many ticks to test limit
        for (let tick = 200; tick < 220; tick++) {
            await savePlanetSnapshots(db, tick, [{ ...earth, id: 'earth-limit-test' }]);
        }

        const caller = getUnauthenticatedCaller();
        const result = await caller.simulation.getPlanetHistory({ planetId: 'earth-limit-test', limit: 5 });

        expect(result.history.length).toBeLessThanOrEqual(5);
    });
});
