import { INITIAL_FOOD_PRICE } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { lockIntoEscrow, queryStorageFacility } from '../planet/storage';
import type { AgentBidOrder, AskOrder } from './marketTypes';
import { clampPrice, validatedBidQuantity } from './validation';

export function collectAgentOffers(agents: Map<string, Agent>, planet: Planet): Map<string, AskOrder[]> {
    const books = new Map<string, AskOrder[]>();

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.market) {
            return;
        }

        for (const [resourceName, offer] of Object.entries(assets.market.sell)) {
            if (!offer.offerPrice) {
                continue;
            }
            const resource = offer.resource;
            const free = queryStorageFacility(assets.storageFacility, resourceName);

            // Retainment-based: sell everything above the retained floor.
            // Falls back to the legacy fixed offerQuantity when retainment is not set.
            const quantity =
                offer.offerRetainment !== undefined
                    ? Math.max(0, free - offer.offerRetainment)
                    : Math.min(offer.offerQuantity ?? 0, free);
            const maybeFloorQty = resource.form === 'pieces' ? Math.floor(quantity) : quantity;

            if (maybeFloorQty <= 0) {
                offer.lastSold = 0;
                offer.lastRevenue = 0;
                offer.lastPlacedQty = 0;
                continue;
            }

            offer.lastPlacedQty = maybeFloorQty;
            const askPrice = clampPrice(offer.offerPrice);
            lockIntoEscrow(assets.storageFacility, resourceName, maybeFloorQty);

            let book = books.get(resourceName);
            if (!book) {
                book = [];
                books.set(resourceName, book);
            }
            book.push({
                agent,
                resource,
                askPrice,
                quantity: maybeFloorQty,
                filled: 0,
                revenue: 0,
            });
        }
    });

    return books;
}

export function collectAgentBids(agents: Map<string, Agent>, planet: Planet): Map<string, AgentBidOrder[]> {
    const books = new Map<string, AgentBidOrder[]>();

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.market?.buy) {
            return;
        }

        // Gather all valid bids and their maximum possible cost.
        const pendingBids: { resourceName: string; qty: number; price: number }[] = [];
        let totalMaxCost = 0;

        for (const [resourceName, bid] of Object.entries(assets.market.buy)) {
            // Storage-target-based: buy enough to reach the target level.
            // Falls back to the legacy fixed bidQuantity when target is not set.
            const rawQty =
                bid.bidStorageTarget !== undefined
                    ? Math.max(0, bid.bidStorageTarget - queryStorageFacility(assets.storageFacility, resourceName))
                    : (bid.bidQuantity ?? 0);
            const qty = validatedBidQuantity(rawQty, bid.resource.form);
            if (qty <= 0) {
                continue;
            }
            const price = clampPrice(bid.bidPrice ?? INITIAL_FOOD_PRICE);
            const maxCost = qty * price;
            pendingBids.push({ resourceName, qty, price });
            totalMaxCost += maxCost;
        }

        if (pendingBids.length === 0) {
            return;
        }

        // Scale all bids proportionally if the agent cannot afford the full set.
        const availableDeposits = assets.deposits;
        const scaleFactor = totalMaxCost > availableDeposits ? availableDeposits / totalMaxCost : 1;

        let holdAmount = 0;

        for (const { resourceName, qty, price } of pendingBids) {
            const bid = assets.market.buy[resourceName]!;
            const scaledQty = validatedBidQuantity(qty * scaleFactor, bid.resource.form);
            if (scaledQty <= 0) {
                continue;
            }
            bid.lastEffectiveQty = scaledQty;
            const cost = scaledQty * price;
            holdAmount += cost;

            let book = books.get(resourceName);
            if (!book) {
                book = [];
                books.set(resourceName, book);
            }
            book.push({
                agent,
                resource: bid.resource,
                bidPrice: price,
                quantity: scaledQty,
                filled: 0,
                cost: 0,
                remainingDeposits: availableDeposits - holdAmount + cost,
            });
        }

        assets.deposits -= holdAmount;
        assets.depositHold += holdAmount;
    });

    return books;
}

export function resetAgentBuyCounters(agents: Map<string, Agent>, planet: Planet): void {
    agents.forEach((agent) => {
        const market = agent.assets[planet.id]?.market;
        if (!market?.buy) {
            return;
        }
        for (const bid of Object.values(market.buy)) {
            bid.lastBought = 0;
            bid.lastSpent = 0;
            bid.lastEffectiveQty = 0;
        }
    });
}

export function resetAgentSellCounters(askBooks: Map<string, AskOrder[]>, planet: Planet): void {
    for (const orders of askBooks.values()) {
        for (const ask of orders) {
            const offer = ask.agent.assets[planet.id]?.market?.sell[ask.resource.name];
            if (offer !== undefined) {
                offer.lastSold = 0;
                offer.lastRevenue = 0;
            }
        }
    }
}
