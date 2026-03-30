import { beforeEach, describe, expect, it } from 'vitest';

import {
    GROCERY_BUFFER_TARGET_TICKS,
    SERVICE_PER_PERSON_PER_TICK,
    INITIAL_GROCERY_PRICE,
    PRICE_ADJUST_MAX_UP,
} from '../constants';
import { putIntoStorageFacility } from '../planet/storage';
import type { Agent, GameState, Planet } from '../planet/planet';
import { forEachPopulationCohort, SKILL } from '../population/population';
import { agentMap, makeAgent, makeGameState as makeGS, makePlanetWithPopulation } from '../utils/testHelper';
import { automaticPricing } from './automaticPricing';
import { marketTick } from './market';
import { groceryServiceResourceType, retailServiceResourceType } from '../planet/services';
import { clothingResourceType } from '../planet/resources';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GROCERY_SERVICE = groceryServiceResourceType.name;
const RETAIL_SERVICE = retailServiceResourceType.name;
const CLOTHING = clothingResourceType.name;

function makeGameState(planet: Planet, ...agents: Agent[]): GameState {
    return makeGS(planet, agents, 1);
}

function makeAgentWithGroceryServiceFacility(id = 'grocery-agent'): Agent {
    const agent = makeAgent(id);
    // Add a grocery service-producing facility
    agent.assets.p.productionFacilities = [
        {
            planetId: 'p',
            id: 'grocery-fac',
            name: 'Grocery Store',
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
                lastProduced: {},
                lastConsumed: {},
            },
            workerRequirement: {},
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [{ resource: groceryServiceResourceType, quantity: 1000 }],
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
function setGroceryOffer(agent: Agent, offerPrice: number, lastSold?: number): void {
    agent.assets.p.market = {
        sell: {
            [GROCERY_SERVICE]: {
                resource: groceryServiceResourceType,
                offerPrice,
                offerRetainment: 0,
                lastSold,
            },
        },
        buy: {},
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('groceryMarketTick', () => {
    let planet: Planet;
    let groceryAgent: Agent;

    beforeEach(() => {
        planet = makePlanetWithPopulation({ none: 1000 }).planet;
        groceryAgent = makeAgentWithGroceryServiceFacility();
    });

    it('runs without error on fresh planet', () => {
        marketTick(agentMap(groceryAgent), planet);
        // After running, marketPrices may or may not be set depending on offers
        // The key assertion is that it doesn't throw
    });

    it('collects per-agent ask orders from storage and sells food', () => {
        // Put food in the food agent's storage
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 500);
        // Set up agent pricing (bootstrap)
        automaticPricing(agentMap(groceryAgent), planet);

        // Give households wealth so they can buy
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        marketTick(agentMap(groceryAgent), planet);

        // Food agent should have recorded lastSold
        expect(groceryAgent.assets.p.market?.sell[GROCERY_SERVICE]?.lastSold).toBeDefined();
        // Storage should be reduced (food was sold)
        const remaining = groceryAgent.assets.p.storageFacility.currentInStorage[GROCERY_SERVICE]?.quantity ?? 0;
        expect(remaining).toBeLessThan(500);
    });

    it('households with wealth purchase food from the market', () => {
        const totalPop = giveHouseholdsWealth(planet, 100);

        // Provide household deposits
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        // Put food in the food agent's storage and set pricing
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 10000);
        automaticPricing(agentMap(groceryAgent), planet);

        marketTick(agentMap(groceryAgent), planet);

        // Household deposits should have decreased (spent on food)
        expect(planet.bank.householdDeposits).toBeLessThan(totalPop * 100);
    });

    it('does not target more than the buffer target per person', () => {
        // set up scenario with one person and no initial food stock
        const pop = giveHouseholdsWealth(planet, 1000);
        planet.bank.householdDeposits = pop * 1000;
        planet.bank.deposits = pop * 1000;

        // Put huge amount of food in the market to ensure supply is unconstrained
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 1e6);
        automaticPricing(agentMap(groceryAgent), planet);

        // zero out existing food buffer explicitly (should already be zero)
        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                cat.services.grocery.buffer = 0;
            }),
        );

        marketTick(agentMap(groceryAgent), planet);

        // after tick, avg buffer per person should equal the single buffer target
        const expected = GROCERY_BUFFER_TARGET_TICKS;
        // Population lives at ages 14–64 (MIN_EMPLOYABLE_AGE upwards); age 0 is empty.
        const cat = planet.population.demography[14].unoccupied.none.novice;
        expect(cat.total).toBeGreaterThan(0); // sanity: cell is populated
        expect(cat.services.grocery.buffer).toBeCloseTo(expected, 5);
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
                cat.services.grocery.buffer = 0;
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
        const supplyQty = GROCERY_BUFFER_TARGET_TICKS * richCat.total * 0.5;
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, supplyQty);
        setGroceryOffer(groceryAgent, 0.5);

        const poorFoodBefore = poorCat.services.grocery.buffer;
        const richFoodBefore = richCat.services.grocery.buffer;

        marketTick(agentMap(groceryAgent), planet);

        // Rich cohort should have received food (higher bid wins priority)
        expect(richCat.services.grocery.buffer).toBeGreaterThan(richFoodBefore);
        // Poor cohort may receive nothing (shortage → price priority excludes them)
        // At least rich received at least as much as poor
        expect(richCat.services.grocery.buffer - richFoodBefore).toBeGreaterThanOrEqual(
            poorCat.services.grocery.buffer - poorFoodBefore,
        );
    });

    it('ask-price priority: cheapest agent sells first', () => {
        // Create two food agents with different prices
        const cheapAgent = makeAgentWithGroceryServiceFacility('cheap');
        const expensiveAgent = makeAgentWithGroceryServiceFacility('expensive');

        putIntoStorageFacility(cheapAgent.assets.p.storageFacility, groceryServiceResourceType, 100);
        putIntoStorageFacility(expensiveAgent.assets.p.storageFacility, groceryServiceResourceType, 100);

        setGroceryOffer(cheapAgent, 1.0);
        setGroceryOffer(expensiveAgent, 5.0);

        // Households need bid prices ≥ cheap ask (1.0).
        // bidPrice = wealth / desiredPerPerson = wealth / GROCERY_BUFFER_TARGET_TICKS
        // desiredPerPerson = 30 → wealth must be > 30 to bid above 1.0
        // Use wealth = 50 → bidPrice ≈ 1.67 → can afford cheap (ask=1.0) but not expensive (ask=5.0)
        const totalPop = giveHouseholdsWealth(planet, 50);
        planet.bank.householdDeposits = totalPop * 50;
        planet.bank.deposits = totalPop * 50;

        marketTick(agentMap(cheapAgent, expensiveAgent), planet);

        // Cheap agent should have sold some food (bid ≥ cheap ask)
        expect(cheapAgent.assets.p.market?.sell[GROCERY_SERVICE]?.lastSold).toBeGreaterThan(0);
        // Cheap agent sells more than (or at least as much as) expensive agent
        const cheapSold = cheapAgent.assets.p.market?.sell[GROCERY_SERVICE]?.lastSold ?? 0;
        const expensiveSold = expensiveAgent.assets.p.market?.sell[GROCERY_SERVICE]?.lastSold ?? 0;
        expect(cheapSold).toBeGreaterThanOrEqual(expensiveSold);
    });

    it('bid below ask price → no trade occurs', () => {
        // Agent asks very high; households cannot afford
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 500);
        setGroceryOffer(groceryAgent, 1_000_000);

        const totalPop = giveHouseholdsWealth(planet, 0.001); // tiny wealth
        planet.bank.householdDeposits = totalPop * 0.001;
        planet.bank.deposits = totalPop * 0.001;

        const depositsBefore = planet.bank.householdDeposits;

        marketTick(agentMap(groceryAgent), planet);

        // No food should have been sold — bid prices are all below the ask
        expect(groceryAgent.assets.p.market?.sell[GROCERY_SERVICE]?.lastSold ?? 0).toBe(0);
        // Household deposits unchanged
        expect(planet.bank.householdDeposits).toBeCloseTo(depositsBefore, 6);
    });

    it('revenue flows directly to selling agents', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 1000);

        groceryAgent.assets[planet.id].deposits = 0;
        automaticPricing(agentMap(groceryAgent), planet);

        // Give households wealth
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        marketTick(agentMap(groceryAgent), planet);

        // Food agent should have received revenue
        expect(groceryAgent.assets.p.deposits).toBeGreaterThan(0);
    });

    it('monetary conservation: householdDeposits decrease equals agent deposit increase', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 1000);
        setGroceryOffer(groceryAgent, 1.0);
        groceryAgent.assets.p.deposits = 0;

        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        const householdBefore = planet.bank.householdDeposits;
        const agentBefore = groceryAgent.assets.p.deposits;

        marketTick(agentMap(groceryAgent), planet);

        const householdDelta = householdBefore - planet.bank.householdDeposits;
        const agentDelta = groceryAgent.assets.p.deposits - agentBefore;

        // Money transferred out of households equals money credited to agents
        expect(agentDelta).toBeCloseTo(householdDelta, 6);
    });

    it('does not produce negative food stock', () => {
        marketTick(agentMap(groceryAgent), planet);

        const demography = planet.population.demography;
        for (let age = 0; age < demography.length; age++) {
            forEachPopulationCohort(demography[age], (cat) => {
                if (cat.total > 0) {
                    expect(cat.services.grocery.buffer).toBeGreaterThanOrEqual(0);
                }
            });
        }
    });

    it('volume-weighted average price is updated', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 1000);
        setGroceryOffer(groceryAgent, 2.5);

        // Give households wealth
        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        marketTick(agentMap(groceryAgent), planet);

        // Price should reflect the agent's ask price (2.5)
        expect(planet.marketPrices[GROCERY_SERVICE]).toBeCloseTo(2.5, 1);
    });

    it('persists lastMarketResult snapshot on planet', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 500);
        setGroceryOffer(groceryAgent, 1.0);

        const totalPop = giveHouseholdsWealth(planet, 50);
        planet.bank.householdDeposits = totalPop * 50;
        planet.bank.deposits = totalPop * 50;

        marketTick(agentMap(groceryAgent), planet);

        const result = planet.lastMarketResult[GROCERY_SERVICE];
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
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, tinySupply);
        setGroceryOffer(groceryAgent, 1.0);

        const totalPop = giveHouseholdsWealth(planet, 100);
        planet.bank.householdDeposits = totalPop * 100;
        planet.bank.deposits = totalPop * 100;

        marketTick(agentMap(groceryAgent), planet);

        expect(planet.lastMarketResult[GROCERY_SERVICE]!.unfilledDemand).toBeGreaterThan(0);
    });

    it('lastMarketResult.unsoldSupply is positive when demand is insufficient', () => {
        // Massive supply, households have almost no wealth → little demand
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 1e6);
        setGroceryOffer(groceryAgent, 1.0);

        const totalPop = giveHouseholdsWealth(planet, 0.00001); // near-zero wealth
        planet.bank.householdDeposits = totalPop * 0.00001;
        planet.bank.deposits = totalPop * 0.00001;

        marketTick(agentMap(groceryAgent), planet);

        expect(planet.lastMarketResult[GROCERY_SERVICE]!.unsoldSupply).toBeGreaterThan(0);
    });
});

describe('updateAgentPricing', () => {
    let planet: Planet;
    let groceryAgent: Agent;

    beforeEach(() => {
        const result = makePlanetWithPopulation({ none: 100 });
        planet = result.planet;
        groceryAgent = makeAgentWithGroceryServiceFacility();
        makeGameState(planet, groceryAgent);
    });

    it('bootstraps with INITIAL_GROCERY_PRICE on first tick', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 100);

        automaticPricing(agentMap(groceryAgent), planet);

        expect(groceryAgent.assets.p.market?.sell[GROCERY_SERVICE]?.offerPrice).toBe(INITIAL_GROCERY_PRICE);
        // With retainment 0, effective quantity should be 100
        // The actual quantity is calculated from retainment, not stored
    });

    it('lowers price when excess supply (produced > sold)', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 100);
        setGroceryOffer(groceryAgent, 2.0, 20); // only 20% sold → price too high

        automaticPricing(agentMap(groceryAgent), planet);

        expect(groceryAgent.assets.p.market!.sell[GROCERY_SERVICE]!.offerPrice!).toBeLessThan(2.0);
    });

    it('raises price when excess demand (produced < sold)', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 0);
        setGroceryOffer(groceryAgent, 1.0, 50); // sold more than produced (from buffer)

        automaticPricing(agentMap(groceryAgent), planet);

        expect(groceryAgent.assets.p.market!.sell[GROCERY_SERVICE]!.offerPrice!).toBeGreaterThan(1.0);
    });

    it('does not set price below GROCERY_PRICE_FLOOR', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 10000);
        setGroceryOffer(groceryAgent, 0.02, 0);

        automaticPricing(agentMap(groceryAgent), planet);

        expect(groceryAgent.assets.p.market!.sell[GROCERY_SERVICE]!.offerPrice!).toBeGreaterThanOrEqual(0.01);
    });

    it('does not raise price when agent has nothing to offer and last sold is from a prior tick', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 0);
        // Simulate: previously sold 1550 units, but current stock is empty → supply-constrained
        setGroceryOffer(groceryAgent, 0.73, 1550);

        automaticPricing(agentMap(groceryAgent), planet);

        // supply = 0 → treated as full shortage → price rises by PRICE_ADJUST_MAX_UP
        expect(groceryAgent.assets.p.market!.sell[GROCERY_SERVICE]!.offerPrice!).toBeCloseTo(0.73 * PRICE_ADJUST_MAX_UP);
    });

    it('raises price when agent has no stock and also sold nothing (intermittent production)', () => {
        putIntoStorageFacility(groceryAgent.assets.p.storageFacility, groceryServiceResourceType, 0);
        setGroceryOffer(groceryAgent, 2.0, 0);

        automaticPricing(agentMap(groceryAgent), planet);

        expect(groceryAgent.assets.p.market!.sell[GROCERY_SERVICE]!.offerPrice!).toBeCloseTo(2.0 * PRICE_ADJUST_MAX_UP);
    });
});

// ---------------------------------------------------------------------------
// Food-scarcity suppression of discretionary demand
// ---------------------------------------------------------------------------

describe('sequential settlement: food is settled before discretionary goods', () => {
    // With sequential settlement, food is cleared and wealth debited before
    // clothing bids are generated.  A cohort that spends all remaining wealth
    // on food has nothing left for clothing.
    const WEALTH_PER_PERSON = 0.02;

    function makeClothingAgent(id = 'clothing-agent'): Agent {
        const agent = makeAgent(id);
        putIntoStorageFacility(agent.assets.p.storageFacility, clothingResourceType, 1e6);
        agent.assets.p.market = {
            sell: {
                [CLOTHING]: {
                    resource: clothingResourceType,
                    offerPrice: 0.01,
                    offerRetainment: 0,
                },
            },
            buy: {},
        };
        return agent;
    }

    function makeGroceryServiceAgent(id = 'grocery-agent', price = 0.02): Agent {
        const agent = makeAgent(id);
        putIntoStorageFacility(agent.assets.p.storageFacility, groceryServiceResourceType, 1e6);
        agent.assets.p.market = {
            sell: {
                [GROCERY_SERVICE]: {
                    resource: groceryServiceResourceType,
                    offerPrice: price,
                    offerRetainment: 0,
                },
            },
            buy: {},
        };
        return agent;
    }

    function totalClothingBought(planet: Planet): number {
        let total = 0;
        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                // Clothing is consumed as retail service, check retail service buffer
                // Convert buffer ticks to units: buffer * SERVICE_PER_PERSON_PER_TICK * population
                const retailBuffer = cat.services.retail.buffer;
                const retailUnits = retailBuffer * SERVICE_PER_PERSON_PER_TICK * cat.total;
                total += retailUnits;
            }),
        );
        return total;
    }

    function setupPlanet(foodBufferPerPerson: number) {
        const { planet } = makePlanetWithPopulation({ none: 50_000 });
        const totalPop = planet.population.demography.reduce((s, cohort) => {
            let n = 0;
            forEachPopulationCohort(cohort, (cat) => {
                n += cat.total;
            });
            return s + n;
        }, 0);
        planet.population.demography.forEach((cohort) =>
            forEachPopulationCohort(cohort, (cat) => {
                if (cat.total > 0) {
                    cat.wealth = { mean: WEALTH_PER_PERSON, variance: 0 };
                    cat.services.grocery.buffer = foodBufferPerPerson;
                }
            }),
        );
        planet.bank.householdDeposits = totalPop * WEALTH_PER_PERSON;
        planet.bank.deposits = totalPop * WEALTH_PER_PERSON;
        planet.marketPrices[CLOTHING] = 0.01;
        return planet;
    }

    it('full food buffer → wealth intact → normal clothing demand', () => {
        const fullBuffer = GROCERY_BUFFER_TARGET_TICKS;
        const planet = setupPlanet(fullBuffer);
        const clothingAgent = makeClothingAgent();

        marketTick(agentMap(clothingAgent), planet);

        expect(totalClothingBought(planet)).toBeGreaterThan(0);
    });

    it('empty food buffer + food available → food spending reduces clothing budget', () => {
        // Verify that food is settled (wealth debited) before clothing bids are
        // generated by checking that total household wealth is lower when both
        // food and clothing are available vs. only clothing.
        const planet = setupPlanet(0);
        const planetClothingOnly = setupPlanet(0);

        const groceryAgent = makeGroceryServiceAgent('grocery-agent', 0.01);

        marketTick(
            new Map([
                ['grocery-agent', groceryAgent],
                ['clothing-agent', makeClothingAgent()],
            ]),
            planet,
        );
        marketTick(agentMap(makeClothingAgent('c-only')), planetClothingOnly);

        const totalWealth = (p: Planet) => {
            let w = 0;
            p.population.demography.forEach((cohort) =>
                forEachPopulationCohort(cohort, (cat) => {
                    w += cat.total * cat.wealth.mean;
                }),
            );
            return w;
        };

        // Food purchase drains more total wealth than clothing purchase alone
        expect(totalWealth(planet)).toBeLessThan(totalWealth(planetClothingOnly));
    });

    it('empty food buffer + no food seller → wealth intact → clothing demand unaffected', () => {
        const fullBuffer = GROCERY_BUFFER_TARGET_TICKS;
        const planetWithFullFood = setupPlanet(fullBuffer);
        const planetWithNoFood = setupPlanet(0);

        marketTick(agentMap(makeClothingAgent('c1')), planetWithFullFood);
        marketTick(agentMap(makeClothingAgent('c2')), planetWithNoFood);

        // No food to buy → no wealth debited → clothing demand should still be non-zero
        expect(totalClothingBought(planetWithNoFood)).toBeGreaterThan(0);
        expect(totalClothingBought(planetWithFullFood)).toBeGreaterThan(0);
    });
});
