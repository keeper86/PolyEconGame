import { describe, expect, it } from 'vitest';
import {
    ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD,
    ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS,
    ARBITRAGE_MIN_CAPITAL_RESERVE,
    ARBITRAGE_MIN_PROFIT_MARGIN,
    ARBITRAGE_SEED_DEPOSIT,
    ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS,
} from '../constants';
import { getCurrencyResourceName } from '../market/currencyResources';
import type { Agent } from '../planet/planet';
import { MAX_AGE, SKILL } from '../population/population';
import { travelTime } from '../ships/shipHandlers';
import { effectiveShipValue } from '../ships/shipMarket';
import type { TransportShip } from '../ships/ships';
import { createShip, shiptypes } from '../ships/ships';
import { makeAgent, makeAgentPlanetAssets, makeGameState, makePlanet } from '../utils/testHelper';
import { seedArbitrageTraderAgents } from './arbitrageTrader';
import { arbitrageTraderTick } from './arbitrageTraderTick';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHIP_TYPE = shiptypes.solid.bulkCarrier1;

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
    const tick = opts?.tick ?? 5;

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

// ---------------------------------------------------------------------------
// assignRoutesToIdleShips
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – assignRoutesToIdleShips', () => {
    it('sets idle ship to loading state when a profitable route exists', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 50_000_000,
            tick: 5, // any tick — assignment runs every tick now
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
        const s = ship.state as { type: 'loading'; planetId: string; to: string };
        expect(s.planetId).toBe('p-origin');
        expect(s.to).toBe('p-dest');
    });

    it('does not assign a route when the price gap is too small', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 101,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('idle');
    });

    it('does not reassign a route to a ship already in loading state', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            tick: 5,
        });

        // Ship is already loading
        ship.state = {
            type: 'loading',
            planetId: 'p-origin',
            to: 'p-dest',
            cargoGoal: null,
            currentCargo: {
                resource: {
                    name: 'Steel',
                    form: 'solid',
                    level: 'refined',
                    volumePerQuantity: 0.3,
                    massPerQuantity: 1,
                },
                quantity: 0,
            },
        };

        const originalState = ship.state;
        arbitrageTraderTick(state);

        // State object should not have been replaced
        expect(ship.state).toBe(originalState);
    });

    it('does not assign a route to a transporting ship', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            tick: 5,
        });

        ship.state = {
            type: 'transporting',
            from: 'p-origin',
            to: 'p-dest',
            cargo: null,
            arrivalTick: 999,
        };

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('transporting');
    });

    it('does not assign a route when agent lacks capital for the purchase', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 1, // nearly zero
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('idle');
    });

    it('route assignment now runs on every tick, not limited to month start', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 50_000_000,
            tick: 7, // mid-month
        });

        arbitrageTraderTick(state);

        // Should still assign — no longer monthly
        expect(ship.state.type).toBe('loading');
    });

    it("does not assign a route whose origin differs from the ship's current planet (BUG B1)", () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100, // p-origin cheap
            destPrice: 300, // p-dest expensive
            agentDeposits: 50_000_000,
            tick: 5,
        });

        // Ship is idle at p-dest — from there the only candidate is p-origin (sell price 100),
        // which would yield a negative margin, so no route should be assigned.
        ship.state = { type: 'idle', planetId: 'p-dest' };

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('idle');
    });

    it('applies forex conversion when evaluating cross-planet profitability', () => {
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

        const state = makeGameState([pOrigin, pDest], [agent], 5);
        state.arbitrageTraders.set(agentId, agent);

        arbitrageTraderTick(state);

        // With forex=0.3 the net = (300*0.3 - 100 - cost)/100 = (90-100-cost)/100 → negative
        expect(ship.state.type).toBe('idle');
    });

    it('minimum profit margin is enforced', () => {
        const originPrice = 100;
        const destPrice = Math.round(originPrice * (1 + ARBITRAGE_MIN_PROFIT_MARGIN));
        const { state, ship } = makeTwoPlanetState({
            originPrice,
            destPrice,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        arbitrageTraderTick(state);

        // With trip cost included, net < margin, so no route
        expect(ship.state.type).toBe('idle');
    });
});

// ---------------------------------------------------------------------------
// postSellOffers
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – postSellOffers', () => {
    it('posts a sell offer for goods in storage when no loading ship needs them', () => {
        const { state, agent } = makeTwoPlanetState({ tick: 5, originPrice: 100, destPrice: 100 });

        // Put Steel in dest storage
        const steelResource = {
            name: 'Steel',
            form: 'solid' as const,
            level: 'refined' as const,
            volumePerQuantity: 0.3,
            massPerQuantity: 1,
        };
        agent.assets['p-dest']!.storageFacility.currentInStorage.Steel = {
            resource: steelResource,
            quantity: 50,
        };
        state.planets.get('p-dest')!.marketPrices.Steel = 200;

        arbitrageTraderTick(state);

        const sellEntry = agent.assets['p-dest']!.market!.sell.Steel;
        expect(sellEntry).toBeDefined();
        expect(sellEntry!.offerPrice).toBeCloseTo(200 * 1.05);
        expect(sellEntry!.automated).toBe(true);
    });

    it('does not post a sell offer for a resource currently being loaded by a ship at that planet', () => {
        const { state, agent, ship } = makeTwoPlanetState({ tick: 5, originPrice: 100, destPrice: 100 });

        const steelResource = {
            name: 'Steel',
            form: 'solid' as const,
            level: 'refined' as const,
            volumePerQuantity: 0.3,
            massPerQuantity: 1,
        };

        // Ship is loading Steel at p-origin
        ship.state = {
            type: 'loading',
            planetId: 'p-origin',
            to: 'p-dest',
            cargoGoal: { resource: steelResource, quantity: 100 },
            currentCargo: { resource: steelResource, quantity: 0 },
        };

        // Put Steel in origin storage
        agent.assets['p-origin']!.storageFacility.currentInStorage.Steel = {
            resource: steelResource,
            quantity: 50,
        };
        state.planets.get('p-origin')!.marketPrices.Steel = 100;

        arbitrageTraderTick(state);

        // No sell offer because ship is loading that resource
        expect(agent.assets['p-origin']!.market!.sell.Steel).toBeUndefined();
    });

    it('updates an existing automated sell offer price', () => {
        const { state, agent } = makeTwoPlanetState({ tick: 5, originPrice: 100, destPrice: 100 });

        const steelResource = {
            name: 'Steel',
            form: 'solid' as const,
            level: 'refined' as const,
            volumePerQuantity: 0.3,
            massPerQuantity: 1,
        };
        agent.assets['p-dest']!.storageFacility.currentInStorage.Steel = {
            resource: steelResource,
            quantity: 50,
        };
        state.planets.get('p-dest')!.marketPrices.Steel = 200;

        // Pre-existing automated sell entry with stale price
        agent.assets['p-dest']!.market!.sell.Steel = {
            resource: steelResource,
            offerPrice: 50,
            offerRetainment: 0,
            automated: true,
        };

        arbitrageTraderTick(state);

        expect(agent.assets['p-dest']!.market!.sell.Steel!.offerPrice).toBeCloseTo(200 * 1.05);
    });

    it('does not overwrite a manually managed (non-automated) sell entry', () => {
        const { state, agent } = makeTwoPlanetState({ tick: 5, originPrice: 100, destPrice: 100 });

        const steelResource = {
            name: 'Steel',
            form: 'solid' as const,
            level: 'refined' as const,
            volumePerQuantity: 0.3,
            massPerQuantity: 1,
        };
        agent.assets['p-dest']!.storageFacility.currentInStorage.Steel = {
            resource: steelResource,
            quantity: 50,
        };
        state.planets.get('p-dest')!.marketPrices.Steel = 200;

        agent.assets['p-dest']!.market!.sell.Steel = {
            resource: steelResource,
            offerPrice: 9999,
            offerRetainment: 0,
            automated: false,
        };

        arbitrageTraderTick(state);

        expect(agent.assets['p-dest']!.market!.sell.Steel!.offerPrice).toBe(9999);
    });
});

// ---------------------------------------------------------------------------
// manageFleet – fleet expansion
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – manageFleet: fleet expansion', () => {
    it('buys a listed ship when deposits exceed reserve + price', () => {
        const { state, agent } = makeTwoPlanetState({ tick: 1 }); // tick=1 → first tick of month

        // Give the agent no ships first (so we can clearly detect purchase)
        agent.ships = [];

        // Post a ship listing via the shipbuilder
        const listingShipType = shiptypes.solid.bulkCarrier1;
        const emaPrice = 200_000;
        state.shipCapitalMarket.emaPrice[listingShipType.name] = emaPrice;

        const seller = makeAgent('seller', 'p-origin');
        const listedShip = createShip(listingShipType, 0, 'For Sale', state.planets.get('p-origin')!);
        seller.ships.push(listedShip);
        seller.assets['p-origin']!.shipListings.push({
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
        expect(agent.assets['p-origin']!.deposits).toBe(ARBITRAGE_MIN_CAPITAL_RESERVE + emaPrice * 2 - emaPrice);
    });

    it('does NOT buy a ship when deposits are at or below reserve + price', () => {
        const { state, agent } = makeTwoPlanetState({ tick: 1 });
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

        // Deposits exactly at reserve limit
        agent.assets['p-origin']!.deposits = ARBITRAGE_MIN_CAPITAL_RESERVE;

        arbitrageTraderTick(state);

        expect(agent.ships).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// manageFleet – ship trimming / listing
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – manageFleet: trim idle ships', () => {
    it('BUG B5 – should not list a ship that just became idle regardless of its total age', () => {
        const currentTick = 1; // first tick of month
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        // Ship is very old but just became idle this tick
        ship.builtAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;
        // No idleAtTick set → defaults to builtAtTick, making idleSince < threshold when idleAtTick not set

        // For B5 to apply, we need idleAtTick to be recent (ship just went idle)
        ship.idleAtTick = currentTick;

        arbitrageTraderTick(state);

        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings).toHaveLength(0);
    });

    it('does NOT list a ship whose age is below the threshold', () => {
        const currentTick = 1;
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        ship.builtAtTick = currentTick - 10;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;

        arbitrageTraderTick(state);

        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings).toHaveLength(0);
    });

    it('does NOT list a ship whose EMA price is not above effective ship value', () => {
        const currentTick = 1;
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        ship.builtAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        ship.idleAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 0;

        arbitrageTraderTick(state);

        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings).toHaveLength(0);
    });

    it('does NOT list again a ship that is already listed', () => {
        const currentTick = 1;
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        ship.builtAtTick = 0;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;

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

    it("BUG M2 – ship state should transition to 'listed' when added to shipListings", () => {
        const currentTick = 1;
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        ship.builtAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        ship.idleAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;

        arbitrageTraderTick(state);

        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings.length).toBeGreaterThan(0);
        expect(ship.state.type).toBe('listed');
    });
});

// ---------------------------------------------------------------------------
// executeShipPurchase – cross-planet teleport
// ---------------------------------------------------------------------------

describe('executeShipPurchase – cross-planet behaviour (BUG B3)', () => {
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
        expect(buyer.ships[0].state.type).toBe('idle');
        expect((buyer.ships[0].state as { planetId: string }).planetId).toBe('p-origin');
    });
});

// ---------------------------------------------------------------------------
// General robustness
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – robustness', () => {
    it('processes agents only in arbitrageTraders map, not all agents', () => {
        const { state, agent, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        // Remove from arbitrageTraders map
        state.arbitrageTraders.delete(agent.id);

        arbitrageTraderTick(state);

        // No route should be assigned — not in arbitrageTraders
        expect(ship.state.type).toBe('idle');
    });

    it('does not throw when agent has no ships', () => {
        const { state, agent } = makeTwoPlanetState({ tick: 5 });
        agent.ships = [];

        expect(() => arbitrageTraderTick(state)).not.toThrow();
    });

    it('handles empty arbitrageTraders map gracefully', () => {
        const { state } = makeTwoPlanetState({ tick: 5 });
        state.arbitrageTraders.clear();

        expect(() => arbitrageTraderTick(state)).not.toThrow();
    });
});

describe('arbitrageTraderTick – capital barrier', () => {

    const BOOTSTRAP_DEPOSITS = ARBITRAGE_SEED_DEPOSIT; // 250,000
    const STEEL_MAX_QTY = 150_000; // mass-limited for Bulk Carrier 1

    it('blocks route assignment when bootstrap deposits cannot cover a full Steel cargo at pBuy=2', () => {
        // requiredCapital = 2 × 150,000 = 300,000 > 250,000 deposits → capital check fails
        // destPrice is intentionally very high to confirm capital — not margin — is the blocker.
        const { state, ship } = makeTwoPlanetState({
            originPrice: 2,
            destPrice: 10_000,
            agentDeposits: BOOTSTRAP_DEPOSITS,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('idle');
    });

    it('permits route assignment when deposits cover a full Steel cargo at pBuy=1', () => {
        // requiredCapital = 1 × 150,000 = 150,000 ≤ 250,000 deposits → capital check passes
        const { state, ship } = makeTwoPlanetState({
            originPrice: 1,
            destPrice: 200,
            agentDeposits: BOOTSTRAP_DEPOSITS,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
    });

    it('capital threshold boundary: largest pBuy that still passes is floor(deposits / maxQty)', () => {
        const maxAffordablePBuy = Math.floor(BOOTSTRAP_DEPOSITS / STEEL_MAX_QTY); // = 1

        // At boundary price → passes
        const { state: stateOk, ship: shipOk } = makeTwoPlanetState({
            originPrice: maxAffordablePBuy,
            destPrice: maxAffordablePBuy * 100,
            agentDeposits: BOOTSTRAP_DEPOSITS,
            tick: 5,
        });
        arbitrageTraderTick(stateOk);
        expect(shipOk.state.type).toBe('loading');

        // One unit above → fails
        const { state: stateBlocked, ship: shipBlocked } = makeTwoPlanetState({
            originPrice: maxAffordablePBuy + 1,
            destPrice: (maxAffordablePBuy + 1) * 100,
            agentDeposits: BOOTSTRAP_DEPOSITS,
            tick: 5,
        });
        arbitrageTraderTick(stateBlocked);
        expect(shipBlocked.state.type).toBe('idle');
    });

    it('route is unblocked when the agent has been capitalised beyond bootstrap level', () => {
        // In practice, arbitrage agents accumulate deposits after their first successful trades.
        // With sufficient capital, higher commodity prices become reachable.
        const richDeposits = STEEL_MAX_QTY * 100; // can afford Steel at pBuy=100
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 200,
            agentDeposits: richDeposits,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
    });
});

// ---------------------------------------------------------------------------
// Transport cost formula — confirming it is negligible vs price margin
// ---------------------------------------------------------------------------

describe('arbitrageTraderTick – transport cost formula', () => {
    // For Bulk Carrier 1 (speed=6, scale='small' → scaleMapping=1) with fresh condition
    // (maintainanceStatus=1, maxMaintenance=1, no maintenance service market price):
    //
    //   effectiveShipValue = scaleMapping(1) × speed(6) × qualityFactor(1) × maxMaintenance(1) = 6
    //   oneWayTicks        = ceil(1000 / 6) = 167
    //   roundTripTicks     = 2×167 + ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS(60) = 394
    //   depreciationPerTrip = (6 / ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS) × 394 ≈ 0.657
    //   costPerUnit         = 0.657 / 150,000 ≈ 0.0000044  (< 0.0001% of Steel price)
    //
    // Conclusion: transport depreciation is negligible; the operative threshold is simply
    // net = (destPrice - originPrice) / originPrice > ARBITRAGE_MIN_PROFIT_MARGIN (5%).

    it('computes the expected depreciation cost per unit for a new Bulk Carrier 1 on Steel', () => {
        const { pOrigin, ship } = makeTwoPlanetState({ tick: 5 });
        const shipAsTransport = ship as TransportShip;

        const shipValue = effectiveShipValue(shipAsTransport); // no gameState → no maintenance penalty
        const oneWayTicks = travelTime(shipAsTransport);
        const roundTripTicks = oneWayTicks * 2 + ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS;
        const depreciationPerTrip = (shipValue / ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS) * roundTripTicks;
        const steelMaxQty = Math.floor(
            Math.min(
                shipAsTransport.type.cargoSpecification.volume / 0.3, // volumePerQuantity for Steel
                shipAsTransport.type.cargoSpecification.mass / 1, // massPerQuantity for Steel
            ),
        );
        const costPerUnit = depreciationPerTrip / steelMaxQty;

        // Ship should be worth 6, one-way 167 ticks, round-trip 394 ticks
        expect(shipValue).toBe(6);
        expect(oneWayTicks).toBe(167);
        expect(roundTripTicks).toBe(394);
        expect(steelMaxQty).toBe(150_000);
        // costPerUnit < 0.001 confirms transport cost is negligible vs any sane commodity price
        expect(costPerUnit).toBeLessThan(0.001);
        void pOrigin; // used above for context
    });

    it('route is assigned when the price gap barely exceeds 5% (transport cost negligible)', () => {
        // net = (106 - 100 - ~0.0000044) / 100 ≈ 5.9999% > 5% → route
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 106,
            agentDeposits: 50_000_000, // remove capital constraint
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
    });

    it('route is NOT assigned when price gap equals exactly 5% (threshold is strict >)', () => {
        // net = (105 - 100 - ~0.0000044) / 100 ≈ 4.9999% < 5% → no route
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 105,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('idle');
    });
});

// ---------------------------------------------------------------------------
// Seeding — initial active workforce is zero (the "196 workers" explained)
// ---------------------------------------------------------------------------

describe('seedArbitrageTraderAgents – initial active workforce', () => {
    // Arbitrage agents are initialised with a workforceDemography array of
    // MAX_AGE+1 (= 101) empty age-cohort slots.  This is a structural skeleton
    // required by the demographic engine — it does NOT represent real workers.
    //
    // The "196 workers" figure sometimes visible in the UI is NOT active worker
    // count.  Active worker count at seeding time is 0 for every arbitrage agent.
    //
    // Arbitrage agents hold only a commercial license (no workforce license), so
    // hireWorkforce will never populate their demography, and automaticWorkerAllocation
    // derives a zero target (no facilities with workerRequirement).

    function totalActiveWorkers(agent: Agent): number {
        let total = 0;
        for (const assets of Object.values(agent.assets)) {
            const wd = assets.workforceDemography;
            if (!wd) {
                continue;
            }
            for (let age = 0; age <= MAX_AGE; age++) {
                for (const edu of ['none', 'primary', 'secondary', 'tertiary'] as const) {
                    for (const skill of SKILL) {
                        total += wd[age][edu][skill].active;
                    }
                }
            }
        }
        return total;
    }

    it('freshly seeded arbitrage agents have 0 active workers and a 101-slot demography', () => {
        const pA = makePlanet({ id: 'p-a', name: 'Alpha' });
        const pB = makePlanet({ id: 'p-b', name: 'Beta' });
        const state = makeGameState([pA, pB], [], 0);

        seedArbitrageTraderAgents(state);

        expect(state.arbitrageTraders.size).toBeGreaterThan(0);

        for (const agent of state.arbitrageTraders.values()) {
            // The demography skeleton has MAX_AGE+1 = 101 age slots
            const homePlanetDemography = agent.assets[agent.associatedPlanetId]?.workforceDemography;
            expect(homePlanetDemography?.length).toBe(MAX_AGE + 1);

            // But zero workers are actually employed anywhere
            expect(totalActiveWorkers(agent)).toBe(0);
        }
    });

    it('arbitrage agents have only a commercial license — no workforce license', () => {
        const pA = makePlanet({ id: 'p-a', name: 'Alpha' });
        const state = makeGameState([pA], [], 0);

        seedArbitrageTraderAgents(state);

        for (const agent of state.arbitrageTraders.values()) {
            for (const [planetId, assets] of Object.entries(agent.assets)) {
                expect(assets.licenses?.commercial).toBeDefined();
                expect(assets.licenses?.workforce).toBeUndefined();
                void planetId;
            }
        }
    });
});
