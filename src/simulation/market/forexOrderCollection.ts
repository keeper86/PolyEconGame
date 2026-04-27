/**
 * simulation/market/forexOrderCollection.ts
 *
 * Collects ask and bid orders for a single currency pair on a trading planet's
 * forex market.
 *
 * Design notes:
 * - Sellers offer units of the ISSUING planet's currency (backed by their
 *   foreignDeposits on that planet).  Escrow is tracked via foreignDepositHolds
 *   on the Agent (not the local storageFacility).
 * - Buyers want to acquire units of the issuing planet's currency. The cost is
 *   paid in the TRADING planet's local currency (held via normal depositHold on
 *   the trading-planet assets).
 * - Both sides' quantities are in "units of issuing-planet currency".
 */

import { PRICE_CEIL } from '../constants';
import { hasActiveLicense } from '../planet/planet';
import type { Agent, Planet } from '../planet/planet';
import type { AgentBidOrder, AskOrder } from './marketTypes';
import { getCurrencyResource, getCurrencyResourceName, FOREX_PRICE_FLOOR } from './currencyResources';

// ---------------------------------------------------------------------------
// Ask (sell) orders — agent offers units of CUR_issuingPlanet
// ---------------------------------------------------------------------------

/**
 * Collect all forex ask orders for `issuingPlanet`'s currency being sold
 * on `tradingPlanet`'s market.
 *
 * For each agent that has a surplus of the issuing planet's currency and
 * has posted a sell offer on the trading planet:
 *   - Available = foreignDeposits[issuingPlanetId] − foreignDepositHolds[issuingPlanetId]
 *                 − (offerRetainment ?? 0)
 *   - Escrow the offered quantity in foreignDepositHolds (prevents double-counting
 *     across simultaneous forex markets in the same tick).
 */
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

        const balance = agent.foreignDeposits[issuingPlanetId] ?? 0;
        const alreadyHeld = agent.foreignDepositHolds[issuingPlanetId] ?? 0;
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

        // Escrow: prevent the agent from selling the same deposit twice within one tick
        agent.foreignDepositHolds[issuingPlanetId] = alreadyHeld + quantity;

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

// ---------------------------------------------------------------------------
// Bid (buy) orders — agent wants to acquire units of CUR_issuingPlanet
// ---------------------------------------------------------------------------

/**
 * Collect all forex bid orders for `issuingPlanet`'s currency being bought
 * on `tradingPlanet`'s market.
 *
 * For each agent that wants more of the issuing planet's currency:
 *   - quantity = (bidStorageTarget − foreignDeposits[issuingPlanetId]), capped at 0
 *   - Payment is in the trading planet's local currency (deducted from localAssets.deposits
 *     as a depositHold).
 *   - Agents without a trading-planet commercial license are skipped.
 */
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

        const bid = localAssets.market?.buy[curName];
        if (!bid?.bidPrice || bid.bidPrice <= 0) {
            continue;
        }

        const storageTarget = bid.bidStorageTarget ?? 0;
        const current = agent.foreignDeposits[issuingPlanetId] ?? 0;
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

        // Check individual budget
        const availableDeposits = Math.max(0, localAssets.deposits - localAssets.depositHold);
        if (holdAmount > availableDeposits) {
            // Skip this bidder entirely — can't afford even the scaled amount
            const bid = localAssets.market!.buy[curName]!;
            bid.lastBought = 0;
            bid.lastSpent = 0;
            bid.lastEffectiveQty = 0;
            bid.depositScaleWarning = 'dropped';
            continue;
        }

        // Deduct deposit hold
        localAssets.deposits -= holdAmount;
        localAssets.depositHold += holdAmount;

        const bid = localAssets.market!.buy[curName]!;
        bid.lastEffectiveQty = scaledQty;
        if (depositScaleFactor < 1) {
            bid.depositScaleWarning = 'scaled';
        }

        orders.push({
            agent: p.agent,
            resource: curResource,
            bidPrice: p.bidPrice,
            quantity: scaledQty,
            filled: 0,
            cost: 0,
            remainingDeposits: availableDeposits - holdAmount,
        });
    }

    return orders;
}

/**
 * Reset per-tick sell counters for forex ask orders on a trading planet.
 * Called before order collection so stale values from the prior tick don't linger.
 */
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
