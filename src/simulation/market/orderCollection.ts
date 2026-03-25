import { FOOD_PRICE_FLOOR, FOOD_PRICE_CEIL, INITIAL_FOOD_PRICE } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { lockIntoEscrow, queryStorageFacility } from '../planet/storage';
import type { AgentBidOrder, AskOrder } from './marketTypes';
export function collectAgentOffers(agents: Map<string, Agent>, planet: Planet): Map<string, AskOrder[]> {
    const books = new Map<string, AskOrder[]>();

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.market) {
            return;
        }

        for (const [resourceName, offer] of Object.entries(assets.market.sell)) {
            const resource = offer.resource;
            const requested = validatedOfferQuantity(offer.offerQuantity ?? 0, resource.form);
            const free = queryStorageFacility(assets.storageFacility, resourceName);
            const qty = Math.min(requested, free);
            if (qty <= 0) {
                offer.lastSold = 0;
                offer.lastRevenue = 0;
                continue;
            }
            const askPrice = clampPrice(offer.offerPrice ?? INITIAL_FOOD_PRICE);
            lockIntoEscrow(assets.storageFacility, resourceName, qty);

            let book = books.get(resourceName);
            if (!book) {
                book = [];
                books.set(resourceName, book);
            }
            book.push({
                agent,
                resource,
                askPrice,
                quantity: qty,
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
            const qty = validatedBidQuantity(bid.bidQuantity ?? 0, bid.resource.form);
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

function clampPrice(price: number): number {
    return Math.max(FOOD_PRICE_FLOOR, Math.min(FOOD_PRICE_CEIL, price));
}

function validatedOfferQuantity(qty: number, form: string): number {
    if (qty <= 0) {
        return 0;
    }
    return form === 'pieces' ? Math.floor(qty) : qty;
}

function validatedBidQuantity(qty: number, form: string): number {
    if (qty <= 0) {
        return 0;
    }
    return form === 'pieces' ? Math.floor(qty) : qty;
}
