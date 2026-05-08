import { describe, expect, it } from 'vitest';
import {
    ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD,
    ARBITRAGE_MIN_CAPITAL_RESERVE,
    ARBITRAGE_MIN_PROFIT_MARGIN,
    TICKS_PER_MONTH,
} from '../constants';
import type { Agent, PendingArbitrageRoute } from '../planet/planet';
import { makeAgent, makeAgentPlanetAssets, makeGameState, makePlanet } from '../utils/testHelper';
import { createShip, shiptypes } from '../ships/ships';
import type { TransportShip } from '../ships/ships';
import { arbitrageTraderTick } from './arbitrageTraderTick';
import { getCurrencyResourceName } from '../market/currencyResources';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHIP_TYPE = shiptypes.solid.bulkCarrier1;

/** First tick of a given (0-indexed) month.
 * isFirstTickInMonth(tick) = tick % TICKS_PER_MONTH === 1, so month 0 → tick 1,
 * month 1 → tick 31, etc.
 */
function firstTickOfMonth(month: number): number {
    return month * TICKS_PER_MONTH + 1;
}

/**
 * Create a minimal two-planet game state with one arbitrage trader that has
 * assets on both planets and one idle BulkCarrier on planetOrigin.
 */
function makeTwoPlanetState(opts?: {
    originPrice?: number;
    destPrice?: number;
    agentDeposits?: number;
    tick?: number;
}) {
    const originPrice = opts?.originPrice ?? 100;
    const destPrice = opts?.destPrice ?? 300;
    const agentDeposits = opts?.agentDeposits ?? 10_000_000;
    const tick = opts?.tick ?? firstTickOfMonth(1);

    const pOrigin = makePlanet({
        id: 'p-origin',
        name: 'Origin',
        marketPrices: { Steel: originPrice },
    });
    const pDest = makePlanet({
        id: 'p-dest',
        name: 'Destination',
        marketPrices: {
            Steel: destPrice,
            // forex: 1 p-dest currency = 1 p-origin currency (parity)
            [getCurrencyResourceName('p-dest')]: 1.0,
        },
    });

    const agentId = 'arb-0';
    const assetsOrigin = makeAgentPlanetAssets('p-origin', {
        deposits: agentDeposits,
        market: { sell: {}, buy: {} },
        licenses: { commercial: { acquiredTick: 0, frozen: false } },
    });
    const assetsDest = makeAgentPlanetAssets('p-dest', {
        deposits: agentDeposits,
        market: { sell: {}, buy: {} },
        licenses: { commercial: { acquiredTick: 0, frozen: false } },
    });

    const agent: Agent = makeAgent(agentId, 'p-origin', 'Arb Trader', {
        agentRole: 'arbitrage_trader',
        automated: true,
        pendingArbitrageRoutes: new Map(),
        assets: {
            'p-origin': assetsOrigin,
            'p-dest': assetsDest,
        },
    });

    // Bootstrap ship: idle at p-origin
    const ship = createShip(SHIP_TYPE, 0, 'Trader Ship', pOrigin) as TransportShip;
    agent.ships.push(ship);

    const state = makeGameState([pOrigin, pDest], [agent], tick);
    state.arbitrageTraders.set(agentId, agent);

    return { state, pOrigin, pDest, agent, ship };
}

describe('arbitrageTraderTick – advanceRoutePhases: buying', () => {
    it('refreshes the buy bid on every tick while in buying phase', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: 5 }); // mid-month

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 100,
            bidPricePerUnit: 110,
            phase: 'buying',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);

        arbitrageTraderTick(state);

        const market = agent.assets['p-origin']!.market!;
        expect(market.buy.Steel).toBeDefined();
        expect(market.buy.Steel!.bidPrice).toBe(110);
        expect(market.buy.Steel!.bidStorageTarget).toBe(100);
    });

    it('transitions to loading when goods are in storage AND ship is idle at origin', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: firstTickOfMonth(1) });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'buying',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);

        // Put goods in storage
        const storage = agent.assets['p-origin']!.storageFacility;
        storage.currentInStorage.Steel = {
            resource: { name: 'Steel', form: 'solid', level: 'refined', volumePerQuantity: 0.3, massPerQuantity: 1 },
            quantity: 10,
        };

        arbitrageTraderTick(state);

        // Route should have advanced to loading; ship should be in loading state
        expect(ship.state.type).toBe('loading');
        expect(agent.pendingArbitrageRoutes!.get(ship.id)!.phase).toBe('loading');
    });

    it('clears the buy bid when transitioning to loading', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: firstTickOfMonth(1) });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'buying',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);

        const storage = agent.assets['p-origin']!.storageFacility;
        storage.currentInStorage.Steel = {
            resource: { name: 'Steel', form: 'solid', level: 'refined', volumePerQuantity: 0.3, massPerQuantity: 1 },
            quantity: 10,
        };
        // Pre-set the buy bid
        agent.assets['p-origin']!.market!.buy.Steel = {
            resource: { name: 'Steel', form: 'solid', level: 'refined', volumePerQuantity: 0.3, massPerQuantity: 1 },
            bidPrice: 110,
            bidStorageTarget: 10,
        };

        arbitrageTraderTick(state);

        // Buy bid should be removed once loading starts
        expect(agent.assets['p-origin']!.market!.buy.Steel).toBeUndefined();
    });

    // -------------------------------------------------------------------
    // BUG B1: scanBestRoute ignores the ship's current location when
    // choosing an origin planet.  A ship sitting at p-dest can be assigned
    // a route with origin=p-origin (where it isn't), so the loading
    // condition (ship.state.planetId === route.originPlanetId) can never
    // be satisfied → ship idles forever while a buy bid fills goods at
    // the wrong planet.
    // Desired fix: assignRoutesToIdleShips must only consider routes where
    //   originPlanetId === ship's current planet.
    // -------------------------------------------------------------------
    it("BUG B1 – should not assign a route whose origin differs from the ship's current planet", () => {
        const { state, agent, ship } = makeTwoPlanetState({
            originPrice: 100, // p-origin cheap
            destPrice: 300, // p-dest expensive
            agentDeposits: 50_000_000,
            tick: firstTickOfMonth(1),
        });

        // Ship just completed a delivery and is now idle at p-dest
        ship.state = { type: 'idle', planetId: 'p-dest' };

        arbitrageTraderTick(state);

        // Desired: no route assigned. From the ship's actual location (p-dest,
        // price 300) the only candidate sell-market is p-origin (price 100),
        // which yields a negative net margin. The buggy code ignores ship
        // location and picks origin=p-origin (buy 100, sell 300) anyway.
        expect(agent.pendingArbitrageRoutes!.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// advanceRoutePhases – loading phase
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – advanceRoutePhases: loading → in_transit', () => {
    it('advances loading → in_transit when ship starts transporting', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: 5 });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'loading',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);

        // Ship transitions to transporting
        ship.state = {
            type: 'transporting',
            from: 'p-origin',
            to: 'p-dest',
            cargo: null,
            arrivalTick: 100,
        };

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.get(ship.id)!.phase).toBe('in_transit');
    });

    it('removes route when loading is aborted (ship becomes idle)', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: 5 });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'loading',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);

        // Ship returns to idle without going transporting (aborted)
        ship.state = { type: 'idle', planetId: 'p-origin' };

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.has(ship.id)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// advanceRoutePhases – in_transit / unloading phases
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – advanceRoutePhases: in_transit → unloading → done', () => {
    it('advances in_transit → unloading when ship enters unloading state', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: 5 });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'in_transit',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);

        ship.state = {
            type: 'unloading',
            planetId: 'p-dest',
            cargo: {
                resource: {
                    name: 'Steel',
                    form: 'solid',
                    level: 'refined',
                    volumePerQuantity: 0.3,
                    massPerQuantity: 1,
                },
                quantity: 10,
            },
        };

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.get(ship.id)!.phase).toBe('unloading');
    });

    it('posts sell offer at destination when unloading is complete (ship idle at dest)', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: firstTickOfMonth(1) });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'unloading',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);

        // Ship is now idle at destination
        ship.state = { type: 'idle', planetId: 'p-dest' };

        arbitrageTraderTick(state);

        const destMarket = agent.assets['p-dest']!.market!;
        expect(destMarket.sell.Steel).toBeDefined();
        expect(destMarket.sell.Steel!.offerPrice).toBeGreaterThan(0);
    });

    it('removes route after posting sell offer', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: firstTickOfMonth(1) });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'unloading',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);
        ship.state = { type: 'idle', planetId: 'p-dest' };

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.has(ship.id)).toBe(false);
    });

    // -------------------------------------------------------------------
    // BUG B6: The sell entry posted at destination lacks automated:true,
    // so automaticPricing never adjusts its price. Goods can get stuck
    // unsold if the destination market price falls after delivery.
    // Desired fix: set automated:true on the sell entry so tâtonnement
    // keeps the price current.
    // -------------------------------------------------------------------
    it('BUG B6 – sell offer at destination should be flagged automated so its price is adjusted', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: firstTickOfMonth(1) });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'unloading',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);
        ship.state = { type: 'idle', planetId: 'p-dest' };

        arbitrageTraderTick(state);

        const sellEntry = agent.assets['p-dest']!.market!.sell.Steel;
        // Desired: automated flag is set so automaticPricing adjusts the price
        expect(sellEntry?.automated).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// advanceRoutePhases – ship disappears mid-route (cleanup)
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – advanceRoutePhases: ship no longer exists', () => {
    it('removes the route when the ship no longer exists in agent.ships', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: 5 });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'buying',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);
        // Pre-set buy bid
        agent.assets['p-origin']!.market!.buy.Steel = {
            resource: { name: 'Steel', form: 'solid', level: 'refined', volumePerQuantity: 0.3, massPerQuantity: 1 },
            bidPrice: 110,
            bidStorageTarget: 10,
        };

        // Remove the ship (simulating it being sold)
        agent.ships = [];

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.has(ship.id)).toBe(false);
    });

    // -------------------------------------------------------------------
    // BUG B7: When a ship in 'buying' phase is removed from agent.ships
    // (e.g. sold), advanceRoutePhases deletes the route entry but does NOT
    // clear market.buy[resourceName]. The bid keeps filling origin storage
    // indefinitely with goods that have no ship to carry them.
    // Desired fix: clean up the buy bid alongside the route deletion.
    // -------------------------------------------------------------------
    it('BUG B7 – buy bid should be removed when ship disappears mid-route', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: 5 });

        const route: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'buying',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, route);
        agent.assets['p-origin']!.market!.buy.Steel = {
            resource: { name: 'Steel', form: 'solid', level: 'refined', volumePerQuantity: 0.3, massPerQuantity: 1 },
            bidPrice: 110,
            bidStorageTarget: 10,
        };

        // Ship sold / removed from fleet
        agent.ships = [];

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.has(ship.id)).toBe(false);
        // Desired: buy bid must be cleaned up together with the route
        expect(agent.assets['p-origin']!.market!.buy.Steel).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// assignRoutesToIdleShips (monthly)
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – assignRoutesToIdleShips', () => {
    it('assigns a route to a profitable idle ship on the first tick of the month', () => {
        // Large price gap ensures profitability: origin 100, dest 300 → net clearly above 5%
        const { state, agent, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 50_000_000,
            tick: firstTickOfMonth(1),
        });

        arbitrageTraderTick(state);

        // A route should be assigned and a buy bid posted
        expect(agent.pendingArbitrageRoutes!.size).toBeGreaterThan(0);
        const route = agent.pendingArbitrageRoutes!.get(ship.id);
        expect(route).toBeDefined();
        expect(route!.resourceName).toBe('Steel');
        expect(route!.phase).toBe('buying');
    });

    it('does not assign a route when the price gap is too small', () => {
        // No profitable gap: same price at both planets
        const { state, agent } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 101,
            agentDeposits: 50_000_000,
            tick: firstTickOfMonth(1),
        });

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.size).toBe(0);
    });

    it('does not re-assign a route to a ship that already has one', () => {
        const { state, agent, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            tick: firstTickOfMonth(1),
        });

        const existing: PendingArbitrageRoute = {
            shipId: ship.id,
            originPlanetId: 'p-origin',
            destPlanetId: 'p-dest',
            resourceName: 'Steel',
            quantity: 10,
            bidPricePerUnit: 110,
            phase: 'buying',
        };
        agent.pendingArbitrageRoutes!.set(ship.id, existing);

        arbitrageTraderTick(state);

        // Route object unchanged
        expect(agent.pendingArbitrageRoutes!.get(ship.id)).toBe(existing);
    });

    it('does not assign a route to a non-idle ship', () => {
        const { state, agent, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            tick: firstTickOfMonth(1),
        });

        ship.state = {
            type: 'transporting',
            from: 'p-origin',
            to: 'p-dest',
            cargo: null,
            arrivalTick: 999,
        };

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.size).toBe(0);
    });

    it('does not assign a route when agent lacks capital for the purchase', () => {
        const { state, agent } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 1, // nearly zero deposits at origin
            tick: firstTickOfMonth(1),
        });
        // Set origin deposits to near zero
        agent.assets['p-origin']!.deposits = 1;

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.size).toBe(0);
    });

    it('route assignment only happens on the first tick of the month', () => {
        const { state, agent } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            tick: 5, // mid-month, not first tick
        });

        arbitrageTraderTick(state);

        expect(agent.pendingArbitrageRoutes!.size).toBe(0);
    });

    it('posts a buy bid at origin after route assignment', () => {
        const { state, agent, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 50_000_000,
            tick: firstTickOfMonth(1),
        });

        arbitrageTraderTick(state);

        // Verify a buy bid was placed
        if (agent.pendingArbitrageRoutes!.size > 0) {
            const route = agent.pendingArbitrageRoutes!.get(ship.id)!;
            const buy = agent.assets[route.originPlanetId]?.market?.buy[route.resourceName];
            expect(buy).toBeDefined();
            expect(buy!.bidPrice).toBeGreaterThan(0);
        }
    });

    it('applies forex conversion when evaluating cross-planet profitability', () => {
        // dest price in dest currency = 300, but forex rate = 0.5 (dest currency = 0.5 origin currency)
        // effective sell price in origin currency = 300 * 0.5 = 150
        // Net = (150 - 100 - cost) / 100 → may or may not be profitable depending on cost
        const pOrigin = makePlanet({
            id: 'p-origin',
            name: 'Origin',
            marketPrices: {
                Steel: 100,
                [getCurrencyResourceName('p-dest')]: 0.3, // 1 p-dest unit = 0.3 origin currency
            },
        });
        const pDest = makePlanet({
            id: 'p-dest',
            name: 'Destination',
            marketPrices: { Steel: 300 },
        });
        const agentId = 'arb-forex';
        const agent: Agent = makeAgent(agentId, 'p-origin', 'Forex Arb', {
            agentRole: 'arbitrage_trader',
            automated: true,
            pendingArbitrageRoutes: new Map(),
            assets: {
                'p-origin': makeAgentPlanetAssets('p-origin', {
                    deposits: 50_000_000,
                    market: { sell: {}, buy: {} },
                    licenses: { commercial: { acquiredTick: 0, frozen: false } },
                }),
                'p-dest': makeAgentPlanetAssets('p-dest', {
                    deposits: 50_000_000,
                    market: { sell: {}, buy: {} },
                    licenses: { commercial: { acquiredTick: 0, frozen: false } },
                }),
            },
        });
        const ship = createShip(SHIP_TYPE, 0, 'Forex Ship', pOrigin) as TransportShip;
        agent.ships.push(ship);

        const state = makeGameState([pOrigin, pDest], [agent], firstTickOfMonth(1));
        state.arbitrageTraders.set(agentId, agent);

        arbitrageTraderTick(state);

        // With forex=0.3 the net after conversion = (300*0.3 - 100 - cost)/100 = (90-100-cost)/100 → negative
        // So no route should be assigned (unprofitable after forex)
        expect(agent.pendingArbitrageRoutes!.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// manageFleet – buy ship
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – manageFleet: fleet expansion', () => {
    it('buys a listed ship when deposits exceed reserve + price', () => {
        const { state, agent } = makeTwoPlanetState({ tick: firstTickOfMonth(1) });

        // Give the agent no ships first (so we can clearly detect purchase)
        agent.ships = [];

        // Post a ship listing via the shipbuilder
        const listingShipType = shiptypes.solid.bulkCarrier1;
        const emaPrice = 200_000;
        state.shipCapitalMarket.emaPrice[listingShipType.name] = emaPrice;

        const seller = makeAgent('seller', 'p-origin');
        const sellerAssets = seller.assets['p-origin']!;
        const listedShip = createShip(listingShipType, 0, 'For Sale', state.planets.get('p-origin')!);
        seller.ships.push(listedShip);
        sellerAssets.shipListings.push({
            id: 'listing-1',
            sellerAgentId: 'seller',
            shipId: listedShip.id,
            shipName: listedShip.name,
            shipTypeName: listingShipType.name,
            askPrice: emaPrice,
            planetId: 'p-origin',
            postedAtTick: 0,
        });
        state.agents.set('seller', seller);

        // Ensure agent has plenty of home deposits
        agent.assets['p-origin']!.deposits = ARBITRAGE_MIN_CAPITAL_RESERVE + emaPrice * 2;

        arbitrageTraderTick(state);

        // Ship should have been purchased
        expect(agent.ships.length).toBeGreaterThan(0);
        expect(seller.ships).toHaveLength(0);
        // Payment made
        expect(agent.assets['p-origin']!.deposits).toBe(ARBITRAGE_MIN_CAPITAL_RESERVE + emaPrice * 2 - emaPrice);
    });

    it('does NOT buy a ship when deposits are at or below reserve + price', () => {
        const { state, agent } = makeTwoPlanetState({ tick: firstTickOfMonth(1) });
        agent.ships = [];

        const emaPrice = 200_000;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = emaPrice;

        const seller = makeAgent('seller', 'p-origin');
        const listedShip = createShip(SHIP_TYPE, 0, 'For Sale', state.planets.get('p-origin')!);
        seller.ships.push(listedShip);
        seller.assets['p-origin']!.shipListings.push({
            id: 'listing-1',
            sellerAgentId: 'seller',
            shipId: listedShip.id,
            shipName: listedShip.name,
            shipTypeName: SHIP_TYPE.name,
            askPrice: emaPrice,
            planetId: 'p-origin',
            postedAtTick: 0,
        });
        state.agents.set('seller', seller);

        // Deposits exactly at reserve limit (insufficient to also pay emaPrice)
        agent.assets['p-origin']!.deposits = ARBITRAGE_MIN_CAPITAL_RESERVE;

        arbitrageTraderTick(state);

        expect(agent.ships).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// manageFleet – ship trimming / listing
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – manageFleet: trim idle ships', () => {
    // -------------------------------------------------------------------
    // BUG B5: `idleSince = gameState.tick - ship.builtAtTick` measures
    // ship age, not how long the ship has actually been idle.  A ship that
    // just finished a route and became idle this tick could be immediately
    // listed for sale if it was built more than ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD
    // ticks ago — even though it has been idle for 0 ticks.
    // Desired fix: track the tick at which the ship last became idle and
    // compare that against the threshold instead of builtAtTick.
    // -------------------------------------------------------------------
    it('BUG B5 – should not list a ship that just became idle regardless of its total age', () => {
        const currentTick = firstTickOfMonth(1);
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        // Ship is very old (age >> threshold) but just became idle this tick
        // (imagine it completed a route and transitioned to idle moments ago).
        ship.builtAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;
        agent.pendingArbitrageRoutes!.clear();

        arbitrageTraderTick(state);

        // Desired: a ship with idle duration ≈ 0 should not be listed for sale;
        // the bug uses ship age instead, so it fires immediately.
        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings).toHaveLength(0);
    });

    it('does NOT list a ship whose age is below the threshold', () => {
        const currentTick = firstTickOfMonth(1);
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        // Ship is young
        ship.builtAtTick = currentTick - 10;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;
        agent.pendingArbitrageRoutes!.clear();

        arbitrageTraderTick(state);

        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings).toHaveLength(0);
    });

    it('does NOT list a ship whose EMA price is not above effective ship value', () => {
        const currentTick = firstTickOfMonth(1);
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        // Make ship old enough so the age check passes (reaches EMA check)
        ship.builtAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        // EMA price = 0 → emaPrice (0) <= currentValue → skip listing
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 0;
        agent.pendingArbitrageRoutes!.clear();

        arbitrageTraderTick(state);

        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings).toHaveLength(0);
    });

    it('does NOT list again a ship that is already listed', () => {
        const currentTick = firstTickOfMonth(1);
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        ship.builtAtTick = 0;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;
        agent.pendingArbitrageRoutes!.clear();

        // Pre-existing listing
        const planetId = (ship.state as { planetId: string }).planetId;
        agent.assets[planetId]!.shipListings.push({
            id: 'existing',
            sellerAgentId: agent.id,
            shipId: ship.id,
            shipName: ship.name,
            shipTypeName: SHIP_TYPE.name,
            askPrice: 1_000_000,
            planetId,
            postedAtTick: 0,
        });

        arbitrageTraderTick(state);

        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings).toHaveLength(1); // no duplicate
    });

    // -------------------------------------------------------------------
    // BUG M2: When a ship is added to shipListings its state is not
    // transitioned to 'listed'. Because assignRoutesToIdleShips only
    // skips ships whose state.type !== 'idle', a listed-but-still-idle ship
    // can be assigned a new trade route in the same tick, creating a race
    // between the sale and a new loading sequence.
    // Desired fix: set ship.state = { type: 'listed', planetId } whenever
    // a ship is added to any shipListings array.
    // -------------------------------------------------------------------
    it("BUG M2 – ship state should transition to 'listed' when added to shipListings", () => {
        const currentTick = firstTickOfMonth(1);
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        // Use age > threshold AND high EMA so that manageFleet creates a listing
        ship.builtAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;
        agent.pendingArbitrageRoutes!.clear();

        arbitrageTraderTick(state);

        // A listing must have been created (via manageFleet / B5 bug path)
        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings.length).toBeGreaterThan(0);

        // Desired: state must be 'listed' so the ship cannot be re-routed
        expect(ship.state.type).toBe('listed');
    });
});

// ---------------------------------------------------------------------------
// executeShipPurchase – cross-planet teleport
// ---------------------------------------------------------------------------

describe('executeShipPurchase – cross-planet behaviour (BUG B2 & B3)', () => {
    // BUG B3: executeShipPurchase places the ship at buyerPlanetId regardless
    // of listing.planetId. A ship listed at p-origin teleports to p-dest when
    // a buyer from p-dest purchases it. The price is also deducted in the
    // buyer's home currency with no forex conversion.
    // Desired fix: the purchased ship should remain at the listing planet
    // (i.e. ship.state.planetId === listing.planetId after purchase).
    it('BUG B3 – ship should stay at the listing planet after purchase, not teleport to buyer planet', async () => {
        const { executeShipPurchase } = await import('../ships/shipMarket');

        const pOrigin = makePlanet({ id: 'p-origin', name: 'Origin' });
        const pDest = makePlanet({ id: 'p-dest', name: 'Destination' });

        const seller = makeAgent('seller', 'p-origin');
        const buyer = makeAgent('buyer', 'p-dest');
        buyer.assets['p-dest']!.deposits = 1_000_000;

        const ship = createShip(SHIP_TYPE, 0, 'Ship', pOrigin) as TransportShip;
        seller.ships.push(ship);

        const listing = {
            id: 'l1',
            sellerAgentId: seller.id,
            shipId: ship.id,
            shipName: ship.name,
            shipTypeName: SHIP_TYPE.name,
            askPrice: 500_000,
            planetId: 'p-origin', // listed at p-origin
            postedAtTick: 0,
        };
        seller.assets['p-origin']!.shipListings.push(listing);

        const state = makeGameState([pOrigin, pDest], [seller, buyer]);

        const result = executeShipPurchase(state, listing, seller, buyer, 'p-dest');

        expect(result).toBe(true);
        // Desired: ship stays at p-origin (the listing planet) after purchase
        expect(buyer.ships[0].state.type).toBe('idle');
        expect((buyer.ships[0].state as { planetId: string }).planetId).toBe('p-origin');
    });
});

// ---------------------------------------------------------------------------
// General robustness
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – robustness', () => {
    it('processes agents only in arbitrageTraders map, not all agents', () => {
        const { state, agent } = makeTwoPlanetState({ tick: firstTickOfMonth(1) });

        // Remove from arbitrageTraders map
        state.arbitrageTraders.delete(agent.id);

        arbitrageTraderTick(state);

        // No routes should be assigned
        expect(agent.pendingArbitrageRoutes!.size).toBe(0);
    });

    it('does not throw when agent has no pendingArbitrageRoutes (undefined)', () => {
        const { state, agent } = makeTwoPlanetState({ tick: 5 });
        // Simulate an agent without the Map initialised
        agent.pendingArbitrageRoutes = undefined;

        expect(() => arbitrageTraderTick(state)).not.toThrow();
    });

    it('handles empty routes map gracefully', () => {
        const { state, agent } = makeTwoPlanetState({ tick: 5 });
        agent.pendingArbitrageRoutes = new Map();

        expect(() => arbitrageTraderTick(state)).not.toThrow();
    });

    it('minimum profit margin is enforced: exactly ARBITRAGE_MIN_PROFIT_MARGIN does not pass', () => {
        // Net = (destPrice - originPrice) / originPrice must exceed margin
        // Choose values so net hits exactly ARBITRAGE_MIN_PROFIT_MARGIN (should not pass the > check)
        const originPrice = 100;
        // Ignoring trip cost: net = (dest - origin) / origin = margin exactly
        const destPrice = Math.round(originPrice * (1 + ARBITRAGE_MIN_PROFIT_MARGIN));
        const { state, agent } = makeTwoPlanetState({
            originPrice,
            destPrice,
            agentDeposits: 50_000_000,
            tick: firstTickOfMonth(1),
        });

        arbitrageTraderTick(state);

        // With trip cost included, net will be < margin, so no route
        expect(agent.pendingArbitrageRoutes!.size).toBe(0);
    });
});
