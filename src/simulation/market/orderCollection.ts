import { INITIAL_FOOD_PRICE } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import type { AgentBidOrder, AskOrder } from './marketTypes';

export function collectAgentOffers(agents: Map<string, Agent>, planet: Planet): Map<string, AskOrder[]> {
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

export function collectAgentBids(agents: Map<string, Agent>, planet: Planet): Map<string, AgentBidOrder[]> {
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
                remainingDeposits: assets.deposits,
            });
        }
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
