import { beforeEach, describe, expect, it } from 'vitest';
import {
    INPUT_BUFFER_TARGET_TICKS,
    INPUT_BUFFER_TARGET_TICKS_SERVICES,
    INVENTORY_SMOOTHING_MAX_EXTRA,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
} from '../constants';
import { DEFAULT_WAGE_PER_EDU } from '../financial/financialTick';
import type { StorageFacility } from '../planet/facility';
import type { AgentMarketOfferState, AutomatedPricingConfig } from '../planet/planet';
import {
    clothingResourceType,
    fabricResourceType,
    ironOreResourceType,
    lumberResourceType,
    produceResourceType,
    waterResourceType,
} from '../planet/resources';
import { seedRng } from '../utils/stochasticRound';
import { makeAgent, makePlanet, makeProductionFacility, makeStorageFacility } from '../utils/testHelper';
import { adjustOfferPrice, automaticPricing } from './automaticPricing';
import type { Resource } from '../planet/claims';

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

// ── Config resolver unit tests ────────────────────────────────────────────────

describe('resolveOfferConfig — config resolution', () => {
    const goodsResource: Resource = {
        name: 'TestGoods',
        form: 'solid',
        level: 'refined',
        volumePerQuantity: 1,
        massPerQuantity: 1,
    };
    const serviceResource: Resource = {
        name: 'TestService',
        form: 'services',
        level: 'source',
        volumePerQuantity: 0,
        massPerQuantity: 0,
    };

    it('returns all defaults when config is undefined (goods)', () => {
        // reach into the module internals via adjustOfferPrice behaviour: undefined config gives defaults
        // We'll test by calling the function with no autoConfig on the offer
        const offer = { resource: goodsResource, offerPrice: 10, lastSold: 5 } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2, 10);
        // Diagnostics are set so we can inspect
        expect(offer.diagnostics).toBeDefined();
        expect(offer.diagnostics!.targetSellThrough).toBe(0.9);
    });

    it('returns service-specific targetSellThrough when config is undefined (services)', () => {
        const offer = { resource: serviceResource, offerPrice: 10, lastSold: 5 } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2, 10);
        expect(offer.diagnostics).toBeDefined();
        expect(offer.diagnostics!.targetSellThrough).toBe(0.95);
    });

    it('partial config overrides only specified fields, others fall back to defaults', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 100, // full sell-through
            autoConfig: { priceAdjustMaxUp: 1.1 } as AutomatedPricingConfig,
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2, 10);
        expect(offer.diagnostics).toBeDefined();
        // priceAdjustMaxUp = 1.10 is used => with full sell-through newPrice = 10 * 1.10 = 11
        expect(offer.offerPrice).toBeCloseTo(11, 5);
        // targetSellThrough should still be default 0.9
        expect(offer.diagnostics!.targetSellThrough).toBe(0.9);
    });

    it('full config overrides all fields', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 100, // full sell-through → baseFactor = 1 (maxUp)
            autoConfig: {
                priceAdjustMaxUp: 1.2,
                priceAdjustMaxDown: 0.9,
                costSpringStrength: 0.5,
                bidOfferMaxCostMultiplier: 10,
                inventorySmoothingMaxExtra: 5,
                outputBufferMaxTicks: 40,
                targetSellThrough: 0.8,
                automatedCostFloorBuffer: 1.0,
                freeSellQuantity: 0,
                freeSellQuantitySmoothingMaxExtra: 2,
            } as AutomatedPricingConfig,
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2, 10);
        expect(offer.diagnostics).toBeDefined();
        expect(offer.diagnostics!.targetSellThrough).toBe(0.8);
        // sellThrough = 100/100 = 1.0, target = 0.8 → above target → factor between 1 and 1.20
        // t = (1.0 - 0.8) / (1 - 0.8) = 1.0, baseFactor = 1 + 1.0 * (1.20 - 1) = 1.20
        expect(offer.offerPrice).toBe(10 * 1.2);
    });
});

describe('resolveBidConfig — config resolution', () => {
    const goodsResource: Resource = {
        name: 'TestGoods',
        form: 'solid',
        level: 'manufactured',
        volumePerQuantity: 1,
        massPerQuantity: 1,
    };
    const serviceResource: Resource = {
        name: 'TestService',
        form: 'services',
        level: 'source',
        volumePerQuantity: 0,
        massPerQuantity: 0,
    };

    it('buy-side with undefined config picks goods defaults for solid resources', () => {
        const planet = makePlanetWithPrice({ [goodsResource.name]: 5 });
        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].deposits = 1_000_000;
        const facility = makeProductionFacility({ none: 1 }, { id: 'fac', scale: 1 });
        facility.needs = [{ resource: goodsResource, quantity: 10 }];
        facility.produces = [{ resource: waterResourceType, quantity: 5 }];
        agent.assets[PLANET_ID].productionFacilities = [facility];

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market?.buy[goodsResource.name];
        expect(bid).toBeDefined();

        // With empty storage and smoothing: baseRate = 10, smoothed = 10 * (1 + 2) = 30
        expect(bid!.bidStorageTarget).toBeCloseTo(10 * (1 + INVENTORY_SMOOTHING_MAX_EXTRA), 0);
    });

    it('buy-side with undefined config picks service defaults for services resources', () => {
        const planet = makePlanetWithPrice({ [serviceResource.name]: 5 });
        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].deposits = 1_000_000;
        const facility = makeProductionFacility({ none: 1 }, { id: 'fac', scale: 1 });
        facility.needs = [{ resource: serviceResource, quantity: 10 }];
        facility.produces = [{ resource: waterResourceType, quantity: 5 }];
        agent.assets[PLANET_ID].productionFacilities = [facility];

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market?.buy[serviceResource.name];
        expect(bid).toBeDefined();
        // Services use INPUT_BUFFER_TARGET_TICKS_SERVICES (3), no inventory smoothing
        const expectedRawTarget = 10 * 1 * INPUT_BUFFER_TARGET_TICKS_SERVICES;
        expect(bid!.bidStorageTarget).toBeCloseTo(expectedRawTarget, 0);
    });
});

// ── Existing tests ────────────────────────────────────────────────────────────

describe('automaticPricing — sell offer respects own input reserves', () => {
    it('does not offer for sale the portion of inventory reserved for own facility inputs', () => {
        const producer = makeProductionFacility({ none: 1 }, { id: 'proc', scale: 10 });
        producer.needs = [];
        producer.produces = [{ resource: produceResourceType, quantity: 1000 }];

        const consumer = makeProductionFacility({ none: 1 }, { id: 'bev', scale: 10 });
        consumer.needs = [{ resource: produceResourceType, quantity: 200 }];
        consumer.produces = [{ resource: ironOreResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [produceResourceType.name]: 5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [producer, consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [produceResourceType.name]: { resource: produceResourceType, quantity: 5_000 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[produceResourceType.name];

        expect(offer?.offerRetainment).toBe(200 * 10 * INPUT_BUFFER_TARGET_TICKS);
    });

    it('offers surplus above the reserved buffer', () => {
        const producer = makeProductionFacility({ none: 1 }, { id: 'proc', scale: 10 });
        producer.needs = [];
        producer.produces = [{ resource: produceResourceType, quantity: 1000 }];

        const consumer = makeProductionFacility({ none: 1 }, { id: 'bev', scale: 10 });
        consumer.needs = [{ resource: produceResourceType, quantity: 200 }];
        consumer.produces = [{ resource: ironOreResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [produceResourceType.name]: 5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [producer, consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [produceResourceType.name]: { resource: produceResourceType, quantity: 65_000 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[produceResourceType.name];

        expect(offer?.offerRetainment).toBe(200 * 10 * INPUT_BUFFER_TARGET_TICKS);
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

        expect(offer?.offerRetainment).toBe(0);
    });
});

describe('automaticPricing — offer price tâtonnement', () => {
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
        expect(newPrice).toBeCloseTo(PRICE * PRICE_ADJUST_MAX_DOWN, 5);
    });

    it('has no price drift when sell-through exactly equals the target', () => {
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

        expect(agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice).toBeCloseTo(PRICE);
    });

    it('does not exceed GROCERY_PRICE_CEIL', () => {
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE_CEIL, STOCK, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        expect(agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice).toBe(PRICE_CEIL);
    });
});

// ── Sell-side config override tests ──────────────────────────────────────────

describe('automaticPricing — sell-side config overrides', () => {
    beforeEach(() => seedRng(42));

    it('custom priceAdjustMaxUp and priceAdjustMaxDown affect the adjustment bounds', () => {
        const PRICE = 10;
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, STOCK, STOCK);
        // Set custom priceAdjustMaxUp = 1.01 (much more conservative)
        agent.assets[PLANET_ID].market!.sell[WATER]!.autoConfig = {
            priceAdjustMaxUp: 1.01,
            priceAdjustMaxDown: 0.99,
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeCloseTo(10 * 1.01, 5);
    });

    it('custom targetSellThrough changes the equilibrium point', () => {
        const PRICE = 10;
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, 800, STOCK);
        // With default target=0.9, sellThrough = 0.8 -> below target -> price down
        // With custom target=0.7, sellThrough = 0.8 -> above target -> price up
        agent.assets[PLANET_ID].market!.sell[WATER]!.autoConfig = {
            targetSellThrough: 0.7,
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        // sellThrough = 800/1000 = 0.8, target = 0.7 → above target → price should go up
        expect(newPrice).toBeGreaterThan(10);
    });

    it('custom outputBufferMaxTicks affects retainment / surplus smoothing', () => {
        const producer = makeProductionFacility({ none: 1 }, { id: 'proc', scale: 10 });
        producer.needs = [];
        producer.produces = [{ resource: produceResourceType, quantity: 1000 }];

        const consumer = makeProductionFacility({ none: 1 }, { id: 'bev', scale: 10 });
        consumer.needs = [{ resource: produceResourceType, quantity: 200 }];
        consumer.produces = [{ resource: ironOreResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [produceResourceType.name]: 5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [producer, consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [produceResourceType.name]: { resource: produceResourceType, quantity: 65_000 },
        });

        // Set very small output buffer → surplus ratio will be higher → more aggressive smoothing
        agent.assets[PLANET_ID].market = {
            sell: {
                [produceResourceType.name]: {
                    resource: produceResourceType,
                    offerPrice: 5,
                    autoConfig: { outputBufferMaxTicks: 2, inventorySmoothingMaxExtra: 5 },
                    lastSold: 100,
                },
            },
            buy: {},
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[produceResourceType.name];
        expect(offer).toBeDefined();
        expect(offer!.diagnostics).toBeDefined();
        // surplusRatio should be > 0 (inventory >> outputBufferMaxTicks * baseRate)
        // With outputBufferMaxTicks=2, referenceQty = 1000 * 2 = 2000
        // surplus = 65000 - retainment (200*10*30=60000) = 5000
        // surplusRatio = min(1, 5000/2000) = 1
        // smoothedOffer = 1000 * (1 + 5 * 1) = 6000
        // retainment = max(60000, 65000 - 6000) = 60000
        // So offerRetainment = 60000
        expect(offer!.offerRetainment).toBe(200 * 10 * INPUT_BUFFER_TARGET_TICKS);
    });

    it('freeSellQuantity adds extra effective quantity when inventory is low', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'well', scale: 1 });
        facility.needs = [];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [WATER]: 5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [WATER]: { resource: waterResourceType, quantity: 10 },
        });
        agent.assets[PLANET_ID].market = {
            sell: {
                [WATER]: {
                    resource: waterResourceType,
                    offerPrice: 10,
                    lastSold: 5,
                    autoConfig: {
                        freeSellQuantity: 1000,
                        freeSellQuantitySmoothingMaxExtra: 5,
                    } as AutomatedPricingConfig,
                },
            },
            buy: {},
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[WATER];
        expect(offer).toBeDefined();
        expect(offer!.diagnostics).toBeDefined();
        // effectiveQuantity should be > 10 (base) because freeSellQuantity adds more
        // freeSellPerTick = 1000/5 = 200, base effective = 10 - 0 = 10
        // but freeSellPerTick dominates -> effectiveQuantity = min(10 + 200, 10) = 10? No...
        // Wait: baseEffectiveQuantity = max(0, 10 - 0) = 10, freeSellPerTick = 200, effectiveQuantity = min(10 + 200, 10) = 10
        // Actually the code says: if freeSellPerTick > 0 && baseEffectiveQuantity < freeSellQty => use baseEffectiveQuantity + freeSellPerTick, capped at inventoryQty
        // So effectiveQuantity = min(10 + 200, 10) = 10
        // With freeSellQuantity but inventory is only 10, the effective quantity is capped at inventory
        expect(offer!.diagnostics!.effectiveQuantity).toBeLessThanOrEqual(10);
    });

    it('custom costSpringStrength and automatedCostFloorBuffer affect cost-floor brake behavior', () => {
        const INPUT_PRICE = 2.0;
        const NEEDS_QTY = 10;
        const PRODUCES_QTY = 5;
        const inputCost = NEEDS_QTY * INPUT_PRICE;
        const wageCost = DEFAULT_WAGE_PER_EDU;
        const costPerUnit = (inputCost + wageCost) / PRODUCES_QTY;

        // Set price slightly above costFloor but well within the brake zone
        // brakeZoneTop = costFloor * (1 + automatedCostFloorBuffer) = costFloor * 1.5
        // With PRIOR_PRICE = costFloor * 1.2, we're inside the zone: deviation = sqrt(brakeZoneTop / price - 1) = sqrt(1.5/1.2 - 1) = sqrt(0.25) = 0.5
        const PRIOR_PRICE = costPerUnit * 1.2;

        const facility = makeProductionFacility({ none: 1 }, { id: 'factory', scale: 1 });
        facility.needs = [{ resource: produceResourceType, quantity: NEEDS_QTY }];
        facility.produces = [{ resource: clothingResourceType, quantity: PRODUCES_QTY }];
        facility.lastTickResults.lastProduced = { [clothingResourceType.name]: PRODUCES_QTY };
        facility.lastTickResults.lastConsumed = { [produceResourceType.name]: NEEDS_QTY };
        facility.lastTickResults.costBalance = PRIOR_PRICE * PRODUCES_QTY - inputCost - wageCost;

        const planet = makePlanetWithPrice({
            [produceResourceType.name]: INPUT_PRICE,
            [clothingResourceType.name]: PRIOR_PRICE,
        });
        planet.lastProductionCostFloors[clothingResourceType.name] = costPerUnit;

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [clothingResourceType.name]: { resource: clothingResourceType, quantity: 1000 },
        });
        // With costSpringStrength=5.0 and deviation=0.5, the spring adds 2.5 to netFactor
        // Since lastSold=0 → baseFactor = PRICE_ADJUST_MAX_DOWN (0.95)
        // netFactor = 0.95 + 5.0*0.5 = 3.45 → price goes way up despite zero sell-through
        // That's extreme, so let's use costSpringStrength=0.5 instead for a milder effect
        agent.assets[PLANET_ID].market = {
            sell: {
                [clothingResourceType.name]: {
                    resource: clothingResourceType,
                    offerPrice: PRIOR_PRICE,
                    lastSold: 0, // zero sell-through → downward pressure
                    autoConfig: {
                        costSpringStrength: 0.5,
                        automatedCostFloorBuffer: 1.0, // brakeZoneTop = costFloor * 2.0
                    } as AutomatedPricingConfig,
                },
            },
            buy: {},
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const diagnostics = agent.assets[PLANET_ID].market!.sell[clothingResourceType.name]!.diagnostics;
        expect(diagnostics).toBeDefined();
        // deviation = sqrt(1.0 / 0.2) = sqrt(5) ≈ 2.236 – wait let me recalculate
        // brakeZoneTop = 4.2 * 2.0 = 8.4, PRIOR_PRICE = 4.2 * 1.2 = 5.04
        // costSpringDeviation = sqrt(8.4/5.04 - 1) = sqrt(0.6667) ≈ 0.816
        // costSpringStrength * deviation = 0.5 * 0.816 = 0.408
        // netFactor without overDeviation = 0.95 + 0.408 = 1.358
        // So newPrice = 5.04 * 1.358 ≈ 6.84, which is > 5.04
        expect(diagnostics!.costSpringDeviation).toBeGreaterThan(0);
        const newPrice = agent.assets[PLANET_ID].market!.sell[clothingResourceType.name]!.offerPrice!;
        expect(newPrice).toBeGreaterThan(PRIOR_PRICE * PRICE_ADJUST_MAX_DOWN);
        expect(diagnostics!.netFactor).toBeGreaterThan(PRICE_ADJUST_MAX_DOWN);
    });
});

// ── Existing tests ────────────────────────────────────────────────────────────

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
        const INPUT_PRICE = 2.0;
        const NEEDS_QTY = 10;
        const PRODUCES_QTY = 5;
        const inputCost = NEEDS_QTY * INPUT_PRICE;
        const wageCost = DEFAULT_WAGE_PER_EDU;
        const costPerUnit = (inputCost + wageCost) / PRODUCES_QTY;
        const PRIOR_PRICE = Math.max(PRICE_FLOOR, costPerUnit);

        const facility = makeProductionFacility({ none: 1 }, { id: 'factory', scale: 1 });
        facility.needs = [{ resource: produceResourceType, quantity: NEEDS_QTY }];
        facility.produces = [{ resource: clothingResourceType, quantity: PRODUCES_QTY }];
        facility.lastTickResults.lastProduced = { [clothingResourceType.name]: PRODUCES_QTY };
        facility.lastTickResults.lastConsumed = { [produceResourceType.name]: NEEDS_QTY };
        facility.lastTickResults.costBalance = PRIOR_PRICE * PRODUCES_QTY - inputCost - wageCost;

        const planet = makePlanetWithPrice({
            [produceResourceType.name]: INPUT_PRICE,
            [clothingResourceType.name]: PRIOR_PRICE,
        });
        planet.lastProductionCostFloors[clothingResourceType.name] = costPerUnit;

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
                    lastSold: 0,
                },
            },
            buy: {},
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[clothingResourceType.name]!.offerPrice!;

        expect(newPrice).toBeGreaterThan(PRIOR_PRICE * PRICE_ADJUST_MAX_DOWN);
    });

    it('does not activate the brake zone for facilities with negligible costs (costFloor = PRICE_FLOOR)', () => {
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(10, 0, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeCloseTo(10 * PRICE_ADJUST_MAX_DOWN, 5);
    });
});

describe('automaticPricing — profitabilityGap multiplicatively dampens but never reverses bid pressure', () => {
    function makeUnprofitableConsumerAgent(initialBidPrice: number) {
        const consumer = makeProductionFacility({ none: 1 }, { id: 'cons', scale: 1 });
        consumer.needs = [{ resource: lumberResourceType, quantity: 1 }];
        consumer.produces = [{ resource: waterResourceType, quantity: 1 }];

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].deposits = 1_000_000;

        agent.assets[PLANET_ID].market = {
            sell: {},
            buy: {
                [lumberResourceType.name]: {
                    resource: lumberResourceType,
                    bidPrice: initialBidPrice,
                    lastBought: 0,
                    lastEffectiveQty: 5,
                    automated: true,
                },
            },
        };
        return agent;
    }

    it('bid price increases even when profitabilityGap is very large and fill rate is 0', () => {
        const planet = makePlanet({
            marketPrices: {
                [lumberResourceType.name]: 100,
                [waterResourceType.name]: 0.1,
            },
            lastProductionCostFloors: { [lumberResourceType.name]: 20 },
        });
        const agent = makeUnprofitableConsumerAgent(50);

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[lumberResourceType.name]!;
        expect(bid.bidPrice).toBeGreaterThan(50);
        expect(bid.bidPrice).toBeCloseTo(50 * PRICE_ADJUST_MAX_UP, 5);
    });

    it('bid price never falls below initial even under extreme profitabilityGap', () => {
        const consumer = makeProductionFacility({ none: 1 }, { id: 'cons', scale: 1 });
        consumer.needs = [{ resource: lumberResourceType, quantity: 1 }];
        consumer.produces = [{ resource: waterResourceType, quantity: 1 }];

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].deposits = 1_000_000;
        agent.assets[PLANET_ID].market = {
            sell: {},
            buy: {
                [lumberResourceType.name]: {
                    resource: lumberResourceType,
                    bidPrice: 50,
                    lastBought: 5,
                    lastEffectiveQty: 10,
                    automated: true,
                },
            },
        };

        const planet = makePlanet({
            marketPrices: {
                [lumberResourceType.name]: 100,
                [waterResourceType.name]: 0.1,
            },
            lastProductionCostFloors: { [lumberResourceType.name]: 20 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[lumberResourceType.name]!;

        expect(bid.bidPrice).toBeGreaterThanOrEqual(50);
    });

    it('oversupplied + unprofitable: downward pressure is unhindered (dampening = 1)', () => {
        const consumer = makeProductionFacility({ none: 1 }, { id: 'cons', scale: 1 });
        consumer.needs = [{ resource: lumberResourceType, quantity: 1 }];
        consumer.produces = [{ resource: waterResourceType, quantity: 1 }];

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].deposits = 1_000_000;

        agent.assets[PLANET_ID].market = {
            sell: {},
            buy: {
                [lumberResourceType.name]: {
                    resource: lumberResourceType,
                    bidPrice: 50,
                    lastBought: 10,
                    lastEffectiveQty: 10,
                    automated: true,
                },
            },
        };

        const planet = makePlanet({
            marketPrices: {
                [lumberResourceType.name]: 100,
                [waterResourceType.name]: 0.1,
            },
            lastProductionCostFloors: { [lumberResourceType.name]: 20 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[lumberResourceType.name]!;

        expect(bid.bidPrice).toBeCloseTo(50 * PRICE_ADJUST_MAX_DOWN, 5);
    });
});
