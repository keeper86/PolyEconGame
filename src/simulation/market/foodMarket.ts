import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK, INITIAL_FOOD_PRICE } from '../constants';
import { agriculturalProductResourceType, removeFromStorageFacility } from '../planet/facilities';
import type { Agent, FoodMarketResult, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import type { GaussianMoments, Occupation, PopulationCategoryIndex, Skill } from '../population/population';
import { forEachPopulationCohort } from '../population/population';
import { debitFoodPurchase } from '../financial/wealthOps';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A household cohort-cell's bid order on the food market. */
interface BidOrder {
    age: number;
    edu: EducationLevelType;
    occ: Occupation;
    skill: Skill;
    population: number;
    /** Reservation price (currency / ton). */
    bidPrice: number;
    /** Quantity demanded (tons). */
    quantity: number;
    /** Wealth moments for settlement. */
    wealthMoments: GaussianMoments;
}

/** A food-producing agent's ask order on the food market. */
interface AskOrder {
    agent: Agent;
    /** Ask price (currency / ton). */
    askPrice: number;
    /** Quantity offered (tons). */
    quantity: number;
    /** Filled so far during matching (tons). */
    filled: number;
    /** Revenue accumulated during matching (currency). */
    revenue: number;
}

/** An executed trade record. */
interface TradeRecord {
    /** Trade price = ask price (seller-price convention). */
    price: number;
    /** Tons traded. */
    quantity: number;
}

// ---------------------------------------------------------------------------
// Exported helper (used by tests & external demand-estimation callers)
// ---------------------------------------------------------------------------

/**
 * Compute the effective food demand quantity for a cohort-cell, applying the
 * liquidity constraint: a household cannot spend more than it has.
 *
 * Uses a mean-field approximation (all members have exactly `meanWealth`).
 * This is exact when `wealthVariance = 0` and is a sound first-order
 * approximation otherwise.
 *
 * @param meanWealth       Per-capita mean wealth of the cell.
 * @param _wealthVariance  (Reserved) per-capita wealth variance — not used yet.
 * @param foodPrice        Reference price per ton.
 * @param desiredPurchase  Tons the cell wants to buy before the liquidity cap.
 * @returns Effective demand in tons (≥ 0).
 */
export function expectedPurchaseQuantity(
    meanWealth: number,
    index: PopulationCategoryIndex,
    foodPrice: number,
    desiredPurchase: number,
): number {
    // Defensive guards: reject non-finite inputs early. Comparisons with NaN
    // are always false, so NaN would slip through the original checks and
    // produce NaN outputs that later break the matching loop.
    if (!Number.isFinite(foodPrice) || !Number.isFinite(desiredPurchase) || foodPrice <= 0 || desiredPurchase <= 0) {
        console.log('warn: invalid inputs to expectedPurchaseQuantity', {
            meanWealth,
            index,
            foodPrice,
            desiredPurchase,
        });
        return 0;
    }
    if (!Number.isFinite(meanWealth) || meanWealth < 0) {
        console.log('warn: invalid meanWealth in expectedPurchaseQuantity', { meanWealth, index });
        return 0;
    }

    const affordableQuantity = meanWealth / foodPrice;
    if (!Number.isFinite(affordableQuantity)) {
        console.log('warn: non-finite affordableQuantity in expectedPurchaseQuantity', {
            meanWealth,
            foodPrice,
            affordableQuantity,
        });
        return 0;
    }

    return Math.min(desiredPurchase, Math.max(0, affordableQuantity));
}

// ---------------------------------------------------------------------------
// Main food market tick
// ---------------------------------------------------------------------------

/**
 * Execute the food market clearing for a single planet.
 *
 * Must be called AFTER `updateAgentPricing` (so agent offers are set) and
 * AFTER intergenerational transfers (so dependents have wealth to spend).
 */
export function foodMarketTick(agents: Map<string, Agent>, planet: Planet): void {
    // ------------------------------------------------------------------
    // Step 1: Collect ask orders from food-producing agents
    // ------------------------------------------------------------------
    const askOrders = collectAskOrders(agents, planet);
    const totalSupply = askOrders.reduce((s, a) => s + a.quantity, 0);

    for (const ask of askOrders) {
        const fm = ask.agent.assets[planet.id]?.foodMarket;
        if (fm) {
            fm.lastSold = 0;
            fm.lastRevenue = 0;
        }
    }

    // ------------------------------------------------------------------
    // Steps 2–3: Form bid orders from household cohort-cells
    // ------------------------------------------------------------------
    // Use planet.priceLevel as reference price (the VWAP from the last cleared
    // tick).  This is a stable, bias-free anchor for demand formation and
    // avoids distortion from very high-priced asks that are unlikely to trade.
    const referencePrice = planet.priceLevel ?? INITIAL_FOOD_PRICE;
    const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
    const demography = planet.population.demography;

    const bidOrders: BidOrder[] = [];
    let totalDemand = 0;

    demography.forEach((cohort, age) =>
        forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            const pop = category.total;
            if (pop <= 0) {
                return;
            }

            const wm = category.wealth;
            if (wm.mean < 0 || !Number.isFinite(wm.mean)) {
                throw new Error(
                    `Invalid mean wealth for cohort category: age=${age} occ=${occ} edu=${edu} skill=${skill} meanWealth=${wm.mean}`,
                );
            }
            const foodStockPerPerson = category.foodStock / pop;
            const desiredPerPerson = Math.max(0, foodTargetPerPerson - foodStockPerPerson);
            if (desiredPerPerson <= 0) {
                return;
            }

            // Liquidity constraint: how much can the cell actually afford?
            const effectiveDemandPerPerson = expectedPurchaseQuantity(
                wm.mean,
                { occ, edu, skill, age },
                referencePrice,
                desiredPerPerson,
            );
            const effectiveDemandTotal = effectiveDemandPerPerson * pop;
            // Guard against NaN/Infinity slipping through — skip invalid demand
            // that would otherwise produce NaNs in matching and cause
            // infinite loops.
            if (!Number.isFinite(effectiveDemandTotal) || effectiveDemandTotal < 0) {
                console.log('warn: non-finite effectiveDemandTotal in foodMarketTick', {
                    age,
                    edu,
                    occ,
                    skill,
                    effectiveDemandPerPerson,
                    effectiveDemandTotal,
                });
                return;
            }

            // Reservation price: the cell is willing to spend its entire per-capita
            // wealth to fill the desired buffer — wealthier cells bid higher.
            // Guard against zero desiredPerPerson (already checked above) and
            // zero wealth (bid price = 0, which will never be matched against a
            // positive ask, correctly preventing purchase).
            const bidPrice = desiredPerPerson > 0 ? wm.mean / desiredPerPerson : 0;

            bidOrders.push({
                age,
                edu,
                occ,
                skill,
                population: pop,
                bidPrice,
                quantity: effectiveDemandTotal,
                wealthMoments: wm,
            });
            totalDemand += effectiveDemandTotal;
        }),
    );

    // ------------------------------------------------------------------
    // Step 4: Build sorted order books
    //   bidBook  → descending  (highest reservation price first)
    //   askBook  → ascending   (lowest ask first)
    // ------------------------------------------------------------------
    bidOrders.sort((a, b) => b.bidPrice - a.bidPrice);
    askOrders.sort((a, b) => a.askPrice - b.askPrice);

    // ------------------------------------------------------------------
    // Step 5: Price-priority matching
    //   Trade while highestBid >= lowestAsk.
    //   Trade price = ask price (seller-price convention).
    // ------------------------------------------------------------------

    // Minimum meaningful trade quantity (tons).  Remaining quantities below
    // this threshold are treated as fully exhausted to prevent infinite loops
    // from IEEE 754 floating-point drift where subtraction never quite reaches
    // exactly 0 (e.g. 1e-14 remaining after many small fills).
    const QUANTITY_EPSILON = 1e-9;

    const trades: TradeRecord[] = [];

    // Working indices into the sorted books
    let bidIdx = 0;
    let askIdx = 0;

    // Mutable remaining quantities for the current head order on each side
    let bidRemaining = bidOrders.length > 0 ? bidOrders[0].quantity : 0;
    let askRemaining = askOrders.length > 0 ? askOrders[0].quantity : 0;

    // Per-bid fill tracking (parallel array indexed by bidIdx).
    // Use map so we derive the tracking array from the actual bids array
    // (defensive against invalid numeric `length` values that would make
    // `new Array(len)` throw a RangeError).
    const bidFilled: number[] = bidOrders.map(() => 0);

    while (bidIdx < bidOrders.length && askIdx < askOrders.length) {
        const bid = bidOrders[bidIdx];
        const ask = askOrders[askIdx];

        // Defensive: if remaining quantities become non-finite break out
        // to avoid an infinite loop that repeatedly pushes into `trades`.
        if (!Number.isFinite(bidRemaining) || !Number.isFinite(askRemaining)) {
            console.warn('foodMarketTick: non-finite remaining quantities', {
                bidIdx,
                askIdx,
                bidOrdersLength: bidOrders.length,
                askOrdersLength: askOrders.length,
                bidRemaining,
                askRemaining,
            });
            break;
        }

        if (bid.bidPrice < ask.askPrice) {
            break; // No more profitable matches
        }

        const tradeQty = Math.min(bidRemaining, askRemaining);

        if (!Number.isFinite(tradeQty)) {
            console.warn('foodMarketTick: invalid tradeQty computed', {
                bidIdx,
                askIdx,
                bidRemaining,
                askRemaining,
                tradeQty,
            });
            break;
        }

        // Skip dust quantities — advance the exhausted side and continue
        if (tradeQty < QUANTITY_EPSILON) {
            if (bidRemaining <= askRemaining) {
                bidIdx++;
                bidRemaining = bidIdx < bidOrders.length ? bidOrders[bidIdx].quantity : 0;
            } else {
                askIdx++;
                askRemaining = askIdx < askOrders.length ? askOrders[askIdx].quantity : 0;
            }
            continue;
        }

        const tradePrice = ask.askPrice;

        try {
            trades.push({ price: tradePrice, quantity: tradeQty });
        } catch (e) {
            // Defensive diagnostics: if an Array operation throws a RangeError
            // we'll log the surrounding state and break out of matching to
            // avoid crashing the worker. This should help identify the root
            // cause in production runs.
            if (e instanceof RangeError) {
                console.error('foodMarketTick: RangeError pushing to trades', {
                    tradesLength: trades.length,
                    bidIdx,
                    askIdx,
                    bidOrdersLength: bidOrders.length,
                    askOrdersLength: askOrders.length,
                    bidRemaining,
                    askRemaining,
                    tradeQty,
                });
                break;
            }
            throw e;
        }
        ask.filled += tradeQty;
        ask.revenue += tradeQty * tradePrice;

        // Defensive guard: ensure we don't accidentally expand `bidFilled`
        // to an invalid length (which can throw RangeError). If this
        // condition fires something has gone wrong with the matching
        // indices; break out to avoid crashing the worker and surface a
        // useful debug message.
        if (bidIdx < 0 || bidIdx >= bidFilled.length) {
            console.warn('foodMarketTick: bidIdx out of range', {
                bidIdx,
                bidOrdersLength: bidOrders.length,
                bidFilledLength: bidFilled.length,
            });
            break;
        }

        bidFilled[bidIdx] += tradeQty;

        bidRemaining -= tradeQty;
        askRemaining -= tradeQty;

        if (bidRemaining < QUANTITY_EPSILON) {
            bidIdx++;
            bidRemaining = bidIdx < bidOrders.length ? bidOrders[bidIdx].quantity : 0;
        }
        if (askRemaining < QUANTITY_EPSILON) {
            askIdx++;
            askRemaining = askIdx < askOrders.length ? askOrders[askIdx].quantity : 0;
        }
    }

    // ------------------------------------------------------------------
    // Step 6: Settlement
    // ------------------------------------------------------------------
    const totalFoodSold = trades.reduce((s, t) => s + t.quantity, 0);
    const totalRevenue = trades.reduce((s, t) => s + t.price * t.quantity, 0);

    // 6a. Household settlement — distribute food and debit wealth
    let totalActualDebit = 0;
    for (let i = 0; i < bidOrders.length; i++) {
        const filled = bidFilled[i];
        if (filled <= 0) {
            continue;
        }

        const record = bidOrders[i];
        const category = demography[record.age][record.occ][record.edu][record.skill];

        // Determine the weighted-average price paid by this bid
        // We charge the bid at the average ask price of the fills it received.
        // Since each bid was filled at successive ask prices (seller-price
        // convention), we use the overall VWAP as a practical simplification —
        // this keeps settlement O(n) and remains money-conserving when scaled.
        const avgAskPrice = totalFoodSold > 0 ? totalRevenue / totalFoodSold : 0;
        const cost = filled * avgAskPrice;
        const perPersonCost = cost / record.population;

        category.foodStock += filled;
        totalActualDebit += debitFoodPurchase(planet.bank, category, perPersonCost);
    }

    // 6b. Agent settlement — credit revenue and remove inventory
    const agentRevenueScale = totalRevenue > 0 ? totalActualDebit / totalRevenue : 0;

    for (const ask of askOrders) {
        const assets = ask.agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        // Ensure foodMarket state exists
        if (!assets.foodMarket) {
            assets.foodMarket = {};
        }

        if (ask.filled <= 0) {
            // lastSold was already reset to 0 at tick start — nothing to do.
            continue;
        }

        // Scale agent revenue so that total agent credits = total household debits
        // (monetary conservation even under the per-capita wealth floor clamp).
        const scaledRevenue = ask.revenue * agentRevenueScale;
        assets.deposits += scaledRevenue;

        // Remove sold food from agent storage
        removeFromStorageFacility(assets.storageFacility, agriculturalProductResourceType.name, ask.filled);

        // Persist for pricing AI
        assets.foodMarket.lastSold = ask.filled;
        assets.foodMarket.lastRevenue = scaledRevenue;
    }

    // ------------------------------------------------------------------
    // Step 7: Update planet price level (VWAP of all trades)
    // ------------------------------------------------------------------
    if (totalFoodSold > 0) {
        planet.priceLevel = totalRevenue / totalFoodSold;
    }
    // If nothing was sold, keep the previous price (or initial default).

    // ------------------------------------------------------------------
    // Step 8: Persist market result snapshot
    // ------------------------------------------------------------------
    const unsoldSupply = askOrders.reduce((s, a) => s + (a.quantity - a.filled), 0);
    const unfilledDemand = Math.max(0, totalDemand - totalFoodSold);

    const result: FoodMarketResult = {
        clearingPrice: totalFoodSold > 0 ? totalRevenue / totalFoodSold : (planet.priceLevel ?? INITIAL_FOOD_PRICE),
        totalVolume: totalFoodSold,
        totalDemand,
        totalSupply,
        unfilledDemand,
        unsoldSupply,
    };
    planet.lastFoodMarketResult = result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect ask orders from all food-producing agents on the planet.
 *
 * The offer price and quantity are set by `updateAgentPricing`.
 * If pricing has not been run yet the agent bootstraps with
 * `INITIAL_FOOD_PRICE` and its full storage quantity.
 */
function collectAskOrders(agents: Map<string, Agent>, planet: Planet): AskOrder[] {
    const orders: AskOrder[] = [];

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        const hasFoodProduction = assets.productionFacilities.some((f) =>
            f.produces.some((p) => p.resource.name === agriculturalProductResourceType.name),
        );
        if (!hasFoodProduction) {
            return;
        }

        const price = assets.foodMarket?.offerPrice ?? INITIAL_FOOD_PRICE;
        const quantity = assets.foodMarket?.offerQuantity ?? 0;

        // Ensure the foodMarket state object exists for later writes
        if (!assets.foodMarket) {
            assets.foodMarket = {};
        }

        if (quantity > 0) {
            orders.push({
                agent,
                askPrice: price,
                quantity,
                filled: 0,
                revenue: 0,
            });
        }
    });

    return orders;
}
