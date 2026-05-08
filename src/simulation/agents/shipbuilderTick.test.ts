import { describe, expect, it } from 'vitest';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHIP_TYPE = shiptypes.solid.bulkCarrier1;

/** Resource names used in the default building cost. */
const RESOURCE_PRICES: Record<string, number> = {
    'Steel': 50,
    'Electronic Component': 200,
    'Machinery': 300,
    'Plastic': 20,
};

/** Expected raw material cost for SHIP_TYPE at RESOURCE_PRICES. */
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

// Returns the first tick of month N (0-indexed months).
// isFirstTickInMonth(tick) = tick % TICKS_PER_MONTH === 1, so month 0 starts at tick 1,
// month 1 at tick 31, etc.
function firstTickOfMonth(month: number): number {
    return month * TICKS_PER_MONTH + 1;
}

// ---------------------------------------------------------------------------
// autoListIdleShips
// ---------------------------------------------------------------------------

describe('shipbuilderTick – autoListIdleShips', () => {
    it('lists an idle transport ship that is not yet listed', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const ship = createShip(SHIP_TYPE, 0, 'Carrier 1', planet);
        // ship starts idle at planet
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

        // Pre-add a listing
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

        // Still only one listing
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
        // EMA should be initialised from the listing ask price
        expect(state.shipCapitalMarket.emaPrice[SHIP_TYPE.name]).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// decideBuild – monthly logic
// ---------------------------------------------------------------------------

describe('shipbuilderTick – decideBuild', () => {
    it('skips decideBuild on non-first tick of month', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', 1); // tick 1 is not month start
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        shipbuilderTick(state);

        expect(facility.produces).toBeNull();
    });

    it('skips build if facility is already building', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        // Set EMA high above threshold
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = ESTIMATED_COST * (SHIPBUILDER_SPECULATIVE_THRESHOLD + 0.5);
        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        facility.produces = SHIP_TYPE; // already building
        facility.progress = 0.5;

        shipbuilderTick(state);

        // produces unchanged
        expect(facility.produces).toBe(SHIP_TYPE);
        expect(facility.progress).toBe(0.5);
    });

    it('starts speculative build when EMA margin exceeds SPECULATIVE_THRESHOLD (monthly)', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        // EMA well above threshold
        const targetEma = ESTIMATED_COST * (SHIPBUILDER_SPECULATIVE_THRESHOLD + 0.5);
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = targetEma;
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        shipbuilderTick(state);

        expect(facility.produces).not.toBeNull();
        expect(facility.progress).toBe(0);
    });

    it('does NOT speculatively build when EMA margin is below threshold', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        // EMA just below threshold
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

        // Add ship + listing
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

        // Speculative build should be suppressed
        expect(facility.produces).toBeNull();
    });

    it('skips speculative build if market prices for inputs are missing', () => {
        // Planet has no prices for build materials
        const planet = makePlanet({ id: 'p1', name: 'TestPlanet', marketPrices: {} });
        const builder = makeShipbuilder('p1');
        const state = makeGameState([planet], [builder], firstTickOfMonth(1));
        state.shipbuilderAgents.set(builder.id, builder);
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = 999_999_999;

        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        shipbuilderTick(state);

        // estimateShipCost returns 0 when prices missing → no build
        expect(facility.produces).toBeNull();
    });

    it('Priority 1: starts build for a buy offer that exceeds cost × PROFIT_THRESHOLD', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        // Another agent posts a buy offer above threshold
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
    // -------------------------------------------------------------------
    // BUG B2: Arbitrage traders never post shipBuyingOffers,
    // so Priority 1 will NEVER fire from arbitrage demand.
    // This test documents the current behaviour (arbitrage buys via
    // executeShipPurchase, not via offers) so a regression can be caught
    // if the mechanism is changed.
    // -------------------------------------------------------------------
    it('BUG B2 – arbitrage agent with no buy offer does NOT trigger Priority 1 build', () => {
        const { state, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        const facility = builder.assets.p1!.shipConstructionFacilities[0];

        // Arbitrage trader: assets on p1, but NO ship buying offer
        const arbAgent = makeAgent('arb-1', 'p1');
        arbAgent.agentRole = 'arbitrage_trader';
        state.agents.set('arb-1', arbAgent);
        state.arbitrageTraders.set('arb-1', arbAgent);

        // No EMA → no speculative build either
        shipbuilderTick(state);

        expect(facility.produces).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// updateInputBids
// ---------------------------------------------------------------------------

describe('shipbuilderTick – updateInputBids', () => {
    it('posts buy bids for non-service build inputs when facility is actively building', () => {
        const { state, builder } = makeStateWithShipbuilder('p1');
        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        facility.produces = SHIP_TYPE;

        shipbuilderTick(state);

        const market = builder.assets.p1!.market!;
        // At least steel should have a bid
        expect(market.buy.Steel).toBeDefined();
        expect(market.buy.Steel!.bidPrice).toBeGreaterThan(0);
    });

    it('does not post buy bids when facility is idle (produces = null)', () => {
        const { state, builder } = makeStateWithShipbuilder('p1');
        const facility = builder.assets.p1!.shipConstructionFacilities[0];
        facility.produces = null;

        shipbuilderTick(state);

        const market = builder.assets.p1!.market!;
        // No bids should be posted for input resources
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

// ---------------------------------------------------------------------------
// Full tick orchestration
// ---------------------------------------------------------------------------

describe('shipbuilderTick – orchestration', () => {
    it('runs autoListIdleShips on every tick (not just monthly)', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1', 5); // mid-month
        const ship = createShip(SHIP_TYPE, 0, 'Carrier', planet);
        builder.ships.push(ship);

        shipbuilderTick(state);

        expect(builder.assets.p1!.shipListings).toHaveLength(1);
    });

    it('does not list a ship when agent has no assets on the planet', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1');
        const ship = createShip(SHIP_TYPE, 0, 'Carrier', planet);
        builder.ships.push(ship);

        // Remove assets
        delete (builder.assets as Record<string, unknown>).p1;

        // Should not throw; just skip
        expect(() => shipbuilderTick(state)).not.toThrow();
    });

    it('skips agent with no ship construction facility', () => {
        const planet = makePlanet({ id: 'p1', marketPrices: RESOURCE_PRICES });
        const builder = makeShipbuilder('p1');
        builder.assets.p1!.shipConstructionFacilities = [];
        const state = makeGameState([planet], [builder]);
        state.shipbuilderAgents.set(builder.id, builder);

        // Should not throw
        expect(() => shipbuilderTick(state)).not.toThrow();
    });

    it('shipbuilderTick does not process agents not in shipbuilderAgents map', () => {
        const { state, planet, builder } = makeStateWithShipbuilder('p1', firstTickOfMonth(1));
        // Remove from shipbuilder map but keep in agents
        state.shipbuilderAgents.delete(builder.id);
        state.shipCapitalMarket.emaPrice[SHIP_TYPE.name] = ESTIMATED_COST * (SHIPBUILDER_SPECULATIVE_THRESHOLD + 1);

        const ship = createShip(SHIP_TYPE, 0, 'Carrier', planet);
        builder.ships.push(ship);

        shipbuilderTick(state);

        // Should produce no listings and no builds
        expect(builder.assets.p1!.shipListings).toHaveLength(0);
        expect(builder.assets.p1!.shipConstructionFacilities[0].produces).toBeNull();
    });
});
