/**
 * market/foodMarket.test.ts
 *
 * Tests for the per-agent food market clearing mechanism:
 * - Per-agent offers and merit-order clearing
 * - Demand formation with liquidity constraints
 * - Financial settlement (household → specific agent deposit transfer)
 * - Volume-weighted average price tracking
 * - Starvation level tracking
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet, GameState } from '../planet/planet';
import { agriculturalProductResourceType, putIntoStorageFacility } from '../planet/facilities';
import { INITIAL_FOOD_PRICE, FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK } from '../constants';
import { foodMarketTick, expectedPurchaseQuantity } from './foodMarket';
import { updateAgentPricing } from './agentPricing';
import { setAgentDepositsForPlanet } from '../financial/depositHelpers';
import { makeAgent, makePlanetWithPopulation, makeGameState as makeGS } from '../utils/testHelper';
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
            scale: 1,
            powerConsumptionPerTick: 0,
            lastTickResults: {
                overallEfficiency: 1,
                workerEfficiency: {},
                workerEfficiencyOverall: 1,
                resourceEfficiency: {},
                overqualifiedWorkers: {},
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
    let gov: Agent;
    let foodAgent: Agent;
    let gs: GameState;

    beforeEach(() => {
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        gov = result.gov;
        foodAgent = makeAgentWithFoodFacility();
        gs = makeGameState(planet, gov, foodAgent);
    });

    it('runs without error on fresh planet', () => {
        foodMarketTick(gs);
        // After running, priceLevel may or may not be set depending on offers
        // The key assertion is that it doesn't throw
    });

    it('collects per-agent offers from storage and sells food', () => {
        // Put food in the food agent's storage
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 500);
        // Set up agent pricing (bootstrap)
        updateAgentPricing(gs);

        // Give households wealth so they can buy
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        foodMarketTick(gs);

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
        updateAgentPricing(gs);

        foodMarketTick(gs);

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
        updateAgentPricing(gs);

        // zero out existing food stock explicitly (should already be zero)
        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                cat.foodStock = 0;
            }),
        );

        foodMarketTick(gs);

        // after tick, avg foodStock per person should equal the single buffer target
        const expected = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
        // Population lives at ages 14–64 (MIN_EMPLOYABLE_AGE upwards); age 0 is empty.
        const cat = planet.population.demography[14].unoccupied.none.novice;
        expect(cat.total).toBeGreaterThan(0); // sanity: cell is populated
        expect(cat.foodStock / cat.total).toBeCloseTo(expected, 5);
    });

    it('merit-order: cheapest agent sells first', () => {
        // Create two food agents with different prices
        const cheapAgent = makeAgentWithFoodFacility('cheap');
        const expensiveAgent = makeAgentWithFoodFacility('expensive');

        putIntoStorageFacility(cheapAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);
        putIntoStorageFacility(expensiveAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);

        cheapAgent.assets.p.foodMarket = { offerPrice: 1.0, offerQuantity: 100 };
        expensiveAgent.assets.p.foodMarket = { offerPrice: 5.0, offerQuantity: 100 };

        const gs2 = makeGameState(planet, gov, cheapAgent, expensiveAgent);

        // Give households limited wealth — enough to buy ~80 tons at price 1.0
        const totalPop = giveHouseholdsWealth(planet, 0.08);
        planet.bank.householdDeposits = totalPop * 0.08;
        planet.bank.deposits = totalPop * 0.08;

        foodMarketTick(gs2);

        // Cheap agent should have sold some food
        expect(cheapAgent.assets.p.foodMarket?.lastSold).toBeGreaterThan(0);
        // Expensive agent may or may not have sold, but cheap should sell more
        const cheapSold = cheapAgent.assets.p.foodMarket?.lastSold ?? 0;
        const expensiveSold = expensiveAgent.assets.p.foodMarket?.lastSold ?? 0;
        expect(cheapSold).toBeGreaterThanOrEqual(expensiveSold);
    });

    it('revenue flows directly to selling agents', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1000);
        setAgentDepositsForPlanet(foodAgent, planet.id, 0);
        updateAgentPricing(gs);

        // Give households wealth
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        foodMarketTick(gs);

        // Food agent should have received revenue
        expect(foodAgent.assets.p.deposits).toBeGreaterThan(0);
    });

    it('does not produce negative food stock', () => {
        foodMarketTick(gs);

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

        foodMarketTick(gs);

        // Price should reflect the agent's offer price (2.5)
        expect(planet.priceLevel).toBeCloseTo(2.5, 1);
    });
});

describe('updateAgentPricing', () => {
    let planet: Planet;
    let foodAgent: Agent;
    let gs: GameState;

    beforeEach(() => {
        const result = makePlanetWithPopulation({ none: 100 });
        planet = result.planet;
        foodAgent = makeAgentWithFoodFacility();
        gs = makeGameState(planet, result.gov, foodAgent);
    });

    it('bootstraps with INITIAL_FOOD_PRICE on first tick', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);

        updateAgentPricing(gs);

        expect(foodAgent.assets.p.foodMarket?.offerPrice).toBe(INITIAL_FOOD_PRICE);
        expect(foodAgent.assets.p.foodMarket?.offerQuantity).toBe(100);
    });

    it('lowers price when excess supply (produced > sold)', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);
        foodAgent.assets.p.foodMarket = { offerPrice: 2.0, lastSold: 20 }; // only 20% sold → price too high

        updateAgentPricing(gs);

        expect(foodAgent.assets.p.foodMarket!.offerPrice!).toBeLessThan(2.0);
    });

    it('raises price when excess demand (produced < sold)', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 0);
        foodAgent.assets.p.foodMarket = { offerPrice: 1.0, lastProduced: 10, lastSold: 50 }; // sold more than produced (from buffer)

        updateAgentPricing(gs);

        expect(foodAgent.assets.p.foodMarket!.offerPrice!).toBeGreaterThan(1.0);
    });

    it('does not set price below FOOD_PRICE_FLOOR', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 10000);
        foodAgent.assets.p.foodMarket = { offerPrice: 0.02, lastProduced: 10000, lastSold: 0 };

        updateAgentPricing(gs);

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
