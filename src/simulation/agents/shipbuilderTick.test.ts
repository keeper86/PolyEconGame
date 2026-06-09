import { describe, expect, it, vi } from 'vitest';
import {
    SHIPBUILDER_LISTING_MARKUP,
    SHIPBUILDER_PROFIT_THRESHOLD,
    SHIPBUILDER_SPECULATIVE_THRESHOLD,
    TICKS_PER_MONTH,
} from '../constants';
import type { Agent } from '../planet/planet';
import { makeAgent, makeAgentPlanetAssets, makeGameState, makePlanet } from '../utils/testHelper';
import { createShip, shiptypes } from '../ships/ships';
import type { ShipConstructionFacility } from '../planet/facility';
import { shipbuilderTick } from './shipbuilderTick';
import { handleAcceptShipListing } from '../workerClient/shipContractActions';

const SHIP_TYPE = shiptypes.solid.bulkCarrier1;

const RESOURCE_PRICES: Record<string, number> = {
    'Steel': 50,
    'Electronic Component': 200,
    'Machinery': 300,
    'Plastic': 20,
};

const ESTIMATED_COST =
    100 * RESOURCE_PRICES.Steel +
    50 * RESOURCE_PRICES['Electronic Component'] +
    30 * RESOURCE_PRICES.Machinery +
    20 * RESOURCE_PRICES.Plastic;

function makeShipyard(planetId: string, agentId: string): ShipConstructionFacility {
    return {
        type: 'ship_construction',
        id: `${agentId}_yard`,
        name: 'Shipyard',
        planetId,
        scale: 1,
        maxScale: 4,
        construction: null,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        shipName: '',
        produces: null,
        progress: 0,
        lastTickResults: {
            overallEfficiency: 0,
            workerEfficiency: {},
            overqualifiedWorkers: {},
            exactUsedByEdu: {},
            totalUsedByEdu: {},
            resourceEfficiency: {},
            lastConsumed: {},
            wageCosts: 0,
            inputCosts: 0,
            costBalance: 0,
        },
    };
}

function makeShipbuilder(planetId: string): Agent {
    const agentId = `shipbuilder_${planetId}`;
    const assets = makeAgentPlanetAssets(planetId, {
        shipConstructionFacilities: [makeShipyard(planetId, agentId)],
        market: { sell: {}, buy: {} },
        deposits: 5_000_000,
        licenses: {
            commercial: { acquiredTick: 0, frozen: false },
            workforce: { acquiredTick: 0, frozen: false },
        },
    });
    return makeAgent(agentId, planetId, `Shipbuilder (${planetId})`, {
        agentRole: 'shipbuilder',
        automated: false,
        assets: { [planetId]: assets },
    });
}

function makeStateWithShipbuilder(planetId = 'p1', tick = 0) {
    const planet = makePlanet({ id: planetId, name: 'TestPlanet', marketPrices: { ...RESOURCE_PRICES } });
    const builder = makeShipbuilder(planetId);
    const state = makeGameState([planet], [builder], tick);
    state.shipbuilderAgents.set(builder.id, builder);
    return { state, planet, builder };
}

function firstTickOfMonth(month: number): number {
    return month * TICKS_PER_MONTH + 1;
}

describe('shipbuilderTick – autoListIdleShips', () => {
    it('lists an idle transport ship that is not yet listed', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const ship = createShip(SHIP_TYPE, 0, 'Carrier 1', planet);

        builder.ships.push(ship);

        shipbuilderTick(state);

        const listings = builder.assets.p1!.shipListings;
        expect(listings).toHaveLength(1);
        expect(listings[0].shipId).toBe(ship.id);
        expect(listings[0].shipTypeName).toBe(SHIP_TYPE.name);
        expect(listings[0].sellerAgentId).toBe(builder.id);
    });

    it('does not list a ship that is already listed', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const ship = createShip(SHIP_TYPE, 0, 'Carrier 1', planet);
        builder.ships.push(ship);
        const assets = builder.assets.p1!;

        assets.shipListings.push({
            id: 'existing-id',
            sellerAgentId: builder.id,
            shipId: ship.id,
            shipName: ship.name,
            shipTypeName: SHIP_TYPE.name,
            askPrice: 100_000,
            planetId: 'p1',
            postedAtTick: 0,
        });

        shipbuilderTick(state);

        expect(assets.shipListings).toHaveLength(1);
    });

    it('does not list a ship that is not idle (e.g. transporting)', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const ship = createShip(SHIP_TYPE, 0, 'Carrier 1', planet);
        ship.state = { type: 'transporting', from: 'p1', to: 'p2', cargo: null, arrivalTick: 99 };
        builder.ships.push(ship);

        shipbuilderTick(state);

        expect(builder.assets.p1!.shipListings).toHaveLength(0);
    });

    it('does not list a construction ship type', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const constructionShip = createShip(
            { ...SHIP_TYPE, type: 'construction' as never },
            0,
            'ConstructionShip',
            planet,
        );
        builder.ships.push(constructionShip);

        shipbuilderTick(state);

        expect(builder.assets.p1!.shipListings).toHaveLength(0);
    });

    it('uses EMA price with markup when available', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const emaPrice = 800_000;
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = emaPrice;

        const ship = createShip(SHIP_TYPE, 0, 'Carrier 1', planet);
        builder.ships.push(ship);

        shipbuilderTick(state);

        const listing = builder.assets.p1!.shipListings[0];
        expect(listing).toBeDefined();
        const expected = Math.round(emaPrice * (1 + SHIPBUILDER_LISTING_MARKUP));
        expect(listing.askPrice).toBe(expected);
    });

    it('falls back to cost estimate with markup when no EMA', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');

        const ship = createShip(SHIP_TYPE, 0, 'Carrier 1', planet);
        builder.ships.push(ship);

        shipbuilderTick(state);

        const listing = builder.assets.p1!.shipListings[0];
        expect(listing).toBeDefined();
        const expected = Math.round(ESTIMATED_COST * (1 + SHIPBUILDER_LISTING_MARKUP));
        expect(listing.askPrice).toBe(expected);
    });

    it('listing populates the EMA price signal even without a trade', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const ship = createShip(SHIP_TYPE, 0, 'Carrier 1', planet);
        builder.ships.push(ship);

        expect(state.shipCapitalMarket.emaPrice[SHIP_TYPE.name]).toBeUndefined();
        shipbuilderTick(state);

        expect(state.shipCapitalMarket.emaPrice[SHIP_TYPE.name]).toBeGreaterThan(0);
    });

    it('sets ship state to "listed" so a buyer can accept the listing', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const ship = createShip(SHIP_TYPE, 0, 'Carrier 1', planet);
        builder.ships.push(ship);

        shipbuilderTick(state);

        expect(ship.state.type).toBe('listed');
    });

    it('auto-listed ship can be accepted by a buyer via handleAcceptShipListing', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const ship = createShip(SHIP_TYPE, 0, 'Carrier 1', planet);
        builder.ships.push(ship);

        shipbuilderTick(state);

        const listing = builder.assets.p1!.shipListings[0];
        expect(listing).toBeDefined();

        const buyer = makeAgent('buyer', 'p1');
        buyer.assets.p1!.deposits = listing.askPrice * 2;
        state.agents.set(buyer.id, buyer);

        const messages: ReturnType<typeof vi.fn> = vi.fn();
        handleAcceptShipListing(
            state,
            {
                type: 'acceptShipListing',
                requestId: 'req-1',
                buyerAgentId: buyer.id,
                buyerPlanetId: 'p1',
                sellerAgentId: builder.id,
                listingId: listing.id,
            },
            messages,
        );

        expect(messages).toHaveBeenCalledOnce();
        expect(messages.mock.calls[0][0]).toMatchObject({ type: 'shipListingAccepted' });

        expect(buyer.ships).toHaveLength(1);
        expect(buyer.ships[0].id).toBe(ship.id);
    });
});

describe('shipbuilderTick – decideBuild', () => {
    it('skips decideBuild on non-first tick of month', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', 2);
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        shipbuilderTick(state);

        expect(facility.produces).toBeNull();
    });

    it('skips build if facility is already building', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));

        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = ESTIMATED_COST * (SHIPBUILDER_SPECULATIVE_THRESHOLD + 0.5);
        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        facility.produces = SHIP_TYPE;
        facility.progress = 0.5;

        shipbuilderTick(state);

        expect(facility.produces).toBe(SHIP_TYPE);
        expect(facility.progress).toBe(0.5);
    });

    it('starts speculative build when EMA margin exceeds SPECULATIVE_THRESHOLD (monthly)', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));

        const targetEma = ESTIMATED_COST * (SHIPBUILDER_SPECULATIVE_THRESHOLD + 0.5);
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = targetEma;
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        shipbuilderTick(state);

        expect(facility.produces).not.toBeNull();
        expect(facility.progress).toBe(0);
    });

    it('does NOT speculatively build when EMA margin is below threshold', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));

        const targetEma = ESTIMATED_COST * (SHIPBUILDER_SPECULATIVE_THRESHOLD - 0.1);
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = targetEma;
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        shipbuilderTick(state);

        expect(facility.produces).toBeNull();
    });

    it('does NOT speculatively build if an idle ship of that type is already listed', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        const targetEma = ESTIMATED_COST * (SHIPBUILDER_SPECULATIVE_THRESHOLD + 0.5);
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = targetEma;
        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        const assets = builder.assets.p1!;

        const ship = createShip(SHIP_TYPE, 0, 'Carrier', planet);
        builder.ships.push(ship);
        assets.shipListings.push({
            id: 'existing',
            sellerAgentId: builder.id,
            shipId: ship.id,
            shipName: ship.name,
            shipTypeName: SHIP_TYPE.name,
            askPrice: 100_000,
            planetId: 'p1',
            postedAtTick: 0,
        });

        shipbuilderTick(state);

        expect(facility.produces).toBeNull();
    });

    it('skips speculative build if market prices for inputs are missing', () => {
        const planet = makePlanet({ id: 'p1', name: 'TestPlanet' });
        const builder = makeShipbuilder('p1');
        const state = makeGameState([planet], [builder], firstTickOfMonth(1));
        planet.marketPrices = {};
        state.shipbuilderAgents.set(builder.id, builder);
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 999_999_999;

        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        shipbuilderTick(state);

        expect(facility.produces).toBeNull();
    });

    it('Priority 1: starts build for a buy offer that exceeds cost × PROFIT_THRESHOLD', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        const buyerAgent = makeAgent('buyer', 'p1');
        buyerAgent.assets.p1!.shipBuyingOffers.push({
            id: 'offer-1',
            buyerAgentId: 'buyer',
            shipType: 'bulkCarrier1',
            price: Math.ceil(ESTIMATED_COST * (SHIPBUILDER_PROFIT_THRESHOLD + 0.1)),
            status: 'open',
        });
        state.agents.set('buyer', buyerAgent);

        shipbuilderTick(state);

        expect(facility.produces).not.toBeNull();
        expect(facility.produces?.name).toBe(SHIP_TYPE.name);
    });

    it('Priority 1: does NOT build for a buy offer that is below cost × PROFIT_THRESHOLD', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        const buyerAgent = makeAgent('buyer', 'p1');
        buyerAgent.assets.p1!.shipBuyingOffers.push({
            id: 'offer-low',
            buyerAgentId: 'buyer',
            shipType: 'bulkCarrier1',
            price: Math.floor(ESTIMATED_COST * (SHIPBUILDER_PROFIT_THRESHOLD - 0.1)),
            status: 'open',
        });
        state.agents.set('buyer', buyerAgent);

        shipbuilderTick(state);

        expect(facility.produces).toBeNull();
    });

    it('BUG B2 – arbitrage agent with no buy offer does NOT trigger Priority 1 build', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        const arbAgent = makeAgent('arb-1', 'p1');
        arbAgent.agentRole = 'arbitrage_trader';
        state.agents.set('arb-1', arbAgent);
        state.arbitrageTraders.set('arb-1', arbAgent);

        shipbuilderTick(state);

        expect(facility.produces).toBeNull();
    });
});

describe('shipbuilderTick – updateInputBids', () => {
    it('posts buy bids for non-service build inputs when facility is actively building', () => {
        const { state, builder } = makeStateWithShipbuilder('p1');
        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        facility.produces = SHIP_TYPE;

        shipbuilderTick(state);

        const market = builder.assets.p1!.market!;

        expect(market.buy.Steel).toBeDefined();
        expect(market.buy.Steel!.bidPrice).toBeGreaterThan(0);
    });

    it('does not post buy bids when facility is idle (produces = null)', () => {
        const { state, builder } = makeStateWithShipbuilder('p1');
        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        facility.produces = null;

        shipbuilderTick(state);

        const market = builder.assets.p1!.market!;

        expect(Object.keys(market.buy)).toHaveLength(0);
    });

    it('input bid price is set slightly above market price', () => {
        const { state, builder } = makeStateWithShipbuilder('p1');
        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        facility.produces = SHIP_TYPE;

        shipbuilderTick(state);

        const market = builder.assets.p1!.market!;
        const steelMarketPrice = RESOURCE_PRICES.Steel;
        expect(market.buy.Steel!.bidPrice).toBeCloseTo(steelMarketPrice * 1.05, 2);
    });
});

describe('shipbuilderTick – orchestration', () => {
    it('runs autoListIdleShips on every tick (not just monthly)', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1', 5);
        const ship = createShip(SHIP_TYPE, 0, 'Carrier', planet);
        builder.ships.push(ship);

        shipbuilderTick(state);

        expect(builder.assets.p1!.shipListings).toHaveLength(1);
    });

    it('does not list a ship when agent has no assets on the planet', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const ship = createShip(SHIP_TYPE, 0, 'Carrier', planet);
        builder.ships.push(ship);

        delete (builder.assets as Record<string, unknown>).p1;

        expect(() => shipbuilderTick(state)).not.toThrow();
    });

    it('skips agent with no ship construction facility', () => {
        const planet = makePlanet({ id: 'p1', marketPrices: RESOURCE_PRICES });
        const builder = makeShipbuilder('p1');
        builder.assets.p1!.shipConstructionFacilities = [];
        const state = makeGameState([planet], [builder]);
        state.shipbuilderAgents.set(builder.id, builder);

        expect(() => shipbuilderTick(state)).not.toThrow();
    });

    it('shipbuilderTick does not process agents not in shipbuilderAgents map', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));

        state.shipbuilderAgents.delete(builder.id);
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = ESTIMATED_COST * (SHIPBUILDER_SPECULATIVE_THRESHOLD + 1);

        const ship = createShip(SHIP_TYPE, 0, 'Carrier', planet);
        builder.ships.push(ship);

        shipbuilderTick(state);

        expect(builder.assets.p1!.shipListings).toHaveLength(0);
        expect(builder.assets.p1!.shipConstructionFacilities[0].produces).toBeNull();
    });
});
