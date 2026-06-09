import { describe, expect, it } from 'vitest';

import { coalResourceType, ironOreResourceType } from '../planet/resources';
import { makePlanet } from '../utils/testHelper';
import type { AgentBidOrder, AskOrder } from './marketTypes';
import { buildPlanetOrderBook } from './orderBookSnapshot';

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

        expect(asks).toEqual([
            { price: 10, quantity: 50 },
            { price: 20, quantity: 50 },
        ]);
    });

    it('uses remaining quantity (quantity - filled), not initial quantity', () => {
        const planet = makePlanet();

        const askBooks = new Map<string, AskOrder[]>([['Coal', [makeAsk(10, 100, 60)]]]);
        buildPlanetOrderBook(planet, askBooks, new Map());
        expect(planet.orderBooks?.Coal?.asks).toEqual([{ price: 10, quantity: 40 }]);
    });

    it('skips fully-filled orders', () => {
        const planet = makePlanet();
        const askBooks = new Map<string, AskOrder[]>([['Coal', [makeAsk(10, 50, 50), makeAsk(20, 30, 0)]]]);
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
