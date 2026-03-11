/**
 * benchmarks/simulation/bench.market.ts
 *
 * Micro-benchmarks for the market subsystems:
 *   - updateAgentPricing
 *   - foodMarketTick   (merit-order clearing — the most complex market step)
 *   - intergenerationalTransfersTick
 *
 * We build worlds with varying numbers of food-producing agents and
 * population sizes to show how each step scales with market breadth.
 */

import { updateAgentPricing } from '../market/agentPricing';
import { foodMarketTick } from '../market/foodMarket';
import { intergenerationalTransfersForPlanet } from '../market/intergenerationalTransfers';
import type { EducationLevelType } from '../population/education';
import { makeStorageFacilityWithFood, makeWorld } from '../utils/testHelper';
import { BenchmarkSuite } from './bench.harness';

// ---------------------------------------------------------------------------
// Helpers — pre-seed storage so that agents actually have food to sell
// ---------------------------------------------------------------------------

/** Seed every agent's storage with food so the market has offers to clear. */
function seedFood(gs: ReturnType<typeof makeWorld>['gameState']): void {
    for (const agent of gs.agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            assets.storageFacility = makeStorageFacilityWithFood(1_000_000, planetId);
            // Set a starting offer price so agentPricing has a base to adjust from
            if (!assets.foodMarket) {
                assets.foodMarket = {};
            }
            assets.foodMarket.offerPrice = 1.0;
        }
    }
}

/** Pre-seed household wealth so households can afford food. */
function seedHouseholdWealth(gs: ReturnType<typeof makeWorld>['gameState']): void {
    for (const planet of gs.planets.values()) {
        planet.bank.householdDeposits = 1e10;
        for (const cohort of planet.population.demography) {
            for (const occ of Object.values(cohort)) {
                for (const eduSlot of Object.values(occ as object)) {
                    for (const cat of Object.values(eduSlot as object)) {
                        (cat as { wealth: { mean: number } }).wealth.mean = 100;
                    }
                }
            }
        }
    }
}

function makeMarketWorld(nCompanies: number, popSize: Partial<Record<EducationLevelType, number>>) {
    const { gameState } = makeWorld({
        populationByEdu: popSize,
        companyIds: Array.from({ length: nCompanies }, (_, i) => `food-co-${i}`),
    });
    seedFood(gameState);
    seedHouseholdWealth(gameState);
    return gameState;
}

export function marketSuite(): BenchmarkSuite {
    const suite = new BenchmarkSuite('Market subsystems');

    // -----------------------------------------------------------------------
    // updateAgentPricing
    // -----------------------------------------------------------------------

    suite.add(
        'agentPricing – 2 agents, 100K pop',
        () => makeMarketWorld(1, { none: 60_000, primary: 30_000, secondary: 8_000, tertiary: 2_000 }),
        (gs) => {
            updateAgentPricing(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 500, warmup: 50 },
    );

    suite.add(
        'agentPricing – 21 agents, 8M pop',
        () =>
            makeMarketWorld(20, {
                none: 4_800_000,
                primary: 2_400_000,
                secondary: 600_000,
                tertiary: 200_000,
            }),
        (gs) => {
            updateAgentPricing(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 100, warmup: 10 },
    );

    // -----------------------------------------------------------------------
    // foodMarketTick — merit-order clearing
    // -----------------------------------------------------------------------

    suite.add(
        'foodMarketTick – 2 agents, 100K pop',
        () => makeMarketWorld(1, { none: 60_000, primary: 30_000, secondary: 8_000, tertiary: 2_000 }),
        (gs) => {
            foodMarketTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'foodMarketTick – 6 agents, 1M pop',
        () => makeMarketWorld(5, { none: 500_000, primary: 300_000, secondary: 150_000, tertiary: 50_000 }),
        (gs) => {
            foodMarketTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 100, warmup: 10 },
    );

    suite.add(
        'foodMarketTick – 21 agents, 8M pop',
        () =>
            makeMarketWorld(20, {
                none: 4_800_000,
                primary: 2_400_000,
                secondary: 600_000,
                tertiary: 200_000,
            }),
        (gs) => {
            foodMarketTick(gs.agents, Object.values(gs.planets)[0]);
        },
        { iterations: 30, warmup: 5 },
    );

    // -----------------------------------------------------------------------
    // intergenerationalTransfersTick
    // -----------------------------------------------------------------------

    suite.add(
        'intergenerationalTransfers – 100K pop',
        () => makeMarketWorld(1, { none: 60_000, primary: 30_000, secondary: 8_000, tertiary: 2_000 }),
        (gs) => {
            intergenerationalTransfersForPlanet(Object.values(gs.planets)[0]);
        },
        { iterations: 300, warmup: 30 },
    );

    suite.add(
        'intergenerationalTransfers – 8M pop',
        () =>
            makeMarketWorld(5, {
                none: 4_800_000,
                primary: 2_400_000,
                secondary: 600_000,
                tertiary: 200_000,
            }),
        (gs) => {
            intergenerationalTransfersForPlanet(Object.values(gs.planets)[0]);
        },
        { iterations: 50, warmup: 5 },
    );

    return suite;
}
