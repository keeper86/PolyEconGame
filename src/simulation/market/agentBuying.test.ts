import { beforeEach, describe, expect, it } from 'vitest';

import { INITIAL_FOOD_PRICE } from '../constants';
import { putIntoStorageFacility } from '../planet/storage';
import type { Agent, Planet } from '../planet/planet';
import { agentMap, makeAgent, makePlanet, makePlanetWithPopulation, makeStorageFacility } from '../utils/testHelper';
import { automaticPricing } from './automaticPricing';
import { marketTick } from './market';
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
                offerQuantity: coalStock,
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
                },
            },
        ];

        automaticPricing(agentMap(agent), planet);

        expect(agent.assets.p.market?.buy[arableLandResourceType.name]).toBeUndefined();
    });

    it('sets bidQuantity to cover the buffer shortfall when storage is empty', () => {
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        // facility needs 100/tick × scale 1 × 30-tick buffer = 3000
        expect(bid.bidQuantity).toBeGreaterThan(0);
        expect(bid.bidQuantity).toBe(100 * 1 * 30);
    });

    it('reduces bidQuantity by the amount already in storage', () => {
        const buyer = makeSteelProducer();
        putIntoStorageFacility(buyer.assets.p.storageFacility, coalResourceType, 500);

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidQuantity).toBe(Math.max(0, 100 * 1 * 30 - 500));
    });

    it('sets bidQuantity to 0 when buffer is already fully covered by storage', () => {
        const buyer = makeSteelProducer();
        const fullBuffer = 100 * 1 * 30;
        putIntoStorageFacility(buyer.assets.p.storageFacility, coalResourceType, fullBuffer + 100);

        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidQuantity).toBe(0);
    });

    it('bootstraps bidPrice from market price on first tick', () => {
        planet.marketPrices[COAL] = 2.0;
        planet.marketPrices[steelResourceType.name] = 8.0; // ceiling = (50×8)/100 = 4.0 — non-binding
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(2.0);
    });

    it('uses INITIAL_FOOD_PRICE as fallback when no market price is set', () => {
        delete planet.marketPrices[COAL];
        planet.marketPrices[steelResourceType.name] = 4.0; // ceiling = (50×4)/100 = 2.0 — non-binding
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(INITIAL_FOOD_PRICE);
    });

    it('uses planet.marketPrices as initial bid price when available', () => {
        planet.marketPrices[COAL] = 3.5;
        planet.marketPrices[steelResourceType.name] = 10.0; // ceiling = (50×10)/100 = 5.0 — non-binding
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeCloseTo(3.5);
    });

    it('holds bid price when nothing was bought last tick (no supply signal)', () => {
        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;

        buyer.assets.p.market!.buy[COAL]!.lastBought = 0;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market!.buy[COAL]!.bidPrice).toBeCloseTo(firstBidPrice);
    });

    it('raises bid price when previous tick was partially filled', () => {
        // Steel at 8.0 → ceiling = (50 × 8) / 100 = 4.0, well above coal price of 2.0
        planet.marketPrices[steelResourceType.name] = 8.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);
        const firstBidPrice = buyer.assets.p.market!.buy[COAL]!.bidPrice!;
        const firstBidQty = buyer.assets.p.market!.buy[COAL]!.bidQuantity!;

        buyer.assets.p.market!.buy[COAL]!.lastBought = firstBidQty / 2;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market!.buy[COAL]!.bidPrice).toBeGreaterThan(firstBidPrice);
    });

    it('skips buy-order creation when agent.automated is false and automatePricing is false', () => {
        const buyer = makeSteelProducer();
        buyer.automated = false;
        buyer.automatePricing = false;

        automaticPricing(agentMap(buyer), planet);

        expect(buyer.assets.p.market?.buy).toBeUndefined();
    });

    it('bootstraps bid price no higher than the break-even ceiling', () => {
        // Steel facility: 100 coal → 50 steel
        // With steel market price 4.0, break-even for coal = (50 × 4) / 100 = 2.0
        planet.marketPrices[COAL] = 3.0;
        planet.marketPrices[steelResourceType.name] = 4.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeLessThanOrEqual(2.0);
    });

    it('bid price does not exceed the break-even ceiling after repeated partially-filled ticks', () => {
        // Steel at price 6.0 → ceiling = (50 × 6) / 100 = 3.0
        planet.marketPrices[COAL] = 1.0;
        planet.marketPrices[steelResourceType.name] = 6.0;

        const buyer = makeSteelProducer();
        automaticPricing(agentMap(buyer), planet);

        for (let i = 0; i < 200; i++) {
            const demanded = buyer.assets.p.market!.buy[COAL]!.bidQuantity ?? 1;
            buyer.assets.p.market!.buy[COAL]!.lastBought = demanded / 2;
            automaticPricing(agentMap(buyer), planet);
        }

        const bid = buyer.assets.p.market!.buy[COAL]!;
        expect(bid.bidPrice).toBeLessThanOrEqual(3.0 + 1e-9);
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
                    bidQuantity: 1,
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
                    bidQuantity: 1,
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

        buyer.assets.p.market!.buy[COAL]!.bidQuantity = 0;

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

    it('fill rate in second tick uses previous demand (bidQuantity), not current shortfall', () => {
        const buyer = makeSteelProducer();
        buyer.assets.p.deposits = 1_000_000;
        automaticPricing(agentMap(buyer), planet);

        const firstBidQuantity = buyer.assets.p.market!.buy[COAL]!.bidQuantity!;

        // First tick: only partial fill — half of demand is filled
        const partialSeller = makeCoalSeller(Math.floor(firstBidQuantity / 2), 1.0, 'partial-seller');
        marketTick(agentMap(partialSeller, buyer), planet);

        // automaticPricing after first tick computes the adjusted bid price using
        // lastBought (=firstBidQuantity/2) vs previousDemand (=firstBidQuantity).
        // Fill rate = 0.5 → price should rise.
        automaticPricing(agentMap(buyer), planet);
        const priceAfterFirstTick = buyer.assets.p.market!.buy[COAL]!.bidPrice!;
        expect(priceAfterFirstTick).toBeGreaterThan(1.0);

        // After automaticPricing, bidQuantity reflects the remaining shortfall,
        // which is smaller than firstBidQuantity (some stock was accumulated).
        const secondBidQuantity = buyer.assets.p.market!.buy[COAL]!.bidQuantity!;
        expect(secondBidQuantity).toBeLessThan(firstBidQuantity);

        // Second tick: half of the (now smaller) shortfall is filled.
        // If the fill rate had been computed from secondBidQuantity (the NEW shortfall)
        // instead of from firstBidQuantity (the OLD demand), lastBought ≈ secondBidQuantity/2
        // would give fillRate ≈ 0.5 relative to the new qty, but the price baseline
        // is already priceAfterFirstTick. With the fix, the rate is computed from
        // the bid.bidQuantity that was set in the PREVIOUS automaticPricing call
        // (= secondBidQuantity), not from the shortfall recalculated inside adjustBidPrice.
        const seller2 = makeCoalSeller(Math.floor(secondBidQuantity / 2), 1.0, 'seller2');
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
                    offerQuantity: 10000,
                },
            },
            buy: {},
        };

        const coalSeller = makeCoalSeller(3000, 1.0, 'coal-seller');
        const steelMaker = makeSteelProducer('steel-maker');
        steelMaker.assets.p.deposits = 1_000_000;
        automaticPricing(agentMap(steelMaker), planet);

        const allAgents = agentMap(foodAgent, coalSeller, steelMaker);

        const householdFoodBefore = planet.population.demography[14].unoccupied.none.novice.inventory[FOOD] ?? 0;

        marketTick(allAgents, planet);

        const householdFoodAfter = planet.population.demography[14].unoccupied.none.novice.inventory[FOOD] ?? 0;

        expect(householdFoodAfter).toBeGreaterThanOrEqual(householdFoodBefore);
    });
});
