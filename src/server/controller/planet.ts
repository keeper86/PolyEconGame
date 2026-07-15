import { CURRENCY_RESOURCE_PREFIX } from '@/simulation/market/currencyResources';
import { allServices, serviceKeyOf } from '@/simulation/market/serviceDefinitions';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import { constructionServiceResourceType, groceryServiceResourceType } from '@/simulation/planet/services';
import { z } from 'zod';
import type { Agent, Planet } from '../../simulation/planet/planet';
import { educationLevelKeys } from '../../simulation/population/education';
import type { ServiceName, Skill } from '../../simulation/population/population';
import { OCCUPATIONS, SKILL } from '../../simulation/population/population';
import { computePopulationTotal } from '../../simulation/snapshotRepository';
import { EPSILON, RECYCLER_BASE_RECOVERY_EFFICIENCY, RECYCLER_PAYMENT_RATIO } from '../../simulation/constants';
import { getRecyclerPaymentRatio } from '../../simulation/agents/recycler';
import { getLatestTick } from '../../simulation/workerClient/manager';
import { getPlanetSync, getPlanetWithAgentsSync } from '../../simulation/workerClient/syncQueries';
import { protectedProcedure } from '../trpcRoot';

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
            const tick = getLatestTick();
            const { planet } = getPlanetSync(input.planetId);
            return {
                tick,
                name: planet?.name ?? input.planetId,
                populationTotal: planet ? computePopulationTotal(planet) : 0,
            };
        });

type DemographyRow = {
    age: number;
    total: number;
    edu: [number, number, number, number];
    occ: [number, number, number, number];
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
            const tick = getLatestTick();
            const { planet } = getPlanetSync(input.planetId);
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
            const tick = getLatestTick();
            const { planet } = getPlanetSync(input.planetId);
            if (!planet) {
                return { tick, economy: null };
            }
            return {
                tick,
                economy: {
                    planetName: planet.name,
                    bank: planet.bank,
                    wagePerEdu: planet.wagePerEdu as Record<string, number>,
                    priceLevel: planet.marketPrices[groceryServiceResourceType.name] ?? null,
                },
            };
        });

type SvcGroupPair = [number, number];
type SvcBands4 = [SvcGroupPair, SvcGroupPair, SvcGroupPair, SvcGroupPair];

type AggRow = {
    age: number;
    total: number;

    occ: [number, number, number, number];

    edu: [number, number, number, number];

    groupValues: [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
    ];

    serviceBuffers: { [K in Exclude<ServiceName, 'grocery'>]: SvcBands4 };
};

const nonGroceryDefs = allServices.filter((d) => serviceKeyOf(d) !== 'grocery');

function emptyServiceBuffers(): AggRow['serviceBuffers'] {
    return {
        healthcare: [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
        ],
        logistics: [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
        ],
        retail: [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
        ],
        education: [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
        ],
    };
}

function buildAggRows(planet: Planet, groupMode: 'occupation' | 'education', activeSkills: readonly Skill[]): AggRow[] {
    const skillSet = new Set(activeSkills);

    const rows: AggRow[] = [];

    for (let age = 0; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        if (!cohort) {
            continue;
        }

        const edu: [number, number, number, number] = [0, 0, 0, 0];
        const occ: [number, number, number, number] = [0, 0, 0, 0];
        let total = 0;

        for (let oi = 0; oi < OCCUPATIONS.length; oi++) {
            const o = OCCUPATIONS[oi];
            for (let ei = 0; ei < educationLevelKeys.length; ei++) {
                const e = educationLevelKeys[ei];
                let cell = 0;

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

        const svcBuffers = emptyServiceBuffers();

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

                        gFoodStock += cat.services.grocery.buffer * cat.total;
                        gWeightedStarvation += cat.total * cat.services.grocery.starvationLevel;
                        gWeightedWealth += cat.total * cat.wealth.mean;
                        for (const def of nonGroceryDefs) {
                            const svcKey = serviceKeyOf(def) as Exclude<ServiceName, 'grocery'>;
                            const svc = cat.services[svcKey];
                            svcBuffers[svcKey][gi][0] += svc.buffer * cat.total;
                            svcBuffers[svcKey][gi][1] += cat.total * svc.starvationLevel;
                        }
                    }
                }
            }

            groupValues[gi] = [gPop, gFoodStock, gWeightedStarvation, gWeightedWealth];
        }

        rows.push({ age, total, occ, edu, groupValues, serviceBuffers: svcBuffers });
    }

    return rows;
}

const groupModeSchema = z.enum(['occupation', 'education']);
const skillLevelSchema = z.enum(SKILL);
const skillsSchema = z.array(skillLevelSchema).min(1);

const groupValueTuple = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const svcGroupPair = z.tuple([z.number(), z.number()]);
const svcBands4 = z.tuple([svcGroupPair, svcGroupPair, svcGroupPair, svcGroupPair]);
const serviceBuffersSchema = z.object({
    healthcare: svcBands4,
    logistics: svcBands4,
    retail: svcBands4,
    education: svcBands4,
});

export const getPlanetDemographicsFull = () =>
    protectedProcedure
        .input(
            z.object({
                planetId: z.string(),

                groupMode: groupModeSchema.default('occupation'),

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
                                serviceBuffers: serviceBuffersSchema,
                            }),
                        ),
                        priceLevel: z.number(),
                        lastTransferMatrix: z.array(z.any()),
                    })
                    .nullable(),
            }),
        )
        .query(async ({ input }) => {
            const tick = getLatestTick();
            const { planet } = getPlanetSync(input.planetId);
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
                    lastTransferMatrix: planet.population.lastTransferMatrix,
                },
            };
        });

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

        if (lastPlacedQuantity <= EPSILON && lastSold <= 0) {
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

export type AgentOffer = z.infer<typeof agentOfferSchema>;

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

        const isActiveBid = bidPrice > 0;
        if ((!isActiveBid && lastBought <= 0) || effectiveQty < EPSILON) {
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

export type AgentBid = z.infer<typeof agentBidSchema>;

const marketSnapshotSchema = z.object({
    planetId: z.string(),
    resourceName: z.string(),
    clearingPrice: z.number(),
    totalDemand: z.number(),
    totalSupply: z.number(),
    totalSold: z.number(),
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
            priceFloor: z.number(),
        })
        .nullable(),
});

export type PlanetMarketSnapshot = z.infer<typeof marketSnapshotSchema>;

// TODO: cache on local planet copy
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
            const { tick, planet, agents } = getPlanetWithAgentsSync(input.planetId);

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
            const priceFloor = planet.lastProductionCostFloors[input.resourceName] ?? 0;
            const currentMonthStats =
                acc && acc.count > 0
                    ? { avgPrice: acc.sum / acc.count, minPrice: acc.min, maxPrice: acc.max, priceFloor }
                    : null;

            return {
                tick,
                market: {
                    planetId: planet.id,
                    resourceName: input.resourceName,
                    clearingPrice,
                    totalDemand,
                    totalSupply,
                    totalSold,
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

export const getPlanetScrapRecoveryRate = () =>
    protectedProcedure
        .input(z.object({ planetId: z.string() }))
        .output(
            z.object({
                tick: z.number(),
                csPrice: z.number(),
                recoveryRatePerCS: z.number(),
                recyclerRatio: z.number(),
            }),
        )
        .query(async ({ input }) => {
            const tick = getLatestTick();
            const { planet } = getPlanetSync(input.planetId);
            if (!planet) {
                return { tick, csPrice: 0, recoveryRatePerCS: 0, recyclerRatio: 0 };
            }
            const csPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
            const ratio = getRecyclerPaymentRatio(planet);
            const recoveryRatePerCS = csPrice * RECYCLER_BASE_RECOVERY_EFFICIENCY * RECYCLER_PAYMENT_RATIO * ratio;
            return { tick, csPrice, recoveryRatePerCS, recyclerRatio: ratio };
        });

const claimResourceSummarySchema = z.object({
    resourceName: z.string(),
    totalCapacity: z.number(),
    tenantedCapacity: z.number(),
    availableCapacity: z.number(),
    totalClaims: z.number(),
    tenantedClaims: z.number(),
    renewable: z.boolean(),

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
            const tick = getLatestTick();
            const { planet } = getPlanetSync(input.planetId);

            if (!planet) {
                return { tick, governmentId: '', resources: [] };
            }

            const summaries: ClaimResourceSummary[] = Object.entries(planet.resources)
                .filter(
                    ([, entry]) => entry.claims.length > 0 && entry.claims[0]?.resource.form === 'landBoundResource',
                )
                .map(([resourceName, entry]) => {
                    const pool = entry.pool;
                    const claims = entry.claims;
                    const tenantedCapacity = claims.reduce((s, c) => s + c.maximumCapacity, 0);
                    const tenantedClaims = claims.length;
                    const totalCapacity = pool.maximumCapacity + tenantedCapacity;
                    const totalRegenerationRate =
                        pool.regenerationRate + claims.reduce((s, c) => s + c.regenerationRate, 0);
                    const isRenewable = pool.regenerationRate > 0 || claims.some((c) => c.regenerationRate > 0);

                    const regenerationRatePerUnit = totalCapacity > 0 ? totalRegenerationRate / totalCapacity : 0;

                    return {
                        resourceName,
                        totalCapacity,
                        tenantedCapacity,
                        availableCapacity: pool.maximumCapacity,
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
            const { tick, planet, agents } = getPlanetWithAgentsSync(input.planetId);

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

            for (const [resourceName, entry] of Object.entries(planet.resources)) {
                for (const claim of entry.claims) {
                    if (claim.tenantAgentId !== input.agentId) {
                        continue;
                    }
                    const extractionRatePerTick = facilities.reduce((sum, f) => {
                        const need = f.needs.find((n) => n.resource.name === resourceName);
                        return need ? sum + need.quantity * f.scale : sum;
                    }, 0);
                    const netDepletionRate = extractionRatePerTick - claim.regenerationRate;
                    const depletionTicksEstimate =
                        netDepletionRate > 0 ? Math.floor(claim.quantity / netDepletionRate) : null;
                    claims.push({
                        claimId: claim.id,
                        resourceName,
                        quantity: claim.quantity,
                        maximumCapacity: claim.maximumCapacity,
                        tenantCostInCoins: claim.tenantCostInCoins,
                        costPerTick: claim.costPerTick,
                        claimStatus: claim.claimStatus,
                        noticePeriodEndsAtTick: claim.noticePeriodEndsAtTick,
                        regenerationRate: claim.regenerationRate,
                        extractionRatePerTick,
                        depletionTicksEstimate,
                    });
                }
            }

            return { tick, claims };
        });

const marketOverviewRowSchema = z.object({
    resourceName: z.string(),
    level: z.string(),
    clearingPrice: z.number(),
    totalProduction: z.number(),
    totalConsumption: z.number(),
    totalSupply: z.number(),
    totalDemand: z.number(),
    totalSold: z.number(),
    priceCostRatio: z.number(),
});

export type MarketOverviewRow = z.infer<typeof marketOverviewRowSchema>;

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
            const { tick, planet } = getPlanetWithAgentsSync(input.planetId);

            if (!planet) {
                return { tick, rows: [] };
            }

            const production = planet.producedResources;
            const consumption = planet.consumedResources;

            const marketResults = input.average ? planet.avgMarketResult : planet.lastMarketResult;

            const rows: MarketOverviewRow[] = ALL_RESOURCES.map((resource) => {
                const result = marketResults[resource.name];
                const clearingPrice = result?.clearingPrice ?? planet.marketPrices[resource.name] ?? 0;
                const totalSupply = result?.totalSupply ?? 0;
                const totalDemand = result?.totalDemand ?? 0;
                const totalSold = result?.totalVolume ?? 0;
                const costFloor = planet.lastProductionCostFloors[resource.name] ?? 0;
                const priceCostRatio = costFloor > 0 ? clearingPrice / costFloor : 0;

                return {
                    resourceName: resource.name,
                    level: resource.level,
                    clearingPrice,
                    totalProduction: production[resource.name] ?? 0,
                    totalConsumption: consumption[resource.name] ?? 0,
                    totalSupply,
                    totalDemand,
                    totalSold,
                    priceCostRatio,
                };
            }).filter((row) => row.totalSupply > 0 || row.totalDemand > 0 || row.totalProduction > 0);

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
                    priceCostRatio: 1,
                });
            }

            return { tick, rows };
        });
