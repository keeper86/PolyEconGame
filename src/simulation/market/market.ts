import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK, INITIAL_FOOD_PRICE, TICKS_PER_YEAR } from '../constants';
import { putIntoStorageFacility, removeFromStorageFacility } from '../planet/storage';
import type { Agent, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import type { GaussianMoments, Occupation, Skill } from '../population/population';
import { forEachPopulationCohort } from '../population/population';
import { debitConsumptionPurchase } from '../financial/wealthOps';
import type { Resource } from '../planet/planet';
import {
    agriculturalProductResourceType,
    beverageResourceType,
    clothingResourceType,
    consumerElectronicsResourceType,
    furnitureResourceType,
    pharmaceuticalResourceType,
    processedFoodResourceType,
} from '../planet/resources';
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

/** A buying agent's bid order on a single resource's market. */
interface AgentBidOrder {
    agent: Agent;
    resource: Resource;
    /** Maximum price this agent will pay (currency / unit). */
    bidPrice: number;
    /** Quantity demanded (units). */
    quantity: number;
    /** Filled so far during matching (units). */
    filled: number;
    /** Total cost accumulated during matching (currency). */
    cost: number;
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
 * A demand rule returns the desired per-person purchase quantity and
 * reservation price for a cohort cell, given its *current* (post-prior-
 * settlement) wealth.  Because markets are cleared sequentially in
 * priority order and wealth is debited before moving to the next resource,
 * each rule sees only the wealth the cohort still has available.
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

const demandRules = new Map<string, DemandRule>();

// ------------------------------------------------------------------
// Food (Agricultural Product) — survival priority 1
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

    const affordableQty = wealthMeanPerPerson / referencePrice;
    const effectiveQty = Math.min(desiredPerPerson, Math.max(0, affordableQty));

    if (!Number.isFinite(effectiveQty) || effectiveQty < 0) {
        return { quantity: 0, reservationPrice: 0 };
    }

    const reservationPrice = desiredPerPerson > 0 ? wealthMeanPerPerson / desiredPerPerson : 0;
    return { quantity: effectiveQty, reservationPrice };
});

// ------------------------------------------------------------------
// Generic discretionary consumer-good demand rule factory.
//
// Households spend a fixed income share on each consumer good,
// capped by a per-person yearly quantity target.  Wealth passed in
// already reflects spending on higher-priority goods settled earlier
// this tick, so no scarcity suppression factor is needed.
//
// incomeSharePerTick  - fraction of remaining per-capita wealth spent
// yearlyQtyPerPerson  - physical cap on how much one person buys/year
// ------------------------------------------------------------------
function makeConsumerGoodRule(incomeSharePerTick: number, yearlyQtyPerPerson: number): DemandRule {
    const qtyPerTick = yearlyQtyPerPerson / TICKS_PER_YEAR;

    return ({ wealthMeanPerPerson, referencePrice }) => {
        if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }
        if (!Number.isFinite(wealthMeanPerPerson) || wealthMeanPerPerson <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        const budget = wealthMeanPerPerson * incomeSharePerTick;
        const affordableQty = budget / referencePrice;
        const effectiveQty = Math.min(qtyPerTick, affordableQty);

        if (effectiveQty <= 0) {
            return { quantity: 0, reservationPrice: 0 };
        }

        return { quantity: effectiveQty, reservationPrice: budget / effectiveQty };
    };
}

// Processed Food: secondary staple, strong demand (~0.5 t/person/year).
demandRules.set(processedFoodResourceType.name, makeConsumerGoodRule(0.003, 0.5));

// Beverages: moderate demand (~0.2 t/person/year).
demandRules.set(beverageResourceType.name, makeConsumerGoodRule(0.001, 0.2));

// Clothing: ~10 items/person/year (each ~0.001 t → 0.01 t/year).
demandRules.set(clothingResourceType.name, makeConsumerGoodRule(0.002, 0.01));

// Pharmaceuticals: low physical volume but steady demand.
demandRules.set(pharmaceuticalResourceType.name, makeConsumerGoodRule(0.001, 0.001));

// Furniture: durable good, slow turnover (~0.02 pieces/person/year).
demandRules.set(furnitureResourceType.name, makeConsumerGoodRule(0.001, 0.02));

// Consumer Electronics: ~0.1 pieces/person/year.
demandRules.set(consumerElectronicsResourceType.name, makeConsumerGoodRule(0.002, 0.1));

/**
 * Priority order for sequential household settlement.
 * Food is cleared and settled first; household wealth is debited before
 * discretionary bids are generated, so no cohort can over-commit.
 * Resources not in this list (agent-only markets) are cleared afterwards.
 */
const householdDemandPriority: string[] = [
    agriculturalProductResourceType.name,
    processedFoodResourceType.name,
    pharmaceuticalResourceType.name,
    beverageResourceType.name,
    clothingResourceType.name,
    furnitureResourceType.name,
    consumerElectronicsResourceType.name,
];

/**
 * Execute the spot market for every resource that has active ask orders
 * or a registered demand rule on a single planet.
 *
 * Household markets are cleared in priority order (food first).  Each
 * resource is fully settled — wealth debited from cohorts — before bids
 * for the next resource are generated.  This ensures no cohort can
 * over-commit wealth across multiple goods.
 *
 * Must be called AFTER `updateAgentPricing` (so agent offers are set) and
 * AFTER intergenerational transfers (so dependents have wealth to spend).
 */
export function marketTick(agents: Map<string, Agent>, planet: Planet): void {
    const askBooks = collectAgentOffers(agents, planet);

    for (const orders of askBooks.values()) {
        for (const ask of orders) {
            const offer = ask.agent.assets[planet.id]?.market?.sell[ask.resource.name];
            if (offer !== undefined) {
                offer.lastSold = 0;
                offer.lastRevenue = 0;
            }
        }
    }

    resetAgentBuyCounters(agents, planet);

    const agentBidBooks = collectAgentBids(agents, planet);

    // All resources that need a market result: household-priority goods first,
    // then any remaining agent-only markets.
    const agentOnlyResources = new Set<string>([...askBooks.keys(), ...agentBidBooks.keys()]);
    for (const name of householdDemandPriority) {
        agentOnlyResources.delete(name);
    }
    const resourceOrder: string[] = [...householdDemandPriority, ...agentOnlyResources];

    for (const resourceName of resourceOrder) {
        const askOrders = askBooks.get(resourceName) ?? [];
        // Household bids are built here, after all higher-priority goods have
        // already been settled, so wealth reflects remaining purchasing power.
        // Sort descending by bid price so that:
        //   1. binHouseholdBids produces deciles in price order (highest first),
        //   2. householdTrades from clearUnifiedBids are emitted in the same
        //      order as the householdBidFilled array, making reconstructBidCosts
        //      correctly attribute trade costs to each cohort.
        const householdBids = buildPopulationDemandForResource(planet, resourceName).sort(
            (a, b) => b.bidPrice - a.bidPrice,
        );
        const agentBids = agentBidBooks.get(resourceName) ?? [];

        const totalSupply = askOrders.reduce((s, a) => s + a.quantity, 0);
        const householdDemand = householdBids.reduce((s, b) => s + b.quantity, 0);
        const agentDemand = agentBids.reduce((s, b) => s + b.quantity, 0);
        const totalDemand = householdDemand + agentDemand;

        if (askOrders.length === 0 || (householdBids.length === 0 && agentBids.length === 0)) {
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
                populationBids: binHouseholdBids(householdBids, [], []),
            };
            continue;
        }

        askOrders.sort((a, b) => a.askPrice - b.askPrice);

        const askFilledBaseline = askOrders.map((a) => a.filled);
        const askRevenueBaseline = askOrders.map((a) => a.revenue);

        const { householdBidFilled, householdTrades, agentTrades } = clearUnifiedBids(
            householdBids,
            agentBids,
            askOrders,
        );

        const householdVolume = householdTrades.reduce((s: number, t: TradeRecord) => s + t.quantity, 0);
        const householdRevenue = householdTrades.reduce((s: number, t: TradeRecord) => s + t.price * t.quantity, 0);
        const agentVolume = agentTrades.reduce((s: number, t: TradeRecord) => s + t.quantity, 0);
        const agentRevenue = agentTrades.reduce((s: number, t: TradeRecord) => s + t.price * t.quantity, 0);

        const bidCosts = reconstructBidCosts(householdTrades, householdBidFilled);

        // Household bids are sized to remaining wealth, so settlement is
        // exact — no post-hoc scaling needed.
        settleHouseholds(planet, resourceName, householdBids, householdBidFilled, bidCosts);

        settleAgentBuyers(planet, agentBids, askOrders, askFilledBaseline, askRevenueBaseline);

        settleAgentSellers(planet, askOrders, askFilledBaseline, askRevenueBaseline);

        const totalVolume = householdVolume + agentVolume;
        const totalRevenue = householdRevenue + agentRevenue;
        if (totalVolume > 0) {
            planet.marketPrices[resourceName] = totalRevenue / totalVolume;
        }

        const unsoldSupply = askOrders.reduce((s, a) => s + (a.quantity - a.filled), 0);
        const unfilledDemand = Math.max(0, totalDemand - totalVolume);

        const referencePrice =
            planet.marketPrices[resourceName] ??
            (resourceName === agriculturalProductResourceType.name ? INITIAL_FOOD_PRICE : 1);

        planet.lastMarketResult[resourceName] = {
            resourceName,
            clearingPrice: totalVolume > 0 ? totalRevenue / totalVolume : referencePrice,
            totalVolume,
            totalDemand,
            totalSupply,
            unfilledDemand,
            unsoldSupply,
            populationBids: binHouseholdBids(householdBids, householdBidFilled, bidCosts),
        };
    }
}

// ---------------------------------------------------------------------------
// Helper to aggregate population bids for UI display
// ---------------------------------------------------------------------------

function binHouseholdBids(bids: BidOrder[], filled: number[], costs: number[]) {
    if (bids.length === 0) {
        return [];
    }
    let totalQty = 0;
    for (const b of bids) {
        totalQty += b.quantity;
    }
    if (totalQty === 0) {
        return [];
    }

    const binSize = totalQty / 10;
    const bins = [];

    let runningQty = 0;
    let group = { quantity: 0, filled: 0, cost: 0, priceSum: 0 };
    let binTarget = binSize;

    for (let i = 0; i < bids.length; i++) {
        const b = bids[i];
        group.quantity += b.quantity;
        group.filled += filled[i] ?? 0;
        group.cost += costs[i] ?? 0;
        group.priceSum += b.bidPrice * b.quantity;
        runningQty += b.quantity;

        if (runningQty >= binTarget || i === bids.length - 1) {
            if (group.quantity > 0) {
                bins.push({
                    bidPrice: group.priceSum / group.quantity,
                    quantity: group.quantity,
                    filled: group.filled,
                    cost: group.cost,
                });
            }
            binTarget += binSize;
            group = { quantity: 0, filled: 0, cost: 0, priceSum: 0 };
        }
    }
    return bins;
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
                offer.lastSold = 0;
                offer.lastRevenue = 0;
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
// Build population demand for a single resource, using current cohort wealth
// ---------------------------------------------------------------------------

function buildPopulationDemandForResource(planet: Planet, resourceName: string): BidOrder[] {
    const rule = demandRules.get(resourceName);
    if (!rule) {
        return [];
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
                console.log('warn: non-finite totalQty in buildPopulationDemandForResource', {
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

    return bidOrders;
}

// ---------------------------------------------------------------------------
// Price-priority order book matching
// ---------------------------------------------------------------------------

/** Minimum meaningful trade quantity.  Below this threshold a remaining
 *  order side is treated as exhausted (IEEE 754 drift guard). */
const QUANTITY_EPSILON = 1e-9;

interface UnifiedClearResult {
    householdTrades: TradeRecord[];
    agentTrades: TradeRecord[];
    /** Fill amount per household bid order (parallel array). */
    householdBidFilled: number[];
}

type MergedBid =
    | { kind: 'household'; index: number; bidPrice: number; quantity: number }
    | { kind: 'agent'; order: AgentBidOrder; bidPrice: number; quantity: number };

function clearUnifiedBids(
    householdBids: BidOrder[],
    agentBids: AgentBidOrder[],
    askOrders: AskOrder[],
): UnifiedClearResult {
    const householdTrades: TradeRecord[] = [];
    const agentTrades: TradeRecord[] = [];
    const householdBidFilled: number[] = householdBids.map(() => 0);

    const merged: MergedBid[] = [
        ...householdBids.map(
            (b, i): MergedBid => ({ kind: 'household', index: i, bidPrice: b.bidPrice, quantity: b.quantity }),
        ),
        ...agentBids.map((b): MergedBid => ({ kind: 'agent', order: b, bidPrice: b.bidPrice, quantity: b.quantity })),
    ];
    merged.sort((a, b) => b.bidPrice - a.bidPrice);

    let askIdx = 0;
    let askRemaining = askOrders.length > 0 ? askOrders[0].quantity - askOrders[0].filled : 0;

    for (const bid of merged) {
        let bidRemaining = bid.quantity;

        while (bidRemaining > QUANTITY_EPSILON && askIdx < askOrders.length) {
            const ask = askOrders[askIdx];
            const effectiveAskRemaining = ask.quantity - ask.filled;

            if (effectiveAskRemaining < QUANTITY_EPSILON) {
                askIdx++;
                askRemaining = askIdx < askOrders.length ? askOrders[askIdx].quantity - askOrders[askIdx].filled : 0;
                continue;
            }

            if (bid.bidPrice < ask.askPrice) {
                break;
            }

            const tradeQty = Math.min(bidRemaining, askRemaining);
            if (tradeQty < QUANTITY_EPSILON) {
                break;
            }

            const tradePrice = ask.askPrice;
            ask.filled += tradeQty;
            ask.revenue += tradeQty * tradePrice;
            bidRemaining -= tradeQty;
            askRemaining -= tradeQty;

            if (bid.kind === 'household') {
                householdTrades.push({ price: tradePrice, quantity: tradeQty });
                householdBidFilled[bid.index] += tradeQty;
            } else {
                agentTrades.push({ price: tradePrice, quantity: tradeQty });
                bid.order.filled += tradeQty;
                bid.order.cost += tradeQty * tradePrice;
            }

            if (askRemaining < QUANTITY_EPSILON) {
                askIdx++;
                askRemaining = askIdx < askOrders.length ? askOrders[askIdx].quantity - askOrders[askIdx].filled : 0;
            }
        }
    }

    return { householdTrades, agentTrades, householdBidFilled };
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
// Settlement — selling agents
// ---------------------------------------------------------------------------

function settleAgentSellers(
    planet: Planet,
    askOrders: AskOrder[],
    filledBaseline: number[],
    revenueBaseline: number[],
): void {
    for (let i = 0; i < askOrders.length; i++) {
        const ask = askOrders[i];
        const assets = ask.agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        if (!assets.market) {
            assets.market = { sell: {}, buy: {} };
        }

        const filledDelta = ask.filled - filledBaseline[i];
        if (filledDelta <= 0) {
            continue;
        }

        const revenueDelta = ask.revenue - revenueBaseline[i];

        assets.deposits += revenueDelta;
        removeFromStorageFacility(assets.storageFacility, ask.resource.name, filledDelta);

        const offer = assets.market.sell[ask.resource.name];
        if (offer) {
            offer.lastSold = (offer.lastSold ?? 0) + filledDelta;
            offer.lastRevenue = (offer.lastRevenue ?? 0) + revenueDelta;
        }
    }
}

// ---------------------------------------------------------------------------
// Collect agent buy orders → Map<resourceName, AgentBidOrder[]>
// ---------------------------------------------------------------------------

function collectAgentBids(agents: Map<string, Agent>, planet: Planet): Map<string, AgentBidOrder[]> {
    const books = new Map<string, AgentBidOrder[]>();

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.market?.buy) {
            return;
        }

        for (const [resourceName, bid] of Object.entries(assets.market.buy)) {
            const qty = bid.bidQuantity ?? 0;
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
                resource: bid.resource,
                bidPrice: bid.bidPrice ?? INITIAL_FOOD_PRICE,
                quantity: qty,
                filled: 0,
                cost: 0,
            });
        }
    });

    return books;
}

// ---------------------------------------------------------------------------
// Reset agent buy feedback counters at tick start
// ---------------------------------------------------------------------------

function resetAgentBuyCounters(agents: Map<string, Agent>, planet: Planet): void {
    agents.forEach((agent) => {
        const market = agent.assets[planet.id]?.market;
        if (!market?.buy) {
            return;
        }
        for (const bid of Object.values(market.buy)) {
            bid.lastBought = 0;
            bid.lastSpent = 0;
        }
    });
}

// ---------------------------------------------------------------------------
// Settlement — buying agents
// ---------------------------------------------------------------------------

function settleAgentBuyers(
    planet: Planet,
    agentBids: AgentBidOrder[],
    askOrders: AskOrder[],
    askFilledBaseline: number[],
    askRevenueBaseline: number[],
): void {
    for (const bid of agentBids) {
        if (bid.filled <= 0) {
            continue;
        }

        const assets = bid.agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        let settledFilled = bid.filled;
        let settledCost = bid.cost;

        if (settledCost > assets.deposits) {
            if (assets.deposits <= 0) {
                settledFilled = 0;
                settledCost = 0;
            } else {
                const scale = assets.deposits / settledCost;
                settledFilled *= scale;
                settledCost = assets.deposits;
            }
        }

        if (settledFilled <= 0) {
            rollbackAskDeltas(askOrders, askFilledBaseline, askRevenueBaseline, bid.filled, bid.cost);
            bid.filled = 0;
            bid.cost = 0;
            continue;
        }

        if (settledFilled < bid.filled) {
            const cancelledFilled = bid.filled - settledFilled;
            const cancelledCost = bid.cost - settledCost;
            rollbackAskDeltas(askOrders, askFilledBaseline, askRevenueBaseline, cancelledFilled, cancelledCost);
            bid.filled = settledFilled;
            bid.cost = settledCost;
        }

        assets.deposits -= settledCost;
        putIntoStorageFacility(assets.storageFacility, bid.resource, settledFilled);

        const buyState = assets.market?.buy[bid.resource.name];
        if (buyState) {
            buyState.lastBought = (buyState.lastBought ?? 0) + settledFilled;
            buyState.lastSpent = (buyState.lastSpent ?? 0) + settledCost;
        }
    }
}

function rollbackAskDeltas(
    askOrders: AskOrder[],
    filledBaseline: number[],
    revenueBaseline: number[],
    cancelledFilled: number,
    cancelledCost: number,
): void {
    let remaining = cancelledFilled;
    for (let i = askOrders.length - 1; i >= 0 && remaining > QUANTITY_EPSILON; i--) {
        const delteFilled = askOrders[i].filled - filledBaseline[i];
        if (delteFilled <= 0) {
            continue;
        }
        const rollback = Math.min(remaining, delteFilled);
        const revenueFraction = delteFilled > 0 ? rollback / delteFilled : 0;
        const deltaRevenue = askOrders[i].revenue - revenueBaseline[i];
        askOrders[i].filled -= rollback;
        askOrders[i].revenue -= deltaRevenue * revenueFraction;
        remaining -= rollback;
    }
    void cancelledCost;
}
