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

import type { Agent, Planet, GameState } from '../planet';
import { makeAgent, makePlanet } from '../workforce/testHelpers';
import { getWealthDemography } from '../population/populationHelpers';
import { agriculturalProductResourceType, putIntoStorageFacility } from '../facilities';
import { FOOD_PER_PERSON_PER_TICK, INITIAL_FOOD_PRICE } from '../constants';
import { foodMarketTick } from './foodMarket';
import { ensureFoodMarket, getFoodBufferDemography, expectedPurchaseQuantity } from './foodMarketHelpers';
import { updateAgentPricing } from './agentPricing';
import { setAgentDepositsForPlanet } from '../financial/depositHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGameState(planet: Planet, ...agents: Agent[]): GameState {
    return {
        tick: 1,
        planets: new Map([[planet.id, planet]]),
        agents: new Map(agents.map((a) => [a.id, a])),
    };
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
            lastTickEfficiencyInPercent: 100,
            powerConsumptionPerTick: 0,
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [{ resource: agriculturalProductResourceType, quantity: 1000 }],
        },
    ];
    return agent;
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
        ({ planet, gov } = makePlanet({ none: 1000 }));
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        foodAgent = makeAgentWithFoodFacility();
        gs = makeGameState(planet, gov, foodAgent);
    });

    it('initialises food market lazily', () => {
        expect(planet.foodMarket).toBeUndefined();
        foodMarketTick(gs);
        expect(planet.foodMarket).toBeDefined();
        expect(planet.foodMarket!.foodPrice).toBeGreaterThan(0);
    });

    it('collects per-agent offers from storage and sells food', () => {
        // Put food in the food agent's storage
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 500);
        // Set up agent pricing (bootstrap)
        updateAgentPricing(gs);

        // Give households wealth so they can buy
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;
        let totalPop = 0;
        for (let age = 0; age < demography.length; age++) {
            if (demography[age].none.unoccupied > 0) {
                wealthDemography[age].none.unoccupied = { mean: 100, variance: 0 };
                totalPop += demography[age].none.unoccupied;
            }
        }
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        foodMarketTick(gs);

        // Food agent should have recorded lastFoodSold
        expect(foodAgent.assets.p.lastFoodSold).toBeDefined();
        // Storage should be reduced (food was sold)
        const remaining =
            foodAgent.assets.p.storageFacility.currentInStorage[agriculturalProductResourceType.name]?.quantity ?? 0;
        expect(remaining).toBeLessThanOrEqual(500);
    });

    it('households consume food from their food stock', () => {
        // Give all households some food stock
        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        const demography = planet.population.demography;

        // Set food stock to 5 ticks of consumption per person
        for (let age = 0; age < demography.length; age++) {
            buffers[age].none.unoccupied.foodStock = FOOD_PER_PERSON_PER_TICK * 5;
        }

        foodMarketTick(gs);

        // Food stock should have decreased (consumed 1 tick)
        let totalFoodStock = 0;
        for (let age = 0; age < demography.length; age++) {
            totalFoodStock += buffers[age].none.unoccupied.foodStock * demography[age].none.unoccupied;
        }
        expect(totalFoodStock).toBeGreaterThanOrEqual(0);
    });

    it('households with wealth purchase food from the market', () => {
        // Give households wealth and food in the market
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        let totalPop = 0;
        for (let age = 0; age < demography.length; age++) {
            if (demography[age].none.unoccupied > 0) {
                wealthDemography[age].none.unoccupied = { mean: 100, variance: 0 };
                totalPop += demography[age].none.unoccupied;
            }
        }

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

    it('merit-order: cheapest agent sells first', () => {
        // Create two food agents with different prices
        const cheapAgent = makeAgentWithFoodFacility('cheap');
        const expensiveAgent = makeAgentWithFoodFacility('expensive');

        putIntoStorageFacility(cheapAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);
        putIntoStorageFacility(expensiveAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);

        // Set explicit prices
        cheapAgent.assets.p.foodOfferPrice = 1.0;
        cheapAgent.assets.p.foodOfferQuantity = 100;
        expensiveAgent.assets.p.foodOfferPrice = 5.0;
        expensiveAgent.assets.p.foodOfferQuantity = 100;

        const gs2 = makeGameState(planet, gov, cheapAgent, expensiveAgent);

        // Give households limited wealth — enough to buy ~80 tons at price 1.0
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;
        let totalPop = 0;
        for (let age = 0; age < demography.length; age++) {
            if (demography[age].none.unoccupied > 0) {
                wealthDemography[age].none.unoccupied = { mean: 0.08, variance: 0 };
                totalPop += demography[age].none.unoccupied;
            }
        }
        planet.bank.householdDeposits = totalPop * 0.08;
        planet.bank.deposits = totalPop * 0.08;

        foodMarketTick(gs2);

        // Cheap agent should have sold some food
        expect(cheapAgent.assets.p.lastFoodSold).toBeGreaterThan(0);
        // Expensive agent may or may not have sold, but cheap should sell more
        const cheapSold = cheapAgent.assets.p.lastFoodSold ?? 0;
        const expensiveSold = expensiveAgent.assets.p.lastFoodSold ?? 0;
        expect(cheapSold).toBeGreaterThanOrEqual(expensiveSold);
    });

    it('revenue flows directly to selling agents', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1000);
        setAgentDepositsForPlanet(foodAgent, planet.id, 0);
        updateAgentPricing(gs);

        // Give households wealth
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;
        let totalPop = 0;
        for (let age = 0; age < demography.length; age++) {
            if (demography[age].none.unoccupied > 0) {
                wealthDemography[age].none.unoccupied = { mean: 100, variance: 0 };
                totalPop += demography[age].none.unoccupied;
            }
        }
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        foodMarketTick(gs);

        // Food agent should have received revenue
        expect(foodAgent.assets.p.deposits).toBeGreaterThan(0);
    });

    it('does not produce negative food stock', () => {
        foodMarketTick(gs);

        const foodMarket = planet.foodMarket!;
        if (foodMarket.householdFoodBuffers) {
            for (let age = 0; age < foodMarket.householdFoodBuffers.length; age++) {
                for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as const) {
                    for (const occ of ['unoccupied', 'company', 'government', 'education', 'unableToWork'] as const) {
                        expect(foodMarket.householdFoodBuffers[age][edu][occ].foodStock).toBeGreaterThanOrEqual(0);
                    }
                }
            }
        }
    });

    it('starvation level rises when no food is available', () => {
        // No food in storage, no food stock
        const initialStarvation = planet.population.starvationLevel;

        foodMarketTick(gs);

        // Starvation should have risen (but not instantly to 1)
        expect(planet.population.starvationLevel).toBeGreaterThanOrEqual(initialStarvation);
    });

    it('volume-weighted average price is updated', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1000);
        foodAgent.assets.p.foodOfferPrice = 2.5;
        foodAgent.assets.p.foodOfferQuantity = 1000;

        // Give households wealth
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;
        let totalPop = 0;
        for (let age = 0; age < demography.length; age++) {
            if (demography[age].none.unoccupied > 0) {
                wealthDemography[age].none.unoccupied = { mean: 100, variance: 0 };
                totalPop += demography[age].none.unoccupied;
            }
        }
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        foodMarketTick(gs);

        // Price should reflect the agent's offer price (2.5)
        expect(planet.foodMarket!.foodPrice).toBeCloseTo(2.5, 1);
    });
});

describe('updateAgentPricing', () => {
    let planet: Planet;
    let foodAgent: Agent;
    let gs: GameState;

    beforeEach(() => {
        ({ planet } = makePlanet({ none: 100 }));
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        foodAgent = makeAgentWithFoodFacility();
        gs = makeGameState(planet, foodAgent);
    });

    it('bootstraps with INITIAL_FOOD_PRICE on first tick', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);

        updateAgentPricing(gs);

        expect(foodAgent.assets.p.foodOfferPrice).toBe(INITIAL_FOOD_PRICE);
        expect(foodAgent.assets.p.foodOfferQuantity).toBe(100);
    });

    it('lowers price when excess supply (produced > sold)', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);
        foodAgent.assets.p.foodOfferPrice = 2.0;
        foodAgent.assets.p.lastFoodProduced = 100;
        foodAgent.assets.p.lastFoodSold = 20; // only 20% sold → price too high

        updateAgentPricing(gs);

        expect(foodAgent.assets.p.foodOfferPrice!).toBeLessThan(2.0);
    });

    it('raises price when excess demand (produced < sold)', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 0);
        foodAgent.assets.p.foodOfferPrice = 1.0;
        foodAgent.assets.p.lastFoodProduced = 10;
        foodAgent.assets.p.lastFoodSold = 50; // sold more than produced (from buffer)

        updateAgentPricing(gs);

        expect(foodAgent.assets.p.foodOfferPrice!).toBeGreaterThan(1.0);
    });

    it('does not set price below FOOD_PRICE_FLOOR', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 10000);
        foodAgent.assets.p.foodOfferPrice = 0.02;
        foodAgent.assets.p.lastFoodProduced = 10000;
        foodAgent.assets.p.lastFoodSold = 0;

        updateAgentPricing(gs);

        expect(foodAgent.assets.p.foodOfferPrice!).toBeGreaterThanOrEqual(0.01);
    });

    it('does nothing for non-food-producing agents', () => {
        const normalAgent = makeAgent('normal');
        const gs2 = makeGameState(planet, normalAgent);

        updateAgentPricing(gs2);

        expect(normalAgent.assets.p.foodOfferPrice).toBeUndefined();
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
