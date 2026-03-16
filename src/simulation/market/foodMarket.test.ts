/**
 * market/foodMarket.test.ts
 *
 * Tests for the food market price-priority commodity exchange:
 * - Ask order collection and bid order formation
 * - Price-priority matching (highest bid first, lowest ask first)
 * - Financial settlement (household → specific agent deposit transfer)
 * - Volume-weighted average price tracking (VWAP → planet.priceLevel)
 * - Market result snapshot (planet.lastFoodMarketResult)
 * - Monetary conservation (householdDeposits decrease = agent deposits increase)
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet, GameState } from '../planet/planet';
import { agriculturalProductResourceType, putIntoStorageFacility } from '../planet/facilities';
import { INITIAL_FOOD_PRICE, FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK } from '../constants';
import { foodMarketTick, expectedPurchaseQuantity } from './foodMarket';
import { updateAgentPricing } from './agentPricing';
import { makeAgent, makePlanetWithPopulation, makeGameState as makeGS, agentMap } from '../utils/testHelper';
import { forEachPopulationCohort, SKILL } from '../population/population';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGameState(planet: Planet, ...agents: Agent[]): GameState {
    return makeGS(planet, agents, 1);
}

function makeAgentWithFoodFacility(id = 'food-agent'): Agent {
    const agent = makeAgent(id);
    // Add a food-producing facility
    agent.assets.p.productionFacilities = [
        {
            planetId: 'p',
            id: 'food-fac',
            name: 'Food Farm',
            maxScale: 1000,
            scale: 1,
            powerConsumptionPerTick: 0,
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                resourceEfficiency: {},
                overqualifiedWorkers: {},
                exactUsedByEdu: {},
                totalUsedByEdu: {},
            },
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [{ resource: agriculturalProductResourceType, quantity: 1000 }],
        },
    ];
    return agent;
}

/** Give all unoccupied/none/novice population cells some wealth. */
function giveHouseholdsWealth(planet: Planet, wealthPerPerson: number): number {
    const demography = planet.population.demography;
    let totalPop = 0;
    for (let age = 0; age < demography.length; age++) {
        for (const skill of SKILL) {
            const cat = demography[age].unoccupied.none[skill];
            if (cat.total > 0) {
                cat.wealth = { mean: wealthPerPerson, variance: 0 };
                totalPop += cat.total;
            }
        }
    }
    return totalPop;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('foodMarketTick', () => {
    let planet: Planet;
    let foodAgent: Agent;

    beforeEach(() => {
        planet = makePlanetWithPopulation({ none: 1000 }).planet;
        foodAgent = makeAgentWithFoodFacility();
    });

    it('runs without error on fresh planet', () => {
        foodMarketTick(agentMap(foodAgent), planet);
        // After running, priceLevel may or may not be set depending on offers
        // The key assertion is that it doesn't throw
    });

    it('collects per-agent ask orders from storage and sells food', () => {
        // Put food in the food agent's storage
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 500);
        // Set up agent pricing (bootstrap)
        updateAgentPricing(agentMap(foodAgent), planet);

        // Give households wealth so they can buy
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        foodMarketTick(agentMap(foodAgent), planet);

        // Food agent should have recorded lastSold
        expect(foodAgent.assets.p.foodMarket?.lastSold).toBeDefined();
        // Storage should be reduced (food was sold)
        const remaining =
            foodAgent.assets.p.storageFacility.currentInStorage[agriculturalProductResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeLessThan(500);
    });

    it('households with wealth purchase food from the market', () => {
        const totalPop = giveHouseholdsWealth(planet, 100);

        // Provide household deposits
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        // Put food in the food agent's storage and set pricing
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 10000);
        updateAgentPricing(agentMap(foodAgent), planet);

        foodMarketTick(agentMap(foodAgent), planet);

        // Household deposits should have decreased (spent on food)
        expect(planet.bank.householdDeposits).toBeLessThan(totalPop * 100);
    });

    it('does not target more than the buffer target per person', () => {
        // set up scenario with one person and no initial food stock
        const pop = giveHouseholdsWealth(planet, 1000);
        planet.bank.householdDeposits = pop * 1000;
        planet.bank.deposits = pop * 1000;

        // Put huge amount of food in the market to ensure supply is unconstrained
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1e6);
        updateAgentPricing(agentMap(foodAgent), planet);

        // zero out existing food stock explicitly (should already be zero)
        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                cat.foodStock = 0;
            }),
        );

        foodMarketTick(agentMap(foodAgent), planet);

        // after tick, avg foodStock per person should equal the single buffer target
        const expected = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
        // Population lives at ages 14–64 (MIN_EMPLOYABLE_AGE upwards); age 0 is empty.
        const cat = planet.population.demography[14].unoccupied.none.novice;
        expect(cat.total).toBeGreaterThan(0); // sanity: cell is populated
        expect(cat.foodStock / cat.total).toBeCloseTo(expected, 5);
    });

    it('price-priority: highest-bid cohort buys before lower-bid cohort', () => {
        // Two wealth levels: rich and poor cohorts
        // Rich (age 14, novice): wealth = 200 → high reservation price
        // Poor (age 20, novice): wealth = 1 → low reservation price
        // Supply is severely constrained so only the rich can be served
        const demography = planet.population.demography;

        // Clear all population wealth first
        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                cat.wealth = { mean: 0, variance: 0 };
                cat.foodStock = 0;
            }),
        );

        const richCat = demography[14].unoccupied.none.novice;
        const poorCat = demography[20].unoccupied.none.novice;

        // Both need food (buffer target not met)
        richCat.wealth = { mean: 200, variance: 0 };
        poorCat.wealth = { mean: 1, variance: 0 };

        planet.bank.householdDeposits = richCat.total * 200 + poorCat.total * 1;
        planet.bank.deposits = planet.bank.householdDeposits;

        // Supply: only enough for the rich cohort (small supply)
        const supplyQty = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * richCat.total * 0.5;
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, supplyQty);
        foodAgent.assets.p.foodMarket = { offerPrice: 0.5, offerQuantity: supplyQty };

        const poorFoodBefore = poorCat.foodStock;
        const richFoodBefore = richCat.foodStock;

        foodMarketTick(agentMap(foodAgent), planet);

        // Rich cohort should have received food (higher bid wins priority)
        expect(richCat.foodStock).toBeGreaterThan(richFoodBefore);
        // Poor cohort may receive nothing (shortage → price priority excludes them)
        // At least rich received at least as much as poor
        expect(richCat.foodStock - richFoodBefore).toBeGreaterThanOrEqual(poorCat.foodStock - poorFoodBefore);
    });

    it('ask-price priority: cheapest agent sells first', () => {
        // Create two food agents with different prices
        const cheapAgent = makeAgentWithFoodFacility('cheap');
        const expensiveAgent = makeAgentWithFoodFacility('expensive');

        putIntoStorageFacility(cheapAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);
        putIntoStorageFacility(expensiveAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);

        cheapAgent.assets.p.foodMarket = { offerPrice: 1.0, offerQuantity: 100 };
        expensiveAgent.assets.p.foodMarket = { offerPrice: 5.0, offerQuantity: 100 };

        // Households need bid prices ≥ cheap ask (1.0).
        // bidPrice = wealth / desiredPerPerson = wealth / (FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK)
        // desiredPerPerson ≈ 0.0833 → wealth must be > 0.0833 to bid above 1.0
        // Use wealth = 0.5 → bidPrice ≈ 6.0 → can afford cheap (ask=1.0) but not expensive (ask=5.0) after buffer
        const totalPop = giveHouseholdsWealth(planet, 0.5);
        planet.bank.householdDeposits = totalPop * 0.5;
        planet.bank.deposits = totalPop * 0.5;

        foodMarketTick(agentMap(cheapAgent, expensiveAgent), planet);

        // Cheap agent should have sold some food (bid ≥ cheap ask)
        expect(cheapAgent.assets.p.foodMarket?.lastSold).toBeGreaterThan(0);
        // Cheap agent sells more than (or at least as much as) expensive agent
        const cheapSold = cheapAgent.assets.p.foodMarket?.lastSold ?? 0;
        const expensiveSold = expensiveAgent.assets.p.foodMarket?.lastSold ?? 0;
        expect(cheapSold).toBeGreaterThanOrEqual(expensiveSold);
    });

    it('bid below ask price → no trade occurs', () => {
        // Agent asks very high; households cannot afford
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 500);
        foodAgent.assets.p.foodMarket = { offerPrice: 1_000_000, offerQuantity: 500 };

        const totalPop = giveHouseholdsWealth(planet, 0.001); // tiny wealth
        planet.bank.householdDeposits = totalPop * 0.001;
        planet.bank.deposits = totalPop * 0.001;

        const depositsBefore = planet.bank.householdDeposits;

        foodMarketTick(agentMap(foodAgent), planet);

        // No food should have been sold — bid prices are all below the ask
        expect(foodAgent.assets.p.foodMarket?.lastSold ?? 0).toBe(0);
        // Household deposits unchanged
        expect(planet.bank.householdDeposits).toBeCloseTo(depositsBefore, 6);
    });

    it('revenue flows directly to selling agents', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1000);

        foodAgent.assets[planet.id].deposits = 0;
        updateAgentPricing(agentMap(foodAgent), planet);

        // Give households wealth
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        foodMarketTick(agentMap(foodAgent), planet);

        // Food agent should have received revenue
        expect(foodAgent.assets.p.deposits).toBeGreaterThan(0);
    });

    it('monetary conservation: householdDeposits decrease equals agent deposit increase', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1000);
        foodAgent.assets.p.foodMarket = { offerPrice: 1.0, offerQuantity: 1000 };
        foodAgent.assets.p.deposits = 0;

        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        const householdBefore = planet.bank.householdDeposits;
        const agentBefore = foodAgent.assets.p.deposits;

        foodMarketTick(agentMap(foodAgent), planet);

        const householdDelta = householdBefore - planet.bank.householdDeposits;
        const agentDelta = foodAgent.assets.p.deposits - agentBefore;

        // Money transferred out of households equals money credited to agents
        expect(agentDelta).toBeCloseTo(householdDelta, 6);
    });

    it('does not produce negative food stock', () => {
        foodMarketTick(agentMap(foodAgent), planet);

        const demography = planet.population.demography;
        for (let age = 0; age < demography.length; age++) {
            forEachPopulationCohort(demography[age], (cat) => {
                if (cat.total > 0) {
                    expect(cat.foodStock).toBeGreaterThanOrEqual(0);
                }
            });
        }
    });

    it('volume-weighted average price is updated', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1000);
        foodAgent.assets.p.foodMarket = { offerPrice: 2.5, offerQuantity: 1000 };

        // Give households wealth
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        foodMarketTick(agentMap(foodAgent), planet);

        // Price should reflect the agent's ask price (2.5)
        expect(planet.priceLevel).toBeCloseTo(2.5, 1);
    });

    it('persists lastFoodMarketResult snapshot on planet', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 500);
        foodAgent.assets.p.foodMarket = { offerPrice: 1.0, offerQuantity: 500 };

        const totalPop = giveHouseholdsWealth(planet, 50);
        planet.bank.householdDeposits = totalPop * 50;
        planet.bank.deposits = totalPop * 50;

        foodMarketTick(agentMap(foodAgent), planet);

        const result = planet.lastFoodMarketResult;
        expect(result).toBeDefined();
        expect(result!.clearingPrice).toBeGreaterThan(0);
        expect(result!.totalVolume).toBeGreaterThanOrEqual(0);
        expect(result!.totalDemand).toBeGreaterThanOrEqual(0);
        expect(result!.totalSupply).toBe(500);
        expect(result!.unfilledDemand).toBeGreaterThanOrEqual(0);
        expect(result!.unsoldSupply).toBeGreaterThanOrEqual(0);
        // Volume ≤ min(demand, supply)
        expect(result!.totalVolume).toBeLessThanOrEqual(result!.totalDemand + 1e-9);
        expect(result!.totalVolume).toBeLessThanOrEqual(result!.totalSupply + 1e-9);
    });

    it('lastFoodMarketResult.unfilledDemand is positive when supply is scarce', () => {
        // Tiny supply relative to population demand
        const tinySupply = 0.001;
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, tinySupply);
        foodAgent.assets.p.foodMarket = { offerPrice: 1.0, offerQuantity: tinySupply };

        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        foodMarketTick(agentMap(foodAgent), planet);

        expect(planet.lastFoodMarketResult!.unfilledDemand).toBeGreaterThan(0);
    });

    it('lastFoodMarketResult.unsoldSupply is positive when demand is insufficient', () => {
        // Massive supply, households have almost no wealth → little demand
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1e6);
        foodAgent.assets.p.foodMarket = { offerPrice: 1.0, offerQuantity: 1e6 };

        const totalPop = giveHouseholdsWealth(planet, 0.00001); // near-zero wealth
        planet.bank.householdDeposits = totalPop * 0.00001;
        planet.bank.deposits = totalPop * 0.00001;

        foodMarketTick(agentMap(foodAgent), planet);

        expect(planet.lastFoodMarketResult!.unsoldSupply).toBeGreaterThan(0);
    });
});

describe('updateAgentPricing', () => {
    let planet: Planet;
    let foodAgent: Agent;

    beforeEach(() => {
        const result = makePlanetWithPopulation({ none: 100 });
        planet = result.planet;
        foodAgent = makeAgentWithFoodFacility();
        makeGameState(planet, foodAgent);
    });

    it('bootstraps with INITIAL_FOOD_PRICE on first tick', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);

        updateAgentPricing(agentMap(foodAgent), planet);

        expect(foodAgent.assets.p.foodMarket?.offerPrice).toBe(INITIAL_FOOD_PRICE);
        expect(foodAgent.assets.p.foodMarket?.offerQuantity).toBe(100);
    });

    it('lowers price when excess supply (produced > sold)', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);
        foodAgent.assets.p.foodMarket = { offerPrice: 2.0, lastSold: 20 }; // only 20% sold → price too high

        updateAgentPricing(agentMap(foodAgent), planet);

        expect(foodAgent.assets.p.foodMarket!.offerPrice!).toBeLessThan(2.0);
    });

    it('raises price when excess demand (produced < sold)', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 0);
        foodAgent.assets.p.foodMarket = { offerPrice: 1.0, lastSold: 50 }; // sold more than produced (from buffer)

        updateAgentPricing(agentMap(foodAgent), planet);

        expect(foodAgent.assets.p.foodMarket!.offerPrice!).toBeGreaterThan(1.0);
    });

    it('does not set price below FOOD_PRICE_FLOOR', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 10000);
        foodAgent.assets.p.foodMarket = { offerPrice: 0.02, lastSold: 0 };

        updateAgentPricing(agentMap(foodAgent), planet);

        expect(foodAgent.assets.p.foodMarket!.offerPrice!).toBeGreaterThanOrEqual(0.01);
    });
});

describe('foodMarketHelpers', () => {
    it('expectedPurchaseQuantity respects liquidity constraint', () => {
        // Can afford everything
        expect(expectedPurchaseQuantity(100, 0, 1.0, 50)).toBe(50);

        // Can only afford 30 out of 50
        expect(expectedPurchaseQuantity(30, 0, 1.0, 50)).toBe(30);

        // Zero wealth
        expect(expectedPurchaseQuantity(0, 0, 1.0, 50)).toBe(0);

        // High price
        expect(expectedPurchaseQuantity(10, 0, 10.0, 50)).toBe(1);
    });
});
