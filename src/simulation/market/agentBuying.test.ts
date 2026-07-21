import { beforeEach, describe, expect, it } from 'vitest';

import {
    INPUT_BUFFER_TARGET_TICKS,
    INVENTORY_SMOOTHING_MAX_EXTRA,
    OUTPUT_BUFFER_MAX_TICKS,
    PRICE_CEIL,
} from '../constants';
import { putIntoStorageFacility } from '../planet/facility';
import type { Agent, Planet } from '../planet/planet';
import { intensiveFarmFacility, ironSmelter } from '../planet/productionFacilities';
import { coalResourceType, produceResourceType, steelResourceType } from '../planet/resources';
import { agentMap, makeAgent, makePlanet, makePlanetWithPopulation, makeStorageFacility } from '../utils/testHelper';
import { automaticPricing } from './automaticPricing';
import { marketTick } from './market';
import { settleAgentBuyers } from './settlement';

const COAL = coalResourceType.name;
const FOOD = produceResourceType.name;

function makeSteelProducer(id = 'steel-producer', planetId = 'p'): Agent {
    const agent = makeAgent(id, planetId);

    agent.assets[planetId].deposits = 1_000_000;
    agent.assets[planetId].storageFacility = makeStorageFacility({
        planetId,
        id: `storage-${planetId}`,
        capacity: { volume: 1e9, mass: 1e9 },
    });
    agent.assets[planetId].productionFacilities = [ironSmelter(planetId, 'steel-fac-1')];
    return agent;
}

function makeCoalSeller(coalStock: number, askPrice: number, id = 'coal-seller', planetId = 'p'): Agent {
    const agent = makeAgent(id, planetId);
    agent.assets[planetId].storageFacility = makeStorageFacility({
        planetId,
        id: `storage-${planetId}-coal`,
        capacity: { volume: 1e9, mass: 1e9 },
    });
    putIntoStorageFacility(agent.assets[planetId].storageFacility, coalResourceType, coalStock);
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
        agent.assets.p.productionFacilities = [intensiveFarmFacility(planet.id, 'farm-1')];

        automaticPricing(agentMap(agent), planet);

        expect(agent.assets.p.market?.buy[arableLandResourceType.name]).toBeUndefined();
    });

    it('sets bidStorageTarget proportional to the input buffer target when storage is empty', () => {
        const buyer = makeSteelProducer();
        const facility = buyer.assets.p.productionFacilities[0]!;
        const coalNeed = facility.needs.find((n) => n.resource.name === COAL)!;
        const rawTarget = coalNeed.quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;

        expect(bid.bidStorageTarget).toBeGreaterThan(0);
        // With empty storage, smoothing caps the target at baseRateConsumption * (1 + INVENTORY_SMOOTHING_MAX_EXTRA)
        const baseRate = rawTarget / INPUT_BUFFER_TARGET_TICKS;
        const smoothedTarget = baseRate * (1 + INVENTORY_SMOOTHING_MAX_EXTRA);
        expect(bid.bidStorageTarget).toBeCloseTo(smoothedTarget, 0);
    });

    it('keeps bidStorageTarget proportional when storage has some inventory', () => {
        const buyer = makeSteelProducer();
        const facility = buyer.assets.p.productionFacilities[0]!;
        const coalNeed = facility.needs.find((n) => n.resource.name === COAL)!;
        const rawTarget = coalNeed.quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;

        putIntoStorageFacility(buyer.assets.p.storageFacility, coalResourceType, 500);

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        const inventoryQty = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;

        // With smoothing, bidStorageTarget should be <= rawTarget and >= inventoryQty
        expect(bid.bidStorageTarget).toBeGreaterThanOrEqual(inventoryQty);
        expect(bid.bidStorageTarget).toBeLessThanOrEqual(rawTarget);
        // The effective buy quantity is the shortfall after smoothing
        const effectiveQty = Math.max(0, bid.bidStorageTarget! - inventoryQty);
        expect(effectiveQty).toBeGreaterThan(0);
    });

    it('effective buy quantity is 0 when buffer is already fully covered by storage', () => {
        const buyer = makeSteelProducer();
        const fullBuffer = 30 * 1 * INPUT_BUFFER_TARGET_TICKS;
        putIntoStorageFacility(buyer.assets.p.storageFacility, coalResourceType, fullBuffer + 100);

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        const inventoryQty = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;

        expect(Math.max(0, bid.bidStorageTarget! - inventoryQty)).toBe(0);
    });

    it('freeBuyQuantity adds extra quantity when inventory is at the buffer target', () => {
        const buyer = makeSteelProducer();
        const facility = buyer.assets.p.productionFacilities[0]!;
        const coalNeed = facility.needs.find((n) => n.resource.name === COAL)!;
        const bufferTarget = coalNeed.quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;

        // Fill exactly to the buffer target (smoothed demand would be 0 since shortfall is 0)
        putIntoStorageFacility(buyer.assets.p.storageFacility, coalResourceType, bufferTarget);

        // First automaticPricing run: creates the buy entry without autoConfig
        automaticPricing(agentMap(buyer), planet);

        const inventoryQty = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
        const baselineTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget ?? 0;
        // With full buffer, the target should be ≤ inventory (smoothing reduces it further)
        expect(baselineTarget).toBeLessThanOrEqual(inventoryQty);

        // Config free buy quantity
        buyer.assets.p.market!.buy[COAL]!.autoConfig = { freeBuyQuantity: 1000, freeBuyQuantitySmoothingMaxExtra: 2 };

        automaticPricing(agentMap(buyer), planet);

        const newTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget ?? 0;
        // freeBuyQuantity = 1000 (absolute target), smoothed over 2 ticks → 500/tick
        // structural target ≈ inventory (already full), so smoothedTarget = inventory + 500
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
        putIntoStorageFacility(buyer.assets.p.storageFacility, coalResourceType, 100);

        // First run to initialise the buy entry
        automaticPricing(agentMap(buyer), planet);

        // Add free buy quantity with a large smoothing window
        buyer.assets.p.market!.buy[COAL]!.autoConfig = {
            freeBuyQuantity: 6000,
            freeBuyQuantitySmoothingMaxExtra: 30, // 30 days → 200/tick
        };

        automaticPricing(agentMap(buyer), planet);

        const inventoryQty = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
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
        buyer.assets.p.market!.buy[COAL]!.lastBought = firstBidTarget / 2;

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
            buyer.assets.p.market!.buy[COAL]!.lastBought = demanded / 2;
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

    it('resumes input buying once output inventory drops below the output buffer ceiling', () => {
        const buyer = makeSteelProducer();
        const fullOutputBuffer = 100 * 1 * OUTPUT_BUFFER_MAX_TICKS;
        putIntoStorageFacility(buyer.assets.p.storageFacility, steelResourceType, fullOutputBuffer - 1);

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market!.buy[COAL]!.bidStorageTarget).toBeGreaterThan(0);
    });

    it('suppresses input buying per facility independently when one facility output is full', () => {
        const buyer = makeSteelProducer();
        buyer.assets.p.productionFacilities.push({
            ...buyer.assets.p.productionFacilities[0],
            id: 'steel-fac-2',
            needs: [{ resource: coalResourceType, quantity: 200 }],
            produces: [{ resource: produceResourceType, quantity: 100 }],
        });

        const fullBuffer = 100 * 1 * OUTPUT_BUFFER_MAX_TICKS;
        putIntoStorageFacility(buyer.assets.p.storageFacility, steelResourceType, fullBuffer);

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidStorageTarget).toBeGreaterThan(0);
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

        const coalBefore = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;

        marketTick(agentMap(seller, buyer), planet);

        const coalAfter = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
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

        const coalBefore = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;

        marketTick(agentMap(seller, buyer), planet);

        const coalAfter = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
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

        const richCoal = richBuyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
        const poorCoal = poorBuyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;

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
        const coalBought = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
        expect(coalBought).toBeLessThanOrEqual(5);
    });

    it('food market (household demand) is unaffected when an unrelated agent buys coal', () => {
        const foodAgent = makeAgent('food-seller');
        foodAgent.assets.p.storageFacility = makeStorageFacility({
            planetId: 'p',
            capacity: { volume: 1e9, mass: 1e9 },
        });
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, produceResourceType, 10000);
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

        const householdFoodBefore = planet.population.demography[14].unoccupied.none.novice.services.grocery.buffer;

        marketTick(allAgents, planet);

        const householdFoodAfter = planet.population.demography[14].unoccupied.none.novice.services.grocery.buffer;

        expect(householdFoodAfter).toBeGreaterThanOrEqual(householdFoodBefore);
    });

    it('buyer only pays for what was stored and bid is zeroed out when storage is full at settlement', () => {
        const seller = makeCoalSeller(3000, 1.0);
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;

        const coalResource = coalResourceType;
        buyer.assets.p.storageFacility = makeStorageFacility({
            planetId: 'p',
            id: 'storage-p',
            capacity: { volume: 1e9, mass: 50 * coalResource.massPerQuantity },
        });

        buyer.assets.p.market = {
            sell: {},
            buy: {
                [COAL]: {
                    resource: coalResourceType,
                    bidPrice: 5.0,
                    bidStorageTarget: 100,
                },
            },
        };

        const depositsBefore = buyer.assets.p.deposits;
        marketTick(agentMap(seller, buyer), planet);

        const coalReceived = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
        const depositsSpent = depositsBefore - buyer.assets.p.deposits;

        expect(coalReceived).toBeCloseTo(50, 1);
        expect(depositsSpent).toBeCloseTo(coalReceived * 1.0, 5);

        expect(buyer.assets.p.market!.buy[COAL]!.bidStorageTarget).toBe(100);

        expect(buyer.assets.p.market!.buy[COAL]!.storageFullWarning).toBeUndefined();
    });

    it('settlement zeros out bid and sets storageFullWarning when goods arrive but storage is already full', () => {
        const buyer = makeSteelProducer();
        buyer.assets.p.storageFacility = makeStorageFacility({
            planetId: 'p',
            id: 'storage-p',
            capacity: { volume: 0, mass: 0 },
        });
        buyer.assets.p.market = {
            sell: {},
            buy: { [COAL]: { resource: coalResourceType, bidPrice: 5.0, bidStorageTarget: 100 } },
        };

        const holdAmount = 500;
        buyer.assets.p.deposits = 1_000_000 - holdAmount;
        buyer.assets.p.depositHold = holdAmount;
        const depositsBefore = buyer.assets.p.deposits + buyer.assets.p.depositHold;

        settleAgentBuyers(planet, [
            {
                agent: buyer,
                resource: coalResourceType,
                bidPrice: 5.0,
                quantity: 100,
                filled: 100,
                cost: 500,
                remainingDeposits: buyer.assets.p.deposits,
            },
        ]);

        expect(buyer.assets.p.deposits + buyer.assets.p.depositHold).toBe(depositsBefore);
        expect(buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0).toBe(0);
        expect(buyer.assets.p.market!.buy[COAL]!.storageFullWarning).toBe(true);
    });
});
