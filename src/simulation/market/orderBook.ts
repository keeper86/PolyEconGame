import type { AgentBidOrder, AskOrder, BidOrder, MergedBid, TradeRecord, UnifiedClearResult } from './marketTypes';

const QUANTITY_EPSILON = 1e-9;

/**
 * Groups consecutive elements with the same price into tiers.
 * Assumes the array is already sorted.
 */
function groupByPrice<T extends { bidPrice?: number; askPrice?: number }>(
    items: T[],
    priceKey: 'bidPrice' | 'askPrice',
): T[][] {
    const tiers: T[][] = [];
    let i = 0;
    while (i < items.length) {
        const price = (items[i] as Record<string, number>)[priceKey];
        const tier: T[] = [];
        while (i < items.length && (items[i] as Record<string, number>)[priceKey] === price) {
            tier.push(items[i]);
            i++;
        }
        tiers.push(tier);
    }
    return tiers;
}

/**
 * Effective quantity a bid can still absorb at a given ask price,
 * considering deposit constraints for agent bids.
 */
function effectiveBidCapacity(bid: MergedBid, remaining: number, askPrice: number): number {
    if (bid.kind === 'agent' && askPrice > 0) {
        return Math.min(remaining, Math.floor(bid.order.remainingDeposits / askPrice));
    }
    return remaining;
}

/**
 * Clears a market using pro-rata matching within price tiers.
 *
 * Bids and asks are grouped by price level. When multiple sellers (asks) sit
 * at the same price, the available demand at that tier is distributed
 * proportionally to each seller's remaining offer size. Symmetrically, when
 * multiple buyers (bids) share the same price, the available supply is split
 * proportionally among them. This prevents any single participant from
 * monopolising trades just because of iteration order under a price floor.
 */
export function clearUnifiedBids(
    householdBids: BidOrder[],
    agentBids: AgentBidOrder[],
    askOrders: AskOrder[],
): UnifiedClearResult {
    const householdTrades: TradeRecord[] = [];
    const agentTrades: TradeRecord[] = [];
    const householdBidFilled: number[] = householdBids.map(() => 0);
    const householdBidCosts: number[] = householdBids.map(() => 0);

    const merged: MergedBid[] = [
        ...householdBids.map(
            (b, i): MergedBid => ({ kind: 'household', index: i, bidPrice: b.bidPrice, quantity: b.quantity }),
        ),
        ...agentBids.map((b): MergedBid => ({ kind: 'agent', order: b, bidPrice: b.bidPrice, quantity: b.quantity })),
    ];
    merged.sort((a, b) => b.bidPrice - a.bidPrice);

    // Track remaining quantities for bids and asks separately from the originals
    // so we can do proportional splits without mutating prematurely.
    const bidRemaining = merged.map((b) => b.quantity);
    const askRemaining = askOrders.map((a) => a.quantity - a.filled);

    const mergedIndexOf = new Map(merged.map((b, i) => [b, i]));
    const askIndexOf = new Map(askOrders.map((a, i) => [a, i]));

    const bidTiers = groupByPrice(merged, 'bidPrice');
    const askTiers = groupByPrice(askOrders, 'askPrice');

    let askTierIdx = 0;

    for (const bidTier of bidTiers) {
        // Advance to the cheapest ask tier that this bid tier can afford.
        while (askTierIdx < askTiers.length) {
            const tierPrice = askTiers[askTierIdx][0].askPrice;
            if (bidTier[0].bidPrice >= tierPrice) {
                break;
            }
            askTierIdx++;
        }
        if (askTierIdx >= askTiers.length) {
            break;
        }

        // Process ask tiers from cheapest to most expensive while bids can still pay.
        let localAskTierIdx = askTierIdx;
        while (localAskTierIdx < askTiers.length) {
            const askTier = askTiers[localAskTierIdx];
            const tradePrice = askTier[0].askPrice;

            if (bidTier[0].bidPrice < tradePrice) {
                break;
            }

            // Total supply available in this ask tier.
            const totalAskSupply = askTier.reduce((s, a) => s + askRemaining[askIndexOf.get(a)!], 0);

            if (totalAskSupply < QUANTITY_EPSILON) {
                localAskTierIdx++;
                continue;
            }

            // Total effective demand from this bid tier at this ask price.
            const bidIndices = bidTier.map((b) => mergedIndexOf.get(b)!);
            const effectiveDemands = bidIndices.map((i) =>
                effectiveBidCapacity(merged[i], bidRemaining[i], tradePrice),
            );
            const totalDemand = effectiveDemands.reduce((s, d) => s + d, 0);

            if (totalDemand < QUANTITY_EPSILON) {
                break;
            }

            const totalTrade = Math.min(totalAskSupply, totalDemand);

            // Distribute supply across asks proportionally by their available quantity.
            for (const ask of askTier) {
                const askIdx = askIndexOf.get(ask)!;
                const askShare = askRemaining[askIdx] / totalAskSupply;
                const askFill = totalTrade * askShare;

                if (askFill < QUANTITY_EPSILON) {
                    continue;
                }

                // Distribute this ask's fill across bids proportionally by effective demand.
                for (let b = 0; b < bidTier.length; b++) {
                    const bidIdx = bidIndices[b];
                    const bidShare = totalDemand > 0 ? effectiveDemands[b] / totalDemand : 0;
                    const bidFill = askFill * bidShare;

                    if (bidFill < QUANTITY_EPSILON) {
                        continue;
                    }

                    const bid = merged[bidIdx];
                    bidRemaining[bidIdx] -= bidFill;
                    askRemaining[askIdx] -= bidFill;
                    ask.filled += bidFill;
                    ask.revenue += bidFill * tradePrice;

                    if (bid.kind === 'household') {
                        householdTrades.push({ price: tradePrice, quantity: bidFill });
                        householdBidFilled[bid.index] += bidFill;
                        householdBidCosts[bid.index] += bidFill * tradePrice;
                    } else {
                        agentTrades.push({ price: tradePrice, quantity: bidFill });
                        bid.order.filled += bidFill;
                        bid.order.cost += bidFill * tradePrice;
                        bid.order.remainingDeposits -= bidFill * tradePrice;
                    }
                }
            }

            localAskTierIdx++;
        }
    }

    return { householdTrades, agentTrades, householdBidFilled, householdBidCosts };
}
