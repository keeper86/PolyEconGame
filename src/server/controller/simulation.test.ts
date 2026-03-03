/**
 * simulation.test.ts
 *
 * Integration tests for the simulation tRPC controller endpoints.
 * Verifies that the endpoints return the expected shape and data.
 */

import { describe, it, expect } from 'vitest';
import { getUnauthenticatedCaller } from 'tests/vitest/setupTestcontainer';

describe('simulation tRPC controller', () => {
    it('getLatestPlanets returns empty result when no snapshots exist', async () => {
        const caller = getUnauthenticatedCaller();
        const result = await caller.simulation.getLatestPlanets();
        expect(result).toBeDefined();
        expect(result.tick).toBe(0);
        expect(Array.isArray(result.planets)).toBe(true);
    });

    it('getLatestAgents returns shape', async () => {
        const caller = getUnauthenticatedCaller();
        const result = await caller.simulation.getLatestAgents();

        expect(result).toBeDefined();
        expect(typeof result.tick).toBe('number');
        expect(Array.isArray(result.agents)).toBe(true);
    });

    // Historical snapshot tests removed — persistence is no longer used.
});
