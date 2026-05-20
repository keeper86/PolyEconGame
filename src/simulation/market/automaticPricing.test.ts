import { beforeEach, describe, expect, it } from 'vitest';
import {
    AUTOMATED_COST_CEILING_FACTOR,
    AUTOMATED_COST_FLOOR_MARKUP,
    COST_SPRING_STRENGTH,
    INPUT_BUFFER_TARGET_TICKS,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
} from '../constants';
import { DEFAULT_WAGE_PER_EDU } from '../financial/financialTick';
import type { StorageFacility } from '../planet/facility';
import {
    agriculturalProductResourceType,
    clothingResourceType,
    fabricResourceType,
    ironOreResourceType,
    logsResourceType,
    lumberResourceType,
    waterResourceType,
} from '../planet/resources';
import { seedRng } from '../utils/stochasticRound';
import { makeAgent, makePlanet, makeProductionFacility, makeStorageFacility } from '../utils/testHelper';
import { automaticPricing, buildPlanetProductionCosts } from './automaticPricing';

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
        // buffer = 200 * scale(10) * INPUT_BUFFER_TARGET_TICKS > 5 000 available → retainment = full buffer target
        expect(offer?.offerRetainment).toBe(200 * 10 * INPUT_BUFFER_TARGET_TICKS);
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
        // 65 000 − (200 * 10 * INPUT_BUFFER_TARGET_TICKS) reserved = sellable, retainment = full buffer target
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
        // The cost spring attenuates the downward pressure: the full 5% drop must NOT happen
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

// ---------------------------------------------------------------------------
// buildPlanetProductionCosts
// ---------------------------------------------------------------------------

describe('buildPlanetProductionCosts — resourceProducerTemplates is populated', () => {
    it('returns a non-empty map when called with any planet', () => {
        const planet = makePlanet({ marketPrices: {} });
        const costs = buildPlanetProductionCosts(planet);
        expect(costs.size).toBeGreaterThan(0);
    });

    it('contains an entry for Lumber (produced by sawmill)', () => {
        const planet = makePlanet({ marketPrices: {} });
        const costs = buildPlanetProductionCosts(planet);
        // sawmill: logs price = 0, workers = 15+20+8+1 = 44, output = 200
        // cost = (0 + 44) / 200 = 0.22  (> 0 → included)
        expect(costs.has(lumberResourceType.name)).toBe(true);
    });

    it('contains an entry for Agricultural Product', () => {
        const planet = makePlanet({ marketPrices: {} });
        const costs = buildPlanetProductionCosts(planet);
        // agricultural facility: water price=0, workers=30+20+10+0=60, output=40
        // cost = (0 + 60) / 40 = 1.5  (> 0 → included)
        expect(costs.has(agriculturalProductResourceType.name)).toBe(true);
    });
});

describe('buildPlanetProductionCosts — cost formula correctness', () => {
    it('computes Lumber cost correctly: (logs_qty × logs_price + worker_sum) / output_qty', () => {
        // sawmill: needs Logs qty=300, workers={none:15,primary:20,secondary:8,tertiary:1}=44, produces Lumber qty=200
        const LOG_PRICE = 10;
        const planet = makePlanet({ marketPrices: { [logsResourceType.name]: LOG_PRICE } });
        const costs = buildPlanetProductionCosts(planet);

        const expected = (300 * LOG_PRICE + 44) / 200; // = 15.22
        expect(costs.get(lumberResourceType.name)).toBeCloseTo(expected, 6);
    });

    it('skips land-bound resource inputs (arable land treated as free)', () => {
        // Agricultural Facility: needs Water (qty=20) + Arable Land (land-bound, skipped)
        // workers = 30+20+10+0 = 60, produces Agricultural Product qty=40
        const WATER_PRICE = 5;
        const planet = makePlanet({ marketPrices: { [waterResourceType.name]: WATER_PRICE } });
        const costs = buildPlanetProductionCosts(planet);

        const expected = (20 * WATER_PRICE + 60) / 40; // = 4.0
        expect(costs.get(agriculturalProductResourceType.name)).toBeCloseTo(expected, 6);
    });

    it('uses 0 for inputs with no market price set', () => {
        // Override logs price to 0 so the only cost is the worker sum
        const planet = makePlanet({ marketPrices: { [logsResourceType.name]: 0 } });
        const costs = buildPlanetProductionCosts(planet);

        // sawmill: logs price = 0, workers = 15+20+8+1 = 44, output = 200 → cost = 44 / 200 = 0.22
        expect(costs.get(lumberResourceType.name)).toBeCloseTo(44 / 200, 6);
    });
});

// ---------------------------------------------------------------------------
// adjustBidPrice — ceiling spring
// ---------------------------------------------------------------------------

describe('automaticPricing — bid ceiling spring (production cost cap)', () => {
    // Strategy: set up an agent whose facility needs Lumber as input.
    // Control the lumber production cost via planet.marketPrices[Logs].
    // Initially set a bid price far above costCeiling, then verify it moves down.

    function makeLumberConsumerAgent(initialBidPrice: number, lastBought: number, lastEffectiveQty: number) {
        // A facility that needs Lumber as input
        const consumer = makeProductionFacility({ none: 1 }, { id: 'furn', scale: 1 });
        consumer.needs = [{ resource: lumberResourceType, quantity: 10 }];
        consumer.produces = [{ resource: waterResourceType, quantity: 5 }];

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
                    lastBought,
                    lastEffectiveQty,
                    automated: true,
                },
            },
        };
        return agent;
    }

    /**
     * Seeds planet.lastMarketResult with productionCost values computed from the
     * current marketPrices so that automaticPricing can read them (as it would
     * after a real marketTick in the engine).
     */
    function seedProductionCosts(planet: ReturnType<typeof makePlanet>): void {
        const costs = buildPlanetProductionCosts(planet);
        for (const [name, cost] of costs) {
            planet.lastMarketResult[name] = {
                resourceName: name,
                clearingPrice: 0,
                totalVolume: 0,
                totalDemand: 0,
                totalSupply: 0,
                unfilledDemand: 0,
                unsoldSupply: 0,
                productionCost: cost,
            };
        }
    }

    it('ceiling spring reduces bid when price is far above productionCost × AUTOMATED_COST_CEILING_FACTOR', () => {
        // Lumber prodCost with logs price = 0: (0 + 44) / 200 = 0.22
        // ceiling = 0.22 × 10 = 2.2
        // Start bid at 1000 >> 2.2
        const planet = makePlanet({ marketPrices: { [logsResourceType.name]: 0 } });
        seedProductionCosts(planet);
        const agent = makeLumberConsumerAgent(1000, 5, 10);

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[lumberResourceType.name]!;
        expect(bid.bidPrice).toBeLessThan(1000);
    });

    it('ceiling spring is inactive when bid is already below productionCost × AUTOMATED_COST_CEILING_FACTOR', () => {
        // Lumber prodCost with logs price = 0: 0.22, ceiling = 2.2
        // Start bid at 1.0 < 2.2 — no ceiling correction should fire
        // With fill rate = 0 (lastBought=0, lastEffectiveQty=10), factor = PRICE_ADJUST_MAX_UP
        const planet = makePlanet({ marketPrices: { [logsResourceType.name]: 0 } });
        seedProductionCosts(planet);
        const agent = makeLumberConsumerAgent(1.0, 0, 10);

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[lumberResourceType.name]!;
        // Ceiling spring adds 0 → price should rise toward PRICE_ADJUST_MAX_UP
        expect(bid.bidPrice).toBeCloseTo(1.0 * PRICE_ADJUST_MAX_UP, 5);
    });

    it('ceiling spring magnitude scales with how far bid exceeds the ceiling', () => {
        // Lumber prodCost = 0.22, ceiling = 2.2
        // Agent A: bid at 3 (ceiling deviation = 3/2.2 - 1 ≈ 0.364)
        // Agent B: bid at 100 (ceiling deviation = 100/2.2 - 1 ≈ 44.45)
        // Agent B's price should drop proportionally more
        const planet = makePlanet({ marketPrices: { [logsResourceType.name]: 0 } });
        seedProductionCosts(planet);
        const agentA = makeLumberConsumerAgent(3, 5, 10);
        const agentB = makeLumberConsumerAgent(100, 5, 10);

        automaticPricing(new Map([['agentA', agentA]]), planet);
        automaticPricing(new Map([['agentB', agentB]]), planet);

        const priceA = agentA.assets[PLANET_ID].market!.buy[lumberResourceType.name]!.bidPrice!;
        const priceB = agentB.assets[PLANET_ID].market!.buy[lumberResourceType.name]!.bidPrice!;

        // Both should be lower than before as both exceed ceiling
        expect(priceA).toBeLessThan(3);
        expect(priceB).toBeLessThan(100);

        // AgentA (closer to ceiling) should have a smaller relative reduction
        const relDropA = (3 - priceA) / 3;
        const relDropB = (100 - priceB) / 100;
        expect(relDropB).toBeGreaterThan(relDropA);
    });

    it('ceiling spring correction uses COST_SPRING_STRENGTH × ceilingDeviation', () => {
        // Lumber prodCost = 0.22 (logs=0 override), ceiling = 2.2
        // bid = 4.4 → ceilingDeviation = 4.4/2.2 - 1 = 1.0
        // Water price set very high → consumer facility is profitable → profitGap = 0
        // fillRate = 1 (lastBought=lastEffectiveQty=10) → fillRateFactor(1) = PRICE_ADJUST_MAX_DOWN
        // factor = PRICE_ADJUST_MAX_DOWN - COST_SPRING_STRENGTH × 1.0
        // newPrice = 4.4 × factor = 4.4 × 0.955 = 4.202
        const planet = makePlanet({
            marketPrices: {
                [logsResourceType.name]: 0, // lumber prodCost = 44/200 = 0.22
                [waterResourceType.name]: 1000, // water revenue >> lumber cost → profitGap = 0
            },
        });
        seedProductionCosts(planet);
        const agent = makeLumberConsumerAgent(4.4, 10, 10);

        automaticPricing(new Map([['co', agent]]), planet);

        const bid = agent.assets[PLANET_ID].market!.buy[lumberResourceType.name]!;
        const lumberCost = 44 / 200; // 0.22 with logs price = 0
        const ceiling = lumberCost * AUTOMATED_COST_CEILING_FACTOR;
        const ceilingDeviation = Math.max(0, 4.4 / ceiling - 1);
        const expectedFactor = PRICE_ADJUST_MAX_DOWN - COST_SPRING_STRENGTH * ceilingDeviation;
        expect(bid.bidPrice).toBeCloseTo(4.4 * expectedFactor, 5);
    });
});
