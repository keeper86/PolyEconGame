import { beforeEach, describe, expect, it } from 'vitest';
import {
    AUTOMATED_COST_FLOOR_BUFFER,
    BID_OFFER_MAX_COST_MULTIPLIER,
    BID_PRICE_SENSITIVITY,
    BID_VOLUME_FLOOR_FRACTION,
    FACILITY_MAINTENANCE_DECREASE_PER_YEAR,
    FILL_RATE_EMA_ALPHA,
    INPUT_BUFFER_TARGET_TICKS,
    INPUT_BUFFER_TARGET_TICKS_SERVICES,
    INVENTORY_SMOOTHING_MAX_EXTRA,
    MAINTENANCE_SERVICE_PER_STATUS_UNIT,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
    SELL_THROUGH_EMA_ALPHA,
    TARGET_SELL_THROUGH,
    TARGET_SELL_THROUGH_SERVICES,
    TICKS_PER_YEAR,
} from '../constants';
import { DEFAULT_WAGE_PER_EDU } from '../financial/financialTick';
import type { StorageFacility } from '../planet/facility';
import { facilityRestorationCapacityPerTick } from '../planet/facilityMaintenance';
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
import { adjustOfferPrice, automaticPricing, buyVolumeFraction, sellVolumeFraction } from './automaticPricing';
import type { Resource } from '../planet/claims';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
} from '../planet/services';
import { storageDepartmentFacilityType } from '../planet/specialFacilities';

const PLANET_ID = 'p';
const WATER = waterResourceType.name;

const BUY_VOLUME_FRACTION_AT_COST = buyVolumeFraction(
    1,
    1,
    BID_PRICE_SENSITIVITY,
    BID_VOLUME_FLOOR_FRACTION,
    BID_OFFER_MAX_COST_MULTIPLIER,
);

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
        adjustOfferPrice(offer, 100, 10, 2);
        // Diagnostics are set so we can inspect
        expect(offer.diagnostics).toBeDefined();
        expect(offer.diagnostics!.targetSellThrough).toBe(TARGET_SELL_THROUGH);
    });

    it('returns service-specific targetSellThrough when config is undefined (services)', () => {
        const offer = { resource: serviceResource, offerPrice: 10, lastSold: 5 } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2);
        expect(offer.diagnostics).toBeDefined();
        expect(offer.diagnostics!.targetSellThrough).toBe(TARGET_SELL_THROUGH_SERVICES);
    });

    it('partial config overrides only specified fields, others fall back to defaults', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 100, // full sell-through
            autoConfig: { priceAdjustMaxUp: 1.1 } as AutomatedPricingConfig,
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2);
        expect(offer.diagnostics).toBeDefined();
        // priceAdjustMaxUp = 1.10 is used => with full sell-through newPrice = 10 * 1.10 = 11
        expect(offer.offerPrice).toBeCloseTo(11, 5);
        expect(offer.diagnostics!.targetSellThrough).toBe(TARGET_SELL_THROUGH);
    });

    it('full config overrides all fields', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 100, // full sell-through → baseFactor = 1 (maxUp)
            autoConfig: {
                priceAdjustMaxUp: 1.2,
                priceAdjustMaxDown: 0.9,
                inventorySmoothingMaxExtra: 5,
                targetSellThrough: 0.8,
                askVolumeFloorFraction: 0.3,
                askPriceSensitivity: 1.5,
                freeRetainment: 0,
                freeRetainmentSmoothingMaxExtra: 2,
            } as AutomatedPricingConfig,
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2);
        expect(offer.diagnostics).toBeDefined();
        expect(offer.diagnostics!.targetSellThrough).toBe(0.8);
        // sellThrough = 100/100 = 1.0, target = 0.8 → above target → factor between 1 and 1.20
        // t = (1.0 - 0.8) / (1 - 0.8) = 1.0, baseFactor = 1 + 1.0 * (1.20 - 1) = 1.20
        // volume fraction only scales quantity, not the price factor
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
        planet.lastProductionCostFloors[goodsResource.name] = 5;
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
        planet.lastProductionCostFloors[serviceResource.name] = 5;
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
        const PRICE = 10;
        const STOCK = 1000;
        const sold = STOCK * TARGET_SELL_THROUGH;
        const { agent, planet } = makeWaterProducerWithPriorOffer(PRICE, sold, STOCK);
        // Disable sell-smoothing for this test: set smoothing=1 so all surplus is offered
        const offer = agent.assets[PLANET_ID].market!.sell[WATER]!;
        offer.autoConfig = { ...offer.autoConfig, freeRetainmentSmoothingMaxExtra: 1 };

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

describe('adjustOfferPrice — adaptive target sell-through', () => {
    const goodsResource: Resource = {
        name: 'TestGoodsAdaptive',
        form: 'solid',
        level: 'refined',
        volumePerQuantity: 1,
        massPerQuantity: 1,
    };

    it('measures sell-through against the volume-adjusted (withheld) quantity', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 4,
            autoConfig: {
                automatedCostFloorBuffer: 2,
                askPriceSensitivity: 1,
                askVolumeFloorFraction: 0,
                targetSellThrough: 0.6,
            },
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 20);

        // ratio 0.5, buffer 2, width 1 → volumeFraction = 1/(1+e^1.5) ≈ 0.1824
        const volumeFraction = offer.diagnostics!.volumeFraction;
        expect(volumeFraction).toBeCloseTo(0.1824, 3);
        // effectiveQuantity = 100 × volumeFraction; sell-through measured against it, not the raw inventory
        expect(offer.diagnostics!.sellThroughRate).toBeCloseTo(4 / (100 * volumeFraction), 10);
        expect(offer.diagnostics!.sellThroughRate).toBeGreaterThan(4 / 100);
    });

    it('scales the target sell-through by the volume factor (price pressure while withholding)', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 4,
            autoConfig: {
                automatedCostFloorBuffer: 2,
                askPriceSensitivity: 1,
                askVolumeFloorFraction: 0,
                targetSellThrough: 0.6,
            },
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 20);

        const volumeFraction = offer.diagnostics!.volumeFraction;
        const adaptiveTarget = offer.diagnostics!.effectiveTargetSellThrough;
        expect(adaptiveTarget).toBeCloseTo(0.6 * volumeFraction, 10);
        // raw sell-through (≈0.22) is below the base target 0.6 but above the adaptive target → price rises
        expect(offer.diagnostics!.sellThroughRate).toBeLessThan(0.6);
        expect(offer.diagnostics!.sellThroughRate).toBeGreaterThan(adaptiveTarget);
        expect(offer.diagnostics!.targetSellThrough).toBe(0.6);
        expect(offer.offerPrice).toBeGreaterThan(10);
    });

    it('keeps the base target when offering the full surplus (no withholding)', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 100,
            autoConfig: {
                automatedCostFloorBuffer: 2,
                askPriceSensitivity: 1,
                askVolumeFloorFraction: 1,
                targetSellThrough: 0.6,
            },
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2);

        // ratio 5 above the buffer → volumeFraction = 1 → effective target equals the base target
        expect(offer.diagnostics!.volumeFraction).toBe(1);
        expect(offer.diagnostics!.effectiveTargetSellThrough).toBeCloseTo(0.6, 10);
        // full sell-through → price adjusts up by the full maxUp
        expect(offer.offerPrice).toBeCloseTo(10 * PRICE_ADJUST_MAX_UP, 5);
    });

    it('still lowers the price when even the withheld offering does not clear', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 0,
            autoConfig: {
                automatedCostFloorBuffer: 2,
                askPriceSensitivity: 1,
                askVolumeFloorFraction: 0,
                targetSellThrough: 0.6,
            },
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 20);

        const adaptiveTarget = offer.diagnostics!.effectiveTargetSellThrough;
        expect(adaptiveTarget).toBeCloseTo(0.6 * offer.diagnostics!.volumeFraction, 10);
        expect(adaptiveTarget).toBeGreaterThan(0);
        expect(offer.diagnostics!.sellThroughRate).toBe(0);
        // sold 0 < adaptive target → factor = maxDown → price falls
        expect(offer.offerPrice).toBeCloseTo(10 * PRICE_ADJUST_MAX_DOWN, 5);
    });
});

// ── Sell-side config override tests ──────────────────────────────────────────

describe('automaticPricing — EMA smoothing', () => {
    const goodsResource: Resource = {
        name: 'TestGoodsEMA',
        form: 'solid',
        level: 'refined',
        volumePerQuantity: 1,
        massPerQuantity: 1,
    };

    it('seeds smoothedSellThrough with the raw value on the first tick', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 50,
            autoConfig: { askVolumeFloorFraction: 1 },
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2);
        expect(offer.smoothedSellThrough).toBeCloseTo(0.5, 10);
        expect(offer.diagnostics!.sellThroughRate).toBeCloseTo(0.5, 10);
        expect(offer.diagnostics!.smoothedSellThrough).toBeCloseTo(0.5, 10);
    });

    it('applies EMA across repeated ticks', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 90,
            autoConfig: { askVolumeFloorFraction: 1 },
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2);
        expect(offer.smoothedSellThrough).toBeCloseTo(0.9, 10);

        offer.lastSold = 10;
        adjustOfferPrice(offer, 100, 10, 2);
        const expected = SELL_THROUGH_EMA_ALPHA * 0.1 + (1 - SELL_THROUGH_EMA_ALPHA) * 0.9;
        expect(offer.smoothedSellThrough).toBeCloseTo(expected, 10);

        offer.lastSold = 90;
        adjustOfferPrice(offer, 100, 10, 2);
        const expected2 = SELL_THROUGH_EMA_ALPHA * 0.9 + (1 - SELL_THROUGH_EMA_ALPHA) * expected;
        expect(offer.smoothedSellThrough).toBeCloseTo(expected2, 10);
    });

    it('damps oscillation between high and low sell-through', () => {
        const offer = {
            resource: goodsResource,
            offerPrice: 10,
            lastSold: 95,
        } as unknown as AgentMarketOfferState;
        adjustOfferPrice(offer, 100, 10, 2);

        let previous = offer.smoothedSellThrough!;
        let maxOscillation = 0;
        for (let i = 0; i < 20; i++) {
            offer.lastSold = i % 2 === 0 ? 85 : 95;
            adjustOfferPrice(offer, 100, 10, 2);
            const current = offer.smoothedSellThrough!;
            maxOscillation = Math.max(maxOscillation, Math.abs(current - previous));
            previous = current;
        }
        // The EMA should never oscillate as much as the raw signal (±0.1 → 0.2 swing)
        expect(maxOscillation).toBeLessThan(0.1);
    });

    it('fill rate EMA seeds with raw value and smooths over ticks', () => {
        const planet = makePlanetWithPrice({ [lumberResourceType.name]: 100 });
        planet.lastProductionCostFloors[lumberResourceType.name] = 20;

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

        automaticPricing(new Map([['co', agent]]), planet);
        const bid = agent.assets[PLANET_ID].market!.buy[lumberResourceType.name]!;
        expect(bid.smoothedFillRate).toBeCloseTo(0.5, 10);
        expect(bid.diagnostics!.fillRate).toBeCloseTo(0.5, 10);
        expect(bid.diagnostics!.smoothedFillRate).toBeCloseTo(0.5, 10);

        bid.lastBought = 10;
        bid.lastEffectiveQty = 10;
        automaticPricing(new Map([['co', agent]]), planet);
        const expected = FILL_RATE_EMA_ALPHA * 1.0 + (1 - FILL_RATE_EMA_ALPHA) * 0.5;
        expect(bid.smoothedFillRate).toBeCloseTo(expected, 10);
    });
});

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

    it('freeRetainment keeps minimum inventory in storage', () => {
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
                        freeRetainment: 1000,
                        freeRetainmentSmoothingMaxExtra: 5,
                    } as AutomatedPricingConfig,
                },
            },
            buy: {},
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[WATER];
        expect(offer).toBeDefined();
        expect(offer!.diagnostics).toBeDefined();
        // With freeRetainment=1000, the agent keeps 1000 units in storage.
        // Inventory is only 10, so effectiveQuantity = max(0, 10 - max(0, freeRetainment=1000)) = 0
        // All 10 units are retained, nothing offered for sale.
        expect(offer!.diagnostics).toBeDefined();
        expect(offer!.diagnostics!.effectiveQuantity).toBe(0);
    });

    it('buyVolumeFraction throttles demand around the configured multiplier', () => {
        const multiplier = BID_OFFER_MAX_COST_MULTIPLIER;
        expect(buyVolumeFraction(0, 1, 1, 0.2, multiplier)).toBeCloseTo(0.977, 3);
        expect(buyVolumeFraction(0.5, 1, 1, 0.2, multiplier)).toBeCloseTo(0.962, 3);
        expect(buyVolumeFraction(multiplier, 1, 1, 0.2, multiplier)).toBeCloseTo(0.6, 5);
        expect(buyVolumeFraction(100, 1, 1, 0.2, multiplier)).toBeCloseTo(0.2, 5);
        expect(buyVolumeFraction(2, 1, 1, 0.2, multiplier)).toBeGreaterThan(0.2);
        expect(buyVolumeFraction(2, 1, 1, 0.2, multiplier)).toBeLessThan(1);
        expect(buyVolumeFraction(3, 1, 1, 0.2, multiplier)).toBeLessThan(buyVolumeFraction(2, 1, 1, 0.2, multiplier));
        expect(buyVolumeFraction(5, 1, 2, 0.2, multiplier)).toBeGreaterThan(
            buyVolumeFraction(5, 1, 1, 0.2, multiplier),
        );
    });

    it('buyVolumeFraction is smooth across price/cost = 1 and anchored near full volume at 0', () => {
        const width = 0.5;
        for (const multiplier of [0, 0.5, 1, 3.5, 7]) {
            const justBelow = buyVolumeFraction(0.9999, 1, width, 0.2, multiplier);
            const justAbove = buyVolumeFraction(1.0001, 1, width, 0.2, multiplier);
            expect(Math.abs(justAbove - justBelow)).toBeLessThan(0.0001);
            expect(justAbove).toBeGreaterThan(0.2);
            expect(justAbove).toBeLessThanOrEqual(1);
        }
        expect(buyVolumeFraction(0, 1, width, 0.2, 3.5)).toBeGreaterThan(0.99);
        expect(buyVolumeFraction(1, 1, width, 0.2, 3.5)).toBeLessThan(1);
    });

    it('sellVolumeFraction holds back volume below the buffer and respects the floor', () => {
        const buffer = AUTOMATED_COST_FLOOR_BUFFER;
        expect(sellVolumeFraction(100, 1, 1, 0.2, buffer)).toBeCloseTo(1, 5);
        expect(sellVolumeFraction(buffer, 1, 1, 0.2, buffer)).toBeCloseTo(0.6, 5);
        expect(sellVolumeFraction(0.5, 1, 1, 0.2, buffer)).toBeLessThan(1);
        expect(sellVolumeFraction(0.25, 1, 1, 0.2, buffer)).toBeLessThan(sellVolumeFraction(0.5, 1, 1, 0.2, buffer));
        expect(sellVolumeFraction(0.25, 1, 2, 0.2, buffer)).toBeGreaterThan(
            sellVolumeFraction(0.25, 1, 1, 0.2, buffer),
        );
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

describe('automaticPricing — sell-side pricing feedback', () => {
    beforeEach(() => seedRng(42));

    it('lowers the ask price purely by sell-through feedback when undersold', () => {
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
        // zero sell-through → ask falls to the maximum downward adjustment (no cost spring)
        expect(newPrice).toBeCloseTo(PRIOR_PRICE * PRICE_ADJUST_MAX_DOWN, 5);
    });

    it('sells at pure sell-through adjustment when the cost floor is negligible', () => {
        const STOCK = 1000;
        const { agent, planet } = makeWaterProducerWithPriorOffer(10, 0, STOCK);

        automaticPricing(new Map([['co', agent]]), planet);

        const newPrice = agent.assets[PLANET_ID].market!.sell[WATER]!.offerPrice!;
        expect(newPrice).toBeCloseTo(10 * PRICE_ADJUST_MAX_DOWN, 5);
    });
});

describe('automaticPricing — bid diagnostics for dropped demand', () => {
    it('clears bid diagnostics when construction finishes and demand drops out', () => {
        const constructionState = {
            type: 'new' as const,
            constructionTargetMaxScale: 2,
            totalConstructionServiceRequired: 1000,
            maximumConstructionServiceConsumption: 20,
            progress: 0.5,
            lastTickInvestedConstructionServices: 10,
        };

        const facility = makeProductionFacility({ none: 1 }, { id: 'under-construction', scale: 1 });
        facility.construction = constructionState;

        const planet = makePlanetWithPrice({ [constructionServiceResourceType.name]: 5 });
        planet.lastProductionCostFloors[constructionServiceResourceType.name] = 2;

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].deposits = 1_000_000;
        agent.assets[PLANET_ID].market = {
            sell: {},
            buy: {
                [constructionServiceResourceType.name]: {
                    resource: constructionServiceResourceType,
                    bidPrice: 4,
                    automated: true,
                },
            },
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const bidBefore = agent.assets[PLANET_ID].market!.buy[constructionServiceResourceType.name]!;
        expect(bidBefore).toBeDefined();
        expect(bidBefore.diagnostics).toBeDefined();

        facility.construction = null;

        automaticPricing(new Map([['co', agent]]), planet);

        const bidAfter = agent.assets[PLANET_ID].market!.buy[constructionServiceResourceType.name]!;
        expect(bidAfter.bidStorageTarget).toBe(0);
        expect(bidAfter.diagnostics).toBeUndefined();
    });
});

describe('automaticPricing — facility maintenance demand', () => {
    it('creates a Maintenance buy bid scaled by facility scale for an active facility', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'factory', scale: 10 });
        facility.needs = [];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [maintenanceServiceResourceType.name]: 2 });
        planet.lastProductionCostFloors[maintenanceServiceResourceType.name] = 2;

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].storageFacility.department = null;
        agent.assets[PLANET_ID].deposits = 1_000_000;

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[maintenanceServiceResourceType.name]!;
        expect(bid).toBeDefined();
        const expectedRate =
            (facility.scale * FACILITY_MAINTENANCE_DECREASE_PER_YEAR * MAINTENANCE_SERVICE_PER_STATUS_UNIT) /
            TICKS_PER_YEAR;
        expect(bid.bidStorageTarget).toBeCloseTo(
            expectedRate * INPUT_BUFFER_TARGET_TICKS_SERVICES * BUY_VOLUME_FRACTION_AT_COST,
            10,
        );
    });
    it('scales maintenance demand to the bid volume floor when price is far above cost', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'factory', scale: 10 });
        facility.needs = [];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [maintenanceServiceResourceType.name]: 100 });
        planet.lastProductionCostFloors[maintenanceServiceResourceType.name] = 2;

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].storageFacility.department = null;
        agent.assets[PLANET_ID].deposits = 1_000_000;

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[maintenanceServiceResourceType.name]!;
        expect(bid).toBeDefined();
        const expectedRate =
            (facility.scale * FACILITY_MAINTENANCE_DECREASE_PER_YEAR * MAINTENANCE_SERVICE_PER_STATUS_UNIT) /
            TICKS_PER_YEAR;
        const fullTarget = expectedRate * INPUT_BUFFER_TARGET_TICKS_SERVICES;
        expect(bid.bidStorageTarget).toBeLessThan(fullTarget);
        expect(bid.bidStorageTarget).toBeCloseTo(fullTarget * BID_VOLUME_FLOOR_FRACTION, 5);
    });

    it('skips maintenance demand for facilities under construction', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'under-construction', scale: 10 });
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 2,
            totalConstructionServiceRequired: 1000,
            maximumConstructionServiceConsumption: 20,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
        };

        const planet = makePlanetWithPrice({ [maintenanceServiceResourceType.name]: 2 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].storageFacility.department = null;
        agent.assets[PLANET_ID].deposits = 1_000_000;

        automaticPricing(new Map([['co', agent]]), planet);

        expect(agent.assets[PLANET_ID].market!.buy[maintenanceServiceResourceType.name]).toBeUndefined();
    });

    it('creates a Maintenance buy bid for an expanding facility', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'expanding', scale: 10 });
        facility.needs = [];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];
        facility.construction = {
            type: 'expansion',
            constructionTargetMaxScale: 20,
            totalConstructionServiceRequired: 1000,
            maximumConstructionServiceConsumption: 20,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
        };

        const planet = makePlanetWithPrice({ [maintenanceServiceResourceType.name]: 2 });
        planet.lastProductionCostFloors[maintenanceServiceResourceType.name] = 2;

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].storageFacility.department = null;
        agent.assets[PLANET_ID].deposits = 1_000_000;

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[maintenanceServiceResourceType.name]!;
        expect(bid).toBeDefined();
        const expectedRate =
            (facility.scale * FACILITY_MAINTENANCE_DECREASE_PER_YEAR * MAINTENANCE_SERVICE_PER_STATUS_UNIT) /
            TICKS_PER_YEAR;
        expect(bid.bidStorageTarget).toBeCloseTo(
            expectedRate * INPUT_BUFFER_TARGET_TICKS_SERVICES * BUY_VOLUME_FRACTION_AT_COST,
            10,
        );
    });

    it('bids above steady-state for a facility below full maintenance', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'degraded', scale: 10 });
        facility.needs = [];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];
        facility.maintenanceStatus = 0.5;
        facility.maxMaintenance = 1;

        const planet = makePlanetWithPrice({ [maintenanceServiceResourceType.name]: 2 });
        planet.lastProductionCostFloors[maintenanceServiceResourceType.name] = 2;

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [facility];
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].storageFacility.department = null;
        agent.assets[PLANET_ID].deposits = 1_000_000;

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[maintenanceServiceResourceType.name]!;
        expect(bid).toBeDefined();
        const steadyStateRate =
            (facility.scale * FACILITY_MAINTENANCE_DECREASE_PER_YEAR * MAINTENANCE_SERVICE_PER_STATUS_UNIT) /
            TICKS_PER_YEAR;
        expect(bid.bidStorageTarget).toBeGreaterThan(steadyStateRate * INPUT_BUFFER_TARGET_TICKS_SERVICES);
    });
});

describe('automaticPricing — facility restoration demand', () => {
    function makeDegradedProducer(id: string) {
        const facility = makeProductionFacility({ none: 1 }, { id, scale: 1 });
        facility.needs = [];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];
        facility.maxMaintenance = 0.5;
        facility.maintenanceStatus = 0.5;
        return facility;
    }

    function makeConstructionPlanet() {
        const planet = makePlanetWithPrice({ [constructionServiceResourceType.name]: 2 });
        planet.lastProductionCostFloors[constructionServiceResourceType.name] = 2;
        return planet;
    }

    function makeAgentWithFacilities(facilities: ReturnType<typeof makeProductionFacility>[]) {
        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = facilities;
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].storageFacility.department = null;
        agent.assets[PLANET_ID].deposits = 1_000_000;
        return agent;
    }

    it('creates a Construction buy bid scaled by restoration capacity for a degraded operating facility', () => {
        const facility = makeDegradedProducer('degraded');
        const planet = makeConstructionPlanet();
        const agent = makeAgentWithFacilities([facility]);

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[constructionServiceResourceType.name]!;
        expect(bid).toBeDefined();
        const expectedRate = facilityRestorationCapacityPerTick(facility);
        expect(expectedRate).toBeGreaterThan(0);
        expect(bid.bidStorageTarget).toBeCloseTo(
            expectedRate * INPUT_BUFFER_TARGET_TICKS_SERVICES * BUY_VOLUME_FRACTION_AT_COST,
            10,
        );
    });

    it('skips restoration demand when maxMaintenance is already full', () => {
        const facility = makeProductionFacility({ none: 1 }, { id: 'healthy', scale: 1 });
        facility.needs = [];
        facility.produces = [{ resource: waterResourceType, quantity: 100 }];

        const planet = makeConstructionPlanet();
        const agent = makeAgentWithFacilities([facility]);

        automaticPricing(new Map([['co', agent]]), planet);

        expect(agent.assets[PLANET_ID].market!.buy[constructionServiceResourceType.name]).toBeUndefined();
    });

    it('skips restoration demand for facilities under construction', () => {
        const facility = makeDegradedProducer('under-construction');
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 2,
            totalConstructionServiceRequired: 1000,
            maximumConstructionServiceConsumption: 20,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
        };

        const planet = makeConstructionPlanet();
        const agent = makeAgentWithFacilities([facility]);

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[constructionServiceResourceType.name]!;
        expect(bid).toBeDefined();
        const buildingOnly = 20 * INPUT_BUFFER_TARGET_TICKS_SERVICES;
        expect(bid.bidStorageTarget).toBeCloseTo(buildingOnly * BUY_VOLUME_FRACTION_AT_COST, 10);
    });

    it('sums restoration demand with active expansion construction demand', () => {
        const facility = makeDegradedProducer('expanding');
        facility.construction = {
            type: 'expansion',
            constructionTargetMaxScale: 2,
            totalConstructionServiceRequired: 1000,
            maximumConstructionServiceConsumption: 20,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
        };

        const planet = makeConstructionPlanet();
        const agent = makeAgentWithFacilities([facility]);

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[constructionServiceResourceType.name]!;
        expect(bid).toBeDefined();
        const expected = (20 + facilityRestorationCapacityPerTick(facility)) * INPUT_BUFFER_TARGET_TICKS_SERVICES;
        expect(bid.bidStorageTarget).toBeCloseTo(expected * BUY_VOLUME_FRACTION_AT_COST, 10);
    });

    it('sums restoration demand across multiple degraded facilities', () => {
        const facilityA = makeDegradedProducer('a');
        const facilityB = makeDegradedProducer('b');

        const planet = makeConstructionPlanet();
        const agent = makeAgentWithFacilities([facilityA, facilityB]);

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[constructionServiceResourceType.name]!;
        expect(bid).toBeDefined();
        const expected =
            (facilityRestorationCapacityPerTick(facilityA) + facilityRestorationCapacityPerTick(facilityB)) *
            INPUT_BUFFER_TARGET_TICKS_SERVICES;
        expect(bid.bidStorageTarget).toBeCloseTo(expected * BUY_VOLUME_FRACTION_AT_COST, 10);
    });

    it('respects a custom autoConfig inputBufferTargetTicks override', () => {
        const facility = makeDegradedProducer('degraded');
        const planet = makeConstructionPlanet();
        const agent = makeAgentWithFacilities([facility]);
        agent.assets[PLANET_ID].market = {
            sell: {},
            buy: {
                [constructionServiceResourceType.name]: {
                    resource: constructionServiceResourceType,
                    automated: true,
                    bidPrice: 4,
                    autoConfig: { inputBufferTargetTicks: 7 },
                },
            },
        };

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[constructionServiceResourceType.name]!;
        expect(bid).toBeDefined();
        expect(bid.bidStorageTarget).toBeCloseTo(
            facilityRestorationCapacityPerTick(facility) * 7 * BUY_VOLUME_FRACTION_AT_COST,
            10,
        );
    });

    it('does not create a restoration bid for a non-automated agent without an automated Construction buy', () => {
        const facility = makeDegradedProducer('degraded');
        const planet = makeConstructionPlanet();
        const agent = makeAgentWithFacilities([facility]);
        agent.automated = false;
        agent.assets[PLANET_ID].market = {
            sell: {
                [WATER]: { resource: waterResourceType, automated: true, offerPrice: 10, lastSold: 0 },
            },
            buy: {},
        };

        automaticPricing(new Map([['co', agent]]), planet);

        expect(agent.assets[PLANET_ID].market!.buy[constructionServiceResourceType.name]).toBeUndefined();
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

describe('automaticPricing — storage department generates buy bids', () => {
    it('generates buy bids for logistics and administration when storage department exists', () => {
        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].storageFacility = makeStorageFacility({ planetId: PLANET_ID });
        agent.assets[PLANET_ID].storageFacility.department = storageDepartmentFacilityType(PLANET_ID, 'storage-dept');
        agent.assets[PLANET_ID].storageFacility.department.scale = 1;
        agent.assets[PLANET_ID].deposits = 1_000_000;
        agent.automated = true;

        const planet = makePlanet({
            marketPrices: {
                [logisticsServiceResourceType.name]: 100,
                [administrativeServiceResourceType.name]: 50,
            },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const logisticsBid = agent.assets[PLANET_ID].market?.buy[logisticsServiceResourceType.name];
        const adminBid = agent.assets[PLANET_ID].market?.buy[administrativeServiceResourceType.name];

        expect(logisticsBid).toBeDefined();
        expect(adminBid).toBeDefined();

        expect(logisticsBid!.bidStorageTarget).toBeGreaterThan(0);
        expect(adminBid!.bidStorageTarget).toBeGreaterThan(0);
    });
});
