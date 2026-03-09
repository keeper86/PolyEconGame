/**
 * controller/simulation.ts
 *
 * Granular tRPC endpoints for querying the live simulation state from the
 * worker thread.  Current-state queries use the typed worker query protocol
 * (`workerQueries`).  Historical time-series queries (planet population
 * history, agent resource history) still read from PostgreSQL because they
 * require data spanning many ticks.
 */

import { z } from 'zod';
import { procedure } from '../trpcRoot';
import {
    computePopulationTotal,
    computeAgentStorage,
    computeAgentProduction,
    computeAgentConsumption,
    summariseAgentBlob,
    summarisePlanetAssets,
    type AgentPlanetSummary,
} from '../snapshotRepository';
import { getPlanetPopulationHistory as dbGetPlanetPopulationHistory } from '../gameSnapshotRepository';
import { db } from '../db';
import { workerQueries } from '../../lib/workerQueries';
import type { Agent } from '../../simulation/planet/planet';

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
                        snapshot: z.any(),
                    }),
                ),
            }),
        )
        .query(async () => {
            const { tick, planets } = await workerQueries.getAllPlanets();
            if (process.env.SIM_DEBUG === '1') {
                try {
                    // Log bank slices for each planet so we can trace server-side values
                    // before tRPC serialization.
                    console.debug(
                        '[controller] getLatestPlanets banks:',
                        planets.map((p) => ({ id: p.id, bank: p.bank })),
                    );
                } catch (_e) {
                    // ignore logging issues
                }
            }
            return {
                tick,
                planets: planets.map((p) => ({
                    planetId: p.id,
                    populationTotal: computePopulationTotal(p),
                    snapshot: p,
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
                        agentSummary: z.any(),
                    }),
                ),
            }),
        )
        .query(async () => {
            const { tick, agents } = await workerQueries.getAllAgents();
            return {
                tick,
                agents: agents.map((a) => ({
                    agentId: a.id,
                    wealth: a.wealth,
                    storage: computeAgentStorage(a),
                    production: computeAgentProduction(a),
                    consumption: computeAgentConsumption(a),
                    agentSummary: a,
                })),
            };
        });

/**
 * Population time-series for a single planet (newest-first).
 * NOTE: Still reads from the database because it requires historical data
 * spanning many ticks.  Will be replaced once lightweight statistics
 * persistence is implemented.
 */
// Historical planet population API removed — snapshot persistence no longer used.

/**
 * Resource history (storage / production / consumption) for a single agent (newest-first).
 * NOTE: Still reads from the database because it requires historical data
 * spanning many ticks.  Will be replaced once lightweight statistics
 * persistence is implemented.
 */
// Historical agent resource API removed — snapshot persistence no longer used.

/**
 * Lightweight summaries for the agent list page.
 * Returns only the data needed for AgentSummaryCard — no full Agent blob.
 */
export const getAgentListSummaries = () =>
    procedure
        .input(z.void())
        .output(
            z.object({
                tick: z.number(),
                agents: z.array(
                    z.object({
                        agentId: z.string(),
                        name: z.string(),
                        associatedPlanetId: z.string(),
                        wealth: z.number(),
                        facilityCount: z.number(),
                        avgEfficiency: z.number().nullable(),
                        totalWorkers: z.number(),
                        unusedWorkerFraction: z.number(),
                        topResources: z.array(z.object({ name: z.string(), quantity: z.number() })),
                        shipCount: z.number(),
                    }),
                ),
            }),
        )
        .query(async () => {
            const { tick, agents } = await workerQueries.getAllAgents();
            return {
                tick,
                agents: agents.map((a: Agent) => summariseAgentBlob(a.id, a.wealth, a)),
            };
        });

/**
 * Full agent detail for a single agent (by ID).
 * Used on the /agents/[agentId] detail page.
 */
export const getAgentDetail = () =>
    procedure
        .input(
            z.object({
                agentId: z.string(),
            }),
        )
        .output(
            z.object({
                tick: z.number(),
                agent: z
                    .object({
                        agentId: z.string(),
                        wealth: z.number(),
                        storage: z.record(z.string(), z.number()),
                        production: z.record(z.string(), z.number()),
                        consumption: z.record(z.string(), z.number()),
                        agentSummary: z.any(),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { agent }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getAgent(input.agentId),
            ]);
            if (!agent) {
                return { tick, agent: null };
            }
            return {
                tick,
                agent: {
                    agentId: agent.id,
                    wealth: agent.wealth,
                    storage: computeAgentStorage(agent),
                    production: computeAgentProduction(agent),
                    consumption: computeAgentConsumption(agent),
                    agentSummary: agent,
                },
            };
        });

/**
 * Agent overview: top-level stats + per-planet summaries.
 * Used on the /agents/[agentId] page to show planet cards.
 */
export const getAgentOverview = () =>
    procedure
        .input(z.object({ agentId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                overview: z
                    .object({
                        agentId: z.string(),
                        name: z.string(),
                        associatedPlanetId: z.string(),
                        wealth: z.number(),
                        shipCount: z.number(),
                        planets: z.array(
                            z.object({
                                planetId: z.string(),
                                deposits: z.number(),
                                facilityCount: z.number(),
                                avgEfficiency: z.number().nullable(),
                                totalWorkers: z.number(),
                                unusedWorkerFraction: z.number(),
                                topResources: z.array(z.object({ name: z.string(), quantity: z.number() })),
                            }),
                        ),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { agent }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getAgent(input.agentId),
            ]);
            if (!agent) {
                return { tick, overview: null };
            }

            const planets: AgentPlanetSummary[] = Object.entries(agent.assets ?? {}).map(([planetId, assets]) =>
                summarisePlanetAssets(planetId, assets),
            );

            return {
                tick,
                overview: {
                    agentId: agent.id,
                    name: agent.name,
                    associatedPlanetId: agent.associatedPlanetId ?? '',
                    wealth: agent.wealth,
                    shipCount: agent.transportShips?.length ?? 0,
                    planets,
                },
            };
        });

/**
 * Full planet detail for a single planet (by ID).
 * Used on the /planets/[planetId] detail page.
 * Returns the full planet snapshot plus pre-computed aggregates for
 * wealth distribution, food buffers, and demographics.
 */
export const getPlanetDetail = () =>
    procedure
        .input(
            z.object({
                planetId: z.string(),
            }),
        )
        .output(
            z.object({
                tick: z.number(),
                planet: z.any(),
                populationTotal: z.number(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planets }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getAllPlanets(),
            ]);
            const planet = planets.find((p) => p.id === input.planetId) ?? null;
            if (!planet) {
                return { tick, planet: null, populationTotal: 0 };
            }
            return {
                tick,
                planet,
                populationTotal: computePopulationTotal(planet),
            };
        });

/**
 * Full per-planet assets for one agent on one planet.
 * Used on the /agents/[agentId]/[planetId] detail page.
 */
export const getAgentPlanetDetail = () =>
    procedure
        .input(z.object({ agentId: z.string(), planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                detail: z.any(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { agent }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getAgent(input.agentId),
            ]);
            if (!agent) {
                return { tick, detail: null };
            }

            const assets = agent.assets?.[input.planetId];
            if (!assets) {
                return { tick, detail: null };
            }

            return {
                tick,
                detail: {
                    agentId: agent.id,
                    agentName: agent.name,
                    planetId: input.planetId,
                    assets,
                },
            };
        });

/**
 * Population history time-series for a single planet.
 * Reads from the planet_population_history table written alongside each
 * cold snapshot (every SNAPSHOT_INTERVAL_TICKS ticks).
 * Returns rows ordered tick ascending, ready for direct chart consumption.
 */
export const getPlanetPopulationHistory = () =>
    procedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                planetId: z.string(),
                history: z.array(
                    z.object({
                        tick: z.number(),
                        population: z.number(),
                        starvationLevel: z.number(),
                        foodPrice: z.number(),
                    }),
                ),
            }),
        )
        .query(async ({ input }) => {
            const rows = await dbGetPlanetPopulationHistory(db, input.planetId);
            return {
                planetId: input.planetId,
                history: rows.map((r) => ({
                    tick: Number(r.tick),
                    population: Number(r.population),
                    starvationLevel: r.starvation_level ?? 0,
                    foodPrice: r.food_price ?? 0,
                })),
            };
        });
