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
import { agriculturalProductResourceType, removeFromStorageFacility } from '../facilities';
import { addAgentDepositsForPlanet } from '../financial/depositHelpers';
import type { Agent, EducationLevelType, GameState, Occupation, Planet, WealthMoments } from '../planet';
import { educationLevelKeys, OCCUPATIONS } from '../planet';
import { updateStarvationLevel } from '../population/nutrition';
import { getWealthDemography } from '../population/populationHelpers';
import { ensureFoodMarket, expectedPurchaseQuantity, getFoodBufferDemography } from './foodMarketHelpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-cohort-class demand record used during market clearing. */
interface DemandRecord {
    age: number;
    edu: EducationLevelType;
    occ: Occupation;
    population: number;
    effectiveDemand: number; // total tons demanded by this cell
    wealthMoments: WealthMoments;
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
// Main food market tick
// ---------------------------------------------------------------------------

/**
 * Execute the food market clearing for all planets.
 *
 * Must be called AFTER `updateAgentPricing` (so offers are set) and
 * BEFORE intergenerational transfers.
 */
export function foodMarketTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        // --- Step 0: Collect per-agent offers ---
        const offers = collectOffers(gameState, planet);

        const demography = planet.population.demography;
        const wealthDemography = getWealthDemography(planet.population);
        const foodBuffers = getFoodBufferDemography(foodMarket, planet.population);

        // --- Step 1: Household consumption (deplete food stock) ---
        let totalConsumptionRequirement = 0;
        let totalActualConsumption = 0;

        for (let age = 0; age < demography.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    const pop = demography[age][edu][occ];
                    if (pop <= 0) {
                        continue;
                    }
                    const fb = foodBuffers[age][edu][occ];
                    const consumptionReq = pop * FOOD_PER_PERSON_PER_TICK;
                    totalConsumptionRequirement += consumptionReq;

                    const totalStock = fb.foodStock * pop;
                    const actualConsumption = Math.min(totalStock, consumptionReq);
                    fb.foodStock = pop > 0 ? Math.max(0, (totalStock - actualConsumption) / pop) : 0;
                    totalActualConsumption += actualConsumption;
                }
            }
        }

        // --- Step 2/3/4: Demand formation with liquidity constraint ---
        const demandRecords: DemandRecord[] = [];
        let aggregateDemand = 0;
        const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        // Use the volume-weighted average price from offers for demand formation
        const referencePrice = computeReferencePrice(offers, foodMarket.foodPrice);

        for (let age = 0; age < demography.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    const pop = demography[age][edu][occ];
                    if (pop <= 0) {
                        continue;
                    }
                    const fb = foodBuffers[age][edu][occ];
                    const wm = wealthDemography[age][edu][occ];

                    const desiredPurchasePerPerson = Math.max(0, foodTargetPerPerson - fb.foodStock);
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
                            population: pop,
                            effectiveDemand: effectiveDemandTotal,
                            wealthMoments: wm,
                        });
                        aggregateDemand += effectiveDemandTotal;
                    }
                }
            }
        }

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

        // --- Step 6: Distribute purchased food to households ---
        // Allocate proportionally among demand records based on what was sold
        if (totalFoodSold > 0 && aggregateDemand > 0) {
            const fillRatio = Math.min(1, totalFoodSold / aggregateDemand);
            // Compute the effective average price paid
            const avgPricePaid = totalRevenue / totalFoodSold;

            for (const record of demandRecords) {
                const quantityReceived = record.effectiveDemand * fillRatio;
                if (quantityReceived <= 0) {
                    continue;
                }
                const cost = quantityReceived * avgPricePaid;
                const perPersonQuantity = quantityReceived / record.population;
                const perPersonCost = cost / record.population;

                // Update food buffer
                const fb = foodBuffers[record.age][record.edu][record.occ];
                fb.foodStock += perPersonQuantity;

                // Update household wealth moments (subtract purchase cost)
                const wm = wealthDemography[record.age][record.edu][record.occ];
                wealthDemography[record.age][record.edu][record.occ] = {
                    mean: Math.max(0, wm.mean - perPersonCost),
                    variance: wm.variance,
                };
            }
        }

        // --- Step 7: Financial settlement ---
        // Debit household deposits
        const bank = planet.bank;
        const actualHouseholdDebit = Math.min(totalRevenue, bank.householdDeposits);
        bank.householdDeposits -= actualHouseholdDebit;

        // Credit each agent's deposits and remove sold food from storage
        // Scale agent revenue proportionally if household deposits were insufficient
        const revenueScale = totalRevenue > 0 ? actualHouseholdDebit / totalRevenue : 0;

        for (const offer of offers) {
            if (offer.sold <= 0) {
                continue;
            }
            const agentRevenue = offer.revenue * revenueScale;
            addAgentDepositsForPlanet(offer.agent, planet.id, agentRevenue);

            // Remove sold food from the agent's storage
            removeFromStorageFacility(
                offer.agent.assets[planet.id]?.storageFacility,
                agriculturalProductResourceType.name,
                offer.sold,
            );

            // Record lastFoodSold for the pricing AI
            const assets = offer.agent.assets[planet.id];
            if (assets) {
                assets.lastFoodSold = offer.sold;
            }
        }

        // Record lastFoodProduced → lastFoodSold = 0 for agents that had offers but sold nothing
        for (const offer of offers) {
            if (offer.sold <= 0) {
                const assets = offer.agent.assets[planet.id];
                if (assets && assets.lastFoodSold === undefined) {
                    assets.lastFoodSold = 0;
                }
            }
        }

        // --- Step 8: Update volume-weighted average price ---
        if (totalFoodSold > 0) {
            foodMarket.foodPrice = totalRevenue / totalFoodSold;
        }
        // If nothing was sold, keep the previous price (or initial)

        // --- Step 9: Update starvation level ---
        const nutritionalFactor =
            totalConsumptionRequirement > 0 ? totalActualConsumption / totalConsumptionRequirement : 1;
        planet.population.starvationLevel = updateStarvationLevel(planet.population.starvationLevel, nutritionalFactor);
    });
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
function collectOffers(gameState: GameState, planet: Planet): MarketOffer[] {
    const offers: MarketOffer[] = [];

    gameState.agents.forEach((agent) => {
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

        const price = assets.foodOfferPrice ?? INITIAL_FOOD_PRICE;
        const quantity = assets.foodOfferQuantity ?? 0;

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
        assets.lastFoodProduced = quantity;
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
