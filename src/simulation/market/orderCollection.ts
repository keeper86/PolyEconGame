import type { Agent, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { lockIntoEscrow, queryStorageFacility } from '../planet/facility';
import type { AgentBidOrder, AskOrder } from './marketTypes';
import { validateAndPrepareSellOffer, validateAndPrepareBuyBid } from './validation';
import { EPSILON } from '../constants';
import { isCurrencyResource } from './currencyResources';

export function collectAgentOffers(agents: Map<string, Agent>, planet: Planet): Map<string, AskOrder[]> {
    const books = new Map<string, AskOrder[]>();

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.market) {
            return;
        }
        if (!hasActiveLicense(assets, 'commercial')) {
            return;
        }

        for (const [resourceName, offer] of Object.entries(assets.market.sell)) {
            if (isCurrencyResource(offer.resource) || offer.resource.form === 'internal') {
                continue;
            }

            if (offer.offerPrice === undefined) {
                continue;
            }

            const free = queryStorageFacility(assets.storage, resourceName);

            const validatedOffer = validateAndPrepareSellOffer(offer, free);

            if (!validatedOffer) {
                offer.lastSold = 0;
                offer.lastRevenue = 0;
                offer.lastPlacedQty = 0;
                continue;
            }

            const { price: askPrice, quantity } = validatedOffer;

            offer.lastPlacedQty = quantity;
            offer.lastOfferPrice = askPrice;
            lockIntoEscrow(assets.storage, resourceName, quantity);

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
        if (!hasActiveLicense(assets, 'commercial')) {
            return;
        }

        const pendingBids: {
            resourceName: string;
            qty: number;
            price: number;
            maxCost: number;
        }[] = [];
        let totalMaxCost = 0;

        for (const [resourceName, bid] of Object.entries(assets.market.buy)) {
            if (isCurrencyResource(bid.resource) || bid.resource.form === 'internal') {
                continue;
            }
            const currentInventory = queryStorageFacility(assets.storage, resourceName);

            // validateAndPrepareBuyBid already caps qty to the exact free space of the bid's own
            // form shell, so nothing has to be scaled across resources for storage afterwards.
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

        const availableDeposits = assets.deposits;
        const isDepositLimited = totalMaxCost > availableDeposits;
        const depositScaleFactor = isDepositLimited
            ? availableDeposits > 0
                ? availableDeposits / totalMaxCost
                : 0
            : 1;

        let holdAmount = 0;

        for (const { resourceName, qty, price } of pendingBids) {
            const bid = assets.market.buy[resourceName]!;

            const safeDepositScale = isDepositLimited ? 0.99 * depositScaleFactor : depositScaleFactor;
            let scaledQty = Math.max(0, qty * safeDepositScale);

            if (scaledQty > 0 && scaledQty < EPSILON) {
                scaledQty = 0;
            }

            if (scaledQty <= 0) {
                if (!agent.automated) {
                    bid.depositScaleWarning = 'dropped';
                }
                continue;
            }

            bid.lastEffectiveQty = scaledQty;
            bid.lastBidPrice = price;
            const cost = scaledQty * price;
            holdAmount += cost;

            if (!agent.automated && isDepositLimited && scaledQty < qty) {
                bid.depositScaleWarning = 'scaled';
            }

            if (process.env.SIM_DEBUG === '1') {
                if (!isFinite(price) || price <= 0) {
                    throw new Error(
                        `Invalid bid price entering order book: agent=${agent.id} resource=${resourceName} price=${price}`,
                    );
                }
                if (!isFinite(scaledQty) || scaledQty <= 0) {
                    throw new Error(
                        `Invalid bid quantity entering order book: agent=${agent.id} resource=${resourceName} qty=${scaledQty}`,
                    );
                }
                const holdSoFar = holdAmount;
                if (!isFinite(cost) || holdSoFar > availableDeposits + 1e-9) {
                    throw new Error(
                        `Cumulative bid cost exceeds available deposits: agent=${agent.id} resource=${resourceName} holdAmount=${holdSoFar} deposits=${availableDeposits}`,
                    );
                }
            }

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
            bid.depositScaleWarning = undefined;
            bid.storageScaleWarning = undefined;
            bid.storageFullWarning = undefined;
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
