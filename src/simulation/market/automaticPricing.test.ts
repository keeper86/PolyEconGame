import { describe, it, expect } from 'vitest';
import { automaticPricing } from './automaticPricing';
import { makeAgent, makePlanet, makeProductionFacility, makeStorageFacility } from '../utils/testHelper';
import { agriculturalProductResourceType, ironOreResourceType, waterResourceType } from '../planet/resources';
import { FOOD_PRICE_CEIL, FOOD_PRICE_FLOOR, PRICE_ADJUST_MAX_DOWN, PRICE_ADJUST_MAX_UP } from '../constants';
import type { StorageFacility } from '../planet/storage';

const PLANET_ID = 'p';
const WATER = waterResourceType.name;

function makePlanetWithPrice(prices: Record<string, number> = {}) {
    return makePlanet({ marketPrices: prices });
}

function makeStorageWith(
    contents: Record<string, { resource: StorageFacility['currentInStorage'][string]['resource']; quantity: number }>,
) {
    return makeStorageFacility({ planetId: PLANET_ID, currentInStorage: contents });
}

/**
 * Sets up an agent that produces Water and has a prior offerPrice + lastSold
 * already written into the market state.  Calling automaticPricing on it will
 * exercise adjustOfferPrice with full control over the sell-through signal.
 */
function makeWaterProducerWithPriorOffer(priorPrice: number, lastSold: number, offerQty: number) {
    const facility = makeProductionFacility({ none: 1 }, { id: 'well', scale: 1 });
    facility.needs = [];
    facility.produces = [{ resource: waterResourceType, quantity: 1000 }];

    const planet = makePlanetWithPrice({ [WATER]: priorPrice });

    const agent = makeAgent('co', PLANET_ID);
    agent.assets[PLANET_ID].productionFacilities = [facility];
    agent.assets[PLANET_ID].storageFacility = makeStorageWith({
        [WATER]: { resource: waterResourceType, quantity: offerQty },
    });
    agent.assets[PLANET_ID].market = {
        sell: {
            [WATER]: { resource: waterResourceType, offerPrice: priorPrice, lastSold },
        },
        buy: {},
    };

    return { agent, planet };
}

describe('automaticPricing — sell offer respects own input reserves', () => {
    it('does not offer for sale the portion of inventory reserved for own facility inputs', () => {
        // Food-processing plant produces Agricultural Product.
        // Beverage plant consumes Agricultural Product (quantity 200, scale 10).
        // Storage holds 5000 units of agri-product.
        // Reserved buffer = 200 * 10 * 30 = 60 000 → exceeds stock, so offerQuantity must be 0.

        const producer = makeProductionFacility({ none: 1 }, { id: 'proc', scale: 10 });
        producer.needs = [];
        producer.produces = [{ resource: agriculturalProductResourceType, quantity: 1000 }];

        const consumer = makeProductionFacility({ none: 1 }, { id: 'bev', scale: 10 });
        consumer.needs = [{ resource: agriculturalProductResourceType, quantity: 200 }];
        consumer.produces = [{ resource: ironOreResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [agriculturalProductResourceType.name]: 5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [producer, consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [agriculturalProductResourceType.name]: { resource: agriculturalProductResourceType, quantity: 5_000 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[agriculturalProductResourceType.name];
        // buffer = 200 * 10 * 30 = 60 000 > 5 000 available → nothing to sell
        expect(offer?.offerQuantity).toBe(0);
    });

    it('offers surplus above the reserved buffer', () => {
        // Same setup but storage holds 65 000 units → 5 000 above the 60 000 buffer.
        const producer = makeProductionFacility({ none: 1 }, { id: 'proc', scale: 10 });
        producer.needs = [];
        producer.produces = [{ resource: agriculturalProductResourceType, quantity: 1000 }];

        const consumer = makeProductionFacility({ none: 1 }, { id: 'bev', scale: 10 });
        consumer.needs = [{ resource: agriculturalProductResourceType, quantity: 200 }];
        consumer.produces = [{ resource: ironOreResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [agriculturalProductResourceType.name]: 5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [producer, consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [agriculturalProductResourceType.name]: { resource: agriculturalProductResourceType, quantity: 65_000 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[agriculturalProductResourceType.name];
        // 65 000 − 60 000 reserved = 5 000 sellable
        expect(offer?.offerQuantity).toBe(5_000);
    });

    it('still offers full inventory when no facility needs that resource as input', () => {
        const producer = makeProductionFacility({ none: 1 }, { id: 'proc', scale: 5 });
        producer.needs = [];
        producer.produces = [{ resource: waterResourceType, quantity: 1000 }];

        const planet = makePlanetWithPrice({ [waterResourceType.name]: 2 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [producer];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [waterResourceType.name]: { resource: waterResourceType, quantity: 3_000 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[waterResourceType.name];
        expect(offer?.offerQuantity).toBe(3_000);
    });
});

describe('automaticPricing — offer price tâtonnement', () => {
    it('sets initial offer price from marketPrices when no prior price exists', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'well', scale: 1 });
        facility.needs = [];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [WATER]: 5 });
        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [WATER]: { resource: waterResourceType, quantity: 200 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        expect(agent.assets[PLANET_ID].market?.sell[WATER]?.offerPrice).toBe(5);
    });

    it('applies PRICE_ADJUST_MAX_UP when everything offered was sold (full sell-through)', () => {
        const PRICE = 10;
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, STOCK, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeCloseTo(PRICE * PRICE_ADJUST_MAX_UP);
    });

    it('applies PRICE_ADJUST_MAX_DOWN when nothing was sold despite having stock (zero sell-through)', () => {
        const PRICE = 10;
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, 0, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeCloseTo(PRICE * PRICE_ADJUST_MAX_DOWN);
    });

    it('does not change price when sell-through equals the target', () => {
        const TARGET_SELL_THROUGH = 0.9;
        const PRICE = 10;
        const STOCK = 1000;
        const sold = STOCK * TARGET_SELL_THROUGH;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, sold, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeCloseTo(PRICE, 5);
    });

    it('recovers quickly from the price floor under persistent full sell-through', () => {
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(FOOD_PRICE_FLOOR, STOCK, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeGreaterThan(FOOD_PRICE_FLOOR);
        expect(newPrice).toBeCloseTo(FOOD_PRICE_FLOOR * PRICE_ADJUST_MAX_UP);
    });

    it('raises price when agent has no stock (supply-constrained, intermittent production)', () => {
        const PRICE = 10;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, 0, 0);

        automaticPricing(new Map([['co', agent]]), planet);

        expect(agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice).toBeCloseTo(PRICE * PRICE_ADJUST_MAX_UP);
    });

    it('does not exceed FOOD_PRICE_CEIL', () => {
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(FOOD_PRICE_CEIL, STOCK, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        expect(agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice).toBe(FOOD_PRICE_CEIL);
    });
});
