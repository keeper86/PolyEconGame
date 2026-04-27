/**
 * controller/planet.ts
 *
 * Granular tRPC endpoints for the planet detail sub-pages.
 * Each endpoint fetches the live planet from the worker and projects
 * only the data that the corresponding sub-page actually needs,
 * keeping payloads small.
 */

import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import { CURRENCY_RESOURCE_PREFIX } from '@/simulation/market/currencyResources';
import { groceryServiceResourceType } from '@/simulation/planet/services';
import { z } from 'zod';
import { SERVICE_PER_PERSON_PER_TICK } from '../../simulation/constants';
import type { Agent, Planet } from '../../simulation/planet/planet';
import { educationLevelKeys } from '../../simulation/population/education';
import type { Skill } from '../../simulation/population/population';
import { OCCUPATIONS, SKILL } from '../../simulation/population/population';
import { computeGlobalStarvation, computePopulationTotal } from '../../simulation/snapshotRepository';
import { workerQueries } from '../../simulation/workerClient/queries';
import { protectedProcedure } from '../trpcRoot';

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/**
 * Minimal data for the overview sub-page:
 * planet identity, position, resources, infrastructure, environment,
 * and pre-computed population/starvation totals for the live chart point.
 */
export const getPlanetOverview = () =>
    protectedProcedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                name: z.string(),
                populationTotal: z.number(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);
            return {
                tick,
                name: planet?.name ?? input.planetId,
                populationTotal: planet ? computePopulationTotal(planet) : 0,
            };
        });

// ---------------------------------------------------------------------------
// Demographics
// ---------------------------------------------------------------------------

/**
 * Slim demography for the demographics sub-page.
 *
 * The full `Population.demography` matrix is large (100 ages × 4 occs ×
 * 4 edus × 3 skills = 4800 cells).  For PlanetDemography we only need
 * per-age totals already broken down by edu/occ — the charts never drill
 * into individual (occ, edu, skill) triples.
 *
 * Shape sent: one row per age with { age, edu0..3, occ0..3, total }.
 */

type DemographyRow = {
    age: number;
    total: number;
    edu: [number, number, number, number]; // none, primary, secondary, tertiary
    occ: [number, number, number, number]; // unoccupied, employed, education, unableToWork
};

function buildDemographyRows(planet: Planet): DemographyRow[] {
    const rows: DemographyRow[] = [];
    for (let age = 0; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        if (!cohort) {
            continue;
        }

        const edu: [number, number, number, number] = [0, 0, 0, 0];
        const occ: [number, number, number, number] = [0, 0, 0, 0];
        let total = 0;

        for (let occIdx = 0; occIdx < OCCUPATIONS.length; occIdx++) {
            const o = OCCUPATIONS[occIdx];
            for (let eduIdx = 0; eduIdx < educationLevelKeys.length; eduIdx++) {
                const e = educationLevelKeys[eduIdx];
                let cell = 0;
                for (const skill of SKILL) {
                    cell += cohort[o][e][skill].total;
                }
                edu[eduIdx] += cell;
                occ[occIdx] += cell;
                total += cell;
            }
        }

        rows.push({ age, total, edu, occ });
    }
    return rows;
}

export const getPlanetDemographics = () =>
    protectedProcedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                demographics: z
                    .object({
                        planetName: z.string(),
                        rows: z.array(
                            z.object({
                                age: z.number(),
                                total: z.number(),
                                edu: z.tuple([z.number(), z.number(), z.number(), z.number()]),
                                occ: z.tuple([z.number(), z.number(), z.number(), z.number()]),
                            }),
                        ),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);
            if (!planet) {
                return { tick, demographics: null };
            }
            return {
                tick,
                demographics: {
                    planetName: planet.name,
                    rows: buildDemographyRows(planet),
                },
            };
        });

export const getPlanetEconomy = () =>
    protectedProcedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                economy: z
                    .object({
                        planetName: z.string(),
                        bank: z.any(),
                        wagePerEdu: z.record(z.string(), z.number()).nullable(),
                        priceLevel: z.number().nullable(),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);
            if (!planet) {
                return { tick, economy: null };
            }
            return {
                tick,
                economy: {
                    planetName: planet.name,
                    bank: planet.bank,
                    wagePerEdu: (planet.wagePerEdu as Record<string, number> | null) ?? null,
                    priceLevel: planet.marketPrices[groceryServiceResourceType.name] ?? null,
                },
            };
        });

// ---------------------------------------------------------------------------
// Demographics (unified) — single query for the demographics accordion page
// ---------------------------------------------------------------------------

/**
 * Compact per-age row sent for the demographics accordion page.
 *
 * The server pre-aggregates all 4800 cells (100 ages × 4 occs × 4 edus ×
 * 3 skills) down to one row per living age.  The caller specifies which
 * `groupMode` it wants ('occupation' | 'education') and which skills to
 * include so that the groupValues tuple is already filtered and summed —
 * no further work needed on the client.
 *
 * Each `groupValues` entry is a 4-element tuple parallel to the 4 group
 * keys (OCCUPATIONS or educationLevelKeys):
 *   [population, totalFoodStock, weightedStarvation, weightedWealth]
 *
 * Clients compute weighted means as:
 *   avgStarvation = weightedStarvation / population
 *   avgWealth     = weightedWealth     / population
 *   avgBuffer     = totalFoodStock     / (population * FOOD_TARGET_PER_PERSON)
 */
type AggRow = {
    age: number;
    total: number;
    /** Population pyramid totals — always over all skills, occupation-indexed. */
    occ: [number, number, number, number];
    /** Population pyramid totals — always over all skills, education-indexed. */
    edu: [number, number, number, number];
    /**
     * Pre-filtered group values for the active groupMode + skills.
     * 4 entries, one per group key; each entry is
     * [population, totalFoodStock, weightedStarvation, weightedWealth]
     */
    groupValues: [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
    ];
};

function buildAggRows(planet: Planet, groupMode: 'occupation' | 'education', activeSkills: readonly Skill[]): AggRow[] {
    const skillSet = new Set(activeSkills);

    const rows: AggRow[] = [];

    for (let age = 0; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        if (!cohort) {
            continue;
        }

        // Population pyramid totals — filtered to the activeSkills set.
        // Previously this used ALL skills; now the pyramid matches the
        // client's skill filtering so charts reflect the same subset.
        const edu: [number, number, number, number] = [0, 0, 0, 0];
        const occ: [number, number, number, number] = [0, 0, 0, 0];
        let total = 0;

        for (let oi = 0; oi < OCCUPATIONS.length; oi++) {
            const o = OCCUPATIONS[oi];
            for (let ei = 0; ei < educationLevelKeys.length; ei++) {
                const e = educationLevelKeys[ei];
                let cell = 0;
                // Only count the skills the caller requested.
                for (const skill of activeSkills) {
                    cell += cohort[o][e][skill].total;
                }
                edu[ei] += cell;
                occ[oi] += cell;
                total += cell;
            }
        }

        if (total === 0) {
            continue;
        }

        // Compact group aggregates (skill-filtered)
        const groupValues: [
            [number, number, number, number],
            [number, number, number, number],
            [number, number, number, number],
            [number, number, number, number],
        ] = [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ];

        for (let gi = 0; gi < 4; gi++) {
            let gPop = 0,
                gFoodStock = 0,
                gWeightedStarvation = 0,
                gWeightedWealth = 0;

            const occs: readonly string[] = groupMode === 'occupation' ? [OCCUPATIONS[gi]] : OCCUPATIONS;
            const edus: readonly string[] = groupMode === 'education' ? [educationLevelKeys[gi]] : educationLevelKeys;

            for (const o of occs) {
                for (const e of edus) {
                    for (const skill of SKILL) {
                        if (!skillSet.has(skill)) {
                            continue;
                        }
                        const occ_ = o as (typeof OCCUPATIONS)[number];
                        const edu_ = e as (typeof educationLevelKeys)[number];
                        const cat = cohort[occ_][edu_][skill];
                        if (!cat || cat.total <= 0) {
                            continue;
                        }
                        gPop += cat.total;
                        // Convert buffer (ticks) → service units so the client
                        // ratio = gFoodStock/pop / SERVICE_TARGET_PER_PERSON normalises correctly.
                        gFoodStock += cat.services.grocery.buffer * SERVICE_PER_PERSON_PER_TICK * cat.total;
                        gWeightedStarvation += cat.total * cat.services.grocery.starvationLevel;
                        gWeightedWealth += cat.total * cat.wealth.mean;
                    }
                }
            }

            groupValues[gi] = [gPop, gFoodStock, gWeightedStarvation, gWeightedWealth];
        }

        rows.push({ age, total, occ, edu, groupValues });
    }

    return rows;
}

const groupModeSchema = z.enum(['occupation', 'education']);
const skillLevelSchema = z.enum(SKILL);
const skillsSchema = z.array(skillLevelSchema).min(1);

/** 4-tuple: [population, totalFoodStock, weightedStarvation, weightedWealth] */
const groupValueTuple = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const getPlanetDemographicsFull = () =>
    protectedProcedure
        .input(
            z.object({
                planetId: z.string(),
                /** Which dimension to group by. Default: 'occupation'. */
                groupMode: groupModeSchema.default('occupation'),
                /** Skills to include in groupValues. Default: all three. */
                activeSkills: skillsSchema.default([...SKILL]),
            }),
        )
        .output(
            z.object({
                tick: z.number(),
                data: z
                    .object({
                        planetName: z.string(),
                        groupMode: groupModeSchema,
                        /**
                         * One entry per living age.
                         * occ/edu are full-skill pyramid totals.
                         * groupValues is skill-filtered, grouped by groupMode.
                         */
                        rows: z.array(
                            z.object({
                                age: z.number(),
                                total: z.number(),
                                edu: z.tuple([z.number(), z.number(), z.number(), z.number()]),
                                occ: z.tuple([z.number(), z.number(), z.number(), z.number()]),
                                groupValues: z.tuple([
                                    groupValueTuple,
                                    groupValueTuple,
                                    groupValueTuple,
                                    groupValueTuple,
                                ]),
                            }),
                        ),
                        priceLevel: z.number(),
                        starvationLevel: z.number(),
                        lastTransferMatrix: z.array(z.any()),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);
            if (!planet) {
                return { tick, data: null };
            }
            return {
                tick,
                data: {
                    planetName: planet.name,
                    groupMode: input.groupMode,
                    rows: buildAggRows(planet, input.groupMode, input.activeSkills),
                    priceLevel: planet.marketPrices[groceryServiceResourceType.name] ?? 1,
                    starvationLevel: computeGlobalStarvation(planet),
                    lastTransferMatrix: planet.population.lastTransferMatrix,
                },
            };
        });

// ---------------------------------------------------------------------------
// Resource Market (generic)
// ---------------------------------------------------------------------------

type AgentOfferEntry = {
    agentId: string;
    agentName: string;
    offerPrice: number;
    lastPlacedQuantity: number;
    lastSold: number;
    sellThrough: number;
    lastRevenue: number;
};

function buildAgentOffers(agents: Agent[], planetId: string, resourceName: string): AgentOfferEntry[] {
    const entries: AgentOfferEntry[] = [];

    for (const agent of agents) {
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }

        const offer = assets.market?.sell[resourceName];
        if (!offer) {
            continue;
        }

        const offerPrice = offer.lastOfferPrice ?? offer.offerPrice;
        if (offerPrice === undefined) {
            continue;
        }
        const lastPlacedQuantity = offer.lastPlacedQty ?? 0;
        const lastSold = offer.lastSold ?? 0;
        const lastRevenue = offer.lastRevenue ?? 0;
        const sellThrough = lastPlacedQuantity > 0 ? Math.min(1, lastSold / lastPlacedQuantity) : 0;

        if (lastPlacedQuantity <= 0 && lastSold <= 0) {
            continue;
        }

        entries.push({
            agentId: agent.id,
            agentName: agent.name,
            offerPrice,
            lastPlacedQuantity,
            lastSold,
            sellThrough,
            lastRevenue,
        });
    }

    entries.sort((a, b) => a.offerPrice - b.offerPrice);
    return entries;
}

const agentOfferSchema = z.object({
    agentId: z.string(),
    agentName: z.string(),
    offerPrice: z.number(),
    lastPlacedQuantity: z.number(),
    lastSold: z.number(),
    sellThrough: z.number(),
    lastRevenue: z.number(),
});

type AgentBidEntry = {
    agentId: string;
    agentName: string;
    bidPrice: number;
    demandedQuantity: number;
    lastBought: number;
    fillRatio: number;
    lastSpent: number;
};

function buildAgentBids(agents: Agent[], planetId: string, resourceName: string): AgentBidEntry[] {
    const entries: AgentBidEntry[] = [];

    for (const agent of agents) {
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }

        const bid = assets.market?.buy[resourceName];
        if (!bid) {
            continue;
        }

        const bidPrice = bid.lastBidPrice ?? bid.bidPrice ?? 0;
        const effectiveQty = bid.lastEffectiveQty ?? 0;
        const lastBought = bid.lastBought ?? 0;
        const lastSpent = bid.lastSpent ?? 0;
        const fillRatio = effectiveQty > 0 ? Math.min(1, lastBought / effectiveQty) : 0;

        if (effectiveQty <= 0 && lastBought <= 0) {
            continue;
        }

        entries.push({
            agentId: agent.id,
            agentName: agent.name,
            bidPrice,
            demandedQuantity: effectiveQty,
            lastBought,
            fillRatio,
            lastSpent,
        });
    }

    entries.sort((a, b) => b.bidPrice - a.bidPrice);
    return entries;
}

const agentBidSchema = z.object({
    agentId: z.string(),
    agentName: z.string(),
    bidPrice: z.number(),
    demandedQuantity: z.number(),
    lastBought: z.number(),
    fillRatio: z.number(),
    lastSpent: z.number(),
});

const marketSnapshotSchema = z.object({
    planetName: z.string(),
    resourceName: z.string(),
    clearingPrice: z.number(),
    totalDemand: z.number(),
    totalSupply: z.number(),
    totalSold: z.number(),
    fillRatio: z.number(),
    unfilledDemand: z.number(),
    unsoldSupply: z.number(),
    offers: z.array(agentOfferSchema),
    bids: z.array(agentBidSchema),
    populationBids: z
        .array(
            z.object({
                priceMin: z.number(),
                priceMax: z.number(),
                priceMid: z.number(),
                demandedQuantity: z.number(),
                lastBought: z.number(),
                fillRatio: z.number(),
                lastSpent: z.number(),
            }),
        )
        .optional(),
    populationDemand: z.number(),
    agentDemand: z.number(),
    currentMonthStats: z
        .object({
            avgPrice: z.number(),
            minPrice: z.number(),
            maxPrice: z.number(),
        })
        .nullable(),
});

export type PlanetMarketSnapshot = z.infer<typeof marketSnapshotSchema>;

export const getPlanetMarket = () =>
    protectedProcedure
        .input(z.object({ planetId: z.string(), resourceName: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                market: marketSnapshotSchema.nullable(),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }, { agents }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
                workerQueries.getAgentsByPlanet(input.planetId),
            ]);

            if (!planet) {
                return { tick, market: null };
            }

            const result = planet.lastMarketResult[input.resourceName];
            const clearingPrice = result?.clearingPrice ?? planet.marketPrices[input.resourceName] ?? 0;
            const totalDemand = result?.totalDemand ?? 0;
            const totalSupply = result?.totalSupply ?? 0;
            const totalSold = result?.totalVolume ?? 0;
            const unfilledDemand = result?.unfilledDemand ?? 0;
            const unsoldSupply = result?.unsoldSupply ?? 0;
            const fillRatio = totalDemand > 0 ? Math.min(1, totalSold / totalDemand) : 1;

            const offers = buildAgentOffers(agents, input.planetId, input.resourceName);
            const bids = buildAgentBids(agents, input.planetId, input.resourceName);
            const agentDemand = bids.reduce((s, b) => s + b.demandedQuantity, 0);
            const populationDemand = Math.max(0, totalDemand - agentDemand);

            const populationBids: {
                priceMin: number;
                priceMax: number;
                priceMid: number;
                demandedQuantity: number;
                lastBought: number;
                fillRatio: number;
                lastSpent: number;
            }[] = [];
            if (result?.populationBids) {
                result.populationBids.forEach((bin) => {
                    // Skip bins from old snapshot format (pre-log-price-bins) that lack price range fields
                    if (bin.priceMin === undefined || bin.priceMax === undefined || bin.priceMid === undefined) {
                        return;
                    }
                    const fillRatio = bin.quantity > 0 ? Math.min(1, bin.filled / bin.quantity) : 0;
                    populationBids.push({
                        priceMin: bin.priceMin,
                        priceMax: bin.priceMax,
                        priceMid: bin.priceMid,
                        demandedQuantity: bin.quantity,
                        lastBought: bin.filled,
                        fillRatio,
                        lastSpent: bin.cost,
                    });
                });
            }

            const acc = planet.monthPriceAcc[input.resourceName];
            const currentMonthStats =
                acc && acc.count > 0 ? { avgPrice: acc.sum / acc.count, minPrice: acc.min, maxPrice: acc.max } : null;

            return {
                tick,
                market: {
                    planetName: planet.name,
                    resourceName: input.resourceName,
                    clearingPrice,
                    totalDemand,
                    totalSupply,
                    totalSold,
                    fillRatio,
                    unfilledDemand,
                    unsoldSupply,
                    offers,
                    bids,
                    populationBids,
                    populationDemand,
                    agentDemand,
                    currentMonthStats,
                },
            };
        });

// ---------------------------------------------------------------------------
// Claims overview (land-bound resources)
// ---------------------------------------------------------------------------

const claimResourceSummarySchema = z.object({
    resourceName: z.string(),
    totalCapacity: z.number(),
    tenantedCapacity: z.number(),
    availableCapacity: z.number(),
    totalClaims: z.number(),
    tenantedClaims: z.number(),
    renewable: z.boolean(),
    /** Sum of regenerationRate across all unclaimed + free capacity for this resource. */
    regenerationRatePerUnit: z.number(),
});

export type ClaimResourceSummary = z.infer<typeof claimResourceSummarySchema>;

export const getPlanetClaims = () =>
    protectedProcedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                governmentId: z.string(),
                resources: z.array(claimResourceSummarySchema),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
            ]);

            if (!planet) {
                return { tick, governmentId: '', resources: [] };
            }

            const summaries: ClaimResourceSummary[] = Object.entries(planet.resources)
                .filter(([, claims]) => claims.length > 0 && claims[0]?.resource.form === 'landBoundResource')
                .map(([resourceName, claims]) => {
                    let tenantedCapacity = 0;
                    let tenantedClaims = 0;
                    let totalCapacity = 0;
                    let isRenewable = false;
                    let totalRegenerationRate = 0;

                    for (const claim of claims) {
                        totalCapacity += claim.maximumCapacity;
                        totalRegenerationRate += claim.regenerationRate;
                        if (claim.regenerationRate > 0) {
                            isRenewable = true;
                        }
                        const isTenanted = claim.tenantAgentId !== null;
                        if (isTenanted) {
                            tenantedCapacity += claim.maximumCapacity;
                            tenantedClaims += 1;
                        }
                    }

                    // regenerationRatePerUnit: ratio of regeneration to capacity (0 for non-renewable, 1 for fully renewable)
                    const regenerationRatePerUnit = totalCapacity > 0 ? totalRegenerationRate / totalCapacity : 0;

                    return {
                        resourceName,
                        totalCapacity,
                        tenantedCapacity,
                        availableCapacity: totalCapacity - tenantedCapacity,
                        totalClaims: claims.length,
                        tenantedClaims,
                        renewable: isRenewable,
                        regenerationRatePerUnit,
                    };
                })
                .sort(
                    (a, b) =>
                        a.resourceName.localeCompare(b.resourceName) - 5 * (Number(a.renewable) - Number(b.renewable)),
                );

            return { tick, governmentId: planet.governmentId, resources: summaries };
        });

export type AgentClaimEntry = {
    claimId: string;
    resourceName: string;
    quantity: number;
    maximumCapacity: number;
    tenantCostInCoins: number;
    costPerTick: number;
    claimStatus: 'active' | 'paused';
    noticePeriodEndsAtTick: number | null;
    regenerationRate: number;
    extractionRatePerTick: number;
    depletionTicksEstimate: number | null;
};

const agentClaimEntrySchema = z.object({
    claimId: z.string(),
    resourceName: z.string(),
    quantity: z.number(),
    maximumCapacity: z.number(),
    tenantCostInCoins: z.number(),
    costPerTick: z.number(),
    claimStatus: z.enum(['active', 'paused']),
    noticePeriodEndsAtTick: z.number().nullable(),
    regenerationRate: z.number(),
    extractionRatePerTick: z.number(),
    depletionTicksEstimate: z.number().nullable(),
});

export const getAgentClaims = () =>
    protectedProcedure
        .input(z.object({ agentId: z.string(), planetId: z.string() }))
        .output(z.object({ tick: z.number(), claims: z.array(agentClaimEntrySchema) }))
        .query(async ({ input }) => {
            const [{ tick }, { planet }, { agents }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
                workerQueries.getAgentsByPlanet(input.planetId),
            ]);

            if (!planet) {
                return { tick, claims: [] };
            }

            const agent = agents.find((a: Agent) => a.id === input.agentId);
            if (!agent) {
                return { tick, claims: [] };
            }

            const assets = agent.assets[input.planetId];
            const facilities = assets?.productionFacilities ?? [];

            const claims: AgentClaimEntry[] = [];

            for (const [resourceName, entries] of Object.entries(planet.resources)) {
                for (const entry of entries) {
                    if (entry.tenantAgentId !== input.agentId) {
                        continue;
                    }
                    const extractionRatePerTick = facilities.reduce((sum, f) => {
                        const need = f.needs.find((n) => n.resource.name === resourceName);
                        return need ? sum + need.quantity * f.scale : sum;
                    }, 0);
                    const netDepletionRate = extractionRatePerTick - entry.regenerationRate;
                    const depletionTicksEstimate =
                        netDepletionRate > 0 ? Math.floor(entry.quantity / netDepletionRate) : null;
                    claims.push({
                        claimId: entry.id,
                        resourceName,
                        quantity: entry.quantity,
                        maximumCapacity: entry.maximumCapacity,
                        tenantCostInCoins: entry.tenantCostInCoins,
                        costPerTick: entry.costPerTick,
                        claimStatus: entry.claimStatus,
                        noticePeriodEndsAtTick: entry.noticePeriodEndsAtTick,
                        regenerationRate: entry.regenerationRate,
                        extractionRatePerTick,
                        depletionTicksEstimate,
                    });
                }
            }

            return { tick, claims };
        });

// ---------------------------------------------------------------------------
// Market overview (all resources)
// ---------------------------------------------------------------------------

const marketOverviewRowSchema = z.object({
    resourceName: z.string(),
    level: z.string(),
    clearingPrice: z.number(),
    totalProduction: z.number(),
    totalConsumption: z.number(),
    totalSupply: z.number(),
    totalDemand: z.number(),
    totalSold: z.number(),
    fillRatio: z.number(),
});

export type MarketOverviewRow = z.infer<typeof marketOverviewRowSchema>;

function computePlanetProduction(agents: Agent[], planetId: string): Record<string, number> {
    const production: Record<string, number> = {};
    for (const agent of agents) {
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }
        for (const fac of assets.productionFacilities ?? []) {
            for (const [resourceName, qty] of Object.entries(fac.lastTickResults?.lastProduced ?? {})) {
                production[resourceName] = (production[resourceName] ?? 0) + qty;
            }
        }
    }
    return production;
}

function computePlanetConsumption(agents: Agent[], planetId: string, planet: Planet): Record<string, number> {
    const consumption: Record<string, number> = { ...planet.population.lastConsumption };
    for (const agent of agents) {
        const assets = agent.assets[planetId];
        if (!assets) {
            continue;
        }
        for (const fac of assets.productionFacilities ?? []) {
            for (const [resourceName, qty] of Object.entries(fac.lastTickResults?.lastConsumed ?? {})) {
                consumption[resourceName] = (consumption[resourceName] ?? 0) + qty;
            }
        }
    }
    return consumption;
}

export const getPlanetMarketOverview = () =>
    protectedProcedure
        .input(z.object({ planetId: z.string(), average: z.boolean().default(false) }))
        .output(
            z.object({
                tick: z.number(),
                rows: z.array(marketOverviewRowSchema),
            }),
        )
        .query(async ({ input }) => {
            const [{ tick }, { planet }, { agents }] = await Promise.all([
                workerQueries.getCurrentTick(),
                workerQueries.getPlanet(input.planetId),
                workerQueries.getAgentsByPlanet(input.planetId),
            ]);

            if (!planet) {
                return { tick, rows: [] };
            }

            const production = computePlanetProduction(agents, input.planetId);
            const consumption = computePlanetConsumption(agents, input.planetId, planet);

            const marketResults = input.average ? planet.avgMarketResult : planet.lastMarketResult;

            const rows: MarketOverviewRow[] = ALL_RESOURCES.map((resource) => {
                const result = marketResults[resource.name];
                const clearingPrice = result?.clearingPrice ?? planet.marketPrices[resource.name] ?? 0;
                const totalSupply = result?.totalSupply ?? 0;
                const totalDemand = result?.totalDemand ?? 0;
                const totalSold = result?.totalVolume ?? 0;
                const fillRatio = totalDemand > 0 ? Math.min(1, totalSold / totalDemand) : 1;

                return {
                    resourceName: resource.name,
                    level: resource.level,
                    clearingPrice,
                    totalProduction: production[resource.name] ?? 0,
                    totalConsumption: consumption[resource.name] ?? 0,
                    totalSupply,
                    totalDemand,
                    totalSold,
                    fillRatio,
                };
            }).filter((row) => row.totalSupply > 0 || row.totalDemand > 0 || row.totalProduction > 0);

            // Append active forex (currency) rows from live market data.
            // These are keyed under CUR_<planetId> in marketResults and never appear in ALL_RESOURCES.
            for (const [resourceName, result] of Object.entries(marketResults)) {
                if (!resourceName.startsWith(CURRENCY_RESOURCE_PREFIX)) {
                    continue;
                }
                const totalSupply = result.totalSupply ?? 0;
                const totalDemand = result.totalDemand ?? 0;
                if (totalSupply <= 0 && totalDemand <= 0) {
                    continue;
                }
                const totalSold = result.totalVolume ?? 0;
                rows.push({
                    resourceName,
                    level: 'currency',
                    clearingPrice: result.clearingPrice ?? planet.marketPrices[resourceName] ?? 0,
                    totalProduction: 0,
                    totalConsumption: 0,
                    totalSupply,
                    totalDemand,
                    totalSold,
                    fillRatio: totalDemand > 0 ? Math.min(1, totalSold / totalDemand) : 1,
                });
            }

            return { tick, rows };
        });
