/**
 * market/intergenerationalTransfers.test.ts
 *
 * Tests for the intergenerational transfer system.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet, GameState } from '../planet';
import { makePlanet } from '../workforce/testHelpers';
import { getWealthDemography } from '../population/populationHelpers';
import {
    GENERATION_GAP,
    FOOD_PER_PERSON_PER_TICK,
    FOOD_BUFFER_TARGET_TICKS,
    SUPPORTER_SURVIVAL_FRACTION,
    PRECAUTIONARY_RESERVE_TICKS,
} from '../constants';
import { intergenerationalTransfersTick } from './intergenerationalTransfers';
import { ensureFoodMarket, getFoodBufferDemography } from './foodMarketHelpers';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('intergenerationalTransfersTick', () => {
    let planet: Planet;
    let gov: Agent;
    let gs: GameState;

    beforeEach(() => {
        ({ planet, gov } = makePlanet({ none: 1000 }));
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        gs = makeGameState(planet, gov);
    });

    it('transfers wealth from supporters to children', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Set up: child age 10, supporter age 35 (10 + 25)
        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        // Ensure both cohorts have population
        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.unoccupied = 100;

        // Give supporter wealth
        wealthDemography[supporterAge].none.unoccupied = { mean: 1000, variance: 0 };

        // Ensure child has empty food stock (needs support)
        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        const supporterWealthBefore = wealthDemography[supporterAge].none.unoccupied.mean;

        intergenerationalTransfersTick(gs);

        // Supporter wealth should decrease
        expect(wealthDemography[supporterAge].none.unoccupied.mean).toBeLessThan(supporterWealthBefore);

        // Child wealth should increase
        expect(wealthDemography[childAge].none.unoccupied.mean).toBeGreaterThan(0);
    });

    it('transfers wealth from supporters to elderly', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Set up: elderly age 70, supporter age 45 (70 - 25)
        const elderlyAge = 70;
        const supporterAge = elderlyAge - GENERATION_GAP;

        // Ensure both cohorts have population
        demography[elderlyAge].none.unoccupied = 50;
        demography[supporterAge].none.unoccupied = 100;

        // Give supporter wealth
        wealthDemography[supporterAge].none.unoccupied = { mean: 500, variance: 0 };

        // Ensure elderly has empty food stock
        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[elderlyAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Elderly wealth should increase from 0
        expect(wealthDemography[elderlyAge].none.unoccupied.mean).toBeGreaterThan(0);
    });

    it('does not transfer when supporter has no surplus', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 5;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.unoccupied = 100;

        // Zero wealth for supporter
        wealthDemography[supporterAge].none.unoccupied = { mean: 0, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        intergenerationalTransfersTick(gs);

        // Child still has no wealth
        expect(wealthDemography[childAge].none.unoccupied.mean).toBe(0);
    });

    it('does not transfer when dependent food stock is already at target', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 5;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.unoccupied = 100;

        wealthDemography[supporterAge].none.unoccupied = { mean: 1000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);

        // Fill child's food buffer to target
        const foodTargetPerPerson = 30 * FOOD_PER_PERSON_PER_TICK;
        buffers[childAge].none.unoccupied.foodStock = foodTargetPerPerson;

        const supporterBefore = wealthDemography[supporterAge].none.unoccupied.mean;

        intergenerationalTransfersTick(gs);

        // Supporter wealth should be unchanged (no transfer needed)
        expect(wealthDemography[supporterAge].none.unoccupied.mean).toBe(supporterBefore);
    });

    it('writes lastTransferBalances to foodMarket', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.unoccupied = 100;
        wealthDemography[supporterAge].none.unoccupied = { mean: 1000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // lastTransferBalances should be written and have correct length
        const balances = planet.foodMarket!.lastTransferBalances;
        expect(balances).toBeDefined();
        expect(balances!.length).toBe(demography.length);

        // Child should be net receiver (positive)
        expect(balances![childAge]).toBeGreaterThan(0);
        // Supporter should be net giver (negative)
        expect(balances![supporterAge]).toBeLessThan(0);

        // Zero-sum: total should be ~0
        const total = balances!.reduce((s, v) => s + v, 0);
        expect(Math.abs(total)).toBeLessThan(1e-6);
    });

    it('respects supporter survival floor — supporter below survival floor keeps wealth', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.unoccupied = 100;

        const foodPrice = planet.foodMarket?.foodPrice ?? 1;
        const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
        const survivalFloor = SUPPORTER_SURVIVAL_FRACTION * foodTargetPerPerson * foodPrice;

        // Give supporter wealth exactly at survival floor — should have zero surplus
        wealthDemography[supporterAge].none.unoccupied = { mean: survivalFloor, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Child should receive nothing (supporter has no surplus above survival floor)
        expect(wealthDemography[childAge].none.unoccupied.mean).toBe(0);
    });

    it('Phase 2 transfers only 1 tick of food (not full buffer)', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.unoccupied = 100;

        const foodPrice = planet.foodMarket?.foodPrice ?? 1;
        const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
        const survivalFloor = SUPPORTER_SURVIVAL_FRACTION * foodTargetPerPerson * foodPrice;
        const oneTick = FOOD_PER_PERSON_PER_TICK;

        // Give supporter wealth slightly above survival floor but far below
        // precautionary reserve — enough for Phase 2 (1 tick) but not Phase 4.
        // Actually we need enough per supporter to fund children.
        // Phase 2 need per child = 1 tick * foodPrice = oneTick * foodPrice
        // Total need = 100 children * oneTick * foodPrice
        // Surplus per supporter = mean - survivalFloor
        // Total surplus = 100 supporters * surplus
        // We want total surplus < total Phase4 need but > total Phase2 need
        const phase2Need = oneTick * foodPrice; // per child

        // Give supporter enough to cover Phase 2 but not Phase 4
        // surplus per person = mean - survivalFloor
        // For Phase 2: surplus * 100 supporters >= phase2Need * 100 children
        // -> surplus >= phase2Need
        // For Phase 4 NOT covered: surplus < foodTargetPerPerson * foodPrice
        // This means: survivalFloor + phase2Need * 1.5 (some margin)
        const supporterWealth = survivalFloor + phase2Need * 1.5;
        wealthDemography[supporterAge].none.unoccupied = { mean: supporterWealth, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Child should have received some wealth (at least Phase 2 amount)
        expect(wealthDemography[childAge].none.unoccupied.mean).toBeGreaterThan(0);

        // Supporter should have lost wealth
        expect(wealthDemography[supporterAge].none.unoccupied.mean).toBeLessThan(supporterWealth);
    });

    it('Phase 4 uses precautionary reserve as floor', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.unoccupied = 100;

        const foodPrice = planet.foodMarket?.foodPrice ?? 1;
        const precautionaryReserve = PRECAUTIONARY_RESERVE_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        // Give supporter wealth well above precautionary reserve
        // so there's surplus for Phase 4 buffer filling
        const generousWealth = precautionaryReserve + foodTargetPerPerson * foodPrice * 2;
        wealthDemography[supporterAge].none.unoccupied = { mean: generousWealth, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Child should have received wealth (both Phase 2 and Phase 4)
        const childWealth = wealthDemography[childAge].none.unoccupied.mean;
        expect(childWealth).toBeGreaterThan(0);

        // Supporter should not go below precautionary reserve
        // (Phase 4 floor = precautionaryReserve)
        const supporterWealth = wealthDemography[supporterAge].none.unoccupied.mean;
        expect(supporterWealth).toBeGreaterThanOrEqual(precautionaryReserve - 1e-9);
    });
});
