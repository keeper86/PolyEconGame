import { describe, expect, it } from 'vitest';
import {
    ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD,
    ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS,
    ARBITRAGE_MIN_CAPITAL_RESERVE,
    ARBITRAGE_MIN_PROFIT_PER_TICK,
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

const SHIP_TYPE = shiptypes.solid.bulkCarrier1;

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

    if (originPrice > 0) {
        pOrigin.orderBooks = { Steel: { asks: [{ price: originPrice, quantity: 1_000_000 }], bids: [] } };
    }
    const pDest = makePlanet({
        id: 'p-dest',
        name: 'Destination',
        marketPrices: {
            Steel: destPrice,

            [getCurrencyResourceName('p-dest')]: 1.0,
        },
    });
    pDest.orderBooks = { Steel: { asks: [], bids: [{ price: destPrice, quantity: 1_000_000 }] } };

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

    const ship = createShip(SHIP_TYPE, 0, 'Trader Ship', pOrigin) as TransportShip;
    agent.ships.push(ship);

    const state = makeGameState([pOrigin, pDest], [agent], tick);
    state.arbitrageTraders.set(agentId, agent);

    return { state, pOrigin, pDest, agent, ship };
}

describe('arbitrageTraderTick – assignRoutesToIdleShips', () => {
    it('sets idle ship to loading state when a profitable route exists', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
        const s = ship.state as { type: 'loading'; planetId: string; to: string };
        expect(s.planetId).toBe('p-origin');
        expect(s.to).toBe('p-dest');
    });

    it('does not assign a route when there is no price spread', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 100,
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

    it('assigns a route regardless of agent capital (capital check removed, order book depth used)', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 1,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
    });

    it('route assignment now runs on every tick, not limited to month start', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 50_000_000,
            tick: 7,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
    });

    it('dispatches ship as empty ferry when idle at destination and profit route requires repositioning', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 300,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        ship.state = { type: 'idle', planetId: 'p-dest' };

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
        const s = ship.state as unknown as {
            type: 'loading';
            planetId: string;
            to: string;
            cargoGoal: unknown;
            currentCargo: unknown;
        };
        expect(s.cargoGoal).toBeNull();
        expect(s.currentCargo).toBeNull();
        expect(s.planetId).toBe('p-dest');
        expect(s.to).toBe('p-origin');
    });

    it('applies forex conversion when evaluating cross-planet profitability', () => {
        const pOrigin = makePlanet({
            id: 'p-origin',
            name: 'Origin',
            marketPrices: {
                Steel: 100,
                [getCurrencyResourceName('p-dest')]: 0.3,
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

        expect(ship.state.type).toBe('idle');
    });

    it('rejects route when there is no gross profit (sell price equals buy price)', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 100,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('idle');
    });

    it('finds route when destination bid depth is less than ship cargo capacity', () => {
        const BID_DEPTH = 1_000;
        const pOrigin = makePlanet({
            id: 'p-origin',
            name: 'Origin',
            marketPrices: { Steel: 20.5 },
        });
        pOrigin.orderBooks = {
            Steel: { asks: [{ price: 20.5, quantity: 2_000_000 }], bids: [] },
        };

        const pDest = makePlanet({
            id: 'p-dest',
            name: 'Destination',
            marketPrices: {
                Steel: 1_000,
                [getCurrencyResourceName('p-dest')]: 1.0,
            },
        });
        pDest.orderBooks = {
            Steel: { asks: [], bids: [{ price: 1_000, quantity: BID_DEPTH }] },
        };

        const agentId = 'arb-shallow';
        const agent: Agent = makeAgent(agentId, 'p-origin', 'Shallow Arb', {
            agentRole: 'arbitrage_trader',
            automated: true,
            assets: {
                'p-origin': makeAgentPlanetAssets('p-origin', {
                    deposits: 10_000_000,
                    market: { sell: {}, buy: {} },
                    licenses: { commercial: { acquiredTick: 0, frozen: false } },
                }),
                'p-dest': makeAgentPlanetAssets('p-dest', {
                    deposits: 0,
                    market: { sell: {}, buy: {} },
                    licenses: { commercial: { acquiredTick: 0, frozen: false } },
                }),
            },
        });
        const ship = createShip(SHIP_TYPE, 0, 'Shallow Ship', pOrigin) as TransportShip;
        agent.ships.push(ship);

        const state = makeGameState([pOrigin, pDest], [agent], 5);
        state.arbitrageTraders.set(agentId, agent);

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
        const s = ship.state as {
            type: 'loading';
            planetId: string;
            to: string;
            cargoGoal: { quantity: number } | null;
        };
        expect(s.planetId).toBe('p-origin');
        expect(s.to).toBe('p-dest');
        expect(s.cargoGoal?.quantity).toBe(BID_DEPTH * 90);
    });
});

describe('arbitrageTraderTick – postSellOffers', () => {
    it('posts a sell offer for goods in storage when no loading ship needs them', () => {
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

        arbitrageTraderTick(state);

        const sellEntry = agent.assets['p-dest']!.market!.sell.Steel;
        expect(sellEntry).toBeDefined();
        expect(sellEntry!.offerPrice).toBeCloseTo(200 * 0.95);
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

        ship.state = {
            type: 'loading',
            planetId: 'p-origin',
            to: 'p-dest',
            cargoGoal: { resource: steelResource, quantity: 100 },
            currentCargo: { resource: steelResource, quantity: 0 },
        };

        agent.assets['p-origin']!.storageFacility.currentInStorage.Steel = {
            resource: steelResource,
            quantity: 50,
        };
        state.planets.get('p-origin')!.marketPrices.Steel = 100;

        arbitrageTraderTick(state);

        expect(agent.assets['p-origin']!.market!.sell.Steel).toBeUndefined();
    });

    it('does not update an existing automated sell offer price (no re-pricing once posted)', () => {
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
            offerPrice: 50,
            offerRetainment: 0,
            automated: true,
        };

        arbitrageTraderTick(state);

        expect(agent.assets['p-dest']!.market!.sell.Steel!.offerPrice).toBe(50);
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

describe('arbitrageTraderTick – manageFleet: fleet expansion', () => {
    it('does not buy ships (manageFleet was removed from arbitrageTraderTick)', () => {
        const { state, agent } = makeTwoPlanetState({ tick: 1 });

        agent.ships = [];

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

        agent.assets['p-origin']!.deposits = ARBITRAGE_MIN_CAPITAL_RESERVE + emaPrice * 2;

        arbitrageTraderTick(state);

        expect(agent.ships).toHaveLength(0);
        expect(seller.ships).toHaveLength(1);
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

        agent.assets['p-origin']!.deposits = ARBITRAGE_MIN_CAPITAL_RESERVE;

        arbitrageTraderTick(state);

        expect(agent.ships).toHaveLength(0);
    });
});

describe('arbitrageTraderTick – manageFleet: trim idle ships', () => {
    it('BUG B5 – should not list a ship that just became idle regardless of its total age', () => {
        const currentTick = 1;
        const { state, agent, ship } = makeTwoPlanetState({ tick: currentTick });

        ship.builtAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;

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
        expect(allListings).toHaveLength(1);
    });

    it('manageFleet removed – no ship listing happens in arbitrageTraderTick', () => {
        const currentTick = 1;

        const { state, agent, ship } = makeTwoPlanetState({
            tick: currentTick,
            originPrice: 100,
            destPrice: 100,
        });

        ship.builtAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        ship.idleAtTick = currentTick - ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD - 1;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 10_000_000;

        arbitrageTraderTick(state);

        const allListings = Object.values(agent.assets).flatMap((a) => a.shipListings);
        expect(allListings).toHaveLength(0);
        expect(ship.state.type).toBe('idle');
    });
});

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
            planetId: 'p-origin',
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

describe('arbitrageTraderTick – robustness', () => {
    it('processes agents only in arbitrageTraders map, not all agents', () => {
        const { state, agent, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 500,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        state.arbitrageTraders.delete(agent.id);

        arbitrageTraderTick(state);

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
    const BOOTSTRAP_DEPOSITS = 250_000;

    it('assigns route based on order book depth regardless of deposits (capital check removed)', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 500_000,
            destPrice: 10_000_000,
            agentDeposits: BOOTSTRAP_DEPOSITS,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
    });

    it('permits route assignment with full cargo capacity regardless of deposits', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 2,
            destPrice: 200,
            agentDeposits: BOOTSTRAP_DEPOSITS,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
    });

    it('blocks route only when there is no profitable price spread (not based on capital)', () => {
        const { state: stateOk, ship: shipOk } = makeTwoPlanetState({
            originPrice: BOOTSTRAP_DEPOSITS,
            destPrice: BOOTSTRAP_DEPOSITS * 100,
            agentDeposits: BOOTSTRAP_DEPOSITS,
            tick: 5,
        });
        arbitrageTraderTick(stateOk);
        expect(shipOk.state.type).toBe('loading');

        const { state: stateBlocked, ship: shipBlocked } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 100,
            agentDeposits: BOOTSTRAP_DEPOSITS,
            tick: 5,
        });
        arbitrageTraderTick(stateBlocked);
        expect(shipBlocked.state.type).toBe('idle');
    });

    it('route assigned regardless of deposit level when price spread is profitable', () => {
        const richDeposits = 15_000_000;
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

describe('arbitrageTraderTick – transport cost formula', () => {
    it('computes the expected local and reposition depreciation for a new Bulk Carrier 1', () => {
        const { pOrigin, ship } = makeTwoPlanetState({ tick: 5 });
        const shipAsTransport = ship as TransportShip;

        const shipValue = effectiveShipValue(shipAsTransport);
        const oneWayTicks = travelTime(shipAsTransport);
        const roundTripTicks = oneWayTicks * 2 + ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS;
        const depreciationRatePerTick = shipValue / ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS;
        const depreciationLocal = depreciationRatePerTick * roundTripTicks;
        const totalTicksReposition = oneWayTicks + roundTripTicks;
        const depreciationReposition = depreciationRatePerTick * totalTicksReposition;

        expect(shipValue).toBe(6);

        expect(oneWayTicks).toBeGreaterThanOrEqual(Math.ceil(900 / SHIP_TYPE.speed));
        expect(oneWayTicks).toBeLessThanOrEqual(Math.ceil(1100 / SHIP_TYPE.speed));
        expect(roundTripTicks).toBe(oneWayTicks * 2 + ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS);
        expect(totalTicksReposition).toBe(oneWayTicks + roundTripTicks);
        expect(depreciationLocal).toBeCloseTo(depreciationRatePerTick * roundTripTicks, 5);
        expect(depreciationReposition).toBeCloseTo(depreciationRatePerTick * totalTicksReposition, 5);
        void pOrigin;
    });

    it('assigns route when price gap produces profitPerTick above ARBITRAGE_MIN_PROFIT_PER_TICK', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 200,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
    });

    it('rejects route when forex haircut eliminates the price spread', () => {
        const { state, ship } = makeTwoPlanetState({
            originPrice: 100,
            destPrice: 106,
            agentDeposits: 50_000_000,
            tick: 5,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('idle');
    });
});

function makeThreePlanetState(opts: {
    currentSteelPrice?: number;
    originSteelPrice?: number;
    destSteelPrice?: number;
    agentDeposits?: number;
    tick?: number;
}) {
    const {
        currentSteelPrice = 0,
        originSteelPrice = 100,
        destSteelPrice = 2_000,
        agentDeposits = 50_000_000,
        tick = 5,
    } = opts;

    const pCurrent = makePlanet({ id: 'p-current', name: 'Current', marketPrices: { Steel: currentSteelPrice } });
    if (currentSteelPrice > 0) {
        pCurrent.orderBooks = {
            Steel: {
                asks: [{ price: currentSteelPrice, quantity: 1_000_000 }],
                bids: [{ price: currentSteelPrice, quantity: 1_000_000 }],
            },
        };
    }
    const pOrigin = makePlanet({ id: 'p-origin', name: 'Origin', marketPrices: { Steel: originSteelPrice } });
    pOrigin.orderBooks = { Steel: { asks: [{ price: originSteelPrice, quantity: 1_000_000 }], bids: [] } };
    const pDest = makePlanet({ id: 'p-dest', name: 'Destination', marketPrices: { Steel: destSteelPrice } });
    pDest.orderBooks = { Steel: { asks: [], bids: [{ price: destSteelPrice, quantity: 1_000_000 }] } };

    const makeAssets = (id: string) =>
        makeAgentPlanetAssets(id, {
            deposits: agentDeposits,
            market: { sell: {}, buy: {} },
            licenses: { commercial: { acquiredTick: 0, frozen: false } },
        });

    const agentId = 'arb-three';
    const agent = makeAgent(agentId, 'p-current', 'Three-Planet Arb', {
        agentRole: 'arbitrage_trader',
        automated: true,
        assets: {
            'p-current': makeAssets('p-current'),
            'p-origin': makeAssets('p-origin'),
            'p-dest': makeAssets('p-dest'),
        },
    });

    const ship = createShip(SHIP_TYPE, 0, 'Trader Ship', pCurrent) as TransportShip;
    agent.ships.push(ship);

    const state = makeGameState([pCurrent, pOrigin, pDest], [agent], tick);
    state.arbitrageTraders.set(agentId, agent);

    return { state, pCurrent, pOrigin, pDest, agent, ship };
}

describe('arbitrageTraderTick – cross-planet repositioning', () => {
    it('dispatches ship as empty ferry when the only profitable route starts on a different planet', () => {
        const { state, ship } = makeThreePlanetState({
            currentSteelPrice: 0,
            originSteelPrice: 100,
            destSteelPrice: 2_000,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
        const s = ship.state as unknown as {
            type: 'loading';
            planetId: string;
            to: string;
            cargoGoal: unknown;
            currentCargo: unknown;
        };
        expect(s.cargoGoal).toBeNull();
        expect(s.currentCargo).toBeNull();
        expect(s.planetId).toBe('p-current');
        expect(s.to).toBe('p-origin');
    });

    it('prefers cross-planet route over local when cross-planet profitPerTick is higher', () => {
        const { state, ship } = makeThreePlanetState({
            currentSteelPrice: 5_000,
            originSteelPrice: 10,
            destSteelPrice: 10_000,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
        const s = ship.state as { type: 'loading'; planetId: string; to: string; cargoGoal: unknown };
        expect(s.cargoGoal).toBeNull();
        expect(s.planetId).toBe('p-current');
        expect(s.to).toBe('p-origin');
    });

    it('stays on the local route when local profitPerTick beats the repositioning route', () => {
        const { state, ship } = makeThreePlanetState({
            currentSteelPrice: 100,
            originSteelPrice: 96,
            destSteelPrice: 200,
        });

        arbitrageTraderTick(state);

        expect(ship.state.type).toBe('loading');
        const s = ship.state as {
            type: 'loading';
            planetId: string;
            to: string;
            cargoGoal: { resource: { name: string } } | null;
        };
        expect(s.cargoGoal).not.toBeNull();
        expect(s.cargoGoal!.resource.name).toBe('Steel');
        expect(s.planetId).toBe('p-current');
        expect(s.to).toBe('p-dest');
    });

    it('repositioning ticks increase totalTicks and decrease profitPerTick for the same gross profit', () => {
        const { ship } = makeTwoPlanetState({ originPrice: 100, destPrice: 500, agentDeposits: 50_000_000, tick: 5 });
        const shipAsTransport = ship as TransportShip;

        const qty = 150_000;
        const oneWayTicks = travelTime(shipAsTransport);
        const roundTripTicks = oneWayTicks * 2 + ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS;
        const totalTicksReposition = oneWayTicks + roundTripTicks;
        const depRatePerTick = effectiveShipValue(shipAsTransport) / ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS;
        const grossProfit = (500 - 100) * qty;

        const profitPerTickLocal = (grossProfit - depRatePerTick * roundTripTicks) / roundTripTicks;
        const profitPerTickReposition = (grossProfit - depRatePerTick * totalTicksReposition) / totalTicksReposition;

        expect(profitPerTickLocal).toBeGreaterThan(profitPerTickReposition);

        expect(profitPerTickReposition).toBeGreaterThan(ARBITRAGE_MIN_PROFIT_PER_TICK);
    });
});

describe('seedArbitrageTraderAgents – initial active workforce', () => {
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
            const homePlanetDemography = agent.assets[agent.associatedPlanetId]?.workforceDemography;
            expect(homePlanetDemography?.length).toBe(MAX_AGE + 1);

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
