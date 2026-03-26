import { describe, expect, it } from 'vitest';
import { makeAgent } from '../utils/testHelper';
import { coalResourceType } from '../planet/resources';
import type { AgentBidOrder, AskOrder, BidOrder } from './marketTypes';
import { clearUnifiedBids } from './orderBook';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COAL = coalResourceType;

function makeAsk(agent: ReturnType<typeof makeAgent>, askPrice: number, quantity: number): AskOrder {
    return { agent, resource: COAL, askPrice, quantity, filled: 0, revenue: 0 };
}

function makeAgentBid(
    agent: ReturnType<typeof makeAgent>,
    bidPrice: number,
    quantity: number,
    deposits = 1e9,
): AgentBidOrder {
    return { agent, resource: COAL, bidPrice, quantity, filled: 0, cost: 0, remainingDeposits: deposits };
}

function makeHouseholdBid(bidPrice: number, quantity: number): BidOrder {
    return {
        age: 20,
        edu: 'none',
        occ: 'unoccupied',
        skill: 'novice',
        population: quantity,
        bidPrice,
        quantity,
        wealthMoments: { mean: bidPrice * quantity, variance: 0 },
    };
}

// ---------------------------------------------------------------------------
// Basic clearing
// ---------------------------------------------------------------------------

describe('clearUnifiedBids — basic clearing', () => {
    it('single seller, single buyer: full fill when quantities match', () => {
        const seller = makeAgent('seller');
        const buyer = makeAgent('buyer');

        const ask = makeAsk(seller, 1.0, 100);
        const bid = makeAgentBid(buyer, 2.0, 100);

        const result = clearUnifiedBids([], [bid], [ask]);

        expect(ask.filled).toBeCloseTo(100);
        expect(bid.filled).toBeCloseTo(100);
        expect(result.agentTrades).toHaveLength(1);
        expect(result.agentTrades[0].quantity).toBeCloseTo(100);
        expect(result.agentTrades[0].price).toBe(1.0);
    });

    it('no trade when bid price is below ask price', () => {
        const seller = makeAgent('seller');
        const buyer = makeAgent('buyer');

        const ask = makeAsk(seller, 5.0, 100);
        const bid = makeAgentBid(buyer, 1.0, 100);

        clearUnifiedBids([], [bid], [ask]);

        expect(ask.filled).toBe(0);
        expect(bid.filled).toBe(0);
    });

    it('partial fill when supply is less than demand', () => {
        const seller = makeAgent('seller');
        const buyer = makeAgent('buyer');

        const ask = makeAsk(seller, 1.0, 40);
        const bid = makeAgentBid(buyer, 2.0, 100);

        clearUnifiedBids([], [bid], [ask]);

        expect(ask.filled).toBeCloseTo(40);
        expect(bid.filled).toBeCloseTo(40);
    });

    it('partial fill when demand is less than supply', () => {
        const seller = makeAgent('seller');
        const buyer = makeAgent('buyer');

        const ask = makeAsk(seller, 1.0, 100);
        const bid = makeAgentBid(buyer, 2.0, 40);

        clearUnifiedBids([], [bid], [ask]);

        expect(ask.filled).toBeCloseTo(40);
        expect(bid.filled).toBeCloseTo(40);
    });
});

// ---------------------------------------------------------------------------
// Equal-share: same-price sellers share demand equally (not proportionally)
// ---------------------------------------------------------------------------

describe('clearUnifiedBids — equal-share ask allocation', () => {
    it('two sellers at the same price each receive an equal share of demand, capped by their supply', () => {
        const sellerA = makeAgent('seller-a');
        const sellerB = makeAgent('seller-b');
        const buyer = makeAgent('buyer');

        // Supply: A=300, B=100, Demand=200 → equal share = 100 each.
        // Both can absorb 100, so each fills 100.  Total = 200 = full demand.
        const askA = makeAsk(sellerA, 1.0, 300);
        const askB = makeAsk(sellerB, 1.0, 100);
        const bid = makeAgentBid(buyer, 2.0, 200);

        clearUnifiedBids([], [bid], [askA, askB]);

        expect(askA.filled).toBeCloseTo(100, 6);
        expect(askB.filled).toBeCloseTo(100, 6);
        expect(bid.filled).toBeCloseTo(200, 6);
    });

    it('two equal-supply sellers split demand 50/50 at same price', () => {
        const sellerA = makeAgent('seller-a');
        const sellerB = makeAgent('seller-b');
        const buyer = makeAgent('buyer');

        const askA = makeAsk(sellerA, 1.0, 100);
        const askB = makeAsk(sellerB, 1.0, 100);
        const bid = makeAgentBid(buyer, 2.0, 60);

        clearUnifiedBids([], [bid], [askA, askB]);

        expect(askA.filled).toBeCloseTo(30, 6);
        expect(askB.filled).toBeCloseTo(30, 6);
    });

    it('three sellers at the same floor price all receive sales (reproduces starvation bug)', () => {
        const sellers = ['a', 'b', 'c'].map((id) => makeAgent(`seller-${id}`));
        const buyer = makeAgent('buyer');

        // All sellers at the same price — mimics the price-floor scenario in the screenshot
        const asks = sellers.map((s) => makeAsk(s, 0.01, 100));
        const bid = makeAgentBid(buyer, 0.05, 150);

        clearUnifiedBids([], [bid], asks);

        // Each seller offered equal supply → each should get equal fills
        for (const ask of asks) {
            expect(ask.filled).toBeCloseTo(50, 6);
        }
        expect(bid.filled).toBeCloseTo(150, 6);
    });

    it('cheaper seller fills before more expensive seller (price priority preserved)', () => {
        const cheapSeller = makeAgent('cheap');
        const expSeller = makeAgent('expensive');
        const buyer = makeAgent('buyer');

        const cheapAsk = makeAsk(cheapSeller, 1.0, 100);
        const expAsk = makeAsk(expSeller, 5.0, 100);
        const bid = makeAgentBid(buyer, 10.0, 100);

        clearUnifiedBids([], [bid], [cheapAsk, expAsk]);

        // Only the cheap ask should be consumed (buyer gets exactly 100 from cheapest first)
        expect(cheapAsk.filled).toBeCloseTo(100, 6);
        expect(expAsk.filled).toBe(0);
    });

    it('revenue on ask is correctly accumulated', () => {
        const sellerA = makeAgent('seller-a');
        const sellerB = makeAgent('seller-b');
        const buyer = makeAgent('buyer');

        const askA = makeAsk(sellerA, 2.0, 100);
        const askB = makeAsk(sellerB, 2.0, 100);
        const bid = makeAgentBid(buyer, 5.0, 80);

        clearUnifiedBids([], [bid], [askA, askB]);

        expect(askA.revenue).toBeCloseTo(askA.filled * 2.0, 6);
        expect(askB.revenue).toBeCloseTo(askB.filled * 2.0, 6);
        expect(askA.filled + askB.filled).toBeCloseTo(80, 6);
    });
});

// ---------------------------------------------------------------------------
// Pro-rata: same-price buyers share supply proportionally
// ---------------------------------------------------------------------------

describe('clearUnifiedBids — equal-share bid allocation', () => {
    it('two agent buyers at the same price each receive an equal share of supply, capped by their demand', () => {
        const seller = makeAgent('seller');
        const buyerA = makeAgent('buyer-a');
        const buyerB = makeAgent('buyer-b');

        // Supply=60, A demands 100, B demands 50 → equal share = 30 each.
        // Both can absorb 30, so each fills 30.  Total = 60 = full supply.
        const ask = makeAsk(seller, 1.0, 60);
        const bidA = makeAgentBid(buyerA, 2.0, 100);
        const bidB = makeAgentBid(buyerB, 2.0, 50);

        clearUnifiedBids([], [bidA, bidB], [ask]);

        expect(bidA.filled).toBeCloseTo(30, 6);
        expect(bidB.filled).toBeCloseTo(30, 6);
    });

    it('two equal-demand buyers split supply 50/50', () => {
        const seller = makeAgent('seller');
        const buyerA = makeAgent('buyer-a');
        const buyerB = makeAgent('buyer-b');

        const ask = makeAsk(seller, 1.0, 60);
        const bidA = makeAgentBid(buyerA, 2.0, 80);
        const bidB = makeAgentBid(buyerB, 2.0, 80);

        clearUnifiedBids([], [bidA, bidB], [ask]);

        expect(bidA.filled).toBeCloseTo(30, 6);
        expect(bidB.filled).toBeCloseTo(30, 6);
    });

    it('higher-price buyer still wins over lower-price buyer when prices differ', () => {
        const seller = makeAgent('seller');
        const richBuyer = makeAgent('rich');
        const poorBuyer = makeAgent('poor');

        const ask = makeAsk(seller, 1.0, 50);
        const richBid = makeAgentBid(richBuyer, 10.0, 50);
        const poorBid = makeAgentBid(poorBuyer, 1.5, 50);

        clearUnifiedBids([], [richBid, poorBid], [ask]);

        expect(richBid.filled).toBeCloseTo(50, 6);
        expect(poorBid.filled).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Household bids
// ---------------------------------------------------------------------------

describe('clearUnifiedBids — household bids', () => {
    it('single household bid fills from single ask', () => {
        const seller = makeAgent('seller');
        const ask = makeAsk(seller, 1.0, 100);
        const hBid = makeHouseholdBid(2.0, 80);

        const result = clearUnifiedBids([hBid], [], [ask]);

        expect(result.householdBidFilled[0]).toBeCloseTo(80, 6);
        expect(result.householdBidCosts[0]).toBeCloseTo(80 * 1.0, 6);
        expect(ask.filled).toBeCloseTo(80, 6);
    });

    it('household and agent buyer at the same price each receive an equal share of supply', () => {
        const seller = makeAgent('seller');
        const buyer = makeAgent('buyer');

        // Supply=60, household demands 90, agent demands 30 → equal share = 30 each.
        // Both can absorb 30, so each fills 30.  Total = 60 = full supply.
        const ask = makeAsk(seller, 1.0, 60);
        const hBid = makeHouseholdBid(2.0, 90);
        const aBid = makeAgentBid(buyer, 2.0, 30);

        const result = clearUnifiedBids([hBid], [aBid], [ask]);

        expect(result.householdBidFilled[0]).toBeCloseTo(30, 6);
        expect(aBid.filled).toBeCloseTo(30, 6);
    });

    it('householdBidCosts accumulates cost correctly across multiple ask price levels', () => {
        const seller1 = makeAgent('seller-1');
        const seller2 = makeAgent('seller-2');

        const ask1 = makeAsk(seller1, 1.0, 50);
        const ask2 = makeAsk(seller2, 2.0, 50);
        const hBid = makeHouseholdBid(5.0, 80);

        const result = clearUnifiedBids([hBid], [], [ask1, ask2]);

        // 50 units at 1.0, 30 units at 2.0
        expect(result.householdBidFilled[0]).toBeCloseTo(80, 6);
        expect(result.householdBidCosts[0]).toBeCloseTo(50 * 1.0 + 30 * 2.0, 5);
    });
});

// ---------------------------------------------------------------------------
// Deposit constraint for agent bids
// ---------------------------------------------------------------------------

describe('clearUnifiedBids — deposit constraints', () => {
    it('agent cannot buy more than deposits allow', () => {
        const seller = makeAgent('seller');
        const buyer = makeAgent('buyer');

        const ask = makeAsk(seller, 2.0, 100);
        const bid = makeAgentBid(buyer, 5.0, 100, 10);

        clearUnifiedBids([], [bid], [ask]);

        // With only 10 deposits and price 2.0, can afford at most floor(10/2)=5 units
        expect(bid.filled).toBeCloseTo(5, 6);
        expect(bid.cost).toBeCloseTo(10, 6);
    });
});

// ---------------------------------------------------------------------------
// Money conservation
// ---------------------------------------------------------------------------

describe('clearUnifiedBids — money conservation', () => {
    it('total revenue equals total cost for agent trades', () => {
        const sellers = [makeAgent('s1'), makeAgent('s2')];
        const buyers = [makeAgent('b1'), makeAgent('b2')];

        const asks = sellers.map((s, i) => makeAsk(s, 1.0 + i * 0.5, 80));
        const bids = buyers.map((b, i) => makeAgentBid(b, 3.0 - i * 0.5, 60));

        clearUnifiedBids([], bids, asks);

        const totalRevenue = asks.reduce((s, a) => s + a.revenue, 0);
        const totalCost = bids.reduce((s, b) => s + b.cost, 0);

        expect(totalRevenue).toBeCloseTo(totalCost, 6);
    });

    it('total revenue equals total cost when households and agents trade', () => {
        const seller = makeAgent('seller');
        const buyer = makeAgent('buyer');

        const ask = makeAsk(seller, 1.5, 200);
        const hBid = makeHouseholdBid(3.0, 100);
        const aBid = makeAgentBid(buyer, 3.0, 100);

        const result = clearUnifiedBids([hBid], [aBid], [ask]);

        const totalRevenue = ask.revenue;
        const totalCost = aBid.cost + result.householdBidCosts[0];

        expect(totalRevenue).toBeCloseTo(totalCost, 6);
    });
});

// ---------------------------------------------------------------------------
// Bug regression: stale effectiveDemands with multiple sellers in same tier
// ---------------------------------------------------------------------------

describe('clearUnifiedBids — multi-seller same-price tier (stale effectiveDemands regression)', () => {
    it('no buyer receives more than their demanded quantity (3 sellers, 3 buyers at same price)', () => {
        // Reproduces the Concrete Giant / Urban Materials bug:
        // 3 sellers at the same price were processed one-by-one, each time
        // using stale effectiveDemands.  A buyer with small demand (20) was
        // being filled 20 units per seller (3×20 = 60) instead of 20 total.
        const sellers = ['s1', 's2', 's3'].map((id) => makeAgent(id));
        const buyerA = makeAgent('urban'); // large demand
        const buyerB = makeAgent('brick'); // medium demand
        const buyerC = makeAgent('concrete'); // small demand

        const asks = sellers.map((s) => makeAsk(s, 0.01, 100)); // 300 total supply
        const bidA = makeAgentBid(buyerA, 0.01, 130); // demand 130
        const bidB = makeAgentBid(buyerB, 0.01, 90); // demand 90
        const bidC = makeAgentBid(buyerC, 0.01, 20); // demand 20

        clearUnifiedBids([], [bidA, bidB, bidC], asks);

        // No buyer should exceed their demand
        expect(bidC.filled).toBeLessThanOrEqual(20 + 1e-9);
        expect(bidB.filled).toBeLessThanOrEqual(90 + 1e-9);
        expect(bidA.filled).toBeLessThanOrEqual(130 + 1e-9);

        // Total filled must equal total supply (240 supply, 240 demand)
        expect(bidA.filled + bidB.filled + bidC.filled).toBeCloseTo(240, 5);
    });

    it('equal-share: buyers at same price share supply proportionally when supply is scarce', () => {
        const seller = makeAgent('seller');
        const buyerA = makeAgent('buyer-a');
        const buyerB = makeAgent('buyer-b');
        const buyerC = makeAgent('buyer-c');

        // Supply=60, demands: A=130, B=90, C=20 → equal-share gives each 20,
        // remainder split between A and B until exhausted
        const ask = makeAsk(seller, 0.01, 60);
        const bidA = makeAgentBid(buyerA, 0.01, 130);
        const bidB = makeAgentBid(buyerB, 0.01, 90);
        const bidC = makeAgentBid(buyerC, 0.01, 20);

        clearUnifiedBids([], [bidA, bidB, bidC], [ask]);

        expect(bidA.filled + bidB.filled + bidC.filled).toBeCloseTo(60, 5);
        expect(bidC.filled).toBeLessThanOrEqual(20 + 1e-9);
        expect(bidA.filled).toBeLessThanOrEqual(130 + 1e-9);
        expect(bidB.filled).toBeLessThanOrEqual(90 + 1e-9);
    });
});

// ---------------------------------------------------------------------------
// Bug regression: Math.floor in effectiveBidCapacity blocks non-pieces bids
// ---------------------------------------------------------------------------

describe('clearUnifiedBids — fractional deposit budget (floor regression)', () => {
    it('agent with sub-unit deposit budget can still buy a fractional solid quantity', () => {
        // Reproduces the "Katz und Maus" bug:
        // An agent had a large bid for another resource that consumed most of
        // their deposit budget, leaving remainingDeposits < askPrice for the
        // coal bid.  Math.floor(0.005 / 0.01) = 0 → bid was silently ignored
        // even though the agent could afford 0.5 units.
        const seller = makeAgent('seller');
        const buyer = makeAgent('buyer');

        // remainingDeposits = 0.005 at askPrice 0.01 → agent can afford 0.5 units
        const ask = makeAsk(seller, 0.01, 100);
        const bid = makeAgentBid(buyer, 0.05, 10, /* remainingDeposits */ 0.005);

        clearUnifiedBids([], [bid], [ask]);

        // Should be able to buy 0.5 units exactly (0.005 / 0.01)
        expect(bid.filled).toBeCloseTo(0.5, 6);
    });

    it('highest bidder is not blocked when their deposit share falls below askPrice', () => {
        // Agent bids highest (0.033) but deposit share for this resource is tiny.
        // Without the fix, floor(0.009 / 0.01) = 0 makes them invisible to the
        // matching engine even though lower-priced buyers get filled.
        const seller = makeAgent('seller');
        const highBuyer = makeAgent('high-bidder'); // bid 0.033, tiny budget
        const lowBuyer = makeAgent('low-bidder'); // bid 0.01,  normal budget

        const ask = makeAsk(seller, 0.01, 100);
        // highBuyer: remainingDeposits=0.009, bidPrice=0.033, qty=10
        //   → can afford 0.009/0.01 = 0.9 units
        const highBid = makeAgentBid(highBuyer, 0.033, 10, 0.009);
        const lowBid = makeAgentBid(lowBuyer, 0.01, 10, 1e9);

        clearUnifiedBids([], [highBid, lowBid], [ask]);

        // High bidder must be filled before low bidder (price priority).
        // They can buy at most 0.9 units given their budget.
        expect(highBid.filled).toBeCloseTo(0.9, 6);
        // Low bidder fills the remainder.
        expect(lowBid.filled).toBeCloseTo(10, 6);
    });
});
