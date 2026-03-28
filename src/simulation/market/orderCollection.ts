import type { Agent, Planet } from '../planet/planet';
import { lockIntoEscrow, queryStorageFacility } from '../planet/storage';
import type { AgentBidOrder, AskOrder } from './marketTypes';
import { validateAndPrepareSellOffer, validateAndPrepareBuyBid } from './validation';

export function collectAgentOffers(agents: Map<string, Agent>, planet: Planet): Map<string, AskOrder[]> {
    const books = new Map<string, AskOrder[]>();

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.market) {
            return;
        }

        for (const [resourceName, offer] of Object.entries(assets.market.sell)) {
            const free = queryStorageFacility(assets.storageFacility, resourceName);
            
            // Use the new validation function
            const validatedOffer = validateAndPrepareSellOffer(offer, free);
            
            if (!validatedOffer) {
                // Update counters for invalid/zero quantity offers
                offer.lastSold = 0;
                offer.lastRevenue = 0;
                offer.lastPlacedQty = 0;
                continue;
            }

            const { price: askPrice, quantity } = validatedOffer;
            
            offer.lastPlacedQty = quantity;
            lockIntoEscrow(assets.storageFacility, resourceName, quantity);

            let book = books.get(resourceName);
            if (!book) {
                book = [];
                books.set(resourceName, book);
            }
            book.push({
                agent,
                resource: offer.resource,
                askPrice,
                quantity,
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
        const pendingBids: { resourceName: string; qty: number; price: number; maxCost: number }[] = [];
        let totalMaxCost = 0;

        for (const [resourceName, bid] of Object.entries(assets.market.buy)) {
            const currentInventory = queryStorageFacility(assets.storageFacility, resourceName);
            
            // Use the new validation function
            const validatedBid = validateAndPrepareBuyBid(bid, assets, currentInventory);
            
            if (!validatedBid) {
                continue;
            }

            const { price, quantity: qty, maxCost } = validatedBid;
            pendingBids.push({ resourceName, qty, price, maxCost });
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
            const scaledQty = Math.max(0, qty * scaleFactor);
            
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
