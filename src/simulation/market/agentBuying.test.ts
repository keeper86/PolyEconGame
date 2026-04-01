import { beforeEach, describe, expect, it } from 'vitest';

import { GROCERY_PRICE_CEIL as PRICE_CEIL, INITIAL_GROCERY_PRICE, OUTPUT_BUFFER_MAX_TICKS } from '../constants';
import { putIntoStorageFacility } from '../planet/storage';
import type { Agent, Planet } from '../planet/planet';
import { agentMap, makeAgent, makePlanet, makePlanetWithPopulation, makeStorageFacility } from '../utils/testHelper';
import { automaticPricing } from './automaticPricing';
import { marketTick } from './market';
import { settleAgentBuyers } from './settlement';
import { agriculturalProductResourceType, coalResourceType, steelResourceType } from '../planet/resources';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COAL = coalResourceType.name;
const FOOD = agriculturalProductResourceType.name;

/**
 * An agent that produces steel and consumes coal as input.
 * Uses a large storage capacity to avoid capacity being a confound.
 */
function makeSteelProducer(id = 'steel-producer', planetId = 'p'): Agent {
    const agent = makeAgent(id, planetId);
    // A well-capitalised producer; tests that want a specific deposit level
    // override this explicitly (e.g. buyer.assets.p.deposits = 5).
    agent.assets[planetId].deposits = 1_000_000;
    agent.assets[planetId].storageFacility = makeStorageFacility({
        planetId,
        id: `storage-${planetId}`,
        capacity: { volume: 1e9, mass: 1e9 },
    });
    agent.assets[planetId].productionFacilities = [
        {
            planetId,
            id: 'steel-fac',
            name: 'Steel Mill',
            maxScale: 1,
            scale: 1,
            powerConsumptionPerTick: 0,
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [{ resource: coalResourceType, quantity: 100 }],
            produces: [{ resource: steelResourceType, quantity: 50 }],
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
                lastProduced: {},
                lastConsumed: { [coalResourceType.name]: 0 },
            },
        },
    ];
    return agent;
}

/** A coal-selling agent with a given stock and ask price. */
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

// ---------------------------------------------------------------------------
// automaticPricing — buy side
// ---------------------------------------------------------------------------

describe('automaticPricing — buy side', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanet();
        planet.marketPrices[COAL] = 2.0;
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
        agent.assets.p.productionFacilities = [
            {
                planetId: 'p',
                id: 'farm',
                name: 'Farm',
                maxScale: 1,
                scale: 1,
                powerConsumptionPerTick: 0,
                workerRequirement: {},
                pollutionPerTick: { air: 0, water: 0, soil: 0 },
                needs: [{ resource: arableLandResourceType, quantity: 10 }],
                produces: [{ resource: agriculturalProductResourceType, quantity: 100 }],
                lastTickResults: {
                    overallEfficiency: 1,
                    workerEfficiency: {},
                    resourceEfficiency: {},
                    overqualifiedWorkers: {},
                    exactUsedByEdu: {},
                    totalUsedByEdu: {},
                    lastProduced: {},
                    lastConsumed: { [arableLandResourceType.name]: 0 },
                },
            },
        ];

        automaticPricing(agentMap(agent), planet);

        expect(agent.assets.p.market?.buy[arableLandResourceType.name]).toBeUndefined();
    });

    it('sets bidStorageTarget to the full input buffer target when storage is empty', () => {
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        // facility needs 100/tick × scale 1 × 30-tick buffer = 3000
        expect(bid.bidStorageTarget).toBeGreaterThan(0);
        expect(bid.bidStorageTarget).toBe(100 * 1 * 30);
    });

    it('keeps bidStorageTarget at the full buffer target regardless of current inventory', () => {
        const buyer = makeSteelProducer();
        putIntoStorageFacility(buyer.assets.p.storageFacility, coalResourceType, 500);

        automaticPricing(agentMap(buyer), planet);

        // The storage target is the desired inventory level, not the remaining shortfall.
        // Effective buy quantity (target − inventory) is computed dynamically each tick.
        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidStorageTarget).toBe(100 * 1 * 30);
        const inventoryQty = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
        expect(Math.max(0, bid.bidStorageTarget! - inventoryQty)).toBe(Math.max(0, 100 * 1 * 30 - 500));
    });

    it('effective buy quantity is 0 when buffer is already fully covered by storage', () => {
        const buyer = makeSteelProducer();
        const fullBuffer = 100 * 1 * 30;
        putIntoStorageFacility(buyer.assets.p.storageFacility, coalResourceType, fullBuffer + 100);

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        const inventoryQty = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
        // Storage target is still set (300), but effective qty = target − inventory = 0
        expect(Math.max(0, bid.bidStorageTarget! - inventoryQty)).toBe(0);
    });

    it('bootstraps bidPrice from market price on first tick', () => {
        planet.marketPrices[COAL] = 2.0;
        planet.marketPrices[steelResourceType.name] = 8.0; // ceiling = (50×8)/100 = 4.0 — non-binding
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(2.0);
    });

    it('uses INITIAL_GROCERY_PRICE as fallback when no market price is set', () => {
        delete planet.marketPrices[COAL];
        planet.marketPrices[steelResourceType.name] = 4.0; // ceiling = (50×4)/100 = 2.0 — non-binding
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(INITIAL_GROCERY_PRICE);
    });

    it('uses planet.marketPrices as initial bid price when available', () => {
        planet.marketPrices[COAL] = 3.5;
        planet.marketPrices[steelResourceType.name] = 10.0; // ceiling = (50×10)/100 = 5.0 — non-binding
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(3.5);
    });

    it('raises bid price when nothing was bought last tick (unfilled demand → bid up)', () => {
        // Steel at 8.0 → ceiling = (50 × 8) / 100 = 4.0, well above coal price of 2.0
        planet.marketPrices[steelResourceType.name] = 8.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        buyer.assets.p.market!.buy[COAL]!.lastBought = 0;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market!.buy[COAL]!.bidPrice).toBeGreaterThan(firstBidPrice);
    });

    it('lowers bid price when fully filled last tick (abundant supply → bid down)', () => {
        // Steel at 8.0 → ceiling = (50 × 8) / 100 = 4.0, well above coal price of 2.0
        planet.marketPrices[steelResourceType.name] = 8.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;
        // Simulate fully filled: lastEffectiveQty = storage target (storage empty), lastBought = same
        const firstBidTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget!;
        buyer.assets.p.market!.buy[COAL]!.lastEffectiveQty = firstBidTarget;
        buyer.assets.p.market!.buy[COAL]!.lastBought = firstBidTarget;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market!.buy[COAL]!.bidPrice).toBeLessThan(firstBidPrice);
    });

    it('raises bid price when previous tick was partially filled', () => {
        // Steel at 8.0 → ceiling = (50 × 8) / 100 = 4.0, well above coal price of 2.0
        planet.marketPrices[steelResourceType.name] = 8.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;
        // Simulate half-filled: lastEffectiveQty = storage target, lastBought = half
        const firstBidTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget!;
        buyer.assets.p.market!.buy[COAL]!.lastEffectiveQty = firstBidTarget;
        buyer.assets.p.market!.buy[COAL]!.lastBought = firstBidTarget / 2;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market!.buy[COAL]!.bidPrice).toBeGreaterThan(firstBidPrice);
    });

    it('skips buy-order creation when agent.automated is false and no bids have automated=true', () => {
        const buyer = makeSteelProducer();
        buyer.automated = false;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market?.buy).toBeUndefined();
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
        // Two facilities both need coal; their combined output value raises the ceiling
        // Facility A: 100 coal → 50 steel (price 4.0) → per-coal value = 2.0
        // Facility B: 200 coal → 100 steel (price 4.0) → per-coal value = 2.0  (same ratio)
        // Each facility computes its own ceiling; agent takes the max → still 2.0
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

    it('suppresses input buying when all outputs exceed the output buffer ceiling', () => {
        const buyer = makeSteelProducer();
        const fullOutputBuffer = 50 * 1 * OUTPUT_BUFFER_MAX_TICKS;
        putIntoStorageFacility(buyer.assets.p.storageFacility, steelResourceType, fullOutputBuffer);

        automaticPricing(agentMap(buyer), planet);

        // storageTarget is set to 0 when output buffer is full (no point buying inputs)
        expect(buyer.assets.p.market!.buy[COAL]!.bidStorageTarget).toBe(0);
    });

    it('resumes input buying once output inventory drops below the output buffer ceiling', () => {
        const buyer = makeSteelProducer();
        const fullOutputBuffer = 50 * 1 * OUTPUT_BUFFER_MAX_TICKS;
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
            produces: [{ resource: agriculturalProductResourceType, quantity: 100 }],
        });

        const fullBuffer = 50 * 1 * OUTPUT_BUFFER_MAX_TICKS;
        putIntoStorageFacility(buyer.assets.p.storageFacility, steelResourceType, fullBuffer);

        automaticPricing(agentMap(buyer), planet);

        // Facility 1 (steel) has full output buffer → contributes 0 to target.
        // Facility 2 (food) still needs coal → target = 200 * 1 * 30 = 6000 > 0.
        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidStorageTarget).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// marketTick — agent buying
// ---------------------------------------------------------------------------

describe('marketTick — agent buying', () => {
    let planet: Planet;

    beforeEach(() => {
        planet = makePlanetWithPopulation({ none: 100 }).planet;
        planet.marketPrices[COAL] = 1.0;
        // Steel at 4.0 → ceiling for coal = (50×4)/100 = 2.0, above the coal ask price of 1.0
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

        // Zero the storage target so the bid becomes inactive in the next tick.
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

    it('fill rate in second tick uses previous demand (lastEffectiveQty), not current shortfall', () => {
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;
        automaticPricing(agentMap(buyer), planet);

        // Storage target = full buffer (3000), storage is empty so effective qty = 3000.
        const firstBidStorageTarget = buyer.assets.p.market!.buy[COAL]!.bidStorageTarget!;
        const firstEffectiveQty = firstBidStorageTarget; // inventory = 0

        // First tick: only partial fill — half of demand is filled
        const partialSeller = makeCoalSeller(Math.floor(firstEffectiveQty / 2), 1.0, 'partial-seller');
        marketTick(agentMap(partialSeller, buyer), planet);
        // collectAgentBids sets lastEffectiveQty = firstEffectiveQty (full demand placed)

        // automaticPricing after first tick computes the adjusted bid price using
        // lastBought (≈firstEffectiveQty/2) vs lastEffectiveQty (=firstEffectiveQty).
        // Fill rate ≈ 0.5 → price should rise.
        automaticPricing(agentMap(buyer), planet);
        const priceAfterFirstTick = buyer.assets.p.market!.buy[COAL]!.bidPrice!;
        expect(priceAfterFirstTick).toBeGreaterThan(1.0);

        // After automaticPricing, bidStorageTarget is still the full buffer (3000).
        // The effective qty = target − current inventory, which is now smaller.
        const coalInStorage = buyer.assets.p.storageFacility.currentInStorage[COAL]?.quantity ?? 0;
        const secondEffectiveQty = Math.max(0, buyer.assets.p.market!.buy[COAL]!.bidStorageTarget! - coalInStorage);
        expect(secondEffectiveQty).toBeLessThan(firstEffectiveQty);

        // Second tick: half of the (now smaller) effective qty is filled.
        // Fill rate still ≈ 0.5 → price should keep rising.
        const seller2 = makeCoalSeller(Math.floor(secondEffectiveQty / 2), 1.0, 'seller2');
        marketTick(agentMap(seller2, buyer), planet);

        automaticPricing(agentMap(buyer), planet);
        const priceAfterSecondTick = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        // Fill deficit persists → price keeps rising tick over tick
        expect(priceAfterSecondTick).toBeGreaterThan(priceAfterFirstTick);
    });

    it('food market (household demand) is unaffected when an unrelated agent buys coal', () => {
        const foodAgent = makeAgent('food-seller');
        foodAgent.assets.p.storageFacility = makeStorageFacility({
            planetId: 'p',
            capacity: { volume: 1e9, mass: 1e9 },
        });
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 10000);
        foodAgent.assets.p.market = {
            sell: {
                [FOOD]: {
                    resource: agriculturalProductResourceType,
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
        // With validation consolidation, bid storage target remains unchanged in the agent's state
        expect(buyer.assets.p.market!.buy[COAL]!.bidStorageTarget).toBe(100);
        // Storage is not full because we only bid for what we can store (50 units)
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
