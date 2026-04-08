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
import {
    getPlanetPopulationHistoryAggregated as dbGetPlanetPopulationHistory,
    getProductPriceHistory as dbGetProductPriceHistory,
} from '../../simulation/gameSnapshotRepository';
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
    existingLoans: z.number(),
    blendedMonthlyWages: z.number(),
    blendedMonthlyRevenue: z.number(),
    monthlyNetCashFlow: z.number(),
    storageCollateral: z.number(),
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
 * Queries the appropriate continuous aggregate view (monthly / yearly / decade).
 * Returns buckets ordered ascending, ready for chart consumption.
 */
export const getPlanetPopulationHistory = () =>
    protectedProcedure
        .input(
            z.object({
                planetId: z.string(),
                granularity: z.enum(['monthly', 'yearly', 'decade']).default('monthly'),
                limit: z.number().int().min(1).max(1000).default(100),
            }),
        )
        .output(
            z.object({
                planetId: z.string(),
                granularity: z.enum(['monthly', 'yearly', 'decade']),
                history: z.array(
                    z.object({
                        bucket: z.number(),
                        avgPopulation: z.number(),
                    }),
                ),
            }),
        )
        .query(async ({ input }) => {
            const rows = await dbGetPlanetPopulationHistory(db, input.planetId, input.granularity, input.limit);
            return {
                planetId: input.planetId,
                granularity: input.granularity,
                history: rows
                    .map((r) => ({
                        bucket: Number(r.bucket),
                        avgPopulation: r.avg_population ?? 0,
                    }))
                    .sort((a, b) => a.bucket - b.bucket),
            };
        });

/**
 * Product price history time-series for a single product on a single planet.
 * Queries the appropriate continuous aggregate view (monthly / yearly / decade)
 * and returns buckets ordered ascending, ready for chart consumption.
 */
export const getProductPriceHistory = () =>
    protectedProcedure
        .input(
            z.object({
                planetId: z.string(),
                productName: z.string(),
                granularity: z.enum(['monthly', 'yearly', 'decade']).default('monthly'),
                limit: z.number().int().min(1).max(1000).default(100),
            }),
        )
        .output(
            z.object({
                planetId: z.string(),
                productName: z.string(),
                granularity: z.enum(['monthly', 'yearly', 'decade']),
                history: z.array(
                    z.object({
                        bucket: z.number(),
                        avgPrice: z.number(),
                        minPrice: z.number(),
                        maxPrice: z.number(),
                    }),
                ),
            }),
        )
        .query(async ({ input }) => {
            const rows = await dbGetProductPriceHistory(
                db,
                input.planetId,
                input.productName,
                input.granularity,
                input.limit,
            );
            return {
                planetId: input.planetId,
                productName: input.productName,
                granularity: input.granularity,
                history: rows
                    .map((r) => ({
                        bucket: Number(r.bucket),
                        avgPrice: r.avg_price,
                        minPrice: r.min_price,
                        maxPrice: r.max_price,
                    }))
                    .sort((a, b) => a.bucket - b.bucket),
            };
        });

/**
 * Minimal financials for a specific agent on a specific planet.
 * Used by the claim lease/expand UI to check affordability.
 */
export const getAgentFinancials = () =>
    protectedProcedure
        .input(z.object({ agentId: z.string(), planetId: z.string() }))
        .output(z.object({ deposits: z.number(), monthlyNetCashFlow: z.number() }))
        .query(async ({ input }) => {
            const [{ agent }, { conditions }] = await Promise.all([
                workerQueries.getAgent(input.agentId),
                workerQueries.getLoanConditions(input.agentId, input.planetId),
            ]);
            const deposits = agent?.assets?.[input.planetId]?.deposits ?? 0;
            const monthlyNetCashFlow = conditions?.monthlyNetCashFlow ?? 0;
            return { deposits, monthlyNetCashFlow };
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
