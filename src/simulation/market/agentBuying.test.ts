import { beforeEach, describe, expect, it } from 'vitest';

import {
    BID_OFFER_MAX_COST_MULTIPLIER,
    DEFAULT_COST_SPRING_STRENGTH,
    INPUT_BUFFER_TARGET_TICKS,
    INVENTORY_SMOOTHING_MAX_EXTRA,
    PRICE_CEIL,
    SPRING_NORMALIZATION,
    TARGET_FILL_RATE,
} from '../constants';
import { updateAgentShellCompartments } from '../planet/automaticProductionScale/shellCompartments';
import {
    getAvailableStorageCapacity,
    putIntoStorageFacility,
    queryStorageFacility,
    STORAGE_SHELL_CAPACITY,
} from '../planet/facility';
import type { Agent, AutomatedPricingConfig, Planet } from '../planet/planet';
import { agriculturalFacility, ironSmelter } from '../planet/productionFacilities';
import { coalResourceType, produceResourceType, steelResourceType } from '../planet/resources';
import { agentMap, makeAgent, makePlanet, makePlanetWithPopulation, makeStorageFacility } from '../utils/testHelper';
import { automaticPricing } from './automaticPricing';
import { marketTick } from './market';

const COAL = coalResourceType.name;
const FOOD = produceResourceType.name;

function makeSteelProducer(id = 'steel-producer', planetId = 'p'): Agent {
    const agent = makeAgent(id, planetId);

    agent.assets[planetId].deposits = 1_000_000;
    agent.assets[planetId].storage = makeStorageFacility(
        {
            planetId,
            id: `storage-${planetId}`,
        },
        20,
    );
    agent.assets[planetId].productionFacilities = [ironSmelter(planetId, 'steel-fac-1')];
    // Author the shell compartments that a real production tick would derive from the iron smelter's
    // coal input and steel output, so stored goods always have explicit physical room.
    updateAgentShellCompartments(agent.assets[planetId]);
    return agent;
}

function makeCoalSeller(coalStock: number, askPrice: number, id = 'coal-seller', planetId = 'p'): Agent {
    const agent = makeAgent(id, planetId);
    agent.assets[planetId].storage = makeStorageFacility({
        planetId,
        id: `storage-${planetId}-coal`,
    });
    agent.assets[planetId].storage.shells.solid.compartments[COAL] = 1;
    putIntoStorageFacility(agent.assets[planetId].storage, coalResourceType, coalStock);
    agent.assets[planetId].market = {
        sell: {
            [COAL]: {
                resource: coalResourceType,
                offerPrice: askPrice,
                offerRetainment: 0,
            },
        },
        buy: {},
    };
    return agent;
}

describe('automaticPricing — buy side', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet();
        planet.marketPrices[COAL] = 2.0;

        planet.lastProductionCostFloors[COAL] = 1.0;
    });

    it('creates a buy order for each non-landBound facility input', () => {
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const buyOrders = buyer.assets.p.market?.buy;
        expect(buyOrders).toBeDefined();
        expect(buyOrders![COAL]).toBeDefined();
    });

    it('does not create buy orders for landBoundResource inputs', () => {
        const agent = makeAgent('land-agent');
        const arableLandResourceType = {
            name: 'Arable Land',
            form: 'landBoundResource' as const,
            level: 'source' as const,
            volumePerQuantity: 0,
            massPerQuantity: 0,
        };
        agent.assets.p.productionFacilities = [agriculturalFacility(planet.id, 'farm-1')];

        automaticPricing(agentMap(agent), planet);

        expect(agent.assets.p.market?.buy[arableLandResourceType.name]).toBeUndefined();
    });

    it('sets bidStorageTarget proportional to the input buffer target when storage is empty', () => {
        const buyer = makeSteelProducer();
        const facility = buyer.assets.p.productionFacilities[0]!;
        const coalNeed = facility.needs.find((n) => n.resource.name === COAL)!;
        const rawTarget = coalNeed.quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;

        planet.lastProductionCostFloors[COAL] = planet.marketPrices[COAL];
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;

        expect(bid.bidStorageTarget).toBeGreaterThan(0);
        // With empty storage: baseRate * (1 + smoothingMaxExtra)
        const baseRate = rawTarget / INPUT_BUFFER_TARGET_TICKS;
        const smoothedTarget = baseRate * (1 + INVENTORY_SMOOTHING_MAX_EXTRA);
        expect(bid.bidStorageTarget).toBeCloseTo(smoothedTarget, 0);
    });

    it('bids above the consumption rate even near a full buffer so the buffer can recover', () => {
        const buyer = makeSteelProducer();
        const facility = buyer.assets.p.productionFacilities[0]!;
        const coalNeed = facility.needs.find((n) => n.resource.name === COAL)!;
        const consumptionPerTick = coalNeed.quantity * facility.scale;
        const storageTarget = consumptionPerTick * INPUT_BUFFER_TARGET_TICKS;

        putIntoStorageFacility(buyer.assets.p.storage, coalResourceType, storageTarget * 0.95);

        planet.lastProductionCostFloors[COAL] = planet.marketPrices[COAL];
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidStorageTarget).toBeGreaterThan(consumptionPerTick);
    });

    it('keeps bidStorageTarget proportional when storage has some inventory', () => {
        const buyer = makeSteelProducer();
        const facility = buyer.assets.p.productionFacilities[0]!;
        const coalNeed = facility.needs.find((n) => n.resource.name === COAL)!;
        const rawTarget = coalNeed.quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;

        putIntoStorageFacility(buyer.assets.p.storage, coalResourceType, 500);

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        const inventoryQty = queryStorageFacility(buyer.assets.p.storage, COAL);

        expect(bid.bidStorageTarget).toBeGreaterThanOrEqual(inventoryQty);
        expect(bid.bidStorageTarget).toBeLessThanOrEqual(rawTarget);
        const effectiveQty = Math.max(0, bid.bidStorageTarget! - inventoryQty);
        expect(effectiveQty).toBeGreaterThan(0);
    });

    it('asks the fixed smoothing maximum while below the level target, independent of the fill ratio', () => {
        const buyer = makeSteelProducer();
        const facility = buyer.assets.p.productionFacilities[0]!;
        const coalNeed = facility.needs.find((n) => n.resource.name === COAL)!;
        const consumptionPerTick = coalNeed.quantity * facility.scale;
        const maxAsk = consumptionPerTick * (1 + INVENTORY_SMOOTHING_MAX_EXTRA);

        putIntoStorageFacility(buyer.assets.p.storage, coalResourceType, consumptionPerTick * 2);
        automaticPricing(agentMap(buyer), planet);
        const bid = buyer.assets.p.market!.buy[COAL]!;
        const lowInventoryAsk = bid.bidStorageTarget! - queryStorageFacility(buyer.assets.p.storage, COAL);

        putIntoStorageFacility(buyer.assets.p.storage, coalResourceType, consumptionPerTick * 18);
        automaticPricing(agentMap(buyer), planet);
        const highInventoryAsk = bid.bidStorageTarget! - queryStorageFacility(buyer.assets.p.storage, COAL);

        expect(lowInventoryAsk).toBeCloseTo(maxAsk, 5);
        expect(highInventoryAsk).toBeCloseTo(maxAsk, 5);
    });

    it('effective buy quantity is 0 when buffer is already fully covered by storage', () => {
        const buyer = makeSteelProducer();
        const fullBuffer = 30 * 1 * INPUT_BUFFER_TARGET_TICKS;
        putIntoStorageFacility(buyer.assets.p.storage, coalResourceType, fullBuffer + 100);

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        const inventoryQty = queryStorageFacility(buyer.assets.p.storage, COAL);

        expect(Math.max(0, bid.bidStorageTarget! - inventoryQty)).toBe(0);
    });

    it('freeBuyQuantity adds extra quantity when inventory is at the buffer target', () => {
        const buyer = makeSteelProducer();
        const facility = buyer.assets.p.productionFacilities[0]!;
        const coalNeed = facility.needs.find((n) => n.resource.name === COAL)!;
        const bufferTarget = coalNeed.quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;

        // Fill exactly to the buffer target (smoothed demand would be 0 since shortfall is 0)
        putIntoStorageFacility(buyer.assets.p.storage, coalResourceType, bufferTarget);

        // First automaticPricing run: creates the buy entry without autoConfig
        automaticPricing(agentMap(buyer), planet);

        const inventoryQty = queryStorageFacility(buyer.assets.p.storage, COAL);
        const baselineTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget ?? 0;
        expect(baselineTarget).toBeLessThanOrEqual(inventoryQty);

        // Config free buy quantity
        buyer.assets.p.market!.buy[COAL]!.autoConfig = { freeBuyQuantity: 1000, freeBuyQuantitySmoothingMaxExtra: 2 };

        automaticPricing(agentMap(buyer), planet);

        const newTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget ?? 0;
        expect(newTarget).toBeGreaterThan(inventoryQty);

        // After the fix: diagnostics.shortfall should equal bidStorageTarget - inventory (both per-tick)
        const effectiveQty = Math.max(0, newTarget - inventoryQty);
        const diagnostics = buyer.assets.p.market!.buy[COAL]!.diagnostics;
        expect(diagnostics).toBeDefined();
        // With freeBuyQuantitySmoothingMaxExtra=2, per-tick = 1000/2 = 500
        // freeInventory = max(0, inventory - storageTarget) = 0 (inventory ≈ storageTarget when full)
        // freeRemaining = max(0, 1000 - 0) = 1000
        // smoothedFreeShortfall = min(1000, 500) = 500
        // So diagnostics.shortfall should be close to 500
        expect(diagnostics!.shortfall).toBeGreaterThan(0);
        expect(diagnostics!.shortfall).toBeCloseTo(effectiveQty, 0);
    });

    it('freeBuyQuantity diagnostics.shortfall matches effective bid qty with combined buffer + free demand', () => {
        const buyer = makeSteelProducer();

        // Put some but not all inventory — structural shortfall exists
        putIntoStorageFacility(buyer.assets.p.storage, coalResourceType, 100);

        // First run to initialise the buy entry
        automaticPricing(agentMap(buyer), planet);

        // Add free buy quantity with a large smoothing window
        buyer.assets.p.market!.buy[COAL]!.autoConfig = {
            freeBuyQuantity: 6000,
            freeBuyQuantitySmoothingMaxExtra: 30, // 30 days → 200/tick
        };

        automaticPricing(agentMap(buyer), planet);

        const inventoryQty = queryStorageFacility(buyer.assets.p.storage, COAL);
        const bid = buyer.assets.p.market!.buy[COAL]!;
        const effectiveQty = Math.max(0, bid.bidStorageTarget! - inventoryQty);
        const diagnostics = bid.diagnostics;

        expect(diagnostics).toBeDefined();
        // diagnostics.shortfall (from code = totalShortfall) must equal effectiveQty (bidStorageTarget - inventory)
        // This was the bug: diagnostics showed the smoothed per-tick amount while the bid used the full unsmoothed target
        expect(diagnostics!.shortfall).toBeCloseTo(effectiveQty, 0);
        // The effective quantity should be less than the full freeTarget, proving smoothing is applied
        expect(effectiveQty).toBeLessThan(6000);
    });

    it('bootstraps bidPrice from market price on first tick', () => {
        planet.marketPrices[COAL] = 2.0;
        planet.marketPrices[steelResourceType.name] = 8.0;
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(2.0);
    });

    it('uses seeded market price as initial bid when no prior bid exists', () => {
        planet.marketPrices[steelResourceType.name] = 4.0;
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(planet.marketPrices[COAL]);
    });

    it('uses planet.marketPrices as initial bid price when available', () => {
        planet.marketPrices[COAL] = 3.5;
        planet.marketPrices[steelResourceType.name] = 10.0;
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(3.5);
    });

    it('raises bid price when nothing was bought last tick (unfilled demand → bid up)', () => {
        planet.marketPrices[steelResourceType.name] = 8.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        buyer.assets.p.market!.buy[COAL]!.lastBought = 0;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market!.buy[COAL]!.bidPrice).toBeGreaterThan(firstBidPrice);
    });

    it('lowers bid price when fully filled last tick (abundant supply → bid down)', () => {
        planet.marketPrices[steelResourceType.name] = 8.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        const firstBidTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget!;
        buyer.assets.p.market!.buy[COAL]!.smoothedFillRate = 0.9;
        buyer.assets.p.market!.buy[COAL]!.lastEffectiveQty = firstBidTarget;
        buyer.assets.p.market!.buy[COAL]!.lastBought = firstBidTarget;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market!.buy[COAL]!.bidPrice).toBeLessThan(firstBidPrice);
    });

    it('raises bid price when previous tick was partially filled', () => {
        planet.marketPrices[COAL] = 0.4;
        planet.marketPrices[steelResourceType.name] = 8.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        const firstBidTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget!;
        buyer.assets.p.market!.buy[COAL]!.lastEffectiveQty = firstBidTarget;
        buyer.assets.p.market!.buy[COAL]!.lastBought = firstBidTarget / 10;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market!.buy[COAL]!.bidPrice).toBeGreaterThan(firstBidPrice);
    });

    it('bootstraps bid price from the current market price', () => {
        planet.marketPrices[COAL] = 3.0;
        planet.marketPrices[steelResourceType.name] = 4.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(3.0);
    });

    it('raises bid price with repeated partially-filled ticks, bounded by PRICE_CEIL', () => {
        planet.marketPrices[COAL] = 1.0;
        planet.marketPrices[steelResourceType.name] = 6.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const initialBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        for (let i = 0; i < 200; i++) {
            const demanded = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget ?? 1;
            buyer.assets.p.market!.buy[COAL]!.lastEffectiveQty = demanded;
            buyer.assets.p.market!.buy[COAL]!.lastBought = demanded / 10;
            automaticPricing(agentMap(buyer), planet);
        }

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeGreaterThan(initialBidPrice);
        expect(bid.bidPrice).toBeLessThanOrEqual(PRICE_CEIL);
    });

    it('break-even ceiling uses sum of all facility outputs for the same input', () => {
        planet.marketPrices[COAL] = 1.0;
        planet.marketPrices[steelResourceType.name] = 4.0;

        const buyer = makeSteelProducer();
        buyer.assets.p.productionFacilities.push({
            ...buyer.assets.p.productionFacilities[0],
            id: 'steel-fac-2',
            needs: [{ resource: coalResourceType, quantity: 200 }],
            produces: [{ resource: steelResourceType, quantity: 100 }],
        });
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeLessThanOrEqual(2.0 + 1e-9);
    });

    it('custom priceAdjustMaxUp raises bid faster when fill rate is low', () => {
        planet.marketPrices[COAL] = 1.0;
        planet.marketPrices[steelResourceType.name] = 8.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        // Set aggressive priceAdjustMaxUp
        buyer.assets.p.market!.buy[COAL]!.autoConfig = { priceAdjustMaxUp: 1.2 } as AutomatedPricingConfig;
        buyer.assets.p.market!.buy[COAL]!.lastBought = 0;

        automaticPricing(agentMap(buyer), planet);

        const newPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;
        // With priceAdjustMaxUp=1.20 and fillRate=0, baseFactor = PRICE_ADJUST_MAX_UP (1.20)
        // Without overDeviation kicking in, factor should be exactly 1.20
        expect(newPrice).toBeCloseTo(firstBidPrice * 1.2, 5);
    });

    it('custom priceAdjustMaxDown lowers bid slower when fill rate is high', () => {
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        // Custom conservative priceAdjustMaxDown = 0.98
        buyer.assets.p.market!.buy[COAL]!.autoConfig = { priceAdjustMaxDown: 0.98 } as AutomatedPricingConfig;
        const firstBidTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget!;
        buyer.assets.p.market!.buy[COAL]!.lastEffectiveQty = firstBidTarget;
        buyer.assets.p.market!.buy[COAL]!.lastBought = firstBidTarget;

        automaticPricing(agentMap(buyer), planet);

        const newPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;
        // Fully filled → normalized fill rate saturates → baseFactor = priceAdjustMaxDown = 0.98
        expect(newPrice).toBeCloseTo(firstBidPrice * 0.98, 5);
    });

    it('custom targetFillRate changes the threshold where bid switches from up to down', () => {
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        // Set fill rate to 0.8 with targetFillRate=0.5 → smoothedFillRate (0.8) >= target (0.5) → bid should go down
        buyer.assets.p.market!.buy[COAL]!.autoConfig = { targetFillRate: 0.5 } as AutomatedPricingConfig;
        const firstBidTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget!;
        buyer.assets.p.market!.buy[COAL]!.smoothedFillRate = 0.8;
        buyer.assets.p.market!.buy[COAL]!.lastEffectiveQty = firstBidTarget;
        buyer.assets.p.market!.buy[COAL]!.lastBought = firstBidTarget * 0.8;

        automaticPricing(agentMap(buyer), planet);

        const newPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;
        // smoothedFillRate=0.8 >= target=0.5 → downward adjustment
        expect(newPrice).toBeLessThan(firstBidPrice);
    });

    it('custom inputBufferTargetTicks changes the buffer size', () => {
        const buyer = makeSteelProducer();
        buyer.assets.p.market = {
            sell: {},
            buy: {
                [COAL]: {
                    resource: coalResourceType,
                    automated: true,
                    autoConfig: { inputBufferTargetTicks: 60 } as AutomatedPricingConfig,
                },
            },
        };

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        const facility = buyer.assets.p.productionFacilities[0]!;
        const coalNeed = facility.needs.find((n) => n.resource.name === COAL)!;
        const rawTarget = coalNeed.quantity * facility.scale * 60; // using custom 60 ticks
        const baseRate = rawTarget / 60;
        const smoothedTarget = baseRate * (1 + INVENTORY_SMOOTHING_MAX_EXTRA);
        planet.lastProductionCostFloors[COAL] = planet.marketPrices[COAL];
        automaticPricing(agentMap(buyer), planet);
        expect(bid.bidStorageTarget).toBeCloseTo(smoothedTarget, 0);
    });

    it('damps an underfilled bid above the per-agent ceiling via the ceiling spring', () => {
        planet.lastProductionCostFloors[COAL] = 1.0;
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        bid.autoConfig = {} as AutomatedPricingConfig;
        bid.bidPrice = 5; // above costFloor × bidOfferMaxCostMultiplier (per-agent ceiling)
        bid.lastBought = 0; // completely unfilled → base factor pushes up
        bid.lastEffectiveQty = 10;
        bid.smoothedFillRate = 0;

        automaticPricing(agentMap(buyer), planet);

        const diagnostics = bid.diagnostics;
        expect(diagnostics).toBeDefined();
        // unfilled → the fill-rate factor wants to raise the bid, but the ceiling spring dampens it
        expect(diagnostics!.baseFactor).toBeGreaterThan(1);
        expect(diagnostics!.ceilingSpring).toBeGreaterThan(0);
        expect(diagnostics!.netFactor).toBeLessThan(diagnostics!.baseFactor);

        const ceiling = Math.min(PRICE_CEIL, 1.0 * BID_OFFER_MAX_COST_MULTIPLIER);
        const expectedPrice =
            5 *
            (diagnostics!.baseFactor -
                DEFAULT_COST_SPRING_STRENGTH * SPRING_NORMALIZATION * Math.sqrt(5 / ceiling - 1));
        expect(bid.bidPrice!).toBeCloseTo(expectedPrice, 5);
        // with SPRING_NORMALIZATION the spring no longer wins against the fill-rate push in a single tick,
        // but the bid rises strictly less than it would without the spring
        expect(bid.bidPrice!).toBeGreaterThan(5);
        expect(bid.bidPrice!).toBeLessThan(5 * diagnostics!.baseFactor);
    });

    it('bids the full quantity regardless of market price and anchors the price via the ceiling spring', () => {
        planet.lastProductionCostFloors[COAL] = 1.0;
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        bid.autoConfig = {} as AutomatedPricingConfig;
        bid.bidPrice = 50;
        const costFloor = planet.lastProductionCostFloors[COAL]!;

        planet.marketPrices[COAL] = 10 * costFloor;
        automaticPricing(agentMap(buyer), planet);
        const highPriceShortfall = bid.diagnostics!.shortfall;

        planet.marketPrices[COAL] = 1 * costFloor;
        automaticPricing(agentMap(buyer), planet);
        const costPriceShortfall = bid.diagnostics!.shortfall;

        // no quantity throttle: the demanded quantity is identical at 10× cost and at cost
        expect(highPriceShortfall).toBeCloseTo(costPriceShortfall, 10);
        // the price anchoring happens on the bid price, not the quantity
        expect(bid.diagnostics!.ceilingSpring).toBeGreaterThan(0);
        expect(bid.bidPrice!).toBeLessThan(50);
    });

    it('freeBuyQuantity smoothing is stable across multiple ticks when no production/consumption exists', () => {
        const buyer = makeAgent('free-buyer');
        buyer.assets.p.deposits = 1_000_000;
        buyer.assets.p.storage = makeStorageFacility({
            planetId: 'p',
            id: 'storage-free',
        });

        // Give the shell scale so mass capacity comfortably holds the full ~1M-unit free-buy drive.
        const freeStorageScale = Math.ceil(1_000_000 / STORAGE_SHELL_CAPACITY.mass);
        buyer.assets.p.storage.shells.solid.scale = freeStorageScale;
        buyer.assets.p.storage.shells.solid.maxScale = freeStorageScale;
        buyer.assets.p.storage.shells.solid.compartments[COAL] = 1;

        // No production facilities, no management, no ships — pure free buy
        const FREE_TARGET = 1_000_000;
        const SMOOTHING_DAYS = 20;
        const PER_TICK = FREE_TARGET / SMOOTHING_DAYS; // 50,000

        planet.marketPrices[COAL] = 1.0;
        buyer.assets.p.market = {
            sell: {},
            buy: {
                [COAL]: {
                    resource: coalResourceType,
                    automated: true,
                    bidPrice: 1.0,
                    autoConfig: {
                        freeBuyQuantity: FREE_TARGET,
                        freeBuyQuantitySmoothingMaxExtra: SMOOTHING_DAYS,
                    } as AutomatedPricingConfig,
                },
            },
        };

        // Simulate over several ticks — the per-tick quantity should stay at PER_TICK
        // until inventory approaches the freeBuyQuantity target.
        for (let tick = 0; tick < 15; tick++) {
            automaticPricing(agentMap(buyer), planet);

            const bid = buyer.assets.p.market!.buy[COAL]!;
            const inventory = queryStorageFacility(buyer.assets.p.storage, COAL);

            // diagnostics.shortfall should be ≤ PER_TICK (the smoothed per-tick amount)
            expect(bid.diagnostics).toBeDefined();
            expect(bid.diagnostics!.shortfall).toBeGreaterThan(0);
            const perTickFromShortfall = bid.diagnostics!.shortfall;

            // The effective order quantity (bidStorageTarget - inventory) should match shortfall
            const effectiveQty = Math.max(0, bid.bidStorageTarget! - inventory);
            expect(effectiveQty).toBeCloseTo(perTickFromShortfall, 0);

            // The shortfall should not exceed PER_TICK by any meaningful margin
            // (allow small rounding)
            expect(perTickFromShortfall).toBeLessThanOrEqual(PER_TICK + 1);

            // Simulate buying — the bid is placed and fully filled at the shortfall
            const placed = perTickFromShortfall;
            if (inventory + placed <= FREE_TARGET) {
                putIntoStorageFacility(buyer.assets.p.storage, coalResourceType, placed);
            }
            bid.lastBought = placed;
            bid.lastSpent = placed * planet.marketPrices[COAL]!;
            bid.lastEffectiveQty = placed;
        }

        // After 15 ticks at ~50k/tick we should have ~750k inventory
        const finalInventory = queryStorageFacility(buyer.assets.p.storage, COAL);
        expect(finalInventory).toBeGreaterThan(700_000);
        expect(finalInventory).toBeLessThan(800_000);
    });

    it('freeBuyQuantity smoothing — near the target the per-tick quantity decreases', () => {
        const buyer = makeAgent('free-buyer-2');
        buyer.assets.p.deposits = 1_000_000;
        buyer.assets.p.storage = makeStorageFacility({
            planetId: 'p',
            id: 'storage-free-2',
        });
        buyer.assets.p.storage.shells.solid.compartments[COAL] = 1;

        const FREE_TARGET = 10_000;
        const SMOOTHING_DAYS = 10;
        const PER_TICK = FREE_TARGET / SMOOTHING_DAYS; // 1,000

        planet.marketPrices[COAL] = 1.0;

        // Start with inventory near the target
        putIntoStorageFacility(buyer.assets.p.storage, coalResourceType, 9_500);

        buyer.assets.p.market = {
            sell: {},
            buy: {
                [COAL]: {
                    resource: coalResourceType,
                    automated: true,
                    bidPrice: 1.0,
                    autoConfig: {
                        freeBuyQuantity: FREE_TARGET,
                        freeBuyQuantitySmoothingMaxExtra: SMOOTHING_DAYS,
                    } as AutomatedPricingConfig,
                },
            },
        };

        // First tick: inventory=9500, freeRemaining=500, freeRemaining < freeFillRate (=1000)
        // So shortfall should be 500 (not 1000)
        automaticPricing(agentMap(buyer), planet);
        const bid = buyer.assets.p.market!.buy[COAL]!;
        const inventory = queryStorageFacility(buyer.assets.p.storage, COAL);
        const effectiveQty = Math.max(0, bid.bidStorageTarget! - inventory);

        // When close to target, should buy less than the full per-tick rate
        expect(effectiveQty).toBeGreaterThan(0);
        expect(effectiveQty).toBeLessThan(PER_TICK);
        // freeRemaining = 10,000 - 9,500 = 500
        expect(effectiveQty).toBeCloseTo(500, 0);
    });

    it('freeBuyQuantity with services skips smoothing', () => {
        // Use a service resource — smoothing is skipped for services
        const serviceResource = {
            name: 'TestService',
            form: 'services' as const,
            level: 'source' as const,
            volumePerQuantity: 0,
            massPerQuantity: 0,
        };
        const planet = makePlanet();
        planet.marketPrices[serviceResource.name] = 5;

        const agent = makeAgent('service-buyer');
        agent.assets.p.deposits = 1_000_000;
        agent.assets.p.market = {
            sell: {},
            buy: {
                [serviceResource.name]: {
                    resource: serviceResource,
                    automated: true,
                    bidPrice: 5, // pre-set price so diagnostics are computed
                    autoConfig: { freeBuyQuantity: 1000 } as AutomatedPricingConfig,
                },
            },
        };

        automaticPricing(agentMap(agent), planet);

        const bid = agent.assets.p.market!.buy[serviceResource.name]!;
        // For services, freeTarget is added directly without smoothing
        // freeTarget = 1000, storageTarget = 0, totalShortfall = 0 + 1000 = 1000
        // Since services skip smoothing: totalShortfall directly adds freeTarget
        expect(bid.bidStorageTarget).toBeGreaterThan(0);
        const diagnostics = bid.diagnostics;
        expect(diagnostics).toBeDefined();
        expect(diagnostics!.shortfall).toBeGreaterThan(0);
    });

    it('partial config — only overrides priceAdjustMaxUp, others use defaults', () => {
        planet.marketPrices[COAL] = 1.0;
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        // Only override priceAdjustMaxUp, leave everything else as defaults
        buyer.assets.p.market!.buy[COAL]!.autoConfig = { priceAdjustMaxUp: 1.15 } as AutomatedPricingConfig;
        buyer.assets.p.market!.buy[COAL]!.lastBought = 0;

        automaticPricing(agentMap(buyer), planet);

        const diagnostics = buyer.assets.p.market!.buy[COAL]!.diagnostics;
        expect(diagnostics).toBeDefined();
        expect(diagnostics!.targetFillRate).toBe(TARGET_FILL_RATE);
        // priceAdjustMaxUp=1.15 applied → factor should reflect that
        const newPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;
        expect(newPrice).toBeCloseTo(firstBidPrice * 1.15, 5);
    });
});

describe('marketTick — agent buying', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanetWithPopulation({ none: 100 }).planet;
        planet.marketPrices[COAL] = 1.0;

        planet.marketPrices[steelResourceType.name] = 4.0;
    });

    it('agent with buy order purchases coal from a selling agent when bid ≥ ask', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        automaticPricing(agentMap(buyer), planet);

        const coalBefore = queryStorageFacility(buyer.assets.p.storage, COAL);

        marketTick(agentMap(seller, buyer), planet);

        const coalAfter = queryStorageFacility(buyer.assets.p.storage, COAL);
        expect(coalAfter).toBeGreaterThan(coalBefore);
    });

    it('agent deposits are debited by the cost of purchased goods', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        automaticPricing(agentMap(buyer), planet);

        const depositsBefore = buyer.assets.p.deposits;
        marketTick(agentMap(seller, buyer), planet);

        expect(buyer.assets.p.deposits).toBeLessThan(depositsBefore);
    });

    it('seller receives revenue from agent buyer', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        automaticPricing(agentMap(buyer), planet);

        const sellerDepositsBefore = seller.assets.p.deposits;
        marketTick(agentMap(seller, buyer), planet);

        expect(seller.assets.p.deposits).toBeGreaterThan(sellerDepositsBefore);
    });

    it('no trade occurs when agent bid price is below seller ask price', () => {
        const seller = makeCoalSeller(3000, 100.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        planet.marketPrices[COAL] = 0.01;
        automaticPricing(agentMap(buyer), planet);

        const coalBefore = queryStorageFacility(buyer.assets.p.storage, COAL);

        marketTick(agentMap(seller, buyer), planet);

        const coalAfter = queryStorageFacility(buyer.assets.p.storage, COAL);
        expect(coalAfter).toBe(coalBefore);
    });

    it('lastBought reflects how much was actually purchased', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        automaticPricing(agentMap(buyer), planet);

        marketTick(agentMap(seller, buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.lastBought).toBeGreaterThan(0);
    });

    it('lastSpent reflects money paid for purchased goods', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        automaticPricing(agentMap(buyer), planet);

        marketTick(agentMap(seller, buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.lastSpent).toBeGreaterThan(0);
    });

    it('money is conserved: buyer debit equals seller credit', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        automaticPricing(agentMap(buyer), planet);

        const buyerBefore = buyer.assets.p.deposits;
        const sellerBefore = seller.assets.p.deposits;

        marketTick(agentMap(seller, buyer), planet);

        const buyerSpent = buyerBefore - buyer.assets.p.deposits;
        const sellerEarned = seller.assets.p.deposits - sellerBefore;

        expect(buyerSpent).toBeCloseTo(sellerEarned, 6);
    });

    it('agent buyer and household compete for same resource; highest bid wins first', () => {
        const seller = makeCoalSeller(1, 1.0);

        const richBuyer = makeSteelProducer('rich-buyer');
        richBuyer.assets.p.deposits = 1_000_000;
        richBuyer.assets.p.market = {
            sell: {},
            buy: {
                [COAL]: {
                    resource: coalResourceType,
                    bidPrice: 999,
                    bidStorageTarget: 1,
                },
            },
        };

        const poorBuyer = makeSteelProducer('poor-buyer');
        poorBuyer.assets.p.deposits = 1_000_000;
        poorBuyer.assets.p.market = {
            sell: {},
            buy: {
                [COAL]: {
                    resource: coalResourceType,
                    bidPrice: 0.01,
                    bidStorageTarget: 1,
                },
            },
        };

        marketTick(agentMap(seller, richBuyer, poorBuyer), planet);

        const richCoal = queryStorageFacility(richBuyer.assets.p.storage, COAL);
        const poorCoal = queryStorageFacility(poorBuyer.assets.p.storage, COAL);

        expect(richCoal).toBeGreaterThan(poorCoal);
    });

    it('market result records agent demand in totalDemand', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        automaticPricing(agentMap(buyer), planet);

        marketTick(agentMap(seller, buyer), planet);

        const result = planet.lastMarketResult[COAL];
        expect(result).toBeDefined();
        expect(result!.totalDemand).toBeGreaterThan(0);
    });

    it('buy counters reset to 0 at the start of each tick', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;
        automaticPricing(agentMap(buyer), planet);

        marketTick(agentMap(seller, buyer), planet);
        const firstBought = buyer.assets.p.market!.buy[COAL]!.lastBought;
        expect(firstBought).toBeGreaterThan(0);

        buyer.assets.p.market!.buy[COAL]!.bidStorageTarget = 0;

        marketTick(agentMap(seller, buyer), planet);
        expect(buyer.assets.p.market!.buy[COAL]!.lastBought).toBe(0);
    });

    it('agent with no deposits still posts a buy order but cannot buy (would go negative)', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 0;

        automaticPricing(agentMap(buyer), planet);

        const depositsBefore = buyer.assets.p.deposits;
        marketTick(agentMap(seller, buyer), planet);

        expect(buyer.assets.p.deposits).toBeLessThanOrEqual(depositsBefore);
    });

    it('a bid dropped at collection keeps its price instead of collapsing via a forged fill rate', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        automaticPricing(agentMap(buyer), planet);
        const bid = buyer.assets.p.market!.buy[COAL]!;
        const priceBefore = bid.bidPrice!;

        buyer.assets.p.deposits = 0;
        marketTick(agentMap(seller, buyer), planet);
        expect(bid.lastEffectiveQty).toBe(0);

        buyer.assets.p.deposits = 1_000_000;
        automaticPricing(agentMap(buyer), planet);

        expect(bid.notPlaced).toBe(true);
        expect(bid.diagnostics).toBeUndefined();
        expect(bid.bidPrice).toBeCloseTo(priceBefore, 10);
    });

    it('seller is credited exactly once when both households and an agent buy from them', () => {
        const coalSeller = makeCoalSeller(3000, 1.0);
        const sellerDepositsBefore = coalSeller.assets.p.deposits;

        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;
        automaticPricing(agentMap(buyer), planet);

        marketTick(agentMap(coalSeller, buyer), planet);

        const offer = coalSeller.assets.p.market!.sell[COAL]!;
        const totalSold = offer.lastSold ?? 0;
        const totalRevenue = offer.lastRevenue ?? 0;
        const depositsEarned = coalSeller.assets.p.deposits - sellerDepositsBefore;

        expect(totalRevenue).toBeCloseTo(depositsEarned, 5);
        expect(totalRevenue).toBeCloseTo(totalSold * 1.0, 5);
    });

    it('agent buyer with insufficient deposits cannot go negative', () => {
        const seller = makeCoalSeller(3000, 1.0);

        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 5;
        automaticPricing(agentMap(buyer), planet);

        marketTick(agentMap(seller, buyer), planet);

        expect(buyer.assets.p.deposits).toBeGreaterThanOrEqual(0);
        const coalBought = queryStorageFacility(buyer.assets.p.storage, COAL);
        expect(coalBought).toBeLessThanOrEqual(5);
    });

    it('food market (household demand) is unaffected when an unrelated agent buys coal', () => {
        const foodAgent = makeAgent('food-seller');
        foodAgent.assets.p.storage = makeStorageFacility({
            planetId: 'p',
        });
        putIntoStorageFacility(foodAgent.assets.p.storage, produceResourceType, 10000);
        foodAgent.assets.p.market = {
            sell: {
                [FOOD]: {
                    resource: produceResourceType,
                    offerPrice: 1.0,
                    offerRetainment: 0,
                },
            },
            buy: {},
        };

        const coalSeller = makeCoalSeller(3000, 1.0, 'coal-seller');
        const steelMaker = makeSteelProducer('steel-maker');
        steelMaker.assets.p.deposits = 1_000_000;
        automaticPricing(agentMap(steelMaker), planet);

        const allAgents = agentMap(foodAgent, coalSeller, steelMaker);

        const householdFoodBefore = planet.population.demography[14].unoccupied.none.services.grocery.buffer;

        marketTick(allAgents, planet);

        const householdFoodAfter = planet.population.demography[14].unoccupied.none.services.grocery.buffer;

        expect(householdFoodAfter).toBeGreaterThanOrEqual(householdFoodBefore);
    });

    it('a bid whose target exceeds the authored compartment is capped at collection and settles cleanly', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        // Rebuild storage without footprint authoring, then author a deliberately small coal compartment
        // (2k of the shell's mass capacity) so the 100-unit target cannot physically fit end to end.
        const compartmentMass = 2_000;
        const storage = makeStorageFacility({ planetId: 'p', id: 'storage-p' });
        storage.shells.solid.compartments[COAL] = compartmentMass / STORAGE_SHELL_CAPACITY.mass;
        buyer.assets.p.storage = storage;

        buyer.assets.p.market = {
            sell: {},
            buy: {
                [COAL]: {
                    resource: coalResourceType,
                    bidPrice: 1.0,
                    bidStorageTarget: 1_000_000,
                },
            },
        };

        // The compartment limits how much the delivery can be capped to at collection, so every placed
        // bid is fully storable and never needs a settlement refund. Read that limit via the same free
        // capacity API the bid validation uses.
        const coalConditioned = getAvailableStorageCapacity(storage, coalResourceType);

        const depositsBefore = buyer.assets.p.deposits;
        marketTick(agentMap(seller, buyer), planet);

        const coalReceived = queryStorageFacility(buyer.assets.p.storage, COAL);
        const depositsSpent = depositsBefore - buyer.assets.p.deposits;

        expect(coalReceived).toBeCloseTo(coalConditioned, 0);
        expect(depositsSpent).toBeCloseTo(coalReceived * 1.0, 5);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.storageFullWarning).toBeUndefined();
        expect(bid.lastEffectiveQty ?? 0).toBeCloseTo(coalConditioned, 0);
    });
});
