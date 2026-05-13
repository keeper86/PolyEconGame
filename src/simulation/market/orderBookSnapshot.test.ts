import { describe, expect, it } from 'vitest';

import type { Planet, ResourceOrderBook } from '../planet/planet';
import { coalResourceType, ironOreResourceType } from '../planet/resources';
import { makePlanet } from '../utils/testHelper';
import type { AgentBidOrder, AskOrder } from './marketTypes';
import { buildPlanetOrderBook, getEffectiveBuyPrice, getEffectiveSellPrice } from './orderBookSnapshot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAsk(price: number, quantity: number, filled = 0): AskOrder {
    return {
        agent: {} as never,
        resource: coalResourceType,
        askPrice: price,
        quantity,
        filled,
        revenue: 0,
    };
}

function makeBid(price: number, quantity: number, filled = 0): AgentBidOrder {
    return {
        agent: {} as never,
        resource: coalResourceType,
        bidPrice: price,
        quantity,
        filled,
        cost: 0,
        remainingDeposits: 1_000_000,
    };
}

function planetWithBook(book: Record<string, ResourceOrderBook>): Planet {
    const p = makePlanet();
    p.orderBooks = book;
    return p;
}

// ---------------------------------------------------------------------------
// getEffectiveBuyPrice
// ---------------------------------------------------------------------------

describe('getEffectiveBuyPrice', () => {
    it('returns null for zero quantity', () => {
        const planet = planetWithBook({ Coal: { asks: [{ price: 10, quantity: 100 }], bids: [] } });
        expect(getEffectiveBuyPrice(planet, 'Coal', 0)).toBeNull();
    });

    it('returns null when orderBooks is undefined', () => {
        const planet = makePlanet();
        expect(getEffectiveBuyPrice(planet, 'Coal', 10)).toBeNull();
    });

    it('returns null when resource has no entry in order book', () => {
        const planet = planetWithBook({});
        expect(getEffectiveBuyPrice(planet, 'Coal', 10)).toBeNull();
    });

    it('returns null when ask side is empty', () => {
        const planet = planetWithBook({ Coal: { asks: [], bids: [] } });
        expect(getEffectiveBuyPrice(planet, 'Coal', 10)).toBeNull();
    });

    it('returns spot price when depth exactly matches requested quantity', () => {
        const planet = planetWithBook({ Coal: { asks: [{ price: 50, quantity: 100 }], bids: [] } });
        expect(getEffectiveBuyPrice(planet, 'Coal', 100)).toBe(50);
    });

    it('returns spot price when depth exceeds requested quantity', () => {
        const planet = planetWithBook({ Coal: { asks: [{ price: 50, quantity: 200 }], bids: [] } });
        expect(getEffectiveBuyPrice(planet, 'Coal', 100)).toBe(50);
    });

    it('returns null when total ask depth is insufficient', () => {
        const planet = planetWithBook({ Coal: { asks: [{ price: 50, quantity: 50 }], bids: [] } });
        expect(getEffectiveBuyPrice(planet, 'Coal', 100)).toBeNull();
    });

    it('returns volume-weighted average across two price levels', () => {
        // 50 @ 10 and 50 @ 20 → VWAP for 100 = (50*10 + 50*20)/100 = 15
        const planet = planetWithBook({
            Coal: {
                asks: [
                    { price: 10, quantity: 50 },
                    { price: 20, quantity: 50 },
                ],
                bids: [],
            },
        });
        expect(getEffectiveBuyPrice(planet, 'Coal', 100)).toBe(15);
    });

    it('returns VWAP for partial fill of each level across three levels', () => {
        // Want 60 units: take 30 @ 10, 20 @ 20, 10 @ 30
        // VWAP = (30*10 + 20*20 + 10*30) / 60 = (300 + 400 + 300) / 60 = 1000/60 ≈ 16.67
        const planet = planetWithBook({
            Coal: {
                asks: [
                    { price: 10, quantity: 30 },
                    { price: 20, quantity: 20 },
                    { price: 30, quantity: 20 },
                ],
                bids: [],
            },
        });
        expect(getEffectiveBuyPrice(planet, 'Coal', 60)).toBeCloseTo(1000 / 60, 6);
    });

    it('returns null when depth falls short on the last level', () => {
        const planet = planetWithBook({
            Coal: {
                asks: [
                    { price: 10, quantity: 50 },
                    { price: 20, quantity: 30 },
                ],
                bids: [],
            },
        });
        expect(getEffectiveBuyPrice(planet, 'Coal', 100)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getEffectiveSellPrice
// ---------------------------------------------------------------------------

describe('getEffectiveSellPrice', () => {
    it('returns null for zero quantity', () => {
        const planet = planetWithBook({ Coal: { asks: [], bids: [{ price: 10, quantity: 100 }] } });
        expect(getEffectiveSellPrice(planet, 'Coal', 0)).toBeNull();
    });

    it('returns null when orderBooks is undefined', () => {
        const planet = makePlanet();
        expect(getEffectiveSellPrice(planet, 'Coal', 10)).toBeNull();
    });

    it('returns null when resource has no entry in order book', () => {
        const planet = planetWithBook({});
        expect(getEffectiveSellPrice(planet, 'Coal', 10)).toBeNull();
    });

    it('returns null when bid side is empty', () => {
        const planet = planetWithBook({ Coal: { asks: [], bids: [] } });
        expect(getEffectiveSellPrice(planet, 'Coal', 10)).toBeNull();
    });

    it('returns bid price when depth exactly matches requested quantity', () => {
        const planet = planetWithBook({ Coal: { asks: [], bids: [{ price: 50, quantity: 100 }] } });
        expect(getEffectiveSellPrice(planet, 'Coal', 100)).toBe(50);
    });

    it('returns bid price when depth exceeds requested quantity', () => {
        const planet = planetWithBook({ Coal: { asks: [], bids: [{ price: 50, quantity: 200 }] } });
        expect(getEffectiveSellPrice(planet, 'Coal', 100)).toBe(50);
    });

    it('returns null when total bid depth is insufficient', () => {
        const planet = planetWithBook({ Coal: { asks: [], bids: [{ price: 50, quantity: 50 }] } });
        expect(getEffectiveSellPrice(planet, 'Coal', 100)).toBeNull();
    });

    it('returns volume-weighted average across two bid levels', () => {
        // 50 @ 20 and 50 @ 10 → VWAP for 100 = (50*20 + 50*10)/100 = 15
        const planet = planetWithBook({
            Coal: {
                asks: [],
                bids: [
                    { price: 20, quantity: 50 },
                    { price: 10, quantity: 50 },
                ],
            },
        });
        expect(getEffectiveSellPrice(planet, 'Coal', 100)).toBe(15);
    });

    it('returns VWAP for partial fill across three bid levels', () => {
        // Want 60 units: fill 30 @ 30, 20 @ 20, 10 @ 10
        // VWAP = (30*30 + 20*20 + 10*10) / 60 = (900 + 400 + 100) / 60 = 1400/60 ≈ 23.33
        const planet = planetWithBook({
            Coal: {
                asks: [],
                bids: [
                    { price: 30, quantity: 30 },
                    { price: 20, quantity: 20 },
                    { price: 10, quantity: 20 },
                ],
            },
        });
        expect(getEffectiveSellPrice(planet, 'Coal', 60)).toBeCloseTo(1400 / 60, 6);
    });

    it('returns null when depth falls short on the last bid level', () => {
        const planet = planetWithBook({
            Coal: {
                asks: [],
                bids: [
                    { price: 20, quantity: 50 },
                    { price: 10, quantity: 30 },
                ],
            },
        });
        expect(getEffectiveSellPrice(planet, 'Coal', 100)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// buildPlanetOrderBook
// ---------------------------------------------------------------------------

describe('buildPlanetOrderBook', () => {
    it('builds empty orderBooks when no orders exist', () => {
        const planet = makePlanet();
        buildPlanetOrderBook(planet, new Map(), new Map());
        expect(planet.orderBooks).toEqual({});
    });

    it('includes a resource with only asks', () => {
        const planet = makePlanet();
        const askBooks = new Map<string, AskOrder[]>([['Coal', [makeAsk(10, 100)]]]);
        buildPlanetOrderBook(planet, askBooks, new Map());
        expect(planet.orderBooks?.Coal?.asks).toEqual([{ price: 10, quantity: 100 }]);
        expect(planet.orderBooks?.Coal?.bids).toEqual([]);
    });

    it('includes a resource with only bids', () => {
        const planet = makePlanet();
        const bidBooks = new Map<string, AgentBidOrder[]>([['Coal', [makeBid(10, 100)]]]);
        buildPlanetOrderBook(planet, new Map(), bidBooks);
        expect(planet.orderBooks?.Coal?.bids).toEqual([{ price: 10, quantity: 100 }]);
        expect(planet.orderBooks?.Coal?.asks).toEqual([]);
    });

    it('sorts asks ascending by price', () => {
        const planet = makePlanet();
        const askBooks = new Map<string, AskOrder[]>([['Coal', [makeAsk(30, 10), makeAsk(10, 20), makeAsk(20, 15)]]]);
        buildPlanetOrderBook(planet, askBooks, new Map());
        const asks = planet.orderBooks?.Coal?.asks ?? [];
        expect(asks.map((a) => a.price)).toEqual([10, 20, 30]);
    });

    it('sorts bids descending by price', () => {
        const planet = makePlanet();
        const bidBooks = new Map<string, AgentBidOrder[]>([
            ['Coal', [makeBid(10, 20), makeBid(30, 10), makeBid(20, 15)]],
        ]);
        buildPlanetOrderBook(planet, new Map(), bidBooks);
        const bids = planet.orderBooks?.Coal?.bids ?? [];
        expect(bids.map((b) => b.price)).toEqual([30, 20, 10]);
    });

    it('aggregates multiple orders at the same price level', () => {
        const planet = makePlanet();
        const askBooks = new Map<string, AskOrder[]>([['Coal', [makeAsk(10, 30), makeAsk(10, 20), makeAsk(20, 50)]]]);
        buildPlanetOrderBook(planet, askBooks, new Map());
        const asks = planet.orderBooks?.Coal?.asks ?? [];
        // Two entries at price 10 should be merged
        expect(asks).toEqual([
            { price: 10, quantity: 50 },
            { price: 20, quantity: 50 },
        ]);
    });

    it('uses remaining quantity (quantity - filled), not initial quantity', () => {
        const planet = makePlanet();
        // Order placed for 100, but 60 already filled → 40 remaining
        const askBooks = new Map<string, AskOrder[]>([['Coal', [makeAsk(10, 100, 60)]]]);
        buildPlanetOrderBook(planet, askBooks, new Map());
        expect(planet.orderBooks?.Coal?.asks).toEqual([{ price: 10, quantity: 40 }]);
    });

    it('skips fully-filled orders', () => {
        const planet = makePlanet();
        const askBooks = new Map<string, AskOrder[]>([
            [
                'Coal',
                [
                    makeAsk(10, 50, 50), // fully filled
                    makeAsk(20, 30, 0), // still open
                ],
            ],
        ]);
        buildPlanetOrderBook(planet, askBooks, new Map());
        const asks = planet.orderBooks?.Coal?.asks ?? [];
        expect(asks).toEqual([{ price: 20, quantity: 30 }]);
    });

    it('handles multiple resources independently', () => {
        const planet = makePlanet();
        const askBooks = new Map<string, AskOrder[]>([
            ['Coal', [makeAsk(10, 100)]],
            [
                'IronOre',
                [
                    {
                        agent: {} as never,
                        resource: ironOreResourceType,
                        askPrice: 5,
                        quantity: 200,
                        filled: 0,
                        revenue: 0,
                    },
                ],
            ],
        ]);
        buildPlanetOrderBook(planet, askBooks, new Map());
        expect(planet.orderBooks?.Coal?.asks).toEqual([{ price: 10, quantity: 100 }]);
        expect(planet.orderBooks?.IronOre?.asks).toEqual([{ price: 5, quantity: 200 }]);
    });

    it('omits resources where all orders are fully filled', () => {
        const planet = makePlanet();
        const askBooks = new Map<string, AskOrder[]>([['Coal', [makeAsk(10, 50, 50)]]]);
        buildPlanetOrderBook(planet, askBooks, new Map());
        expect(planet.orderBooks?.Coal).toBeUndefined();
    });

    it('overwrites a previous snapshot on subsequent calls', () => {
        const planet = makePlanet();
        const first = new Map<string, AskOrder[]>([['Coal', [makeAsk(10, 100)]]]);
        buildPlanetOrderBook(planet, first, new Map());
        expect(planet.orderBooks?.Coal?.asks[0]?.quantity).toBe(100);

        const second = new Map<string, AskOrder[]>([['Coal', [makeAsk(10, 50)]]]);
        buildPlanetOrderBook(planet, second, new Map());
        expect(planet.orderBooks?.Coal?.asks[0]?.quantity).toBe(50);
    });
});
