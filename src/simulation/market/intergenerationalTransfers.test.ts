/**
 * market/intergenerationalTransfers.test.ts
 *
 * Comprehensive tests for the intergenerational transfer system.
 *
 * Covers:
 *   - Multi-modal Gaussian weight kernel (parent, grandparent, great-grandparent peaks)
 *   - Continuous support capacity curve (ramp, plateau, decline, elderly)
 *   - Age-appropriate survival floor (working-age vs elderly)
 *   - Cross-education transfers (no education matching)
 *   - Intra-cohort support (spousal / peer pooling)
 *   - Survival floor enforcement
 *   - Precautionary reserve floor in Phase 3
 *   - Wealth conservation (zero-sum balances)
 *   - Inequality-sensitive surplus (variance friction)
 *   - Need-weighted credit distribution
 *   - Friction-weighted debit distribution
 *   - Elderly as supporters (rich elderly give to younger generations)
 *   - Edge cases: empty planet, single person, starvation, all elderly, all children
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet, GameState } from '../planet';
import { educationLevelKeys, OCCUPATIONS } from '../planet';
import { makePlanet } from '../workforce/testHelpers';
import { getWealthDemography } from '../population/populationHelpers';
import {
    GENERATION_GAP,
    FOOD_PER_PERSON_PER_TICK,
    FOOD_BUFFER_TARGET_TICKS,
    SUPPORTER_SURVIVAL_FRACTION,
    PRECAUTIONARY_RESERVE_TICKS,
    ELDERLY_MIN_AGE,
    ELDERLY_FLOOR_FRACTION,
    GENERATION_KERNEL_N,
} from '../constants';
import {
    intergenerationalTransfersTick,
    supportWeight,
    effectiveSurplus,
    supportCapacity,
    survivalFloorForAge,
} from './intergenerationalTransfers';
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

/** Compute total wealth across all age × edu × occ cells. */
function totalWealth(planet: Planet): number {
    const wd = getWealthDemography(planet.population);
    const dem = planet.population.demography;
    let total = 0;
    for (let age = 0; age < dem.length; age++) {
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                total += wd[age][edu][occ].mean * dem[age][edu][occ];
            }
        }
    }
    return total;
}

// ===========================================================================
// Unit tests: supportWeight (multi-modal kernel)
// ===========================================================================

describe('supportWeight', () => {
    it('peaks at GENERATION_GAP (n=1)', () => {
        expect(supportWeight(GENERATION_GAP)).toBeCloseTo(1.0, 10);
    });

    it('peaks at 2 × GENERATION_GAP (n=2, grandparent)', () => {
        expect(supportWeight(2 * GENERATION_GAP)).toBeCloseTo(1.0, 10);
    });

    it('peaks at 3 × GENERATION_GAP (n=3, great-grandparent)', () => {
        if (GENERATION_KERNEL_N >= 3) {
            expect(supportWeight(3 * GENERATION_GAP)).toBeCloseTo(1.0, 10);
        }
    });

    it('decays for age differences away from any peak', () => {
        const peak = supportWeight(GENERATION_GAP);
        const farAway = supportWeight(GENERATION_GAP + 20);
        expect(farAway).toBeLessThan(peak);
        expect(farAway).toBeGreaterThan(0);
    });

    it('is symmetric around each peak', () => {
        const below = supportWeight(GENERATION_GAP - 5);
        const above = supportWeight(GENERATION_GAP + 5);
        expect(below).toBeCloseTo(above, 10);

        // Also for n=2 peak
        const below2 = supportWeight(2 * GENERATION_GAP - 5);
        const above2 = supportWeight(2 * GENERATION_GAP + 5);
        expect(below2).toBeCloseTo(above2, 10);
    });

    it('valley between peaks is lower than peaks', () => {
        // Midpoint between n=1 and n=2 peak
        const midpoint = 1.5 * GENERATION_GAP; // = 37.5
        const valleyWeight = supportWeight(midpoint);
        expect(valleyWeight).toBeLessThan(1.0);
        // But still > 0 (continuous)
        expect(valleyWeight).toBeGreaterThan(0);
    });

    it('has non-zero weight at age difference 0', () => {
        const w = supportWeight(0);
        expect(w).toBeGreaterThan(0);
        // But less than the peak
        expect(w).toBeLessThan(1.0);
    });

    it('negative age difference gives same result as positive', () => {
        expect(supportWeight(-GENERATION_GAP)).toBeCloseTo(supportWeight(GENERATION_GAP), 10);
        expect(supportWeight(-50)).toBeCloseTo(supportWeight(50), 10);
    });
});

// ===========================================================================
// Unit tests: supportCapacity (continuous curve)
// ===========================================================================

describe('supportCapacity', () => {
    it('returns 0 for children (age < 16)', () => {
        expect(supportCapacity(0)).toBe(0);
        expect(supportCapacity(10)).toBe(0);
        expect(supportCapacity(15)).toBe(0);
    });

    it('ramps from 0 to 1 between ages 16 and 22', () => {
        expect(supportCapacity(16)).toBeCloseTo(0, 10);
        expect(supportCapacity(19)).toBeCloseTo(0.5, 10);
        expect(supportCapacity(22)).toBeCloseTo(1.0, 10);
    });

    it('is monotonically increasing in the ramp', () => {
        for (let age = 16; age < 22; age++) {
            expect(supportCapacity(age + 1)).toBeGreaterThan(supportCapacity(age));
        }
    });

    it('returns 1.0 for prime working age (22-60)', () => {
        expect(supportCapacity(22)).toBe(1);
        expect(supportCapacity(30)).toBe(1);
        expect(supportCapacity(45)).toBe(1);
        expect(supportCapacity(60)).toBe(1);
    });

    it('declines gently from 60 to 75', () => {
        expect(supportCapacity(60)).toBe(1);
        expect(supportCapacity(75)).toBeCloseTo(0.4, 10);
        // Monotonic decline
        for (let age = 60; age < 75; age++) {
            expect(supportCapacity(age + 1)).toBeLessThan(supportCapacity(age));
        }
    });

    it('declines steeply from 75 to 100', () => {
        expect(supportCapacity(75)).toBeCloseTo(0.4, 10);
        expect(supportCapacity(100)).toBeCloseTo(0.1, 10);
        // Monotonic decline
        for (let age = 75; age < 100; age++) {
            expect(supportCapacity(age + 1)).toBeLessThan(supportCapacity(age));
        }
    });

    it('never returns negative', () => {
        for (let age = 0; age <= 100; age++) {
            expect(supportCapacity(age)).toBeGreaterThanOrEqual(0);
        }
    });

    it('elderly at 80 still have positive capacity', () => {
        expect(supportCapacity(80)).toBeGreaterThan(0);
    });
});

// ===========================================================================
// Unit tests: survivalFloorForAge
// ===========================================================================

describe('survivalFloorForAge', () => {
    const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * 1.0; // price=1

    it('returns working-age floor for young adults', () => {
        expect(survivalFloorForAge(30, baseFoodCost)).toBeCloseTo(SUPPORTER_SURVIVAL_FRACTION * baseFoodCost, 10);
    });

    it('returns elderly floor for old ages', () => {
        expect(survivalFloorForAge(80, baseFoodCost)).toBeCloseTo(ELDERLY_FLOOR_FRACTION * baseFoodCost, 10);
    });

    it('transitions smoothly near ELDERLY_MIN_AGE', () => {
        const workingFloor = survivalFloorForAge(ELDERLY_MIN_AGE - 6, baseFoodCost);
        const elderlyFloor = survivalFloorForAge(ELDERLY_MIN_AGE, baseFoodCost);
        const transitionFloor = survivalFloorForAge(ELDERLY_MIN_AGE - 3, baseFoodCost);

        // Transition value should be between working and elderly floor
        expect(transitionFloor).toBeLessThan(workingFloor);
        expect(transitionFloor).toBeGreaterThan(elderlyFloor);
    });

    it('elderly floor is lower than working-age floor', () => {
        const workingFloor = survivalFloorForAge(30, baseFoodCost);
        const elderlyFloor = survivalFloorForAge(80, baseFoodCost);
        expect(elderlyFloor).toBeLessThan(workingFloor);
    });
});

// ===========================================================================
// Unit tests: effectiveSurplus
// ===========================================================================

describe('effectiveSurplus', () => {
    it('returns full naive surplus when variance is 0', () => {
        expect(effectiveSurplus(100, 0, 50, 10)).toBe(500); // (100-50)*10
    });

    it('reduces surplus with higher variance', () => {
        const zeroVar = effectiveSurplus(100, 0, 50, 10);
        const highVar = effectiveSurplus(100, 10000, 50, 10); // cv²=1 → α=0.5
        expect(highVar).toBeLessThan(zeroVar);
        expect(highVar).toBeCloseTo(250, 5); // 0.5 * 50 * 10
    });

    it('returns 0 when mean is at or below floor', () => {
        expect(effectiveSurplus(50, 0, 50, 10)).toBe(0);
        expect(effectiveSurplus(30, 0, 50, 10)).toBe(0);
    });

    it('returns 0 for zero population', () => {
        expect(effectiveSurplus(100, 0, 50, 0)).toBe(0);
    });
});

// ===========================================================================
// Integration tests
// ===========================================================================

describe('intergenerationalTransfersTick', () => {
    let planet: Planet;
    let gov: Agent;
    let gs: GameState;

    beforeEach(() => {
        // Use empty population to avoid interference from pre-seeded cohorts.
        ({ planet, gov } = makePlanet({}));
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        gs = makeGameState(planet, gov);
    });

    // -----------------------------------------------------------------------
    // Basic child / elderly support
    // -----------------------------------------------------------------------

    it('transfers wealth from supporters to children', () => {
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

        expect(wealthDemography[supporterAge].none.unoccupied.mean).toBeLessThan(1000);
        expect(wealthDemography[childAge].none.unoccupied.mean).toBeGreaterThan(0);
    });

    it('transfers wealth from supporters to elderly', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const elderlyAge = 70;
        const supporterAge = elderlyAge - GENERATION_GAP;

        demography[elderlyAge].none.unoccupied = 50;
        demography[supporterAge].none.unoccupied = 100;
        wealthDemography[supporterAge].none.unoccupied = { mean: 500, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[elderlyAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[elderlyAge].none.unoccupied.mean).toBeGreaterThan(0);
    });

    it('does not transfer when supporter has no surplus', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 5;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.unoccupied = 100;
        wealthDemography[supporterAge].none.unoccupied = { mean: 0, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[childAge].none.unoccupied.mean).toBe(0);
    });

    it('does not transfer when dependent food stock is already at target', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 5;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.company = 100;
        wealthDemography[supporterAge].none.company = { mean: 1000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);

        const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
        buffers[childAge].none.unoccupied.foodStock = foodTargetPerPerson;

        const supporterBefore = wealthDemography[supporterAge].none.company.mean;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[supporterAge].none.company.mean).toBe(supporterBefore);
    });

    // -----------------------------------------------------------------------
    // Balances and conservation
    // -----------------------------------------------------------------------

    it('writes lastTransferBalances to foodMarket', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.company = 100;
        wealthDemography[supporterAge].none.company = { mean: 1000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        const balances = planet.foodMarket!.lastTransferBalances;
        expect(balances).toBeDefined();
        expect(balances!.length).toBe(demography.length);
        expect(balances![childAge]).toBeGreaterThan(0);

        // Zero-sum
        const total = balances!.reduce((s, v) => s + v, 0);
        expect(Math.abs(total)).toBeLessThan(1e-6);
    });

    it('conserves total wealth exactly', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        demography[5].none.unoccupied = 200;
        demography[15].none.unoccupied = 150;
        demography[30].none.company = 300;
        demography[30].none.unoccupied = 50;
        demography[40].primary.company = 200;
        demography[40].none.unableToWork = 30;
        demography[50].none.government = 100;
        demography[70].none.unoccupied = 100;
        demography[80].none.unoccupied = 50;

        wealthDemography[30].none.company = { mean: 500, variance: 0 };
        wealthDemography[40].primary.company = { mean: 800, variance: 100 };
        wealthDemography[50].none.government = { mean: 600, variance: 0 };
        // Wealthy elderly who also give
        wealthDemography[70].none.unoccupied = { mean: 2000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        const wealthBefore = totalWealth(planet);

        intergenerationalTransfersTick(gs);

        const wealthAfter = totalWealth(planet);
        expect(Math.abs(wealthAfter - wealthBefore)).toBeLessThan(1e-6);
    });

    // -----------------------------------------------------------------------
    // Survival floor
    // -----------------------------------------------------------------------

    it('respects survival floor — supporter at floor keeps wealth', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.company = 100;

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const foodPrice = foodMarket.foodPrice;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const floor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;

        wealthDemography[supporterAge].none.company = { mean: floor, variance: 0 };

        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[childAge].none.unoccupied.mean).toBe(0);
    });

    it('elderly have lower survival floor than working-age', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const foodPrice = foodMarket.foodPrice;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;

        // Give an elderly person wealth between elderly floor and working floor
        const elderlyAge = 80;
        const elderlyFloor = ELDERLY_FLOOR_FRACTION * baseFoodCost;
        const workingFloor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;
        const wealthBetween = (elderlyFloor + workingFloor) / 2;

        demography[elderlyAge].none.unoccupied = 100;
        wealthDemography[elderlyAge].none.unoccupied = { mean: wealthBetween, variance: 0 };

        // Create a child they can support
        const childAge = 5;
        demography[childAge].none.unoccupied = 100;

        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Elderly has wealth above their floor → should give
        // (but wouldn't give if they had the working-age floor)
        expect(wealthDemography[childAge].none.unoccupied.mean).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Phase 2 / Phase 3
    // -----------------------------------------------------------------------

    it('Phase 2 transfers only 1 tick of food (not full buffer)', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.company = 100;

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const foodPrice = foodMarket.foodPrice;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const floor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;
        const oneTick = FOOD_PER_PERSON_PER_TICK;
        const phase2Need = oneTick * foodPrice;

        // Give supporter enough for Phase 2 but not much more
        wealthDemography[supporterAge].none.company = { mean: floor + phase2Need * 1.5, variance: 0 };

        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[childAge].none.unoccupied.mean).toBeGreaterThan(0);
        expect(wealthDemography[supporterAge].none.company.mean).toBeLessThan(floor + phase2Need * 1.5);
    });

    it('Phase 3 uses precautionary reserve as floor', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].none.company = 100;

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const foodPrice = foodMarket.foodPrice;
        const precautionaryReserve = PRECAUTIONARY_RESERVE_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        const generousWealth = precautionaryReserve + foodTargetPerPerson * foodPrice * 2;
        wealthDemography[supporterAge].none.company = { mean: generousWealth, variance: 0 };

        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        const childWealth = wealthDemography[childAge].none.unoccupied.mean;
        expect(childWealth).toBeGreaterThan(0);

        const supporterWealthAfter = wealthDemography[supporterAge].none.company.mean;
        expect(supporterWealthAfter).toBeGreaterThanOrEqual(precautionaryReserve - 1e-9);
    });

    // -----------------------------------------------------------------------
    // Cross-education and intra-cohort
    // -----------------------------------------------------------------------

    it('transfers across different education levels (no edu matching)', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[supporterAge].primary.company = 100;
        wealthDemography[supporterAge].primary.company = { mean: 1000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[childAge].none.unoccupied.mean).toBeGreaterThan(0);
        expect(wealthDemography[supporterAge].primary.company.mean).toBeLessThan(1000);
    });

    it('supports same-age intra-cohort transfers (spousal pooling)', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const age = 30;
        demography[age].none.company = 100;
        demography[age].none.unoccupied = 100;
        wealthDemography[age].none.company = { mean: 500, variance: 0 };
        wealthDemography[age].none.unoccupied = { mean: 0, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[age].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[age].none.unoccupied.mean).toBeGreaterThan(0);
        expect(wealthDemography[age].none.company.mean).toBeLessThan(500);
    });

    it('supports disabled at working age via intra-cohort transfers', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const age = 40;
        demography[age].none.company = 100;
        demography[age].none.unableToWork = 50;
        wealthDemography[age].none.company = { mean: 800, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[age].none.unableToWork.foodStock = 0;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[age].none.unableToWork.mean).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Smooth kernel / multi-modal
    // -----------------------------------------------------------------------

    it('smooth kernel: supporters at various distances contribute', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const exactAge = childAge + GENERATION_GAP;
        const offsetAge = childAge + GENERATION_GAP + 5;

        demography[childAge].none.unoccupied = 100;
        demography[exactAge].none.company = 100;
        demography[offsetAge].none.company = 100;

        wealthDemography[exactAge].none.company = { mean: 1000, variance: 0 };
        wealthDemography[offsetAge].none.company = { mean: 1000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[exactAge].none.company.mean).toBeLessThan(1000);
        expect(wealthDemography[offsetAge].none.company.mean).toBeLessThan(1000);

        const exactContrib = 1000 - wealthDemography[exactAge].none.company.mean;
        const offsetContrib = 1000 - wealthDemography[offsetAge].none.company.mean;
        expect(exactContrib).toBeGreaterThan(offsetContrib);
    });

    it('grandparent (n=2 peak) supports grandchild', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Child age 5, grandparent age 55 (distance = 50 = 2 × GENERATION_GAP)
        const childAge = 5;
        const grandparentAge = childAge + 2 * GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[grandparentAge].none.company = 100;
        wealthDemography[grandparentAge].none.company = { mean: 1000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Grandparent should have given wealth (n=2 peak matches)
        expect(wealthDemography[grandparentAge].none.company.mean).toBeLessThan(1000);
        expect(wealthDemography[childAge].none.unoccupied.mean).toBeGreaterThan(0);
    });

    it('great-grandparent (n=3 peak) supports great-grandchild', () => {
        if (GENERATION_KERNEL_N < 3) {
            return; // skip if N < 3
        }

        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Child age 5, great-grandparent age 80 (distance = 75 = 3 × GENERATION_GAP)
        const childAge = 5;
        const greatGrandparentAge = childAge + 3 * GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;
        demography[greatGrandparentAge].none.unoccupied = 100;
        wealthDemography[greatGrandparentAge].none.unoccupied = { mean: 5000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Great-grandparent should have given wealth
        expect(wealthDemography[greatGrandparentAge].none.unoccupied.mean).toBeLessThan(5000);
        expect(wealthDemography[childAge].none.unoccupied.mean).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Elderly as supporters
    // -----------------------------------------------------------------------

    it('wealthy elderly transfer wealth to younger generations', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Rich 75-year-old, poor 50-year-old (age difference = 25 → n=1 peak)
        const elderlyAge = 75;
        const childAge = 10;

        demography[elderlyAge].none.unoccupied = 100;
        demography[childAge].none.unoccupied = 100;

        wealthDemography[elderlyAge].none.unoccupied = { mean: 5000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Elderly should have given wealth
        expect(wealthDemography[elderlyAge].none.unoccupied.mean).toBeLessThan(5000);
        // Child should have received
        expect(wealthDemography[childAge].none.unoccupied.mean).toBeGreaterThan(0);
    });

    it('elderly with capacity < 1 give less than prime-age supporter with same wealth', () => {
        // Make the surplus the binding constraint so capacity scaling matters.
        // Use many children (large need) and supporters with barely-above-floor wealth.
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 5;

        // Many children → large need
        demography[childAge].none.unoccupied = 50000;

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const foodPrice = foodMarket.foodPrice;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const workingFloor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;
        // Supporters with modest surplus
        const supporterMean = workingFloor + 0.5;

        // --- Scenario 1: prime-age supporter at exact GENERATION_GAP ---
        const primeAge = childAge + GENERATION_GAP; // = 30

        demography[primeAge].none.company = 100;
        wealthDemography[primeAge].none.company = { mean: supporterMean, variance: 0 };

        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);
        const primeContrib = supporterMean - wealthDemography[primeAge].none.company.mean;

        // --- Scenario 2: elderly supporter ---
        wealthDemography[childAge].none.unoccupied = { mean: 0, variance: 0 };
        buffers[childAge].none.unoccupied.foodStock = 0;
        demography[primeAge].none.company = 0;
        wealthDemography[primeAge].none.company = { mean: 0, variance: 0 };

        const elderlyAge = 80;
        demography[elderlyAge].none.unoccupied = 100;
        wealthDemography[elderlyAge].none.unoccupied = { mean: supporterMean, variance: 0 };

        intergenerationalTransfersTick(gs);
        const elderlyContrib = supporterMean - wealthDemography[elderlyAge].none.unoccupied.mean;

        // Prime-age (capacity=1) should contribute more than elderly (capacity < 1)
        expect(primeContrib).toBeGreaterThan(0);
        expect(elderlyContrib).toBeGreaterThan(0);
        expect(primeContrib).toBeGreaterThan(elderlyContrib);
    });

    it('elderly deplete faster under starvation (lower floor)', () => {
        // Simulate: both working-age and elderly have same wealth, just above
        // the elderly floor but below the working-age floor.
        // Only the elderly can be debited (working-age is protected by higher floor).
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const foodPrice = foodMarket.foodPrice;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;

        const elderlyFloor = ELDERLY_FLOOR_FRACTION * baseFoodCost;
        const workingFloor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;

        // Wealth between the two floors
        const sharedWealth = (elderlyFloor + workingFloor) / 2;

        const childAge = 5;
        const workingAge = 30;
        const elderlyAge = 80;

        demography[childAge].none.unoccupied = 100;
        demography[workingAge].none.company = 100;
        demography[elderlyAge].none.unoccupied = 100;

        wealthDemography[workingAge].none.company = { mean: sharedWealth, variance: 0 };
        wealthDemography[elderlyAge].none.unoccupied = { mean: sharedWealth, variance: 0 };

        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Working-age keeps wealth (below their floor)
        expect(wealthDemography[workingAge].none.company.mean).toBeCloseTo(sharedWealth, 5);
        // Elderly loses wealth (above their floor, so they can give)
        expect(wealthDemography[elderlyAge].none.unoccupied.mean).toBeLessThan(sharedWealth);
    });

    // -----------------------------------------------------------------------
    // Continuous capacity
    // -----------------------------------------------------------------------

    it('children (age < 16) never act as supporters regardless of wealth', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const youngAge = 5;
        demography[youngAge].none.unoccupied = 100;
        wealthDemography[youngAge].none.unoccupied = { mean: 10000, variance: 0 };

        const elderlyAge = 70;
        demography[elderlyAge].none.unoccupied = 100;

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        intergenerationalTransfersTick(gs);

        expect(wealthDemography[youngAge].none.unoccupied.mean).toBe(10000);
    });

    it('young adults (16-21) have partial support capacity', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // A 19-year-old has capacity ≈ 0.5
        const youngAdultAge = 19;
        const childAge = 0;

        demography[youngAdultAge].none.company = 100;
        demography[childAge].none.unoccupied = 1000;
        wealthDemography[youngAdultAge].none.company = { mean: 1000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Young adult should have contributed (partial capacity)
        expect(wealthDemography[youngAdultAge].none.company.mean).toBeLessThan(1000);
    });

    it('no transfer to working-age non-disabled adults', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const workingAge = 40;
        const supporterAge = workingAge + GENERATION_GAP;

        demography[workingAge].none.company = 100;
        demography[supporterAge].none.company = 100;

        wealthDemography[supporterAge].none.company = { mean: 1000, variance: 0 };
        wealthDemography[workingAge].none.company = { mean: 0, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        intergenerationalTransfersTick(gs);

        // Working-age company workers are NOT dependents
        expect(wealthDemography[workingAge].none.company.mean).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Inequality friction
    // -----------------------------------------------------------------------

    it('inequality reduces effective transfer capacity', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        // Many children with zero food → large need
        demography[childAge].none.unoccupied = 10000;

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        const survivalFloor =
            SUPPORTER_SURVIVAL_FRACTION * FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodMarket.foodPrice;
        const supporterMean = survivalFloor + 0.1;

        // Scenario 1: zero variance → α = 1
        demography[supporterAge].none.company = 50;
        wealthDemography[supporterAge].none.company = { mean: supporterMean, variance: 0 };

        intergenerationalTransfersTick(gs);
        const childWealth1 = wealthDemography[childAge].none.unoccupied.mean;

        // Reset
        wealthDemography[childAge].none.unoccupied = { mean: 0, variance: 0 };
        buffers[childAge].none.unoccupied.foodStock = 0;

        // Scenario 2: cv²=1 → α = 0.5
        wealthDemography[supporterAge].none.company = {
            mean: supporterMean,
            variance: supporterMean * supporterMean,
        };
        intergenerationalTransfersTick(gs);
        const childWealth2 = wealthDemography[childAge].none.unoccupied.mean;

        expect(childWealth1).toBeGreaterThan(0);
        expect(childWealth2).toBeLessThan(childWealth1);
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    it('handles empty planet gracefully', () => {
        // No population at all
        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        intergenerationalTransfersTick(gs);

        const balances = planet.foodMarket!.lastTransferBalances;
        expect(balances).toBeDefined();
        const total = balances!.reduce((s, v) => s + v, 0);
        expect(total).toBe(0);
    });

    it('handles planet with only children (no supporters)', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Only children, no one to support them
        demography[5].none.unoccupied = 500;
        demography[10].none.unoccupied = 500;

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        intergenerationalTransfersTick(gs);

        // Children should still have zero wealth (no supporters)
        expect(wealthDemography[5].none.unoccupied.mean).toBe(0);
        expect(wealthDemography[10].none.unoccupied.mean).toBe(0);
    });

    it('handles planet with only elderly (mutual support through capacity)', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Two elderly groups: one rich, one poor
        demography[70].none.unoccupied = 100; // poor elderly
        demography[80].none.unoccupied = 100; // rich elderly
        wealthDemography[80].none.unoccupied = { mean: 5000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[70].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Poor elderly should have received support from rich elderly
        // (age diff = 10, which has some kernel weight via n=1 peak since |10-25| = 15, σ=8)
        const poorElderlyWealth = wealthDemography[70].none.unoccupied.mean;
        expect(poorElderlyWealth).toBeGreaterThan(0);
    });

    it('handles single person planet', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        demography[30].none.company = 1;
        wealthDemography[30].none.company = { mean: 100, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        intergenerationalTransfersTick(gs);

        // No one to transfer to, wealth unchanged
        expect(wealthDemography[30].none.company.mean).toBe(100);
    });

    it('does not produce negative wealth', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Massive need, tiny surplus
        demography[5].none.unoccupied = 10000;
        demography[30].none.company = 10;
        wealthDemography[30].none.company = { mean: 0.001, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[5].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Check no cell has negative wealth
        for (let age = 0; age < demography.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    if (demography[age][edu][occ] > 0) {
                        expect(wealthDemography[age][edu][occ].mean).toBeGreaterThanOrEqual(-1e-10);
                    }
                }
            }
        }
    });

    it('multiple education levels at same age all contribute', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        demography[childAge].none.unoccupied = 100;

        // Two education levels at the same supporter age
        demography[supporterAge].none.company = 50;
        demography[supporterAge].primary.company = 50;

        wealthDemography[supporterAge].none.company = { mean: 1000, variance: 0 };
        wealthDemography[supporterAge].primary.company = { mean: 1000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;
        const buffers = getFoodBufferDemography(foodMarket, planet.population);
        buffers[childAge].none.unoccupied.foodStock = 0;

        intergenerationalTransfersTick(gs);

        // Both education levels should have contributed
        expect(wealthDemography[supporterAge].none.company.mean).toBeLessThan(1000);
        expect(wealthDemography[supporterAge].primary.company.mean).toBeLessThan(1000);
    });

    it('conservation holds with elderly supporters in the mix', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Complex scenario with elderly supporters
        demography[5].none.unoccupied = 200; // children
        demography[30].none.company = 300; // prime supporters
        demography[70].none.unoccupied = 100; // poor elderly (dependent)
        demography[80].none.unoccupied = 50; // rich elderly (supporter!)
        demography[90].none.unoccupied = 20; // very old, still some capacity

        wealthDemography[30].none.company = { mean: 500, variance: 0 };
        wealthDemography[80].none.unoccupied = { mean: 10000, variance: 0 };
        wealthDemography[90].none.unoccupied = { mean: 3000, variance: 0 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        const wealthBefore = totalWealth(planet);

        intergenerationalTransfersTick(gs);

        const wealthAfter = totalWealth(planet);
        expect(Math.abs(wealthAfter - wealthBefore)).toBeLessThan(1e-6);
    });

    it('conservation holds under extreme conditions', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Fill every age with some population
        for (let age = 0; age <= 100; age++) {
            demography[age].none.unoccupied = 10;
            if (age >= 18 && age <= 65) {
                demography[age].none.company = 20;
                wealthDemography[age].none.company = { mean: 100 + age * 10, variance: age * 5 };
            }
        }

        // Some wealthy elderly
        wealthDemography[75].none.unoccupied = { mean: 5000, variance: 100 };
        wealthDemography[85].none.unoccupied = { mean: 3000, variance: 200 };

        const foodMarket = ensureFoodMarket(planet.population, planet.foodMarket);
        planet.foodMarket = foodMarket;

        const wealthBefore = totalWealth(planet);

        intergenerationalTransfersTick(gs);

        const wealthAfter = totalWealth(planet);
        expect(Math.abs(wealthAfter - wealthBefore)).toBeLessThan(1e-4);
    });
});
