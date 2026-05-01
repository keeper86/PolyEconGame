import { describe, expect, it } from 'vitest';
import { SHIP_MARKET_EMA_ALPHA } from '../constants';
import { makeAgent, makeGameState, makePlanet } from '../utils/testHelper';
import { effectiveShipValue, findCompatibleTrades, updateShipEma } from './shipMarket';
import type { ShipCapitalMarket } from './ships';
import { createShip, shiptypes } from './ships';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMarket(): ShipCapitalMarket {
    return { tradeHistory: [], emaPrice: {} };
}

function makeTransportShipIdle(planetId: string) {
    const planet = makePlanet({ id: planetId });
    const ship = createShip(shiptypes.solid.bulkCarrier1, 0, 'S1', planet);
    return ship;
}

// ---------------------------------------------------------------------------
// effectiveShipValue
// ---------------------------------------------------------------------------

describe('effectiveShipValue', () => {
    it('returns a positive value for a healthy idle ship without gameState', () => {
        const ship = makeTransportShipIdle('p1');
        const val = effectiveShipValue(ship);
        expect(val).toBeGreaterThan(0);
    });

    it('returns 0 when maxMaintenance is 0', () => {
        const ship = makeTransportShipIdle('p1');
        ship.maxMaintenance = 0;
        ship.maintainanceStatus = 0;
        const val = effectiveShipValue(ship);
        expect(val).toBe(0);
    });

    it('degrades with lower maintainanceStatus', () => {
        const ship = makeTransportShipIdle('p1');
        const fullVal = effectiveShipValue(ship);
        ship.maintainanceStatus = 0.5;
        const halfVal = effectiveShipValue(ship);
        expect(halfVal).toBeLessThan(fullVal);
    });

    it('applies maintenance-cost penalty when gameState has a market price for the planet', () => {
        const planet = makePlanet({ id: 'p1' });
        planet.marketPrices['Maintenance Service'] = 10;
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([planet], [agent]);

        const ship = makeTransportShipIdle('p1');
        const withPenalty = effectiveShipValue(ship, state);
        const withoutPenalty = effectiveShipValue(ship);
        // Penalty reduces value
        expect(withPenalty).toBeLessThan(withoutPenalty);
    });

    it('does not apply penalty for a transporting ship with no derived planetId', () => {
        const planet = makePlanet({ id: 'p1' });
        planet.marketPrices['Maintenance Service'] = 100;
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([planet], [agent]);

        const ship = makeTransportShipIdle('p1');
        ship.state = {
            type: 'transporting',
            from: 'p1',
            to: 'p2',
            cargo: null,
            arrivalTick: 999,
        };
        const val = effectiveShipValue(ship, state);
        // No planet lookup possible for transporting state → no penalty
        const valNoPenalty = effectiveShipValue(ship);
        expect(val).toBe(valNoPenalty);
    });

    it('applies penalty for a ship in loading state (has planetId)', () => {
        const planet = makePlanet({ id: 'p1' });
        planet.marketPrices['Maintenance Service'] = 10;
        const agent = makeAgent('a1', 'p1');
        const state = makeGameState([planet], [agent]);

        const ship = makeTransportShipIdle('p1');
        ship.state = {
            type: 'loading',
            planetId: 'p1',
            to: 'p2',
            cargoGoal: null,
            currentCargo: { resource: shiptypes.solid.bulkCarrier1.cargoSpecification as never, quantity: 0 },
        };
        const val = effectiveShipValue(ship, state);
        const valNoPenalty = effectiveShipValue(ship);
        expect(val).toBeLessThan(valNoPenalty);
    });
});

// ---------------------------------------------------------------------------
// findCompatibleTrades
// ---------------------------------------------------------------------------

describe('findCompatibleTrades', () => {
    it('returns empty when there are no listings', () => {
        const state = makeGameState([makePlanet({ id: 'p1' })], [makeAgent('a1', 'p1')]);
        expect(findCompatibleTrades(state)).toHaveLength(0);
    });

    it('returns empty when types do not match', () => {
        const seller = makeAgent('seller', 'p1');
        seller.assets.p1!.shipListings.push({
            id: 'l1',
            sellerAgentId: 'seller',
            shipName: 'S1',
            shipTypeName: 'Bulk Carrier 1',
            askPrice: 1000,
            planetId: 'p1',
            postedAtTick: 0,
        });
        const buyer = makeAgent('buyer', 'p1');
        buyer.assets.p1!.shipBuyingOffers.push({
            id: 'o1',
            buyerAgentId: 'buyer',
            shipType: 'tanker1', // different type key
            price: 2000,
            status: 'open',
        });
        const state = makeGameState([makePlanet({ id: 'p1' })], [seller, buyer]);
        expect(findCompatibleTrades(state)).toHaveLength(0);
    });

    it('returns empty when offer price is below ask price', () => {
        const seller = makeAgent('seller', 'p1');
        seller.assets.p1!.shipListings.push({
            id: 'l1',
            sellerAgentId: 'seller',
            shipName: 'S1',
            shipTypeName: 'Small Bulk Carrier',
            askPrice: 5000,
            planetId: 'p1',
            postedAtTick: 0,
        });
        const buyer = makeAgent('buyer', 'p1');
        buyer.assets.p1!.shipBuyingOffers.push({
            id: 'o1',
            buyerAgentId: 'buyer',
            shipType: 'bulkCarrier1',
            price: 3000, // below ask
            status: 'open',
        });
        const state = makeGameState([makePlanet({ id: 'p1' })], [seller, buyer]);
        expect(findCompatibleTrades(state)).toHaveLength(0);
    });

    it('skips offers with status !== open', () => {
        const seller = makeAgent('seller', 'p1');
        seller.assets.p1!.shipListings.push({
            id: 'l1',
            sellerAgentId: 'seller',
            shipName: 'S1',
            shipTypeName: 'Small Bulk Carrier',
            askPrice: 1000,
            planetId: 'p1',
            postedAtTick: 0,
        });
        const buyer = makeAgent('buyer', 'p1');
        buyer.assets.p1!.shipBuyingOffers.push({
            id: 'o1',
            buyerAgentId: 'buyer',
            shipType: 'bulkCarrier1',
            shipName: 'S1',
            price: 2000,
            sellerAgentId: 'seller',
            status: 'accepted', // not open
        });
        const state = makeGameState([makePlanet({ id: 'p1' })], [seller, buyer]);
        expect(findCompatibleTrades(state)).toHaveLength(0);
    });

    it('returns a matching pair with correct surplus', () => {
        const seller = makeAgent('seller', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const ship = createShip(shiptypes.solid.bulkCarrier1, 0, 'S1', planet);
        seller.ships.push(ship);
        seller.assets.p1!.shipListings.push({
            id: 'l1',
            sellerAgentId: 'seller',
            shipName: 'S1',
            shipTypeName: 'Bulk Carrier 1',
            askPrice: 1000,
            planetId: 'p1',
            postedAtTick: 0,
        });
        const buyer = makeAgent('buyer', 'p1');
        buyer.assets.p1!.shipBuyingOffers.push({
            id: 'o1',
            buyerAgentId: 'buyer',
            shipType: 'bulkCarrier1',
            price: 1500,
            status: 'open',
        });
        const state = makeGameState([planet], [seller, buyer]);
        const trades = findCompatibleTrades(state);
        expect(trades).toHaveLength(1);
        expect(trades[0]!.surplus).toBe(500);
        expect(trades[0]!.listing.shipName).toBe('S1');
    });

    it('sorts multiple pairs by surplus descending', () => {
        const seller = makeAgent('seller', 'p1');
        const planet = makePlanet({ id: 'p1' });
        const s1 = createShip(shiptypes.solid.bulkCarrier1, 0, 'S1', planet);
        const s2 = createShip(shiptypes.solid.bulkCarrier1, 0, 'S2', planet);
        seller.ships.push(s1, s2);
        seller.assets.p1!.shipListings.push(
            {
                id: 'l1',
                sellerAgentId: 'seller',
                shipName: 'S1',
                shipTypeName: 'Bulk Carrier 1',
                askPrice: 1000,
                planetId: 'p1',
                postedAtTick: 0,
            },
            {
                id: 'l2',
                sellerAgentId: 'seller',
                shipName: 'S2',
                shipTypeName: 'Bulk Carrier 1',
                askPrice: 1000,
                planetId: 'p1',
                postedAtTick: 0,
            },
        );
        const buyer = makeAgent('buyer', 'p1');
        buyer.assets.p1!.shipBuyingOffers.push(
            {
                id: 'o1',
                buyerAgentId: 'buyer',
                shipType: 'bulkCarrier1',
                price: 1200,
                status: 'open',
            },
            {
                id: 'o2',
                buyerAgentId: 'buyer',
                shipType: 'bulkCarrier1',
                price: 3000,
                status: 'open',
            },
        );
        const state = makeGameState([planet], [seller, buyer]);
        const trades = findCompatibleTrades(state);
        // 4 combinations (2 listings × 2 offers), sorted by surplus desc → max surplus first
        const surpluses = trades.map((t) => t.surplus);
        for (let i = 0; i < surpluses.length - 1; i++) {
            expect(surpluses[i]).toBeGreaterThanOrEqual(surpluses[i + 1]!);
        }
        expect(surpluses[0]).toBe(2000); // offer 3000 - ask 1000
    });
});

// ---------------------------------------------------------------------------
// updateShipEma
// ---------------------------------------------------------------------------

describe('updateShipEma', () => {
    it('sets price directly on first trade (no prior EMA)', () => {
        const market = makeMarket();
        updateShipEma(market, 'BulkCarrier1', 1000);
        expect(market.emaPrice.BulkCarrier1).toBe(1000);
    });

    it('applies EMA formula on subsequent trades', () => {
        const market = makeMarket();
        updateShipEma(market, 'BulkCarrier1', 1000);
        updateShipEma(market, 'BulkCarrier1', 2000);
        const expected = SHIP_MARKET_EMA_ALPHA * 2000 + (1 - SHIP_MARKET_EMA_ALPHA) * 1000;
        expect(market.emaPrice.BulkCarrier1).toBeCloseTo(expected, 10);
    });

    it('tracks multiple ship types independently', () => {
        const market = makeMarket();
        updateShipEma(market, 'TypeA', 500);
        updateShipEma(market, 'TypeB', 800);
        expect(market.emaPrice.TypeA).toBe(500);
        expect(market.emaPrice.TypeB).toBe(800);
    });
});
