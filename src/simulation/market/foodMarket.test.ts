import { beforeEach, describe, expect, it } from 'vitest';

import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK, INITIAL_FOOD_PRICE } from '../constants';
import { putIntoStorageFacility } from '../planet/storage';
import type { Agent, GameState, Planet } from '../planet/planet';
import { forEachPopulationCohort, SKILL } from '../population/population';
import { agentMap, makeAgent, makeGameState as makeGS, makePlanetWithPopulation } from '../utils/testHelper';
import { automaticPricing } from './automaticPricing';
import { marketTick } from './market';
import { agriculturalProductResourceType } from '../planet/resources';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FOOD = agriculturalProductResourceType.name;

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

/** Helper: set a food offer on an agent for the agricultural product resource. */
function setFoodOffer(agent: Agent, offerPrice: number, offerQuantity?: number, lastSold?: number): void {
    agent.assets.p.market = {
        sell: {
            [FOOD]: {
                resource: agriculturalProductResourceType,
                offerPrice,
                offerQuantity,
                lastSold,
            },
        },
    };
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
        marketTick(agentMap(foodAgent), planet);
        // After running, marketPrices may or may not be set depending on offers
        // The key assertion is that it doesn't throw
    });

    it('collects per-agent ask orders from storage and sells food', () => {
        // Put food in the food agent's storage
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 500);
        // Set up agent pricing (bootstrap)
        automaticPricing(agentMap(foodAgent), planet);

        // Give households wealth so they can buy
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        marketTick(agentMap(foodAgent), planet);

        // Food agent should have recorded lastSold
        expect(foodAgent.assets.p.market?.sell[FOOD]?.lastSold).toBeDefined();
        // Storage should be reduced (food was sold)
        const remaining = foodAgent.assets.p.storageFacility.currentInStorage[FOOD]?.quantity ?? 0;
        expect(remaining).toBeLessThan(500);
    });

    it('households with wealth purchase food from the market', () => {
        const totalPop = giveHouseholdsWealth(planet, 100);

        // Provide household deposits
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        // Put food in the food agent's storage and set pricing
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 10000);
        automaticPricing(agentMap(foodAgent), planet);

        marketTick(agentMap(foodAgent), planet);

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
        automaticPricing(agentMap(foodAgent), planet);

        // zero out existing food stock explicitly (should already be zero)
        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                cat.inventory = {};
            }),
        );

        marketTick(agentMap(foodAgent), planet);

        // after tick, avg inventory per person should equal the single buffer target
        const expected = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
        // Population lives at ages 14–64 (MIN_EMPLOYABLE_AGE upwards); age 0 is empty.
        const cat = planet.population.demography[14].unoccupied.none.novice;
        expect(cat.total).toBeGreaterThan(0); // sanity: cell is populated
        expect((cat.inventory[FOOD] ?? 0) / cat.total).toBeCloseTo(expected, 5);
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
                cat.inventory = {};
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
        setFoodOffer(foodAgent, 0.5, supplyQty);

        const poorFoodBefore = poorCat.inventory[FOOD] ?? 0;
        const richFoodBefore = richCat.inventory[FOOD] ?? 0;

        marketTick(agentMap(foodAgent), planet);

        // Rich cohort should have received food (higher bid wins priority)
        expect(richCat.inventory[FOOD] ?? 0).toBeGreaterThan(richFoodBefore);
        // Poor cohort may receive nothing (shortage → price priority excludes them)
        // At least rich received at least as much as poor
        expect((richCat.inventory[FOOD] ?? 0) - richFoodBefore).toBeGreaterThanOrEqual(
            (poorCat.inventory[FOOD] ?? 0) - poorFoodBefore,
        );
    });

    it('ask-price priority: cheapest agent sells first', () => {
        // Create two food agents with different prices
        const cheapAgent = makeAgentWithFoodFacility('cheap');
        const expensiveAgent = makeAgentWithFoodFacility('expensive');

        putIntoStorageFacility(cheapAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);
        putIntoStorageFacility(expensiveAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);

        setFoodOffer(cheapAgent, 1.0, 100);
        setFoodOffer(expensiveAgent, 5.0, 100);

        // Households need bid prices ≥ cheap ask (1.0).
        // bidPrice = wealth / desiredPerPerson = wealth / (FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK)
        // desiredPerPerson ≈ 0.0833 → wealth must be > 0.0833 to bid above 1.0
        // Use wealth = 0.5 → bidPrice ≈ 6.0 → can afford cheap (ask=1.0) but not expensive (ask=5.0) after buffer
        const totalPop = giveHouseholdsWealth(planet, 0.5);
        planet.bank.householdDeposits = totalPop * 0.5;
        planet.bank.deposits = totalPop * 0.5;

        marketTick(agentMap(cheapAgent, expensiveAgent), planet);

        // Cheap agent should have sold some food (bid ≥ cheap ask)
        expect(cheapAgent.assets.p.market?.sell[FOOD]?.lastSold).toBeGreaterThan(0);
        // Cheap agent sells more than (or at least as much as) expensive agent
        const cheapSold = cheapAgent.assets.p.market?.sell[FOOD]?.lastSold ?? 0;
        const expensiveSold = expensiveAgent.assets.p.market?.sell[FOOD]?.lastSold ?? 0;
        expect(cheapSold).toBeGreaterThanOrEqual(expensiveSold);
    });

    it('bid below ask price → no trade occurs', () => {
        // Agent asks very high; households cannot afford
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 500);
        setFoodOffer(foodAgent, 1_000_000, 500);

        const totalPop = giveHouseholdsWealth(planet, 0.001); // tiny wealth
        planet.bank.householdDeposits = totalPop * 0.001;
        planet.bank.deposits = totalPop * 0.001;

        const depositsBefore = planet.bank.householdDeposits;

        marketTick(agentMap(foodAgent), planet);

        // No food should have been sold — bid prices are all below the ask
        expect(foodAgent.assets.p.market?.sell[FOOD]?.lastSold ?? 0).toBe(0);
        // Household deposits unchanged
        expect(planet.bank.householdDeposits).toBeCloseTo(depositsBefore, 6);
    });

    it('revenue flows directly to selling agents', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1000);

        foodAgent.assets[planet.id].deposits = 0;
        automaticPricing(agentMap(foodAgent), planet);

        // Give households wealth
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        marketTick(agentMap(foodAgent), planet);

        // Food agent should have received revenue
        expect(foodAgent.assets.p.deposits).toBeGreaterThan(0);
    });

    it('monetary conservation: householdDeposits decrease equals agent deposit increase', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1000);
        setFoodOffer(foodAgent, 1.0, 1000);
        foodAgent.assets.p.deposits = 0;

        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        const householdBefore = planet.bank.householdDeposits;
        const agentBefore = foodAgent.assets.p.deposits;

        marketTick(agentMap(foodAgent), planet);

        const householdDelta = householdBefore - planet.bank.householdDeposits;
        const agentDelta = foodAgent.assets.p.deposits - agentBefore;

        // Money transferred out of households equals money credited to agents
        expect(agentDelta).toBeCloseTo(householdDelta, 6);
    });

    it('does not produce negative food stock', () => {
        marketTick(agentMap(foodAgent), planet);

        const demography = planet.population.demography;
        for (let age = 0; age < demography.length; age++) {
            forEachPopulationCohort(demography[age], (cat) => {
                if (cat.total > 0) {
                    expect(cat.inventory[FOOD] ?? 0).toBeGreaterThanOrEqual(0);
                }
            });
        }
    });

    it('volume-weighted average price is updated', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1000);
        setFoodOffer(foodAgent, 2.5, 1000);

        // Give households wealth
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        marketTick(agentMap(foodAgent), planet);

        // Price should reflect the agent's ask price (2.5)
        expect(planet.marketPrices[FOOD]).toBeCloseTo(2.5, 1);
    });

    it('persists lastMarketResult snapshot on planet', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 500);
        setFoodOffer(foodAgent, 1.0, 500);

        const totalPop = giveHouseholdsWealth(planet, 50);
        planet.bank.householdDeposits = totalPop * 50;
        planet.bank.deposits = totalPop * 50;

        marketTick(agentMap(foodAgent), planet);

        const result = planet.lastMarketResult[FOOD];
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

    it('lastMarketResult.unfilledDemand is positive when supply is scarce', () => {
        // Tiny supply relative to population demand
        const tinySupply = 0.001;
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, tinySupply);
        setFoodOffer(foodAgent, 1.0, tinySupply);

        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        marketTick(agentMap(foodAgent), planet);

        expect(planet.lastMarketResult[FOOD]!.unfilledDemand).toBeGreaterThan(0);
    });

    it('lastMarketResult.unsoldSupply is positive when demand is insufficient', () => {
        // Massive supply, households have almost no wealth → little demand
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 1e6);
        setFoodOffer(foodAgent, 1.0, 1e6);

        const totalPop = giveHouseholdsWealth(planet, 0.00001); // near-zero wealth
        planet.bank.householdDeposits = totalPop * 0.00001;
        planet.bank.deposits = totalPop * 0.00001;

        marketTick(agentMap(foodAgent), planet);

        expect(planet.lastMarketResult[FOOD]!.unsoldSupply).toBeGreaterThan(0);
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

        automaticPricing(agentMap(foodAgent), planet);

        expect(foodAgent.assets.p.market?.sell[FOOD]?.offerPrice).toBe(INITIAL_FOOD_PRICE);
        expect(foodAgent.assets.p.market?.sell[FOOD]?.offerQuantity).toBe(100);
    });

    it('lowers price when excess supply (produced > sold)', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 100);
        setFoodOffer(foodAgent, 2.0, undefined, 20); // only 20% sold → price too high

        automaticPricing(agentMap(foodAgent), planet);

        expect(foodAgent.assets.p.market!.sell[FOOD]!.offerPrice!).toBeLessThan(2.0);
    });

    it('raises price when excess demand (produced < sold)', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 0);
        setFoodOffer(foodAgent, 1.0, undefined, 50); // sold more than produced (from buffer)

        automaticPricing(agentMap(foodAgent), planet);

        expect(foodAgent.assets.p.market!.sell[FOOD]!.offerPrice!).toBeGreaterThan(1.0);
    });

    it('does not set price below FOOD_PRICE_FLOOR', () => {
        putIntoStorageFacility(foodAgent.assets.p.storageFacility, agriculturalProductResourceType, 10000);
        setFoodOffer(foodAgent, 0.02, undefined, 0);

        automaticPricing(agentMap(foodAgent), planet);

        expect(foodAgent.assets.p.market!.sell[FOOD]!.offerPrice!).toBeGreaterThanOrEqual(0.01);
    });
});
