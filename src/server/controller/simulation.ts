/**
 * controller/simulation.ts
 *
 * Granular tRPC endpoints for querying the live simulation state from the
 * worker thread.  Current-state queries use the typed worker query protocol
 * (`workerQueries`).  Historical time-series queries (planet population
 * history, agent resource history) still read from PostgreSQL because they
 * require data spanning many ticks.
 */

import { groceryServiceResourceType } from '@/simulation/planet/services';
import { z } from 'zod';
import { getPlanetPopulationHistory as dbGetPlanetPopulationHistory } from '../../simulation/gameSnapshotRepository';
import type { Agent } from '../../simulation/planet/planet';
import {
    computeAgentConsumption,
    computeAgentProduction,
    computeAgentStorage,
    computePopulationTotal,
    summariseAgentBlob,
    summarisePlanetAssets,
    type AgentPlanetSummary,
} from '../../simulation/snapshotRepository';
import { workerQueries } from '../../simulation/workerClient/queries';
import { db } from '../db';
import { protectedProcedure } from '../trpcRoot';

const loanConditionsSchema = z.object({
    maxLoanAmount: z.number(),
    annualInterestRate: z.number(),
    existingDiscretionaryLoans: z.number(),
    monthlyWageBill: z.number(),
    monthlyRevenue: z.number(),
    monthlyNetCashFlow: z.number(),
    isNewAgent: z.boolean(),
});

export const getCurrentTick = () =>
    protectedProcedure
        .input(z.void())
        .output(z.object({ tick: z.number() }))
        .query(async () => {
            const { tick } = await workerQueries.getCurrentTick();
            return { tick };
        });

const planetSummarySchema = z.object({
    planetId: z.string(),
    name: z.string(),
    populationTotal: z.number(),
    bank: z.object({
        equity: z.number(),
        deposits: z.number(),
    }),
    foodPrice: z.number(),
});

export type PlanetSummary = z.infer<typeof planetSummarySchema>;

/** Latest snapshot for every planet (one row per planet). */
export const getLatestPlanetSummaries = () =>
    protectedProcedure
        .input(z.void())
        .output(
            z.object({
                tick: z.number(),
                planets: z.array(planetSummarySchema),
            }),
        )
        .query(async () => {
            const { tick, planets } = await workerQueries.getAllPlanets();

            return {
                tick,
                planets: planets.map((p) => ({
                    planetId: p.id,
                    populationTotal: computePopulationTotal(p),
                    bank: {
                        equity: p.bank.equity,
                        deposits: p.bank.deposits,
                    },
                    foodPrice: p.marketPrices[groceryServiceResourceType.name] ?? 1,
                    name: p.name,
                })),
            };
        });

/** Latest snapshot for every agent (one row per agent). */
export const getLatestAgents = () =>
    protectedProcedure
        .input(z.void())
        .output(
            z.object({
                tick: z.number(),
                agents: z.array(
                    z.object({
                        agentId: z.string(),
                        balance: z.number(),
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
                    balance: a.assets
                        ? Object.values(a.assets).reduce((sum, pa) => sum + (pa.deposits ?? 0) - (pa.loans ?? 0), 0)
                        : 0,
                    storage: computeAgentStorage(a),
                    production: computeAgentProduction(a),
                    consumption: computeAgentConsumption(a),
                    agentSummary: a,
                })),
            };
        });

/**
 * Lightweight summaries for the agent list page.
 * Returns only the data needed for AgentSummaryCard — no full Agent blob.
 */
export const getAgentListSummaries = () =>
    protectedProcedure
        .input(z.void())
        .output(
            z.object({
                tick: z.number(),
                agents: z.array(
                    z.object({
                        agentId: z.string(),
                        name: z.string(),
                        associatedPlanetId: z.string(),
                        balance: z.number(),
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
                agents: agents.map((a: Agent) => summariseAgentBlob(a.id, a)),
            };
        });

/**
 * Full agent detail for a single agent (by ID).
 * Used on the /agents/[agentId] detail page.
 */
export const getAgentDetail = () =>
    protectedProcedure
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
                        name: z.string(),
                        balance: z.number(),
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
                    name: agent.name,
                    balance: agent.assets
                        ? Object.values(agent.assets).reduce((sum, pa) => sum + (pa.deposits ?? 0) - (pa.loans ?? 0), 0)
                        : 0,
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
    protectedProcedure
        .input(z.object({ agentId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                overview: z
                    .object({
                        agentId: z.string(),
                        name: z.string(),
                        associatedPlanetId: z.string(),
                        balance: z.number(),
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
                    balance: agent.assets
                        ? Object.values(agent.assets).reduce((sum, pa) => sum + (pa.deposits ?? 0) - (pa.loans ?? 0), 0)
                        : 0,
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
    protectedProcedure
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
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);
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
    protectedProcedure
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
                    automateWorkerAllocation: agent.automateWorkerAllocation ?? false,
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
    protectedProcedure
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

/**
 * Return the credit conditions the planet bank would offer the requesting
 * agent right now.  Read-only — does not modify any state.
 */
export const getLoanConditions = () =>
    protectedProcedure
        .input(z.object({ agentId: z.string(), planetId: z.string() }))
        .output(z.object({ conditions: loanConditionsSchema.nullable() }))
        .query(async ({ input }) => {
            const { conditions } = await workerQueries.getLoanConditions(input.agentId, input.planetId);
            return { conditions: conditions ?? null };
        });
