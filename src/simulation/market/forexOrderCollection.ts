import { PRICE_CEIL } from '../constants';
import { hasActiveLicense } from '../planet/planet';
import type { Agent, Planet } from '../planet/planet';
import type { AgentBidOrder, AskOrder } from './marketTypes';
import { getCurrencyResource, getCurrencyResourceName, FOREX_PRICE_FLOOR } from './currencyResources';

export function collectForexAsks(
    agents: Map<string, Agent>,
    tradingPlanet: Planet,
    issuingPlanetId: string,
): AskOrder[] {
    const orders: AskOrder[] = [];
    const curName = getCurrencyResourceName(issuingPlanetId);
    const curResource = getCurrencyResource(issuingPlanetId);

    for (const agent of agents.values()) {
        const localAssets = agent.assets[tradingPlanet.id];
        if (!localAssets) {
            continue;
        }
        if (!hasActiveLicense(localAssets, 'commercial')) {
            continue;
        }

        const offer = localAssets.market?.sell[curName];
        if (!offer?.offerPrice) {
            continue;
        }

        const issuingAssets = agent.assets[issuingPlanetId];
        const balance = issuingAssets?.deposits ?? 0;
        const alreadyHeld = issuingAssets?.depositHold ?? 0;
        const retainment = offer.offerRetainment ?? 0;
        const available = balance - alreadyHeld - retainment;

        if (available <= 0) {
            offer.lastSold = 0;
            offer.lastRevenue = 0;
            offer.lastPlacedQty = 0;
            continue;
        }

        const askPrice = Math.max(FOREX_PRICE_FLOOR, Math.min(PRICE_CEIL, offer.offerPrice));
        const quantity = available;

        issuingAssets!.depositHold = alreadyHeld + quantity;

        offer.lastPlacedQty = quantity;
        offer.lastOfferPrice = askPrice;

        orders.push({
            agent,
            resource: curResource,
            askPrice,
            quantity,
            filled: 0,
            revenue: 0,
        });
    }

    return orders;
}

export function collectForexBids(
    agents: Map<string, Agent>,
    tradingPlanet: Planet,
    issuingPlanetId: string,
): AgentBidOrder[] {
    const orders: AgentBidOrder[] = [];
    const curName = getCurrencyResourceName(issuingPlanetId);
    const curResource = getCurrencyResource(issuingPlanetId);

    // First pass: gather valid bids and total deposit demand
    type PendingBid = {
        agent: Agent;
        quantity: number;
        bidPrice: number;
        maxCost: number;
    };
    const pending: PendingBid[] = [];
    let totalMaxCost = 0;

    for (const agent of agents.values()) {
        const localAssets = agent.assets[tradingPlanet.id];
        if (!localAssets) {
            continue;
        }
        if (!hasActiveLicense(localAssets, 'commercial')) {
            continue;
        }

        if (!agent.assets[issuingPlanetId]) {
            continue;
        }

        const bid = localAssets.market?.buy[curName];
        if (!bid?.bidPrice || bid.bidPrice <= 0) {
            continue;
        }

        const storageTarget = bid.bidStorageTarget ?? 0;
        const current = agent.assets[issuingPlanetId].deposits;
        const quantity = Math.max(0, storageTarget - current);
        if (quantity <= 0) {
            bid.lastBought = 0;
            bid.lastSpent = 0;
            bid.lastEffectiveQty = 0;
            continue;
        }

        const askPrice = Math.max(FOREX_PRICE_FLOOR, Math.min(PRICE_CEIL, bid.bidPrice));
        const maxCost = quantity * askPrice;

        pending.push({ agent, quantity, bidPrice: askPrice, maxCost });
        totalMaxCost += maxCost;
    }

    // Second pass: apply deposit scaling if total cost exceeds all buyers' budgets
    const availableDepositsTotal = pending.reduce((sum, p) => {
        const localAssets = p.agent.assets[tradingPlanet.id]!;
        return sum + Math.max(0, localAssets.deposits - localAssets.depositHold);
    }, 0);

    const depositScaleFactor =
        totalMaxCost > 0 && totalMaxCost > availableDepositsTotal ? (availableDepositsTotal / totalMaxCost) * 0.99 : 1;

    for (const p of pending) {
        const localAssets = p.agent.assets[tradingPlanet.id]!;
        const scaledQty = p.quantity * depositScaleFactor;
        const holdAmount = scaledQty * p.bidPrice;

        const availableDeposits = Math.max(0, localAssets.deposits - localAssets.depositHold);
        const bid = localAssets.market!.buy[curName]!;

        // If the globally-scaled hold still exceeds this bidder's individual budget, cap it.
        const actualHold = Math.min(holdAmount, availableDeposits);
        const actualQty = p.bidPrice > 0 ? actualHold / p.bidPrice : 0;

        if (actualQty <= 0) {
            bid.lastBought = 0;
            bid.lastSpent = 0;
            bid.lastEffectiveQty = 0;
            bid.depositScaleWarning = 'dropped';
            continue;
        }

        // Deduct deposit hold
        localAssets.deposits -= actualHold;
        localAssets.depositHold += actualHold;

        bid.lastEffectiveQty = actualQty;
        bid.depositScaleWarning = actualHold < holdAmount || depositScaleFactor < 1 ? 'scaled' : undefined;

        orders.push({
            agent: p.agent,
            resource: curResource,
            bidPrice: p.bidPrice,
            quantity: actualQty,
            filled: 0,
            cost: 0,
            remainingDeposits: availableDeposits - actualHold,
        });
    }

    return orders;
}

export function resetForexSellCounters(
    tradingPlanet: Planet,
    issuingPlanetId: string,
    agents: Map<string, Agent>,
): void {
    const curName = getCurrencyResourceName(issuingPlanetId);
    for (const agent of agents.values()) {
        const offer = agent.assets[tradingPlanet.id]?.market?.sell[curName];
        if (offer) {
            offer.lastSold = 0;
            offer.lastRevenue = 0;
        }
        const bid = agent.assets[tradingPlanet.id]?.market?.buy[curName];
        if (bid) {
            bid.lastBought = 0;
            bid.lastSpent = 0;
        }
    }
}
