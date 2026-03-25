import { beforeEach, describe, expect, it } from 'vitest';

import { putIntoStorageFacility } from '../planet/storage';
import type { Agent, Planet } from '../planet/planet';
import { agentMap, makeAgent, makePlanet, makePlanetWithPopulation, makeStorageFacility } from '../utils/testHelper';
import { marketTick } from './market';
import { collectAgentBids, collectAgentOffers } from './orderCollection';
import { clearUnifiedBids } from './orderBook';
import {
    clothingResourceType,
    coalResourceType,
    machineryResourceType,
    vehicleResourceType,
} from '../planet/resources';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COAL = coalResourceType.name;
const VEHICLE = vehicleResourceType.name;
const MACHINERY = machineryResourceType.name;
const CLOTHING = clothingResourceType.name;

function makeSellerWithStock(resourceName: string, stock: number, askPrice: number, id = 'seller'): Agent {
    const resource = [coalResourceType, vehicleResourceType, machineryResourceType, clothingResourceType].find(
        (r) => r.name === resourceName,
    )!;
    const agent = makeAgent(id, 'p');
    agent.assets.p.storageFacility = makeStorageFacility({ planetId: 'p', id: `storage-${id}` });
    putIntoStorageFacility(agent.assets.p.storageFacility, resource, stock);
    agent.assets.p.market = {
        sell: {
            [resourceName]: { resource, offerPrice: askPrice, offerQuantity: stock },
        },
        buy: {},
    };
    return agent;
}

function makeBuyerWithDeposits(
    resourceName: string,
    qty: number,
    price: number,
    deposits: number,
    id = 'buyer',
): Agent {
    const resource = [coalResourceType, vehicleResourceType, machineryResourceType, clothingResourceType].find(
        (r) => r.name === resourceName,
    )!;
    const agent = makeAgent(id, 'p');
    agent.assets.p.deposits = deposits;
    agent.assets.p.storageFacility = makeStorageFacility({ planetId: 'p', id: `storage-${id}` });
    agent.assets.p.market = {
        sell: {},
        buy: { [resourceName]: { resource, bidPrice: price, bidQuantity: qty } },
    };
    return agent;
}

// ---------------------------------------------------------------------------
// Escrow: seller goods are locked at offer time
// ---------------------------------------------------------------------------

describe('market escrow — seller-side', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet();
        planet.marketPrices[COAL] = 1.0;
    });

    it('queryStorageFacility returns free stock (escrow is invisible)', () => {
        const seller = makeSellerWithStock(COAL, 100, 1.0);
        collectAgentOffers(agentMap(seller), planet);

        const freeAfterEscrow =
            seller.assets.p.storageFacility.currentInStorage[COAL]!.quantity -
            (seller.assets.p.storageFacility.escrow[COAL] ?? 0);
        expect(freeAfterEscrow).toBe(0);
    });

    it('a second offer for the same resource cannot double-book escrowed stock', () => {
        const seller = makeSellerWithStock(COAL, 100, 1.0);
        const books = collectAgentOffers(agentMap(seller), planet);

        const orders = books.get(COAL) ?? [];
        expect(orders).toHaveLength(1);
        expect(orders[0].quantity).toBe(100);
        expect(seller.assets.p.storageFacility.escrow[COAL]).toBe(100);
    });

    it('goods not sold are released from escrow after a full market tick', () => {
        const seller = makeSellerWithStock(COAL, 100, 999);
        marketTick(agentMap(seller), planet);

        expect(seller.assets.p.storageFacility.escrow[COAL] ?? 0).toBe(0);
        expect(seller.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0).toBeCloseTo(100, 6);
    });

    it('sold goods are removed from both escrow and storage', () => {
        const seller = makeSellerWithStock(COAL, 100, 1.0);
        const buyer = makeBuyerWithDeposits(COAL, 60, 2.0, 1_000_000);

        marketTick(agentMap(seller, buyer), planet);

        expect(seller.assets.p.storageFacility.escrow[COAL] ?? 0).toBe(0);
        const remaining = seller.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
        expect(remaining).toBeCloseTo(40, 6);
    });

    it('agent selling two resources has zero escrow for both after a full tick', () => {
        const seller = makeAgent('seller', 'p');
        seller.assets.p.storageFacility = makeStorageFacility({ planetId: 'p', id: 'storage-seller' });
        putIntoStorageFacility(seller.assets.p.storageFacility, coalResourceType, 100);
        putIntoStorageFacility(seller.assets.p.storageFacility, machineryResourceType, 5);
        seller.assets.p.market = {
            sell: {
                [COAL]: { resource: coalResourceType, offerPrice: 1.0, offerQuantity: 100 },
                [MACHINERY]: { resource: machineryResourceType, offerPrice: 10.0, offerQuantity: 5 },
            },
            buy: {},
        };
        planet.marketPrices[MACHINERY] = 10.0;

        marketTick(agentMap(seller), planet);

        expect(seller.assets.p.storageFacility.escrow[COAL] ?? 0).toBe(0);
        expect(seller.assets.p.storageFacility.escrow[MACHINERY] ?? 0).toBe(0);
        expect(seller.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0).toBeCloseTo(100, 6);
        expect(seller.assets.p.storageFacility.currentInStorage[MACHINERY]?.quantity ?? 0).toBeCloseTo(5, 6);
    });

    it('agent that is both buyer and seller ends tick with zero escrow and zero depositHold', () => {
        const agent = makeAgent('dual', 'p');
        agent.assets.p.storageFacility = makeStorageFacility({ planetId: 'p', id: 'storage-dual' });
        putIntoStorageFacility(agent.assets.p.storageFacility, coalResourceType, 50);
        agent.assets.p.deposits = 1_000;
        planet.marketPrices[MACHINERY] = 10.0;
        agent.assets.p.market = {
            sell: {
                [COAL]: { resource: coalResourceType, offerPrice: 1.0, offerQuantity: 50 },
            },
            buy: {
                [MACHINERY]: { resource: machineryResourceType, bidPrice: 12.0, bidQuantity: 3 },
            },
        };

        marketTick(agentMap(agent), planet);

        expect(agent.assets.p.storageFacility.escrow[COAL] ?? 0).toBe(0);
        expect(agent.assets.p.depositHold).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Escrow: deposit hold prevents over-commitment across multiple bids
// ---------------------------------------------------------------------------

describe('market escrow — buyer-side deposit hold', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet();
        planet.marketPrices[COAL] = 1.0;
        planet.marketPrices[MACHINERY] = 1.0;
    });

    it('total hold does not exceed available deposits when agent bids on two resources', () => {
        const agent = makeAgent('buyer', 'p');
        agent.assets.p.deposits = 50;
        agent.assets.p.market = {
            sell: {},
            buy: {
                [COAL]: { resource: coalResourceType, bidPrice: 1.0, bidQuantity: 30 },
                [MACHINERY]: { resource: machineryResourceType, bidPrice: 1.0, bidQuantity: 30 },
            },
        };

        collectAgentBids(agentMap(agent), planet);

        expect(agent.assets.p.depositHold).toBeCloseTo(50, 6);
        expect(agent.assets.p.deposits).toBeCloseTo(0, 6);
    });

    it('deposits + depositHold are conserved after a full tick with no sellers', () => {
        const buyer = makeBuyerWithDeposits(COAL, 100, 2.0, 200, 'buyer');

        const total = buyer.assets.p.deposits + buyer.assets.p.depositHold;
        marketTick(agentMap(buyer), planet);

        expect(buyer.assets.p.deposits + buyer.assets.p.depositHold).toBeCloseTo(total, 6);
    });

    it('depositHold is zero after a full market tick (released on no-trade or consumed on trade)', () => {
        const seller = makeSellerWithStock(COAL, 100, 1.0);
        const buyer = makeBuyerWithDeposits(COAL, 60, 2.0, 1_000_000);

        marketTick(agentMap(seller, buyer), planet);

        expect(buyer.assets.p.depositHold).toBe(0);
    });

    it('buyer with zero deposits cannot acquire any goods', () => {
        const seller = makeSellerWithStock(COAL, 100, 1.0);
        const buyer = makeBuyerWithDeposits(COAL, 60, 2.0, 0);

        marketTick(agentMap(seller, buyer), planet);

        const bought = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
        expect(bought).toBe(0);
        expect(buyer.assets.p.deposits).toBe(0);
    });

    it('money is conserved across buyer + seller after a full tick', () => {
        const seller = makeSellerWithStock(COAL, 100, 1.0);
        const buyer = makeBuyerWithDeposits(COAL, 60, 2.0, 1_000_000);

        const totalBefore = seller.assets.p.deposits + buyer.assets.p.deposits;
        marketTick(agentMap(seller, buyer), planet);
        const totalAfter = seller.assets.p.deposits + buyer.assets.p.deposits;

        expect(totalAfter).toBeCloseTo(totalBefore, 6);
    });
});

// ---------------------------------------------------------------------------
// Pieces: integer enforcement at input
// ---------------------------------------------------------------------------

describe('market input validation — pieces resources', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet();
        planet.marketPrices[VEHICLE] = 10.0;
        planet.marketPrices[CLOTHING] = 1.0;
    });

    it('fractional offer quantity for pieces resource is floored to integer before entering book', () => {
        const agent = makeAgent('seller', 'p');
        agent.assets.p.storageFacility = makeStorageFacility({ planetId: 'p' });
        putIntoStorageFacility(agent.assets.p.storageFacility, vehicleResourceType, 5);
        agent.assets.p.market = {
            sell: {},
            buy: {},
        };
        agent.assets.p.market.sell[VEHICLE] = {
            resource: vehicleResourceType,
            offerPrice: 10.0,
            offerQuantity: 3.7,
        };

        const books = collectAgentOffers(agentMap(agent), planet);
        const orders = books.get(VEHICLE) ?? [];

        expect(orders[0].quantity).toBe(3);
    });

    it('fractional bid quantity for pieces resource is floored to integer before entering book', () => {
        const agent = makeAgent('buyer', 'p');
        agent.assets.p.deposits = 1_000_000;
        agent.assets.p.market = {
            sell: {},
            buy: {
                [VEHICLE]: { resource: vehicleResourceType, bidPrice: 10.0, bidQuantity: 4.9 },
            },
        };

        const books = collectAgentBids(agentMap(agent), planet);
        const orders = books.get(VEHICLE) ?? [];

        expect(orders[0].quantity).toBe(4);
    });

    it('bid quantity that rounds down to zero is dropped from the book', () => {
        const agent = makeAgent('buyer', 'p');
        agent.assets.p.deposits = 1_000_000;
        agent.assets.p.market = {
            sell: {},
            buy: {
                [VEHICLE]: { resource: vehicleResourceType, bidPrice: 10.0, bidQuantity: 0.3 },
            },
        };

        const books = collectAgentBids(agentMap(agent), planet);

        expect(books.get(VEHICLE)).toBeUndefined();
    });

    it('pieces buyer and seller trade only whole units — no fractional fill', () => {
        const planet2 = makePlanetWithPopulation({}).planet;
        planet2.marketPrices[VEHICLE] = 10.0;

        const seller = makeSellerWithStock(VEHICLE, 3, 10.0, 'v-seller');
        const buyer = makeBuyerWithDeposits(VEHICLE, 2, 20.0, 1_000_000, 'v-buyer');

        marketTick(agentMap(seller, buyer), planet2);

        const bought = buyer.assets.p.storageFacility.currentInStorage[VEHICLE]?.quantity ?? 0;
        expect(Number.isInteger(bought)).toBe(true);
        expect(bought).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Equal-share: small orders are not starved by large orders
// ---------------------------------------------------------------------------

describe('clearUnifiedBids — starvation prevention', () => {
    it('a 1-unit seller is not starved by a 1-billion-unit seller at the same price', () => {
        const bigSeller = makeAgent('big');
        const smallSeller = makeAgent('small');
        const buyer = makeAgent('buyer');

        const bigAsk = {
            agent: bigSeller,
            resource: coalResourceType,
            askPrice: 1.0,
            quantity: 1_000_000_000,
            filled: 0,
            revenue: 0,
        };
        const smallAsk = {
            agent: smallSeller,
            resource: coalResourceType,
            askPrice: 1.0,
            quantity: 1,
            filled: 0,
            revenue: 0,
        };
        const bid = {
            agent: buyer,
            resource: coalResourceType,
            bidPrice: 2.0,
            quantity: 500_000_000,
            filled: 0,
            cost: 0,
            remainingDeposits: 1e18,
        };

        clearUnifiedBids([], [bid], [bigAsk, smallAsk]);

        expect(smallAsk.filled).toBe(1);
    });

    it('a 1-unit buyer is not starved by a 1-billion-unit buyer at the same price', () => {
        const seller = makeAgent('seller');
        const bigBuyer = makeAgent('big');
        const smallBuyer = makeAgent('small');

        const ask = {
            agent: seller,
            resource: coalResourceType,
            askPrice: 1.0,
            quantity: 500_000_000,
            filled: 0,
            revenue: 0,
        };
        const bigBid = {
            agent: bigBuyer,
            resource: coalResourceType,
            bidPrice: 2.0,
            quantity: 1_000_000_000,
            filled: 0,
            cost: 0,
            remainingDeposits: 1e18,
        };
        const smallBid = {
            agent: smallBuyer,
            resource: coalResourceType,
            bidPrice: 2.0,
            quantity: 1,
            filled: 0,
            cost: 0,
            remainingDeposits: 1e18,
        };

        clearUnifiedBids([], [bigBid, smallBid], [ask]);

        expect(smallBid.filled).toBe(1);
    });

    it('small-demand participant gets fully served before large-demand participant takes the rest', () => {
        const seller = makeAgent('seller');
        const hugeBuyer = makeAgent('huge');
        const tinyBuyer = makeAgent('tiny');

        // Supply=10, huge wants 1000, tiny wants 3 → equal share = 5 each.
        // tiny absorbs 3 (< 5), huge absorbs 5.  Remainder = 10-3-5 = 2 goes to huge.
        // Final: tiny=3, huge=7.
        const ask = {
            agent: seller,
            resource: coalResourceType,
            askPrice: 1.0,
            quantity: 10,
            filled: 0,
            revenue: 0,
        };
        const hugeBid = {
            agent: hugeBuyer,
            resource: coalResourceType,
            bidPrice: 2.0,
            quantity: 1000,
            filled: 0,
            cost: 0,
            remainingDeposits: 1e18,
        };
        const tinyBid = {
            agent: tinyBuyer,
            resource: coalResourceType,
            bidPrice: 2.0,
            quantity: 3,
            filled: 0,
            cost: 0,
            remainingDeposits: 1e18,
        };

        clearUnifiedBids([], [hugeBid, tinyBid], [ask]);

        expect(tinyBid.filled).toBeCloseTo(3, 6);
        expect(hugeBid.filled).toBeCloseTo(7, 6);
    });
});
