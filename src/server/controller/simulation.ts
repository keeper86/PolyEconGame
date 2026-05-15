import { getCurrencyResourceName, DEFAULT_EXCHANGE_RATE } from '@/simulation/market/currencyResources';
import { getEffectiveBuyPrice, getEffectiveSellPrice } from '@/simulation/market/orderBookSnapshot';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import { groceryServiceResourceType } from '@/simulation/planet/services';
import { shiptypes } from '@/simulation/ships/ships';
import {
    ARBITRAGE_FOREX_THIN_BOOK_HAIRCUT,
    ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS,
    ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS,
} from '@/simulation/constants';
import { z } from 'zod';
import { totalOutstandingLoans } from '../../simulation/financial/loanTypes';
import {
    getAgentFinancialHistoryAggregated as dbGetAgentFinancialHistory,
    getAgentHistoryAggregated as dbGetAgentHistory,
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

const loanSchema = z.object({
    id: z.string(),
    type: z.enum([
        'starter',
        'discretionary',
        'wageCoverage',
        'bufferCoverage',
        'claimCoverage',
        'shipPenaltyCoverage',
        'licenseBootstrap',
        'forexWorkingCapital',
        'shipbuilderBootstrap',
    ]),
    principal: z.number(),
    remainingPrincipal: z.number(),
    annualInterestRate: z.number(),
    takenAtTick: z.number(),
    maturityTick: z.number(),
    earlyRepaymentAllowed: z.boolean(),
});

const loanConditionsSchema = z.object({
    maxLoanAmount: z.number(),
    annualInterestRate: z.number(),
    existingLoans: z.number(),
    lastMonthlyExpenses: z.number(),
    lastMonthlyRevenue: z.number(),
    monthlyNetCashFlow: z.number(),
    storageCollateral: z.number(),
    isNewAgent: z.boolean(),
});

export type LoanConditions = z.infer<typeof loanConditionsSchema>;

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
                        ? Object.values(a.assets).reduce(
                              (sum, pa) => sum + (pa.deposits ?? 0) - totalOutstandingLoans(pa.activeLoans ?? []),
                              0,
                          )
                        : 0,
                    storage: computeAgentStorage(a),
                    production: computeAgentProduction(a),
                    consumption: computeAgentConsumption(a),
                    agentSummary: a,
                })),
            };
        });

export const getAgentListSummaries = () =>
    protectedProcedure
        .input(z.object({ planetId: z.string().optional() }))
        .output(
            z.object({
                tick: z.number(),
                agents: z.array(
                    z.object({
                        agentId: z.string(),
                        name: z.string(),
                        associatedPlanetId: z.string(),
                        balance: z.number(),
                        /** Balance normalised into the requested planet's local currency. */
                        normalizedBalance: z.number(),
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
        .query(async ({ input }) => {
            const { tick, agents } = await workerQueries.getAllAgents();

            // If a planetId is given, fetch the planet's avgMarketResult to
            // build a forex rate lookup: currency resource name → clearing price.
            let forexRates: Record<string, number> | undefined;
            if (input.planetId) {
                const { planet } = await workerQueries.getPlanet(input.planetId);
                if (planet) {
                    forexRates = {};
                    for (const [curName, result] of Object.entries(planet.avgMarketResult)) {
                        forexRates[curName] = result.clearingPrice;
                    }
                }
            }

            return {
                tick,
                agents: agents.map((a: Agent) => {
                    const summary = summariseAgentBlob(a.id, a);
                    let normalizedBalance = summary.balance;
                    if (forexRates && summary.associatedPlanetId !== input.planetId) {
                        const curName = getCurrencyResourceName(summary.associatedPlanetId);
                        const rate = forexRates[curName] ?? DEFAULT_EXCHANGE_RATE;
                        normalizedBalance = summary.balance * rate;
                    }
                    return { ...summary, normalizedBalance };
                }),
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
                        ? Object.values(agent.assets).reduce(
                              (sum, pa) => sum + (pa.deposits ?? 0) - totalOutstandingLoans(pa.activeLoans ?? []),
                              0,
                          )
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
                                licenses: z.object({
                                    commercial: z.object({ acquiredTick: z.number(), frozen: z.boolean() }).optional(),
                                    workforce: z.object({ acquiredTick: z.number(), frozen: z.boolean() }).optional(),
                                }),
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
                        ? Object.values(agent.assets).reduce(
                              (sum, pa) => sum + (pa.deposits ?? 0) - totalOutstandingLoans(pa.activeLoans ?? []),
                              0,
                          )
                        : 0,
                    shipCount: agent.ships?.length ?? 0,
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

const agentPlanetDetail = z.object({
    agentId: z.string(),
    agentName: z.string(),
    planetId: z.string(),
    automateWorkerAllocation: z.boolean(),
    assets: z.any(),
    allPlanetDeposits: z.record(z.string(), z.number()),
});
export type AgentPlanetDetail = z.infer<typeof agentPlanetDetail>;
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
                detail: agentPlanetDetail.nullable(),
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

            const allPlanetDeposits: Record<string, number> = {};
            for (const [pid, pa] of Object.entries(agent.assets ?? {})) {
                allPlanetDeposits[pid] = pa.deposits ?? 0;
            }

            return {
                tick,
                detail: {
                    agentId: agent.id,
                    agentName: agent.name,
                    planetId: input.planetId,
                    automateWorkerAllocation: agent.automateWorkerAllocation ?? false,
                    assets,
                    allPlanetDeposits,
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

export const getAgentHistory = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string(),
                planetId: z.string(),
                granularity: z.enum(['monthly', 'yearly', 'decade']).default('monthly'),
                limit: z.number().int().min(1).max(1000).default(100),
            }),
        )
        .output(
            z.object({
                agentId: z.string(),
                granularity: z.enum(['monthly', 'yearly', 'decade']),
                foundedTick: z.number(),
                history: z.array(
                    z.object({
                        bucket: z.number(),
                        avgNetBalance: z.number(),
                        avgMonthlyNetIncome: z.number(),
                        avgTotalWorkers: z.number(),
                        avgWages: z.number(),
                        sumProductionValue: z.number(),
                        sumConsumptionValue: z.number(),
                    }),
                ),
            }),
        )
        .query(async ({ input }) => {
            const [{ agent }, rows] = await Promise.all([
                workerQueries.getAgent(input.agentId),
                dbGetAgentHistory(db, input.agentId, input.planetId, input.granularity, input.limit),
            ]);
            return {
                agentId: input.agentId,
                granularity: input.granularity,
                foundedTick: agent?.foundedTick ?? 0,
                history: rows
                    .map((r) => ({
                        bucket: Number(r.bucket),
                        avgNetBalance: r.avg_net_balance ?? 0,
                        avgMonthlyNetIncome: r.avg_monthly_net_income ?? 0,
                        avgTotalWorkers: r.avg_total_workers ?? 0,
                        avgWages: r.avg_wages ?? 0,
                        sumProductionValue: r.sum_production_value ?? 0,
                        sumConsumptionValue: r.sum_consumption_value ?? 0,
                    }))
                    .sort((a, b) => a.bucket - b.bucket),
            };
        });

export const getAgentFinancialHistory = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string(),
                planetId: z.string(),
                granularity: z.enum(['monthly', 'yearly', 'decade']).default('monthly'),
                limit: z.number().int().min(1).max(1000).default(26),
            }),
        )
        .output(
            z.object({
                agentId: z.string(),
                granularity: z.enum(['monthly', 'yearly', 'decade']),
                foundedTick: z.number(),
                history: z.array(
                    z.object({
                        bucket: z.number(),
                        avgNetBalance: z.number(),
                        avgMonthlyNetIncome: z.number(),
                        avgWages: z.number(),
                        sumPurchases: z.number(),
                        sumClaimPayments: z.number(),
                    }),
                ),
            }),
        )
        .query(async ({ input }) => {
            const [{ agent }, rows] = await Promise.all([
                workerQueries.getAgent(input.agentId),
                dbGetAgentFinancialHistory(db, input.agentId, input.planetId, input.granularity, input.limit),
            ]);
            return {
                agentId: input.agentId,
                granularity: input.granularity,
                foundedTick: agent?.foundedTick ?? 0,
                history: rows
                    .map((r) => ({
                        bucket: Number(r.bucket),
                        avgNetBalance: r.avg_net_balance ?? 0,
                        avgMonthlyNetIncome: r.avg_monthly_net_income ?? 0,
                        avgWages: r.avg_wages ?? 0,
                        sumPurchases: r.sum_purchases ?? 0,
                        sumClaimPayments: r.sum_claim_payments ?? 0,
                    }))
                    .sort((a, b) => a.bucket - b.bucket),
            };
        });

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
        .output(z.object({ conditions: loanConditionsSchema.nullable(), activeLoans: z.array(loanSchema) }))
        .query(async ({ input }) => {
            const { conditions, activeLoans } = await workerQueries.getLoanConditions(input.agentId, input.planetId);
            return { conditions: conditions ?? null, activeLoans: activeLoans ?? [] };
        });

const baseTickerEventSchema = z.object({
    id: z.number(),
    planetId: z.string(),
    tick: z.number(),
});

const tickerEventSchema = baseTickerEventSchema.extend(
    z.object({
        category: z.enum([
            'agentCreated',
            'shipDispatched',
            'shipArrived',
            'shipCompleted',
            'facilityCompleted',
            'licenseAcquired',
            'agentBankrupt',
            'contractAccepted',
            'loanRollover',
            'priceSpike',
            'populationMilestone',
        ]),
        agentId: z.string().optional(),
        agentName: z.string().optional(),
        message: z.string(),
    }).shape,
);

export type TickerEvent = z.infer<typeof tickerEventSchema>;

export const getTickerEvents = () =>
    protectedProcedure
        .input(z.object({ lastSeenId: z.number().optional() }).default({}))
        .output(z.object({ tickerEvents: z.array(tickerEventSchema) }))
        .query(async ({ input }) => {
            const { tickerEvents } = await workerQueries.getTickerEvents();
            const filtered =
                input.lastSeenId !== undefined ? tickerEvents.filter((e) => e.id > input.lastSeenId!) : tickerEvents;
            return { tickerEvents: filtered };
        });

// ---------------------------------------------------------------------------
// Trade Route Scanner — dev-only endpoint used by the supply-chain analyser.
// Replicates the arbitrageur's scan logic against live planet order books.
// ---------------------------------------------------------------------------

const ALL_TRANSPORT_SHIP_TYPES = [
    ...Object.values(shiptypes.solid),
    ...Object.values(shiptypes.liquid),
    ...Object.values(shiptypes.gas),
    ...Object.values(shiptypes.pieces),
] as const;

const routeRowSchema = z.object({
    resourceName: z.string(),
    originPlanetId: z.string(),
    originPlanetName: z.string(),
    destPlanetId: z.string(),
    destPlanetName: z.string(),
    quantity: z.number(),
    buyPrice: z.number(),
    sellPriceDest: z.number(),
    forexRate: z.number(),
    forexSource: z.enum(['bid-book', 'mid-fallback']),
    sellPriceAdj: z.number(),
    grossProfit: z.number(),
    depreciation: z.number(),
    netProfit: z.number(),
    roundTripTicks: z.number(),
    profitPerTick: z.number(),
});

export type ArbitrageRouteRow = z.infer<typeof routeRowSchema>;

type PlanetList = Awaited<ReturnType<typeof workerQueries.getAllPlanets>>['planets'];

function computeArbitrageRoutesForShip(
    planets: PlanetList,
    shipType: (typeof ALL_TRANSPORT_SHIP_TYPES)[number],
    depreciation: number,
    roundTripTicks: number,
    opts: { resourceNames?: Set<string>; destPlanetId?: string; originPlanetId?: string } = {},
): ArbitrageRouteRow[] {
    const routes: ArbitrageRouteRow[] = [];
    const { cargoSpecification } = shipType;

    for (const resource of ALL_RESOURCES) {
        // Skip resource types this ship can't carry
        const form = resource.form;
        if (form === 'services' || form === 'landBoundResource' || form === 'currency') {
            continue;
        }
        if (cargoSpecification.type !== form) {
            continue;
        }
        if (opts.resourceNames && !opts.resourceNames.has(resource.name)) {
            continue;
        }

        const maxByVolume = cargoSpecification.volume / resource.volumePerQuantity;
        const maxByMass = cargoSpecification.mass / resource.massPerQuantity;
        const maxQty = Math.floor(Math.min(maxByVolume, maxByMass));
        if (maxQty < 1) {
            continue;
        }

        for (const origin of planets) {
            if (opts.originPlanetId && origin.id !== opts.originPlanetId) {
                continue;
            }
            const originAskDepth = (origin.orderBooks?.[resource.name]?.asks ?? []).reduce((s, l) => s + l.quantity, 0);
            if (originAskDepth < 1) {
                continue;
            }

            for (const dest of planets) {
                if (dest.id === origin.id) {
                    continue;
                }
                if (opts.destPlanetId && dest.id !== opts.destPlanetId) {
                    continue;
                }

                const destBidDepth = (dest.orderBooks?.[resource.name]?.bids ?? []).reduce((s, l) => s + l.quantity, 0);
                if (destBidDepth < 1) {
                    continue;
                }

                const effectiveQty = Math.min(maxQty, originAskDepth, destBidDepth);

                const pBuy = getEffectiveBuyPrice(origin, resource.name, effectiveQty);
                if (!pBuy) {
                    continue;
                }

                const pSellDest = getEffectiveSellPrice(dest, resource.name, effectiveQty);
                if (!pSellDest) {
                    continue;
                }

                const currencyName = getCurrencyResourceName(dest.id);
                const estimatedForexQty = pSellDest * effectiveQty;
                const forexBidRate =
                    estimatedForexQty > 0 ? getEffectiveSellPrice(origin, currencyName, estimatedForexQty) : null;
                const midForexRate = origin.marketPrices[currencyName] ?? DEFAULT_EXCHANGE_RATE;
                const forexRate = forexBidRate ?? midForexRate * ARBITRAGE_FOREX_THIN_BOOK_HAIRCUT;
                const forexSource: 'bid-book' | 'mid-fallback' = forexBidRate ? 'bid-book' : 'mid-fallback';

                const pSellAdj = pSellDest * forexRate;
                const grossProfit = (pSellAdj - pBuy) * effectiveQty;
                const netProfit = grossProfit - depreciation;
                const profitPerTick = netProfit / roundTripTicks;

                routes.push({
                    resourceName: resource.name,
                    originPlanetId: origin.id,
                    originPlanetName: origin.name,
                    destPlanetId: dest.id,
                    destPlanetName: dest.name,
                    quantity: effectiveQty,
                    buyPrice: pBuy,
                    sellPriceDest: pSellDest,
                    forexRate,
                    forexSource,
                    sellPriceAdj: pSellAdj,
                    grossProfit,
                    depreciation,
                    netProfit,
                    roundTripTicks,
                    profitPerTick,
                });
            }
        }
    }

    return routes;
}

export const getArbitrageRoutes = () =>
    protectedProcedure
        .input(
            z.object({
                shipTypeName: z.string(),
                maxRoutes: z.number().int().min(1).max(500).default(200),
            }),
        )
        .output(
            z.object({
                tick: z.number(),
                shipTypeName: z.string(),
                routes: z.array(routeRowSchema),
            }),
        )
        .query(async ({ input }) => {
            const shipType = ALL_TRANSPORT_SHIP_TYPES.find((s) => s.name === input.shipTypeName);
            if (!shipType || shipType.type !== 'transport') {
                return { tick: 0, shipTypeName: input.shipTypeName, routes: [] };
            }

            const [{ tick, planets }, { shipCapitalMarket }] = await Promise.all([
                workerQueries.getAllPlanets(),
                workerQueries.getShipCapitalMarket(),
            ]);

            const oneWayTicks = Math.ceil(1000 / shipType.speed);
            const roundTripTicks = oneWayTicks * 2 + ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS;
            const emaPrice = shipCapitalMarket.emaPrice[shipType.name] ?? 0;
            const depreciationRatePerTick = emaPrice > 0 ? emaPrice / ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS : 0;
            const depreciation = depreciationRatePerTick * roundTripTicks;

            const routes = computeArbitrageRoutesForShip(planets, shipType, depreciation, roundTripTicks);
            routes.sort((a, b) => b.profitPerTick - a.profitPerTick);
            return {
                tick,
                shipTypeName: input.shipTypeName,
                routes: routes.slice(0, input.maxRoutes),
            };
        });

export const getArbitrageForResources = () =>
    protectedProcedure
        .input(
            z.object({
                resourceNames: z.array(z.string()),
                destPlanetId: z.string().optional(),
                originPlanetId: z.string().optional(),
            }),
        )
        .output(
            z.object({
                tick: z.number(),
                byResource: z.record(z.string(), routeRowSchema.nullable()),
            }),
        )
        .query(async ({ input }) => {
            if (input.resourceNames.length === 0) {
                return { tick: 0, byResource: {} };
            }

            const resourceNameSet = new Set(input.resourceNames);
            const [{ tick, planets }, { shipCapitalMarket }] = await Promise.all([
                workerQueries.getAllPlanets(),
                workerQueries.getShipCapitalMarket(),
            ]);

            const byResource: Record<string, ArbitrageRouteRow | null> = {};
            for (const name of input.resourceNames) {
                byResource[name] = null;
            }

            for (const shipType of ALL_TRANSPORT_SHIP_TYPES) {
                const oneWayTicks = Math.ceil(1000 / shipType.speed);
                const roundTripTicks = oneWayTicks * 2 + ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS;
                const emaPrice = shipCapitalMarket.emaPrice[shipType.name] ?? 0;
                const depreciationRatePerTick = emaPrice > 0 ? emaPrice / ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS : 0;
                const depreciation = depreciationRatePerTick * roundTripTicks;

                const routes = computeArbitrageRoutesForShip(planets, shipType, depreciation, roundTripTicks, {
                    resourceNames: resourceNameSet,
                    destPlanetId: input.destPlanetId,
                    originPlanetId: input.originPlanetId,
                });

                for (const route of routes) {
                    const current = byResource[route.resourceName];
                    if (!current || route.profitPerTick > current.profitPerTick) {
                        byResource[route.resourceName] = route;
                    }
                }
            }

            return { tick, byResource };
        });
