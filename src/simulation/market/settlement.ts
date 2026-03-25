import { putIntoStorageFacility, releaseFromEscrow, transferFromEscrow } from '../planet/storage';
import type { Planet } from '../planet/planet';
import { debitConsumptionPurchase } from '../financial/wealthOps';
import type { AgentBidOrder, AskOrder, BidOrder, TradeRecord } from './marketTypes';

export function settleHouseholds(
    planet: Planet,
    resourceName: string,
    bidOrders: BidOrder[],
    bidFilled: number[],
    bidCosts: number[],
): void {
    const demography = planet.population.demography;

    for (let i = 0; i < bidOrders.length; i++) {
        const filled = bidFilled[i];
        if (filled <= 0) {
            continue;
        }

        const record = bidOrders[i];
        const category = demography[record.age][record.occ][record.edu][record.skill];
        const perPersonCost = record.population > 0 ? bidCosts[i] / record.population : 0;

        category.inventory[resourceName] = (category.inventory[resourceName] ?? 0) + filled;
        debitConsumptionPurchase(planet.bank, category, perPersonCost);
    }
}

export function settleAgentSellers(
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
        const unfilledDelta = ask.quantity - filledBaseline[i] - filledDelta;

        // Transfer sold goods out of escrow (removes them from storage too).
        if (filledDelta > 0) {
            transferFromEscrow(assets.storageFacility, ask.resource.name, filledDelta);
            const revenueDelta = ask.revenue - revenueBaseline[i];
            assets.deposits += revenueDelta;

            const offer = assets.market.sell[ask.resource.name];
            if (offer) {
                offer.lastSold = (offer.lastSold ?? 0) + filledDelta;
                offer.lastRevenue = (offer.lastRevenue ?? 0) + revenueDelta;
            }
        }

        // Release unsold goods from escrow back to free stock.
        if (unfilledDelta > 0) {
            releaseFromEscrow(assets.storageFacility, ask.resource.name, unfilledDelta);
        }
    }
}

export function settleAgentBuyers(planet: Planet, agentBids: AgentBidOrder[]): void {
    for (const bid of agentBids) {
        const assets = bid.agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        const holdConsumed = bid.cost;
        const holdUnused = bid.quantity * bid.bidPrice - holdConsumed;

        // Return the unused portion of the hold to free deposits.
        if (holdUnused > 0) {
            assets.depositHold -= holdUnused;
            assets.deposits += holdUnused;
        }

        if (bid.filled <= 0) {
            continue;
        }

        // Consume the hold for the filled amount.
        assets.depositHold -= holdConsumed;

        const actuallyStored = putIntoStorageFacility(assets.storageFacility, bid.resource, bid.filled);
        const storageFull = actuallyStored < bid.filled;

        const costForStored = bid.filled > 0 ? bid.cost * (actuallyStored / bid.filled) : 0;
        const costRefunded = bid.cost - costForStored;

        if (costRefunded > 0) {
            assets.deposits += costRefunded;
        }

        const buyState = assets.market?.buy[bid.resource.name];
        if (buyState) {
            buyState.lastBought = (buyState.lastBought ?? 0) + actuallyStored;
            buyState.lastSpent = (buyState.lastSpent ?? 0) + costForStored;

            if (storageFull) {
                buyState.bidQuantity = 0;
                buyState.storageFullWarning = true;
            }
        }
    }
}

export function computeMarketSummary(
    trades: TradeRecord[],
    referencePrice: number,
): { clearingPrice: number; totalVolume: number; totalRevenue: number } {
    const totalVolume = trades.reduce((s, t) => s + t.quantity, 0);
    const totalRevenue = trades.reduce((s, t) => s + t.price * t.quantity, 0);
    const clearingPrice = totalVolume > 0 ? totalRevenue / totalVolume : referencePrice;
    return { clearingPrice, totalVolume, totalRevenue };
}
