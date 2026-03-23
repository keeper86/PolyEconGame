import type { AgentBidOrder, AskOrder, BidOrder, MergedBid, TradeRecord, UnifiedClearResult } from './marketTypes';

const QUANTITY_EPSILON = 1e-9;

export function clearUnifiedBids(
    householdBids: BidOrder[],
    agentBids: AgentBidOrder[],
    askOrders: AskOrder[],
): UnifiedClearResult {
    const householdTrades: TradeRecord[] = [];
    const agentTrades: TradeRecord[] = [];
    const householdBidFilled: number[] = householdBids.map(() => 0);

    const merged: MergedBid[] = [
        ...householdBids.map(
            (b, i): MergedBid => ({ kind: 'household', index: i, bidPrice: b.bidPrice, quantity: b.quantity }),
        ),
        ...agentBids.map((b): MergedBid => ({ kind: 'agent', order: b, bidPrice: b.bidPrice, quantity: b.quantity })),
    ];
    merged.sort((a, b) => b.bidPrice - a.bidPrice);

    let askIdx = 0;
    let askRemaining = askOrders.length > 0 ? askOrders[0].quantity - askOrders[0].filled : 0;

    for (const bid of merged) {
        let bidRemaining = bid.quantity;

        while (bidRemaining > QUANTITY_EPSILON && askIdx < askOrders.length) {
            const ask = askOrders[askIdx];
            const effectiveAskRemaining = ask.quantity - ask.filled;

            if (effectiveAskRemaining < QUANTITY_EPSILON) {
                askIdx++;
                askRemaining = askIdx < askOrders.length ? askOrders[askIdx].quantity - askOrders[askIdx].filled : 0;
                continue;
            }

            if (bid.bidPrice < ask.askPrice) {
                break;
            }

            const tradeQty = Math.min(bidRemaining, askRemaining);
            if (tradeQty < QUANTITY_EPSILON) {
                break;
            }

            const tradePrice = ask.askPrice;
            ask.filled += tradeQty;
            ask.revenue += tradeQty * tradePrice;
            bidRemaining -= tradeQty;
            askRemaining -= tradeQty;

            if (bid.kind === 'household') {
                householdTrades.push({ price: tradePrice, quantity: tradeQty });
                householdBidFilled[bid.index] += tradeQty;
            } else {
                agentTrades.push({ price: tradePrice, quantity: tradeQty });
                bid.order.filled += tradeQty;
                bid.order.cost += tradeQty * tradePrice;
            }

            if (askRemaining < QUANTITY_EPSILON) {
                askIdx++;
                askRemaining = askIdx < askOrders.length ? askOrders[askIdx].quantity - askOrders[askIdx].filled : 0;
            }
        }
    }

    return { householdTrades, agentTrades, householdBidFilled };
}

/**
 * Reconstructs per-bid costs from a flat list of trade records produced by
 * clearUnifiedBids.  Trades are emitted in the same order as bids (highest
 * price first), so we walk both arrays in parallel to attribute each trade
 * fragment to the correct bid.
 */
export function reconstructBidCosts(trades: TradeRecord[], bidFilled: number[]): number[] {
    const bidCosts: number[] = new Array(bidFilled.length).fill(0);
    let bidIdx = 0;
    while (bidIdx < bidFilled.length && bidFilled[bidIdx] <= 0) {
        bidIdx++;
    }
    let remainingForBid = bidIdx < bidFilled.length ? bidFilled[bidIdx] : 0;

    for (const trade of trades) {
        let remainingTradeQty = trade.quantity;
        while (remainingTradeQty > 0 && bidIdx < bidFilled.length) {
            if (remainingForBid <= 0) {
                bidIdx++;
                while (bidIdx < bidFilled.length && bidFilled[bidIdx] <= 0) {
                    bidIdx++;
                }
                if (bidIdx >= bidFilled.length) {
                    break;
                }
                remainingForBid = bidFilled[bidIdx];
            }
            const alloc = Math.min(remainingTradeQty, remainingForBid);
            bidCosts[bidIdx] += alloc * trade.price;
            remainingTradeQty -= alloc;
            remainingForBid -= alloc;
        }
    }
    return bidCosts;
}
