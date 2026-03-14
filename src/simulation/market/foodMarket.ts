/**
 * market/foodMarket.ts
 *
 * Implements the food market clearing mechanism (Subsystems 1 & 2).
 *
 * **Per-agent offer model:**  Each food-producing agent posts an offer
 * (price, quantity) via `updateAgentPricing`.  Households form demand
 * and buy from the cheapest offers first (merit-order dispatch).
 *
 * Per tick:
 * 1. Collect per-agent offers from storage facilities.
 * 2. Household consumption: each cohort-class depletes its foodStock.
 * 3. Demand formation: households compute desiredPurchase (buffer replenishment).
 * 4. Liquidity constraint: affordableQuantity = meanWealth / offerPrice.
 * 5. Merit-order clearing: match demand against offers cheapest-first.
 * 6. Financial settlement: household deposits decrease, agent deposits increase.
 * 7. Compute volume-weighted average price for the price level.
 * 8. Update starvation level based on actual foodStock.
 *
 * Revenue flows directly to the agent whose offer was filled (not
 * proportional distribution).
 */

import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK, INITIAL_FOOD_PRICE } from '../constants';
import { agriculturalProductResourceType, removeFromStorageFacility } from '../planet/facilities';
import type { Agent, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import type { GaussianMoments, Occupation, Skill } from '../population/population';
import { forEachPopulationCohort } from '../population/population';
import { debitFoodPurchase } from '../financial/wealthOps';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-cohort-class demand record used during market clearing. */
interface DemandRecord {
    age: number;
    edu: EducationLevelType;
    occ: Occupation;
    skill: Skill;
    population: number;
    effectiveDemand: number; // total tons demanded by this cell
    wealthMoments: GaussianMoments;
}

/** A single agent's offer on the market. */
interface MarketOffer {
    agent: Agent;
    price: number; // currency per ton
    quantity: number; // tons available
    sold: number; // tons sold so far (accumulated during clearing)
    revenue: number; // revenue accumulated during clearing
}

// ---------------------------------------------------------------------------
// Truncated expectation under lognormal wealth distribution
// ---------------------------------------------------------------------------

/**
 * Compute the expected purchase quantity for a cohort-class under the
 * assumption that wealth is lognormally distributed.
 *
 * E[min(w / price, desiredPurchase)] where w ~ LogNormal(μ_ln, σ_ln²)
 *
 * For the initial implementation we use a simpler mean-field approximation:
 * all members of the cohort-class have exactly meanWealth.  This is exact
 * when wealthVariance = 0 and a reasonable first-order approximation
 * otherwise.
 *
 * TODO: Replace with closed-form truncated lognormal expectation when
 *       variance tracking is well-calibrated.
 */
export function expectedPurchaseQuantity(
    meanWealth: number,
    _wealthVariance: number,
    foodPrice: number,
    desiredPurchase: number,
): number {
    if (foodPrice <= 0 || desiredPurchase <= 0) {
        return 0;
    }
    const affordableQuantity = meanWealth / foodPrice;
    return Math.min(desiredPurchase, Math.max(0, affordableQuantity));
}

// ---------------------------------------------------------------------------
// Main food market tick
// ---------------------------------------------------------------------------

/**
 * Execute the food market clearing for all planets.
 *
 * Must be called AFTER `updateAgentPricing` (so offers are set) and
 * AFTER intergenerational transfers (so dependents have wealth to spend).
 */
export function foodMarketTick(agents: Map<string, Agent>, planet: Planet): void {
    // --- Step 0: Collect per-agent offers ---
    const offers = collectOffers(agents, planet);

    const demography = planet.population.demography;

    // --- Step 2/3/4: Demand formation with liquidity constraint ---
    const demandRecords: DemandRecord[] = [];
    let aggregateDemand = 0;
    // Each household aims to hold `FOOD_BUFFER_TARGET_TICKS` worth of
    // consumption. The previous implementation multiplied this by 2,
    // effectively causing agents to target a 60‑day buffer even though
    // the constant is documented and used elsewhere as a 30‑day target.
    // That led to persistent hoarding and very large apparent buffer
    // percentages (e.g. 400%+) in the UI.  Use the single-target value
    // here so demand formation aligns with the rest of the model.
    const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

    // Use the volume-weighted average price from offers for demand formation
    const referencePrice = computeReferencePrice(offers, planet.priceLevel ?? 0.01);

    demography.forEach((cohort, age) =>
        forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            const pop = category.total;
            if (pop <= 0) {
                return;
            }
            const fb = category;
            const wm = category.wealth;

            const foodStockPerPerson = fb.foodStock / pop;
            const desiredPurchasePerPerson = Math.max(0, foodTargetPerPerson - foodStockPerPerson);
            const effectiveDemandPerPerson = expectedPurchaseQuantity(
                wm.mean,
                wm.variance,
                referencePrice,
                desiredPurchasePerPerson,
            );
            const effectiveDemandTotal = effectiveDemandPerPerson * pop;

            if (effectiveDemandTotal > 0) {
                demandRecords.push({
                    age,
                    edu,
                    occ,
                    skill,
                    population: pop,
                    effectiveDemand: effectiveDemandTotal,
                    wealthMoments: wm,
                });
                aggregateDemand += effectiveDemandTotal;
            }
        }),
    );

    // --- Step 5: Merit-order clearing (cheapest offers first) ---
    // Sort offers by price ascending
    offers.sort((a, b) => a.price - b.price);

    let remainingDemand = aggregateDemand;
    let totalRevenue = 0;
    let totalFoodSold = 0;

    for (const offer of offers) {
        if (remainingDemand <= 0) {
            break;
        }
        const filledQuantity = Math.min(offer.quantity, remainingDemand);
        offer.sold = filledQuantity;
        offer.revenue = filledQuantity * offer.price;
        remainingDemand -= filledQuantity;
        totalRevenue += offer.revenue;
        totalFoodSold += filledQuantity;
    }

    // --- Step 6 & 7: Financial settlement + wealth update ---
    // Use centralised debitFoodPurchase so that householdDeposits is
    // decremented by the *actual* wealth removed from each cell (after
    // the Math.max(0,…) floor clamp), keeping the two values in sync.
    const bank = planet.bank;

    // Distribute purchased food to households and reduce wealth
    let totalActualDebit = 0;
    if (totalFoodSold > 0 && aggregateDemand > 0) {
        const fillRatio = Math.min(1, totalFoodSold / aggregateDemand);
        const avgPricePaid = totalRevenue / totalFoodSold;

        for (const record of demandRecords) {
            const quantityReceived = record.effectiveDemand * fillRatio;
            if (quantityReceived <= 0) {
                continue;
            }
            const cost = quantityReceived * avgPricePaid;
            const perPersonCost = cost / record.population;

            const category = demography[record.age][record.occ][record.edu][record.skill];
            category.foodStock += quantityReceived;

            // debitFoodPurchase tracks the actual amount removed (respecting
            // the zero floor) and decrements householdDeposits accordingly.
            totalActualDebit += debitFoodPurchase(bank, category, perPersonCost);
        }
    }

    // Agent revenue: distribute the actual amount paid by households
    // (totalActualDebit) to agents proportionally by their share of
    // the total revenue.  This ensures monetary conservation: the
    // total firm deposit increase equals the total household deposit decrease.
    const agentRevenueScale = totalRevenue > 0 ? totalActualDebit / totalRevenue : 0;

    for (const offer of offers) {
        if (offer.sold <= 0) {
            continue;
        }
        const agentRevenue = offer.revenue * agentRevenueScale;
        offer.agent.assets[planet.id].deposits += agentRevenue;

        // Remove sold food from the agent's storage
        removeFromStorageFacility(
            offer.agent.assets[planet.id]?.storageFacility,
            agriculturalProductResourceType.name,
            offer.sold,
        );

        // Record lastSold for the pricing AI
        const assets = offer.agent.assets[planet.id];
        if (assets) {
            if (!assets.foodMarket) {
                assets.foodMarket = {};
            }
            assets.foodMarket.lastSold = offer.sold;
        }
    }

    // Record lastSold = 0 for agents that had offers but sold nothing
    for (const offer of offers) {
        if (offer.sold <= 0) {
            const assets = offer.agent.assets[planet.id];
            if (assets) {
                if (!assets.foodMarket) {
                    assets.foodMarket = {};
                }
                if (assets.foodMarket.lastSold === undefined) {
                    assets.foodMarket.lastSold = 0;
                }
            }
        }
    }

    // --- Step 8: Update volume-weighted average price ---
    if (totalFoodSold > 0) {
        planet.priceLevel = totalRevenue / totalFoodSold;
    }
    // If nothing was sold, keep the previous price (or initial)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect per-agent food offers from all agents on a planet.
 *
 * Each food-producing agent's `foodOfferPrice` and `foodOfferQuantity`
 * (set by `updateAgentPricing`) become an offer.  If pricing has not
 * been run yet, the agent bootstraps with INITIAL_FOOD_PRICE and its
 * full storage quantity.
 */
function collectOffers(agents: Map<string, Agent>, planet: Planet): MarketOffer[] {
    const offers: MarketOffer[] = [];

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        // Check if agent produces food
        const hasFoodProduction = assets.productionFacilities.some((f) =>
            f.produces.some((p) => p.resource.name === agriculturalProductResourceType.name),
        );
        if (!hasFoodProduction) {
            return;
        }

        const price = assets.foodMarket?.offerPrice ?? INITIAL_FOOD_PRICE;
        const quantity = assets.foodMarket?.offerQuantity ?? 0;

        if (quantity > 0) {
            offers.push({
                agent,
                price,
                quantity,
                sold: 0,
                revenue: 0,
            });
        }

        // Record the food currently in storage as "produced" for the pricing AI
        // (This captures both newly produced and carried-over inventory)
        if (!assets.foodMarket) {
            assets.foodMarket = {};
        }
    });

    return offers;
}

/**
 * Compute a reference price for household demand formation.
 *
 * Uses the quantity-weighted average of offer prices.  Falls back to
 * the last known market price if there are no offers.
 */
function computeReferencePrice(offers: MarketOffer[], fallbackPrice: number): number {
    let totalQty = 0;
    let weightedPrice = 0;
    for (const offer of offers) {
        weightedPrice += offer.price * offer.quantity;
        totalQty += offer.quantity;
    }
    if (totalQty > 0) {
        return weightedPrice / totalQty;
    }
    return fallbackPrice;
}
