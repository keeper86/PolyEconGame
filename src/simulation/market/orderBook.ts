import type { AgentBidOrder, AskOrder, BidOrder, MergedBid, TradeRecord, UnifiedClearResult } from './marketTypes';
import { nextRandom } from '../utils/stochasticRound';
import { EPSILON } from '../constants';

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

function shuffledIndices(n: number): number[] {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(nextRandom() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
}

/**
 * Distribute `supply` among `participants` (each entry is their remaining demand).
 *
 * Phase 1 — equal-share rounds: repeatedly give every unsatisfied participant
 * an equal slice of the remaining supply, capped at their demand.  Participants
 * whose demand is smaller than their equal slice absorb only what they need;
 * their surplus feeds the next round.  Continues until supply is exhausted or
 * all demands are met, or until the per-participant share would be < 1 unit
 * (the integer-remainder boundary).
 *
 * Phase 2 — random remainder: when remaining supply is less than the number of
 * still-hungry participants (i.e. each equal share < 1), assign one unit at a
 * time in a random order.  This avoids starvation: a participant wanting 1 unit
 * competes on equal terms with one wanting 1 000 000.
 *
 * Properties:
 * - No participant starves because another has a larger demand.
 * - Order-independent within a price tier.
 * - Monotone: a new large order never reduces what small participants receive.
 *
 * For continuous resources (not pieces), set `minUnit = QUANTITY_EPSILON` so
 * Phase 2 is never entered and Phase 1 runs to full convergence.
 * For integer pieces resources, set `minUnit = 1`.
 */
function equalShareAllocate(participants: number[], supply: number, minUnit: number): number[] {
    const allocations = participants.map(() => 0);
    const remaining = [...participants];
    let leftover = supply;

    while (leftover > EPSILON) {
        const activeIndices = remaining.map((d, i) => i).filter((i) => remaining[i] > EPSILON);
        if (activeIndices.length === 0) {
            break;
        }

        const perParticipant = leftover / activeIndices.length;

        if (activeIndices.length > 1 && perParticipant < minUnit - EPSILON) {
            // Integer remainder phase — assign one unit each in random order.
            const order = shuffledIndices(activeIndices.length);
            for (const pos of order) {
                if (leftover < minUnit - EPSILON) {
                    break;
                }
                const i = activeIndices[pos];
                const given = Math.min(remaining[i], minUnit);
                allocations[i] += given;
                remaining[i] -= given;
                leftover -= given;
            }
            break;
        }

        let consumed = 0;
        for (const i of activeIndices) {
            const given = Math.min(remaining[i], perParticipant);
            allocations[i] += given;
            remaining[i] -= given;
            consumed += given;
        }
        leftover -= consumed;

        if (consumed < EPSILON) {
            break;
        }
    }

    return allocations;
}

/**
 * Deposit-aware effective demand for an agent bid at a given ask price.
 *
 * For 'pieces' resources the capacity is floored to an integer because you
 * cannot buy a fractional piece.  For all other forms (solid, liquid, gas …)
 * no rounding is applied: even a budget of 0.005 credits at an ask price of
 * 0.01 per ton allows a 0.5-ton purchase.
 */
function effectiveBidCapacity(bid: MergedBid, remaining: number, askPrice: number): number {
    if (bid.kind === 'agent' && askPrice > 0) {
        const maxAffordable = bid.order.remainingDeposits / askPrice;
        const capacity = bid.order.resource.form === 'pieces' ? Math.floor(maxAffordable) : maxAffordable;
        return Math.min(remaining, capacity);
    }
    return remaining;
}

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

    const bidRemaining = merged.map((b) => b.quantity);
    const askRemaining = askOrders.map((a) => a.quantity - a.filled);

    const mergedIndexOf = new Map(merged.map((b, i) => [b, i]));
    const askIndexOf = new Map(askOrders.map((a, i) => [a, i]));

    const bidTiers = groupByPrice(merged, 'bidPrice');
    const askTiers = groupByPrice(askOrders, 'askPrice');

    let askTierIdx = 0;

    for (const bidTier of bidTiers) {
        while (askTierIdx < askTiers.length) {
            if (bidTier[0].bidPrice >= askTiers[askTierIdx][0].askPrice) {
                break;
            }
            askTierIdx++;
        }
        if (askTierIdx >= askTiers.length) {
            break;
        }

        let localAskTierIdx = askTierIdx;
        while (localAskTierIdx < askTiers.length) {
            const askTier = askTiers[localAskTierIdx];
            const tradePrice = askTier[0].askPrice;

            if (bidTier[0].bidPrice < tradePrice) {
                break;
            }

            const totalAskSupply = askTier.reduce((s, a) => s + askRemaining[askIndexOf.get(a)!], 0);
            if (totalAskSupply < EPSILON) {
                localAskTierIdx++;
                continue;
            }

            // Compute effective bid demands at this ask price.
            const bidIndices = bidTier.map((b) => mergedIndexOf.get(b)!);
            const effectiveDemands = bidIndices.map((i) =>
                effectiveBidCapacity(merged[i], bidRemaining[i], tradePrice),
            );
            const totalDemand = effectiveDemands.reduce((s, d) => s + d, 0);

            if (totalDemand < EPSILON) {
                break;
            }

            const totalTrade = Math.min(totalAskSupply, totalDemand);

            const isPieces = askTier[0].resource.form === 'pieces';
            const minUnit = isPieces ? 1 : EPSILON;

            const askSupplies = askTier.map((a) => askRemaining[askIndexOf.get(a)!]);
            const askFills = equalShareAllocate(askSupplies, totalTrade, minUnit);

            for (let ai = 0; ai < askTier.length; ai++) {
                const askFill = askFills[ai];
                if (askFill < EPSILON) {
                    continue;
                }
                const ask = askTier[ai];
                const askIdx = askIndexOf.get(ask)!;

                // Recompute effective demands from the current bidRemaining so that buyers
                // already satisfied by earlier sellers in this tier don't steal quota from
                // others (stale values would cause over-allocation beyond a buyer's demand).
                const currentEffectiveDemands = bidIndices.map((i) =>
                    effectiveBidCapacity(merged[i], bidRemaining[i], tradePrice),
                );
                const bidFills = equalShareAllocate(currentEffectiveDemands, askFill, minUnit);

                for (let bi = 0; bi < bidTier.length; bi++) {
                    const bidFill = bidFills[bi];
                    if (bidFill < EPSILON) {
                        continue;
                    }
                    const bidIdx = bidIndices[bi];
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
