/**
 * controller/planet.ts
 *
 * Granular tRPC endpoints for the planet detail sub-pages.
 * Each endpoint fetches the live planet from the worker and projects
 * only the data that the corresponding sub-page actually needs,
 * keeping payloads small.
 */

import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import { groceryServiceResourceType } from '@/simulation/planet/services';
import { z } from 'zod';
import { INITIAL_GROCERY_PRICE, SERVICE_PER_PERSON_PER_TICK } from '../../simulation/constants';
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

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

/**
 * Data for the economy sub-page: bank, wagePerEdu, priceLevel, and
 * a slim demography that retains only wealth moments (mean, variance) and
 * total per (age, occ, edu, skill) cell — everything else (foodStock,
 * starvation, death stats) is dropped.
 *
 * Also includes the lastTransferMatrix for IntergenerationalTransferChart.
 */

type SlimCategory = {
    total: number;
    wealthMean: number;
    wealthVariance: number;
};

type SlimCohort = {
    [occ: string]: {
        [edu: string]: {
            [skill: string]: SlimCategory;
        };
    };
};

function buildSlimDemographyForEconomy(planet: Planet): SlimCohort[] {
    return planet.population.demography.map((cohort) => {
        if (!cohort) {
            return {} as SlimCohort;
        }
        const slimCohort: SlimCohort = {};
        for (const occ of OCCUPATIONS) {
            slimCohort[occ] = {};
            for (const edu of educationLevelKeys) {
                slimCohort[occ][edu] = {};
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    slimCohort[occ][edu][skill] = {
                        total: cat.total,
                        wealthMean: cat.wealth.mean,
                        wealthVariance: cat.wealth.variance,
                    };
                }
            }
        }
        return slimCohort;
    });
}

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
                        /** Slim demography: wealth moments only, no food/starvation data. */
                        demography: z.array(z.any()),
                        /** Transfer matrix for intergenerational chart. */
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
                return { tick, economy: null };
            }
            return {
                tick,
                economy: {
                    planetName: planet.name,
                    bank: planet.bank,
                    wagePerEdu: (planet.wagePerEdu as Record<string, number> | null) ?? null,
                    priceLevel: planet.marketPrices[groceryServiceResourceType.name] ?? null,
                    demography: buildSlimDemographyForEconomy(planet),
                    lastTransferMatrix: planet.population.lastTransferMatrix,
                },
            };
        });

// ---------------------------------------------------------------------------
// Food & Nutrition
// ---------------------------------------------------------------------------

/**
 * Data for the food & nutrition sub-page.
 *
 * Strips the demography down to only food-relevant fields:
 * (total, foodStock, starvationLevel) per (age, occ, edu, skill) cell.
 * Wealth moments and death/disability stats are dropped entirely.
 */

type FoodCategory = {
    total: number;
    foodStock: number;
    starvationLevel: number;
};

type FoodCohort = {
    [occ: string]: {
        [edu: string]: {
            [skill: string]: FoodCategory;
        };
    };
};

function buildFoodDemography(planet: Planet): FoodCohort[] {
    return planet.population.demography.map((cohort) => {
        if (!cohort) {
            return {} as FoodCohort;
        }
        const slimCohort: FoodCohort = {};
        for (const occ of OCCUPATIONS) {
            slimCohort[occ] = {};
            for (const edu of educationLevelKeys) {
                slimCohort[occ][edu] = {};
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    slimCohort[occ][edu][skill] = {
                        total: cat.total,
                        // Convert buffer (ticks) → service units so callers can
                        // compare against SERVICE_TARGET_PER_PERSON (= 1.0 unit).
                        foodStock: cat.services.grocery.buffer * SERVICE_PER_PERSON_PER_TICK * cat.total,
                        starvationLevel: cat.services.grocery.starvationLevel,
                    };
                }
            }
        }
        return slimCohort;
    });
}

export const getPlanetFood = () =>
    protectedProcedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                food: z
                    .object({
                        planetName: z.string(),
                        /** Food-only demography: total, foodStock, starvationLevel per cell. */
                        demography: z.array(z.any()),
                        priceLevel: z.number(),
                        starvationLevel: z.number(),
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
                return { tick, food: null };
            }
            return {
                tick,
                food: {
                    planetName: planet.name,
                    demography: buildFoodDemography(planet),
                    priceLevel: planet.marketPrices[groceryServiceResourceType.name] ?? 1,
                    starvationLevel: computeGlobalStarvation(planet),
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

        const offerPrice = offer.lastOfferPrice ?? offer.offerPrice ?? INITIAL_GROCERY_PRICE;
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
                bidPrice: z.number(),
                demandedQuantity: z.number(),
                lastBought: z.number(),
                fillRatio: z.number(),
                lastSpent: z.number(),
            }),
        )
        .optional(),
    populationDemand: z.number(),
    agentDemand: z.number(),
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
            const clearingPrice = result?.clearingPrice ?? planet.marketPrices[input.resourceName] ?? 1;
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
                bidPrice: number;
                demandedQuantity: number;
                lastBought: number;
                fillRatio: number;
                lastSpent: number;
            }[] = [];
            if (result?.populationBids) {
                result.populationBids.forEach((bin) => {
                    const fillRatio = bin.quantity > 0 ? Math.min(1, bin.filled / bin.quantity) : 0;
                    populationBids.push({
                        bidPrice: bin.bidPrice,
                        demandedQuantity: bin.quantity,
                        lastBought: bin.filled,
                        fillRatio,
                        lastSpent: bin.cost,
                    });
                });
                populationBids.sort((a, b) => b.bidPrice - a.bidPrice);
            }

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
                .filter(([, claims]) => claims.length > 0 && claims[0]?.type.form === 'landBoundResource')
                .map(([resourceName, claims]) => {
                    let tenantedCapacity = 0;
                    let tenantedClaims = 0;
                    let totalCapacity = 0;
                    let isRenewable = false;

                    for (const claim of claims) {
                        totalCapacity += claim.maximumCapacity;
                        if (claim.regenerationRate > 0) {
                            isRenewable = true;
                        }
                        const isTenanted = claim.tenantAgentId !== null && claim.tenantAgentId !== claim.claimAgentId;
                        if (isTenanted) {
                            tenantedCapacity += claim.maximumCapacity;
                            tenantedClaims += 1;
                        }
                    }

                    return {
                        resourceName,
                        totalCapacity,
                        tenantedCapacity,
                        availableCapacity: totalCapacity - tenantedCapacity,
                        totalClaims: claims.length,
                        tenantedClaims,
                        renewable: isRenewable,
                    };
                })
                .sort((a, b) => a.resourceName.localeCompare(b.resourceName));

            return { tick, governmentId: planet.governmentId, resources: summaries };
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

function computePlanetConsumption(agents: Agent[], planetId: string): Record<string, number> {
    const consumption: Record<string, number> = {};
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
        .input(z.object({ planetId: z.string() }))
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
            const consumption = computePlanetConsumption(agents, input.planetId);

            const rows: MarketOverviewRow[] = ALL_RESOURCES.map((resource) => {
                const result = planet.lastMarketResult[resource.name];
                const clearingPrice = result?.clearingPrice ?? planet.marketPrices[resource.name] ?? 1;
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

            return { tick, rows };
        });
