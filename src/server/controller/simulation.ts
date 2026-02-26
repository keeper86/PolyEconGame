/**
 * controller/simulation.ts
 *
 * Granular tRPC endpoints for querying simulation snapshots from the database.
 * Each endpoint returns only the data needed for a specific UI component,
 * replacing the previous pattern of delivering the entire GameState every tick
 * via SSE.
 */

import { z } from 'zod';
import { procedure } from '../trpcRoot';
import { db } from '../db';
import {
    getLatestPlanetSnapshots,
    getLatestAgentSnapshots,
    getPlanetPopulationHistory,
    getAgentResourceHistory,
    reconstructPlanetFromRow,
} from '../snapshotRepository';

/** Latest snapshot for every planet (one row per planet). */
export const getLatestPlanets = () =>
    procedure
        .input(z.void())
        .output(
            z.object({
                tick: z.number(),
                planets: z.array(
                    z.object({
                        planetId: z.string(),
                        populationTotal: z.number(),
                        // Reconstructed Planet-like object from resolved DB columns.
                        // z.any() is used because the Planet type has complex nested
                        // structures that would require a very verbose Zod schema.
                        snapshot: z.any(),
                    }),
                ),
            }),
        )
        .query(async () => {
            const rows = await getLatestPlanetSnapshots(db);
            const tick = rows.length > 0 ? Math.max(...rows.map((r) => r.tick)) : 0;
            return {
                tick,
                planets: rows.map((r) => ({
                    planetId: r.planet_id,
                    populationTotal: Number(r.population_total),
                    snapshot: reconstructPlanetFromRow(r),
                })),
            };
        });

/** Latest snapshot for every agent (one row per agent). */
export const getLatestAgents = () =>
    procedure
        .input(z.void())
        .output(
            z.object({
                tick: z.number(),
                agents: z.array(
                    z.object({
                        agentId: z.string(),
                        wealth: z.number(),
                        storage: z.record(z.string(), z.number()),
                        production: z.record(z.string(), z.number()),
                        consumption: z.record(z.string(), z.number()),
                        // z.any() is used here because agentSummary is the full Agent
                        // object stored as JSONB. The Agent type has complex nested
                        // structures (facilities, storageFacility) that would require a
                        // very verbose Zod schema to replicate exactly.
                        agentSummary: z.any(),
                    }),
                ),
            }),
        )
        .query(async () => {
            const rows = await getLatestAgentSnapshots(db);
            const tick = rows.length > 0 ? Math.max(...rows.map((r) => r.tick)) : 0;
            return {
                tick,
                agents: rows.map((r) => ({
                    agentId: r.agent_id,
                    wealth: Number(r.wealth),
                    storage: (r.storage as Record<string, number>) ?? {},
                    production: (r.production as Record<string, number>) ?? {},
                    consumption: (r.consumption as Record<string, number>) ?? {},
                    agentSummary: r.agent_summary,
                })),
            };
        });

/** Population time-series for a single planet (newest-first). */
export const getPlanetHistory = () =>
    procedure
        .input(
            z.object({
                planetId: z.string(),
                limit: z.number().int().positive().max(2000).optional().default(200),
            }),
        )
        .output(
            z.object({
                history: z.array(
                    z.object({
                        tick: z.number(),
                        populationTotal: z.number(),
                    }),
                ),
            }),
        )
        .query(async ({ input }) => {
            const rows = await getPlanetPopulationHistory(db, input.planetId, input.limit);
            return {
                history: rows.map((r) => ({
                    tick: r.tick,
                    populationTotal: Number(r.population_total),
                })),
            };
        });

/** Resource history (storage / production / consumption) for a single agent (newest-first). */
export const getAgentHistory = () =>
    procedure
        .input(
            z.object({
                agentId: z.string(),
                limit: z.number().int().positive().max(200).optional().default(100),
            }),
        )
        .output(
            z.object({
                history: z.array(
                    z.object({
                        tick: z.number(),
                        storage: z.record(z.string(), z.number()),
                        production: z.record(z.string(), z.number()),
                        consumption: z.record(z.string(), z.number()),
                    }),
                ),
            }),
        )
        .query(async ({ input }) => {
            const rows = await getAgentResourceHistory(db, input.agentId, input.limit);
            return {
                history: rows.map((r) => ({
                    tick: r.tick,
                    storage: (r.storage as Record<string, number>) ?? {},
                    production: (r.production as Record<string, number>) ?? {},
                    consumption: (r.consumption as Record<string, number>) ?? {},
                })),
            };
        });
