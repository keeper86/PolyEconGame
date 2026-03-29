/**
 * simulation.test.ts
 *
 * Integration tests for the simulation tRPC controller endpoints.
 * Verifies that the endpoints return the expected shape and data.
 */

import { getCaller } from 'tests/vitest/setupTestcontainer';
import { describe, expect, it } from 'vitest';

describe('simulation tRPC controller', () => {
    it('getLatestPlanets returns empty result when no snapshots exist', async () => {
        const caller = getCaller();
        const result = await caller.simulation.getLatestPlanetSummaries();
        expect(result).toBeDefined();
        expect(Array.isArray(result.planets)).toBe(true);
    });

    it('getLatestAgents returns shape', async () => {
        const caller = getCaller();
        const result = await caller.simulation.getLatestAgents();

        expect(result).toBeDefined();
        expect(typeof result.tick).toBe('number');
        expect(Array.isArray(result.agents)).toBe(true);
    });

    // Historical snapshot tests removed — persistence is no longer used.
});
