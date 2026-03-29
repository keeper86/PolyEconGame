import type { Agent, Planet, Resource } from '../planet/planet';
import { lockIntoEscrow, queryStorageFacility } from '../planet/storage';
import type { AgentBidOrder, AskOrder } from './marketTypes';
import { validateAndPrepareSellOffer, validateAndPrepareBuyBid } from './validation';
import { EPSILON } from '../constants';

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
            offer.lastOfferPrice = askPrice;
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
        const pendingBids: {
            resourceName: string;
            qty: number;
            price: number;
            maxCost: number;
            resource: Resource;
        }[] = [];
        let totalMaxCost = 0;
        let totalRequiredVolume = 0;
        let totalRequiredMass = 0;

        for (const [resourceName, bid] of Object.entries(assets.market.buy)) {
            const currentInventory = queryStorageFacility(assets.storageFacility, resourceName);

            // Use the new validation function
            const validatedBid = validateAndPrepareBuyBid(bid, assets, currentInventory);

            if (!validatedBid) {
                continue;
            }

            const { price, quantity: qty, maxCost } = validatedBid;
            pendingBids.push({ resourceName, qty, price, maxCost, resource: bid.resource });
            totalMaxCost += maxCost;

            // Calculate volume and mass requirements for storage scaling
            totalRequiredVolume += qty * bid.resource.volumePerQuantity;
            totalRequiredMass += qty * bid.resource.massPerQuantity;
        }

        if (pendingBids.length === 0) {
            return;
        }

        // ----- STORAGE SCALING -----
        // Calculate available storage capacity
        const storage = assets.storageFacility;
        const freeVolume = storage.capacity.volume * storage.scale - storage.current.volume;
        const freeMass = storage.capacity.mass * storage.scale - storage.current.mass;

        const isVolumeLimited = totalRequiredVolume > freeVolume;
        const isMassLimited = totalRequiredMass > freeMass;
        const isStorageLimited = isVolumeLimited || isMassLimited;

        // Compute scale factors for volume and mass
        const volumeScaleFactor = isVolumeLimited ? (freeVolume > 0 ? freeVolume / totalRequiredVolume : 0) : 1;
        const massScaleFactor = isMassLimited ? (freeMass > 0 ? freeMass / totalRequiredMass : 0) : 1;
        const storageScaleFactor = Math.min(volumeScaleFactor, massScaleFactor);

        // ----- DEPOSIT SCALING -----
        // Scale all bids proportionally if the agent cannot afford the full set.
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

            // Apply storage scaling first (physical constraint)
            const storageScaledQty = Math.max(0, qty * storageScaleFactor);

            // Then apply deposit scaling (financial constraint)
            // Apply a 0.99 safety margin only when deposit-scaling is active to avoid
            // rounding-induced overspend. Unrestrained bids are placed at full quantity.
            const safeDepositScale = isDepositLimited ? 0.99 * depositScaleFactor : depositScaleFactor;
            let scaledQty = Math.max(0, storageScaledQty * safeDepositScale);

            // Snap quantities smaller than EPSILON to 0 to prevent "quantity too small" warnings
            if (scaledQty > 0 && scaledQty < EPSILON) {
                scaledQty = 0;
            }

            // Determine warning states
            const isStorageDropped = storageScaledQty <= 0;
            const isStorageScaled = !isStorageDropped && isStorageLimited && storageScaledQty < qty;
            const isDepositDropped = scaledQty <= 0 && !isStorageDropped;
            const isDepositScaled = !isDepositDropped && isDepositLimited && scaledQty < storageScaledQty;

            if (scaledQty <= 0) {
                // Bid dropped entirely — warn human players
                if (!agent.automated) {
                    if (isStorageDropped) {
                        bid.storageScaleWarning = 'dropped';
                    } else if (isDepositDropped) {
                        bid.depositScaleWarning = 'dropped';
                    }
                }
                continue;
            }

            bid.lastEffectiveQty = scaledQty;
            bid.lastBidPrice = price;
            const cost = scaledQty * price;
            holdAmount += cost;

            // Record scaling feedback for human players
            if (!agent.automated) {
                if (isStorageScaled) {
                    bid.storageScaleWarning = 'scaled';
                }
                if (isDepositScaled) {
                    bid.depositScaleWarning = 'scaled';
                }
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
