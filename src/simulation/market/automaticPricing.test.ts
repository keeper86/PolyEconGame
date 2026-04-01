import { beforeEach, describe, expect, it } from 'vitest';
import {
    AUTOMATED_COST_FLOOR_MARKUP,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_DOWN_SOFT,
    PRICE_ADJUST_MAX_UP,
    GROCERY_PRICE_CEIL as PRICE_CEIL,
    GROCERY_PRICE_FLOOR as PRICE_FLOOR,
} from '../constants';
import { DEFAULT_WAGE_PER_EDU } from '../financial/financialTick';
import {
    agriculturalProductResourceType,
    clothingResourceType,
    fabricResourceType,
    ironOreResourceType,
    waterResourceType,
} from '../planet/resources';
import type { StorageFacility } from '../planet/storage';
import { seedRng } from '../utils/stochasticRound';
import { makeAgent, makePlanet, makeProductionFacility, makeStorageFacility } from '../utils/testHelper';
import { automaticPricing } from './automaticPricing';

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
        // buffer = 200 * 10 * 30 = 60 000 > 5 000 available → retainment should be 60,000
        expect(offer?.offerRetainment).toBe(60_000);
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
        // 65 000 − 60 000 reserved = 5 000 sellable, retainment should be 60,000
        expect(offer?.offerRetainment).toBe(60_000);
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
        // No facility needs water as input, so retainment should be 0
        expect(offer?.offerRetainment).toBe(0);
    });
});

describe('automaticPricing — offer price tâtonnement', () => {
    // Each test that exercises adjustOfferPrice must start from the same PRNG
    // state so that the (1 + 0.01 * nextRandom()) noise term is deterministic.
    beforeEach(() => seedRng(42));

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
        expect(newPrice).toBeCloseTo(PRICE * PRICE_ADJUST_MAX_UP, 5);
    });

    it('applies PRICE_ADJUST_MAX_DOWN when nothing was sold despite having stock (zero sell-through)', () => {
        const PRICE = 10;
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, 0, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeCloseTo(PRICE * 0.95, 5);
    });

    it('has no price drift when sell-through exactly equals the target', () => {
        const TARGET_SELL_THROUGH = 0.9;
        const PRICE = 10;
        const STOCK = 1000;
        const sold = STOCK * TARGET_SELL_THROUGH;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, sold, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        // sellThroughFactor(TARGET) == 1.0 exactly, so price is unchanged
        expect(newPrice).toBeCloseTo(PRICE, 5);
    });

    it('recovers quickly from the price floor under persistent full sell-through', () => {
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE_FLOOR, STOCK, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeGreaterThan(PRICE_FLOOR);
        expect(newPrice).toBeCloseTo(PRICE_FLOOR * PRICE_ADJUST_MAX_UP);
    });

    it('does not change price when agent has no stock and sold nothing (intermittent production)', () => {
        const PRICE = 10;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, 0, 0);

        automaticPricing(new Map([['co', agent]]), planet);

        // stock=0, sold=0 → supply-constrained with no prior sales → price unchanged
        expect(agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice).toBeCloseTo(PRICE);
    });

    it('does not exceed GROCERY_PRICE_CEIL', () => {
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE_CEIL, STOCK, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        expect(agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice).toBe(PRICE_CEIL);
    });
});

describe('automaticPricing — pieces resource quantities are continuous', () => {
    it('offerRetainment is set to raw reserved quantity without integer rounding', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'clothing-fac', scale: 1 });
        facility.needs = [{ resource: fabricResourceType, quantity: 80 }];
        facility.produces = [{ resource: clothingResourceType, quantity: 6_000 }];

        const planet = makePlanetWithPrice({ [clothingResourceType.name]: 0.5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.automated = true;
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [clothingResourceType.name]: { resource: clothingResourceType, quantity: 0.22 },
            [fabricResourceType.name]: { resource: fabricResourceType, quantity: 500 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const offerRetainment = agent.assets[PLANET_ID].market?.sell[clothingResourceType.name]?.offerRetainment ?? -1;
        // No facility needs clothing as input, so retainment should be 0
        expect(offerRetainment).toBe(0);
    });

    it('bidStorageTarget is set to raw input buffer target without integer rounding', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'clothing-fac', scale: 1 });
        facility.needs = [{ resource: clothingResourceType, quantity: 10 }];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [clothingResourceType.name]: 0.5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.automated = true;
        agent.assets[PLANET_ID].deposits = 1_000_000;
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({});

        automaticPricing(new Map([['co', agent]]), planet);

        const bidStorageTarget = agent.assets[PLANET_ID].market?.buy[clothingResourceType.name]?.bidStorageTarget ?? -1;
        expect(bidStorageTarget).toBeGreaterThan(0);
    });
});

describe('automaticPricing — cost-floor brake zone', () => {
    beforeEach(() => seedRng(42));

    it('attenuates the downward adjustment when the offer price is at the cost floor', () => {
        // Facility: scale=1, workerReq: { none: 1 }, needs: 10 agri-product @ INPUT_PRICE, produces: 5 clothing
        // inputCostPerTick = NEEDS_QTY × INPUT_PRICE × scale = 10 × 2.0 × 1 = 20
        // wageCostPerTick  = DEFAULT_WAGE_PER_EDU × 1 worker × scale = 1.0
        // costPerUnit = (20 + 1) / 5 = 4.2
        // costFloor = max(PRICE_FLOOR, 4.2 × (1 + AUTOMATED_COST_FLOOR_MARKUP)) = 4.41
        const INPUT_PRICE = 2.0;
        const NEEDS_QTY = 10;
        const PRODUCES_QTY = 5;
        const inputCost = NEEDS_QTY * INPUT_PRICE;
        const wageCost = DEFAULT_WAGE_PER_EDU; // 1 worker, scale 1
        const costPerUnit = (inputCost + wageCost) / PRODUCES_QTY;
        const PRIOR_PRICE = Math.max(PRICE_FLOOR, costPerUnit * (1 + AUTOMATED_COST_FLOOR_MARKUP));

        const facility = makeProductionFacility({ none: 1 }, { id: 'factory', scale: 1 });
        facility.needs = [{ resource: agriculturalProductResourceType, quantity: NEEDS_QTY }];
        facility.produces = [{ resource: clothingResourceType, quantity: PRODUCES_QTY }];

        const planet = makePlanetWithPrice({
            [agriculturalProductResourceType.name]: INPUT_PRICE,
            [clothingResourceType.name]: PRIOR_PRICE,
        });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [clothingResourceType.name]: { resource: clothingResourceType, quantity: 1000 },
        });
        agent.assets[PLANET_ID].market = {
            sell: {
                [clothingResourceType.name]: {
                    resource: clothingResourceType,
                    offerPrice: PRIOR_PRICE,
                    lastSold: 0, // zero sell-through → maximum downward pressure
                },
            },
            buy: {},
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[clothingResourceType.name]!.offerPrice!;
        // At the cost floor, soft brake applies: max drop is PRICE_ADJUST_MAX_DOWN_SOFT (≤1%)
        expect(newPrice).toBeGreaterThanOrEqual(PRIOR_PRICE * PRICE_ADJUST_MAX_DOWN_SOFT);
        // The full 5% drop must NOT happen
        expect(newPrice).toBeGreaterThan(PRIOR_PRICE * PRICE_ADJUST_MAX_DOWN);
    });

    it('does not activate the brake zone for facilities with negligible costs (costFloor = PRICE_FLOOR)', () => {
        // A facility with no inputs and minimal workers has costFloor ≈ PRICE_FLOOR.
        // The brake zone should be inactive and full PRICE_ADJUST_MAX_DOWN should apply.
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(10, 0, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeCloseTo(10 * PRICE_ADJUST_MAX_DOWN, 5);
    });
});
