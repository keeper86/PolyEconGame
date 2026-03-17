import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK, INITIAL_FOOD_PRICE } from '../constants';
import { removeFromStorageFacility } from '../planet/facilities';
import type { Agent, MarketResult, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import type { GaussianMoments, Occupation, Skill } from '../population/population';
import { forEachPopulationCohort } from '../population/population';
import { debitConsumptionPurchase } from '../financial/wealthOps';
import type { Resource } from '../planet/facilities';
import { agriculturalProductResourceType } from '../planet/facilities';

// ---------------------------------------------------------------------------
// Internal order-book types
// ---------------------------------------------------------------------------

/** A household cohort-cell's bid order on a single resource's market. */
interface BidOrder {
    age: number;
    edu: EducationLevelType;
    occ: Occupation;
    skill: Skill;
    population: number;
    /** Reservation price (currency / unit). */
    bidPrice: number;
    /** Quantity demanded (units). */
    quantity: number;
    /** Wealth moments for settlement. */
    wealthMoments: GaussianMoments;
}

/** A selling agent's ask order on a single resource's market. */
interface AskOrder {
    agent: Agent;
    resource: Resource;
    /** Ask price (currency / unit). */
    askPrice: number;
    /** Quantity offered (units). */
    quantity: number;
    /** Filled so far during matching (units). */
    filled: number;
    /** Revenue accumulated during matching (currency). */
    revenue: number;
}

/** An executed trade record. */
interface TradeRecord {
    /** Trade price = ask price (seller-price convention). */
    price: number;
    /** Units traded. */
    quantity: number;
}

// ---------------------------------------------------------------------------
// Demand rule registry
// ---------------------------------------------------------------------------

/**
 * A demand rule maps a resource to a function that returns the desired
 * per-person quantity for a given cohort cell.
 */
type DemandRule = (params: {
    resource: Resource;
    population: number;
    wealthMeanPerPerson: number;
    inventoryPerPerson: number;
    referencePrice: number;
}) => {
    /** Per-person desired purchase quantity (>= 0). */
    quantity: number;
    /** Reservation price (currency / unit). */
    reservationPrice: number;
};

/** Registry of demand rules keyed by resource name. */
const demandRules = new Map<string, DemandRule>();

// ------------------------------------------------------------------
// Food (Agricultural Product) demand rule
// ------------------------------------------------------------------
const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

demandRules.set(agriculturalProductResourceType.name, ({ wealthMeanPerPerson, inventoryPerPerson, referencePrice }) => {
    const desiredPerPerson = Math.max(0, foodTargetPerPerson - inventoryPerPerson);
    if (desiredPerPerson <= 0) {
        return { quantity: 0, reservationPrice: 0 };
    }

    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        return { quantity: 0, reservationPrice: 0 };
    }
    if (!Number.isFinite(wealthMeanPerPerson) || wealthMeanPerPerson < 0) {
        return { quantity: 0, reservationPrice: 0 };
    }

    // Liquidity constraint: can't spend more than total wealth on food.
    const affordableQty = wealthMeanPerPerson / referencePrice;
    const effectiveQty = Math.min(desiredPerPerson, Math.max(0, affordableQty));

    if (!Number.isFinite(effectiveQty) || effectiveQty < 0) {
        return { quantity: 0, reservationPrice: 0 };
    }

    // Reservation price: willing to spend entire per-capita wealth to reach buffer.
    const reservationPrice = desiredPerPerson > 0 ? wealthMeanPerPerson / desiredPerPerson : 0;

    return { quantity: effectiveQty, reservationPrice };
});

/**
 * Execute the spot market for every resource that has active ask orders
 * or a registered demand rule on a single planet.
 *
 * Must be called AFTER `updateAgentPricing` (so agent offers are set) and
 * AFTER intergenerational transfers (so dependents have wealth to spend).
 */
export function marketTick(agents: Map<string, Agent>, planet: Planet): void {
    // ------------------------------------------------------------------
    // Step 1: Collect ask orders, grouped by resource
    // ------------------------------------------------------------------
    const askBooks = collectAgentOffers(agents, planet);

    // Reset lastSold / lastRevenue at tick start
    for (const orders of askBooks.values()) {
        for (const ask of orders) {
            const offer = ask.agent.assets[planet.id]?.market?.sell[ask.resource.name];
            if (offer) {
                offer.lastSold = 0;
                offer.lastRevenue = 0;
            }
        }
    }

    // Determine all resources to process (currently, resources that have
    // active ask orders in the order book).
    const resourcesToClear = new Set<string>(askBooks.keys());

    // ------------------------------------------------------------------
    // Step 2: Build bid orders from household demography for each resource
    // ------------------------------------------------------------------
    const bidBooks = buildPopulationDemand(planet, resourcesToClear);

    // ------------------------------------------------------------------
    // Step 3: Per-resource clearing
    // ------------------------------------------------------------------
    for (const resourceName of resourcesToClear) {
        const askOrders = askBooks.get(resourceName) ?? [];
        const bidOrders = bidBooks.get(resourceName) ?? [];

        const totalSupply = askOrders.reduce((s, a) => s + a.quantity, 0);
        const totalDemand = bidOrders.reduce((s, b) => s + b.quantity, 0);

        if (askOrders.length === 0 || bidOrders.length === 0) {
            // No trades possible — persist zero-volume result and move on.
            const referencePrice =
                planet.marketPrices[resourceName] ??
                (resourceName === agriculturalProductResourceType.name ? INITIAL_FOOD_PRICE : 1);

            planet.lastMarketResult[resourceName] = {
                resourceName,
                clearingPrice: referencePrice,
                totalVolume: 0,
                totalDemand,
                totalSupply,
                unfilledDemand: totalDemand,
                unsoldSupply: totalSupply,
            };
            continue;
        }

        // ------------------------------------------------------------------
        // Sort order books
        // ------------------------------------------------------------------
        bidOrders.sort((a, b) => b.bidPrice - a.bidPrice);
        askOrders.sort((a, b) => a.askPrice - b.askPrice);

        // ------------------------------------------------------------------
        // Price-priority matching
        // ------------------------------------------------------------------
        const { trades, bidFilled } = clearOrderBook(bidOrders, askOrders);

        // ------------------------------------------------------------------
        // Settlement
        // ------------------------------------------------------------------
        const totalFoodSold = trades.reduce((s, t) => s + t.quantity, 0);
        const totalRevenue = trades.reduce((s, t) => s + t.price * t.quantity, 0);

        // Reconstruct per-bid realized costs
        const bidCosts = reconstructBidCosts(trades, bidFilled);

        // Household settlement
        const totalActualDebit = settleHouseholds(planet, resourceName, bidOrders, bidFilled, bidCosts);

        // Agent settlement
        settleAgents(planet, askOrders, totalRevenue, totalActualDebit);

        // Update VWAP price
        if (totalFoodSold > 0) {
            planet.marketPrices[resourceName] = totalRevenue / totalFoodSold;
        }

        // Persist result
        const unsoldSupply = askOrders.reduce((s, a) => s + (a.quantity - a.filled), 0);
        const unfilledDemand = Math.max(0, totalDemand - totalFoodSold);

        const result: MarketResult = {
            resourceName,
            clearingPrice:
                totalFoodSold > 0
                    ? totalRevenue / totalFoodSold
                    : (planet.marketPrices[resourceName] ??
                      (resourceName === agriculturalProductResourceType.name ? INITIAL_FOOD_PRICE : 1)),
            totalVolume: totalFoodSold,
            totalDemand,
            totalSupply,
            unfilledDemand,
            unsoldSupply,
        };
        planet.lastMarketResult[resourceName] = result;
    }
}

// ---------------------------------------------------------------------------
// Collect agent offers → Map<resourceName, AskOrder[]>
// ---------------------------------------------------------------------------

function collectAgentOffers(agents: Map<string, Agent>, planet: Planet): Map<string, AskOrder[]> {
    const books = new Map<string, AskOrder[]>();

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.market) {
            return;
        }

        for (const [resourceName, offer] of Object.entries(assets.market.sell)) {
            const qty = offer.offerQuantity ?? 0;
            if (qty <= 0) {
                continue;
            }
            let book = books.get(resourceName);
            if (!book) {
                book = [];
                books.set(resourceName, book);
            }
            book.push({
                agent,
                resource: offer.resource,
                askPrice: offer.offerPrice ?? INITIAL_FOOD_PRICE,
                quantity: qty,
                filled: 0,
                revenue: 0,
            });
        }
    });

    return books;
}

// ---------------------------------------------------------------------------
// Build population demand → Map<resourceName, BidOrder[]>
// ---------------------------------------------------------------------------

function buildPopulationDemand(planet: Planet, resources: Set<string>): Map<string, BidOrder[]> {
    const books = new Map<string, BidOrder[]>();

    for (const resourceName of resources) {
        const rule = demandRules.get(resourceName);
        if (!rule) {
            continue;
        }

        const referencePrice = planet.marketPrices[resourceName] ?? INITIAL_FOOD_PRICE;
        const bidOrders: BidOrder[] = [];

        planet.population.demography.forEach((cohort, age) =>
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

                const inventoryPerPerson = (category.inventory[resourceName] ?? 0) / pop;

                const { quantity: qtyPerPerson, reservationPrice } = rule({
                    resource: { name: resourceName } as Resource,
                    population: pop,
                    wealthMeanPerPerson: wm.mean,
                    inventoryPerPerson,
                    referencePrice,
                });

                const totalQty = qtyPerPerson * pop;

                if (!Number.isFinite(totalQty) || totalQty < 0) {
                    console.log('warn: non-finite totalQty in buildPopulationDemand', {
                        age,
                        edu,
                        occ,
                        skill,
                        resourceName,
                        qtyPerPerson,
                        totalQty,
                    });
                    return;
                }

                if (totalQty <= 0) {
                    return;
                }

                bidOrders.push({
                    age,
                    edu,
                    occ,
                    skill,
                    population: pop,
                    bidPrice: reservationPrice,
                    quantity: totalQty,
                    wealthMoments: wm,
                });
            }),
        );

        if (bidOrders.length > 0) {
            books.set(resourceName, bidOrders);
        }
    }

    return books;
}

// ---------------------------------------------------------------------------
// Price-priority order book matching
// ---------------------------------------------------------------------------

/** Minimum meaningful trade quantity.  Below this threshold a remaining
 *  order side is treated as exhausted (IEEE 754 drift guard). */
const QUANTITY_EPSILON = 1e-9;

interface ClearResult {
    trades: TradeRecord[];
    /** Fill amount per bid order (parallel array indexed by bid index). */
    bidFilled: number[];
}

function clearOrderBook(bidOrders: BidOrder[], askOrders: AskOrder[]): ClearResult {
    const trades: TradeRecord[] = [];
    const bidFilled: number[] = bidOrders.map(() => 0);

    let bidIdx = 0;
    let askIdx = 0;
    let bidRemaining = bidOrders.length > 0 ? bidOrders[0].quantity : 0;
    let askRemaining = askOrders.length > 0 ? askOrders[0].quantity : 0;

    while (bidIdx < bidOrders.length && askIdx < askOrders.length) {
        const bid = bidOrders[bidIdx];
        const ask = askOrders[askIdx];

        if (!Number.isFinite(bidRemaining) || !Number.isFinite(askRemaining)) {
            console.warn('clearOrderBook: non-finite remaining quantities', {
                bidIdx,
                askIdx,
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
            console.warn('clearOrderBook: invalid tradeQty computed', { bidIdx, askIdx, bidRemaining, askRemaining });
            break;
        }

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
        trades.push({ price: tradePrice, quantity: tradeQty });

        ask.filled += tradeQty;
        ask.revenue += tradeQty * tradePrice;

        if (bidIdx < 0 || bidIdx >= bidFilled.length) {
            console.warn('clearOrderBook: bidIdx out of range', { bidIdx, bidFilledLength: bidFilled.length });
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

    return { trades, bidFilled };
}

// ---------------------------------------------------------------------------
// Bid cost reconstruction (two-pass settlement helper)
// ---------------------------------------------------------------------------

function reconstructBidCosts(trades: TradeRecord[], bidFilled: number[]): number[] {
    const bidCosts: number[] = new Array(bidFilled.length).fill(0);
    let currentBidIndex = 0;
    while (currentBidIndex < bidFilled.length && bidFilled[currentBidIndex] <= 0) {
        currentBidIndex++;
    }
    let remainingForBid = currentBidIndex < bidFilled.length ? bidFilled[currentBidIndex] : 0;
    for (const trade of trades) {
        let remainingTradeQty = trade.quantity;
        while (remainingTradeQty > 0 && currentBidIndex < bidFilled.length) {
            if (remainingForBid <= 0) {
                currentBidIndex++;
                while (currentBidIndex < bidFilled.length && bidFilled[currentBidIndex] <= 0) {
                    currentBidIndex++;
                }
                if (currentBidIndex >= bidFilled.length) {
                    break;
                }
                remainingForBid = bidFilled[currentBidIndex];
            }
            const alloc = Math.min(remainingTradeQty, remainingForBid);
            bidCosts[currentBidIndex] += alloc * trade.price;
            remainingTradeQty -= alloc;
            remainingForBid -= alloc;
        }
    }
    return bidCosts;
}

// ---------------------------------------------------------------------------
// Settlement — households
// ---------------------------------------------------------------------------

function settleHouseholds(
    planet: Planet,
    resourceName: string,
    bidOrders: BidOrder[],
    bidFilled: number[],
    bidCosts: number[],
): number {
    const demography = planet.population.demography;
    let totalActualDebit = 0;

    for (let i = 0; i < bidOrders.length; i++) {
        const filled = bidFilled[i];
        if (filled <= 0) {
            continue;
        }

        const record = bidOrders[i];
        const category = demography[record.age][record.occ][record.edu][record.skill];

        const totalCostForBid = bidCosts[i];
        const perPersonCost = record.population > 0 ? totalCostForBid / record.population : 0;

        // Credit inventory for the cleared resource.
        category.inventory[resourceName] = (category.inventory[resourceName] ?? 0) + filled;

        totalActualDebit += debitConsumptionPurchase(planet.bank, category, perPersonCost);
    }

    return totalActualDebit;
}

// ---------------------------------------------------------------------------
// Settlement — agents
// ---------------------------------------------------------------------------

function settleAgents(planet: Planet, askOrders: AskOrder[], totalRevenue: number, totalActualDebit: number): void {
    const agentRevenueScale = totalRevenue > 0 ? totalActualDebit / totalRevenue : 0;

    for (const ask of askOrders) {
        const assets = ask.agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        if (!assets.market) {
            assets.market = { sell: {} };
        }

        if (ask.filled <= 0) {
            continue;
        }

        const scaledRevenue = ask.revenue * agentRevenueScale;
        assets.deposits += scaledRevenue;

        removeFromStorageFacility(assets.storageFacility, ask.resource.name, ask.filled);

        const offer = assets.market.sell[ask.resource.name];
        if (offer) {
            offer.lastSold = ask.filled;
            offer.lastRevenue = scaledRevenue;
        }
    }
}
