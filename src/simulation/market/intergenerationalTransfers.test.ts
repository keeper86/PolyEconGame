/**
 * market/intergenerationalTransfers.test.ts
 *
 * Comprehensive tests for the intergenerational transfer system.
 *
 * Covers:
 *   - Asymmetric multi-modal Gaussian weight kernel (with generation amplitudes)
 *   - Generation amplitude function (asymmetric child > peer > parent > grandparent)
 *   - Continuous support capacity curve (ramp, plateau, decline, elderly)
 *   - Age-appropriate survival floor (working-age vs elderly)
 *   - Cross-education transfers (no education matching)
 *   - Same-age support via unified kernel (spousal / peer pooling)
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

import type { Agent, Planet, GameState } from '../planet/planet';
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
    generationAmplitude,
    effectiveSurplus,
    supportCapacity,
    survivalFloorForAge,
    createZeroTransferMatrix,
    sumTransferMatrix,
} from './intergenerationalTransfers';
import { makePlanetWithPopulation, makeGameState as makeGS } from '../utils/testHelper';
import { OCCUPATIONS, SKILL } from '../population/population';
import type { Occupation } from '../population/population';
import { educationLevelKeys } from '../population/education';
import type { EducationLevelType } from '../population/education';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGameState(planet: Planet, ...agents: Agent[]): GameState {
    return makeGS(planet, agents, 1);
}

/**
 * Set population total for a specific (age, occ, edu) cell,
 * distributing evenly across all skill levels.
 */
function setPopulation(planet: Planet, age: number, occ: Occupation, edu: EducationLevelType, count: number): void {
    const demography = planet.population.demography;
    const perSkill = Math.floor(count / SKILL.length);
    const remainder = count - perSkill * SKILL.length;
    for (let i = 0; i < SKILL.length; i++) {
        const skill = SKILL[i];
        demography[age][occ][edu][skill].total = perSkill + (i === 0 ? remainder : 0);
    }
}

/**
 * Set wealth for a specific (age, occ, edu) cell across all skill levels.
 */
function setWealth(
    planet: Planet,
    age: number,
    occ: Occupation,
    edu: EducationLevelType,
    mean: number,
    variance = 0,
): void {
    const demography = planet.population.demography;
    for (const skill of SKILL) {
        const cat = demography[age][occ][edu][skill];
        cat.wealth = { mean, variance };
    }
}

/**
 * Get aggregate wealth mean for a specific (age, occ, edu) cell
 * (population-weighted average across skill levels).
 */
function getWealth(planet: Planet, age: number, occ: Occupation, edu: EducationLevelType): number {
    const demography = planet.population.demography;
    let totalPop = 0;
    let weightedMean = 0;
    for (const skill of SKILL) {
        const cat = demography[age][occ][edu][skill];
        if (cat.total > 0) {
            weightedMean += cat.wealth.mean * cat.total;
            totalPop += cat.total;
        }
    }
    return totalPop > 0 ? weightedMean / totalPop : 0;
}

/**
 * Set per-capita food stock for a specific (age, occ, edu) cell across all skill levels.
 * The value stored is `foodStockPerCapita × category.total` (total food in the cell).
 */
function setFoodStock(
    planet: Planet,
    age: number,
    occ: Occupation,
    edu: EducationLevelType,
    foodStockPerCapita: number,
): void {
    const demography = planet.population.demography;
    for (const skill of SKILL) {
        const cat = demography[age][occ][edu][skill];
        cat.foodStock = foodStockPerCapita * cat.total;
    }
}

/** Compute total wealth across all age × occ × edu × skill cells. */
function totalWealth(planet: Planet): number {
    const dem = planet.population.demography;
    let total = 0;
    for (let age = 0; age < dem.length; age++) {
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = dem[age][occ][edu][skill];
                    total += cat.wealth.mean * cat.total;
                }
            }
        }
    }
    return total;
}

// ===========================================================================
// Unit tests: generationAmplitude (asymmetric kernel amplitudes)
// ===========================================================================

describe('generationAmplitude', () => {
    it('n=-1 (child) has highest amplitude = 1.0', () => {
        expect(generationAmplitude(-1)).toBeCloseTo(1.0, 10);
    });

    it('n=0 (self/peer) has amplitude = exp(-0.33)', () => {
        expect(generationAmplitude(0)).toBeCloseTo(Math.exp(-0.33), 10);
    });

    it('n=-2 (grandchild) has amplitude = exp(-0.33)', () => {
        expect(generationAmplitude(-2)).toBeCloseTo(Math.exp(-0.33), 10);
    });

    it('n=1 (parent) has amplitude = exp(-0.66)', () => {
        expect(generationAmplitude(1)).toBeCloseTo(Math.exp(-0.66), 10);
    });

    it('n=2 (grandparent) has amplitude = exp(-0.99)', () => {
        expect(generationAmplitude(2)).toBeCloseTo(Math.exp(-0.99), 10);
    });

    it('child amplitude > peer amplitude > parent amplitude', () => {
        expect(generationAmplitude(-1)).toBeGreaterThan(generationAmplitude(0));
        expect(generationAmplitude(0)).toBeGreaterThan(generationAmplitude(1));
    });

    it('amplitudes are always positive', () => {
        for (let n = -5; n <= 5; n++) {
            expect(generationAmplitude(n)).toBeGreaterThan(0);
        }
    });

    it('amplitudes decay for larger |n|', () => {
        // Negative side
        expect(generationAmplitude(-1)).toBeGreaterThan(generationAmplitude(-2));
        expect(generationAmplitude(-2)).toBeGreaterThan(generationAmplitude(-3));
        // Positive side
        expect(generationAmplitude(0)).toBeGreaterThan(generationAmplitude(1));
        expect(generationAmplitude(1)).toBeGreaterThan(generationAmplitude(2));
    });
});

// ===========================================================================
// Unit tests: supportWeight (asymmetric multi-modal kernel)
// ===========================================================================

describe('supportWeight', () => {
    it('peaks at -GENERATION_GAP (n=-1, child) with amplitude 1.0', () => {
        expect(supportWeight(-GENERATION_GAP)).toBeCloseTo(1.0, 10);
    });

    it('peaks at +GENERATION_GAP (n=+1, parent) with amplitude exp(-0.66)', () => {
        expect(supportWeight(GENERATION_GAP)).toBeCloseTo(Math.exp(-0.66), 5);
    });

    it('has a peak at 0 (n=0, self/peer) with amplitude exp(-0.33)', () => {
        expect(supportWeight(0)).toBeCloseTo(Math.exp(-0.33), 5);
    });

    it('peaks at -2*GENERATION_GAP (n=-2, grandchild) with amplitude exp(-0.33)', () => {
        expect(supportWeight(-2 * GENERATION_GAP)).toBeCloseTo(Math.exp(-0.33), 5);
    });

    it('peaks at +2*GENERATION_GAP (n=+2, grandparent) with amplitude exp(-0.99)', () => {
        expect(supportWeight(2 * GENERATION_GAP)).toBeCloseTo(Math.exp(-0.99), 5);
    });

    it('peaks at -3*GENERATION_GAP (n=-3, great-grandchild) with amplitude exp(-0.66)', () => {
        if (GENERATION_KERNEL_N >= 3) {
            expect(supportWeight(-3 * GENERATION_GAP)).toBeCloseTo(Math.exp(-0.66), 5);
        }
    });

    it('decays for age differences away from any peak', () => {
        const peak = supportWeight(-GENERATION_GAP);
        const farAway = supportWeight(-GENERATION_GAP - 20);
        expect(farAway).toBeLessThan(peak);
        expect(farAway).toBeGreaterThan(0);
    });

    it('is symmetric around each peak center', () => {
        // The kernel is symmetric around each peak center n*G
        const below = supportWeight(-GENERATION_GAP - 5);
        const above = supportWeight(-GENERATION_GAP + 5);
        expect(below).toBeCloseTo(above, 10);
    });

    it('valley between peaks is lower than adjacent peaks', () => {
        // Between n=-1 and n=0 peaks
        const midpoint = -GENERATION_GAP / 2;
        const valleyWeight = supportWeight(midpoint);
        expect(valleyWeight).toBeLessThan(supportWeight(-GENERATION_GAP));
        expect(valleyWeight).toBeLessThan(supportWeight(0));
    });

    it('child peak (n=-1) is higher than parent peak (n=+1)', () => {
        expect(supportWeight(-GENERATION_GAP)).toBeGreaterThan(supportWeight(GENERATION_GAP));
    });

    it('kernel is intentionally asymmetric (not symmetric in ±Δ)', () => {
        // supportWeight(-25) ≠ supportWeight(+25) because amplitudes differ
        expect(supportWeight(-GENERATION_GAP)).not.toBeCloseTo(supportWeight(GENERATION_GAP), 5);
    });
});

// ===========================================================================
// Unit tests: supportCapacity (continuous curve)
// ===========================================================================

describe('supportCapacity', () => {
    it('returns 0 for children (age < 14)', () => {
        expect(supportCapacity(0)).toBe(0);
        expect(supportCapacity(10)).toBe(0);
        expect(supportCapacity(13)).toBe(0);
    });

    it('ramps from 0 to 1 between ages 14 and 20', () => {
        expect(supportCapacity(14)).toBeCloseTo(0, 10);
        expect(supportCapacity(17)).toBeCloseTo(0.5, 10);
        expect(supportCapacity(20)).toBeCloseTo(1.0, 10);
    });

    it('is monotonically increasing in the ramp', () => {
        for (let age = 14; age < 20; age++) {
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
        for (let age = 60; age < 75; age++) {
            expect(supportCapacity(age + 1)).toBeLessThan(supportCapacity(age));
        }
    });

    it('declines steeply from 75 to 100', () => {
        expect(supportCapacity(75)).toBeCloseTo(0.4, 10);
        expect(supportCapacity(100)).toBeCloseTo(0.1, 10);
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
    const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * 1.0;

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
        expect(effectiveSurplus(100, 0, 50, 10)).toBe(500);
    });

    it('reduces surplus with higher variance', () => {
        const zeroVar = effectiveSurplus(100, 0, 50, 10);
        const highVar = effectiveSurplus(100, 10000, 50, 10);
        expect(highVar).toBeLessThan(zeroVar);
        expect(highVar).toBeCloseTo(250, 5);
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
        ({ planet, gov } = makePlanetWithPopulation({}));
        gs = makeGameState(planet, gov);
    });

    // -----------------------------------------------------------------------
    // Basic child / elderly support
    // -----------------------------------------------------------------------

    it('transfers wealth from supporters to children', () => {
        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'unoccupied', 'none', 100);
        setWealth(planet, supporterAge, 'unoccupied', 'none', 1000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, supporterAge, 'unoccupied', 'none')).toBeLessThan(1000);
        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBeGreaterThan(0);
    });

    it('transfers wealth from supporters to elderly', () => {
        const elderlyAge = 70;
        const supporterAge = elderlyAge - GENERATION_GAP;

        setPopulation(planet, elderlyAge, 'unoccupied', 'none', 50);
        setPopulation(planet, supporterAge, 'unoccupied', 'none', 100);
        setWealth(planet, supporterAge, 'unoccupied', 'none', 500);
        setFoodStock(planet, elderlyAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, elderlyAge, 'unoccupied', 'none')).toBeGreaterThan(0);
    });

    it('does not transfer when supporter has no surplus', () => {
        const childAge = 5;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'unoccupied', 'none', 100);
        setWealth(planet, supporterAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBe(0);
    });

    it('does not transfer when dependent food stock is already at target', () => {
        const childAge = 5;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'employed', 'none', 100);
        setWealth(planet, supporterAge, 'employed', 'none', 1000);

        const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
        setFoodStock(planet, childAge, 'unoccupied', 'none', foodTargetPerPerson);

        const supporterBefore = getWealth(planet, supporterAge, 'employed', 'none');

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, supporterAge, 'employed', 'none')).toBeCloseTo(supporterBefore, 5);
    });

    // -----------------------------------------------------------------------
    // Balances and conservation
    // -----------------------------------------------------------------------

    it('writes lastTransferMatrix to population', () => {
        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'employed', 'none', 100);
        setWealth(planet, supporterAge, 'employed', 'none', 1000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix;
        expect(matrix).toBeDefined();
        expect(matrix!.length).toBe(planet.population.demography.length);

        // Child age should have received (positive)
        let childAgeTotal = 0;
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                childAgeTotal += matrix![childAge][edu][occ];
            }
        }
        expect(childAgeTotal).toBeGreaterThan(0);

        // Zero-sum across entire matrix
        expect(Math.abs(sumTransferMatrix(matrix!))).toBeLessThan(1e-6);
    });

    it('conserves total wealth exactly', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 200);
        setPopulation(planet, 15, 'unoccupied', 'none', 150);
        setPopulation(planet, 30, 'employed', 'none', 300);
        setPopulation(planet, 30, 'unoccupied', 'none', 50);
        setPopulation(planet, 40, 'employed', 'primary', 200);
        setPopulation(planet, 40, 'unableToWork', 'none', 30);
        setPopulation(planet, 50, 'employed', 'none', 100);
        setPopulation(planet, 70, 'unoccupied', 'none', 100);
        setPopulation(planet, 80, 'unoccupied', 'none', 50);

        setWealth(planet, 30, 'employed', 'none', 500);
        setWealth(planet, 40, 'employed', 'primary', 800, 100);
        setWealth(planet, 50, 'employed', 'none', 600);
        setWealth(planet, 70, 'unoccupied', 'none', 2000);

        const wealthBefore = totalWealth(planet);

        intergenerationalTransfersTick(gs);

        const wealthAfter = totalWealth(planet);
        expect(Math.abs(wealthAfter - wealthBefore)).toBeLessThan(1e-6);
    });

    // -----------------------------------------------------------------------
    // Survival floor
    // -----------------------------------------------------------------------

    it('respects survival floor — supporter at floor keeps wealth', () => {
        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'employed', 'none', 100);

        const foodPrice = planet.priceLevel ?? 1.0;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const floor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;

        setWealth(planet, supporterAge, 'employed', 'none', floor);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBeCloseTo(0, 10);
    });

    it('elderly have lower survival floor than working-age', () => {
        const foodPrice = planet.priceLevel ?? 1.0;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;

        const elderlyAge = 80;
        const elderlyFloor = ELDERLY_FLOOR_FRACTION * baseFoodCost;
        const workingFloor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;
        const wealthBetween = (elderlyFloor + workingFloor) / 2;

        setPopulation(planet, elderlyAge, 'unoccupied', 'none', 100);
        setWealth(planet, elderlyAge, 'unoccupied', 'none', wealthBetween);

        const childAge = 5;
        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Phase 2 / Phase 3
    // -----------------------------------------------------------------------

    it('Phase 2 transfers only 1 tick of food (not full buffer)', () => {
        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'employed', 'none', 100);

        const foodPrice = planet.priceLevel ?? 1.0;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const floor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;
        const phase2Need = FOOD_PER_PERSON_PER_TICK * foodPrice;

        setWealth(planet, supporterAge, 'employed', 'none', floor + phase2Need * 1.5);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBeGreaterThan(0);
        expect(getWealth(planet, supporterAge, 'employed', 'none')).toBeLessThan(floor + phase2Need * 1.5);
    });

    it('Phase 3 uses precautionary reserve as floor', () => {
        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'employed', 'none', 100);

        const foodPrice = planet.priceLevel ?? 1.0;
        const precautionaryReserve = PRECAUTIONARY_RESERVE_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const foodTargetPerPerson = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        const generousWealth = precautionaryReserve + foodTargetPerPerson * foodPrice * 2;
        setWealth(planet, supporterAge, 'employed', 'none', generousWealth);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        const childWealth = getWealth(planet, childAge, 'unoccupied', 'none');
        expect(childWealth).toBeGreaterThan(0);

        const supporterWealthAfter = getWealth(planet, supporterAge, 'employed', 'none');
        expect(supporterWealthAfter).toBeGreaterThanOrEqual(precautionaryReserve - 1e-9);
    });

    // -----------------------------------------------------------------------
    // Cross-education and same-age support
    // -----------------------------------------------------------------------

    it('transfers across different education levels (no edu matching)', () => {
        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'employed', 'primary', 100);
        setWealth(planet, supporterAge, 'employed', 'primary', 1000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBeGreaterThan(0);
        expect(getWealth(planet, supporterAge, 'employed', 'primary')).toBeLessThan(1000);
    });

    it('supports same-age transfers via unified kernel (spousal pooling)', () => {
        const age = 30;
        setPopulation(planet, age, 'employed', 'none', 100);
        setPopulation(planet, age, 'unoccupied', 'none', 100);
        setWealth(planet, age, 'employed', 'none', 500);
        setWealth(planet, age, 'unoccupied', 'none', 0);
        setFoodStock(planet, age, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, age, 'unoccupied', 'none')).toBeGreaterThan(0);
        expect(getWealth(planet, age, 'employed', 'none')).toBeLessThan(500);
    });

    it('supports disabled at working age via unified kernel transfers', () => {
        const age = 40;
        setPopulation(planet, age, 'employed', 'none', 100);
        setPopulation(planet, age, 'unableToWork', 'none', 50);
        setWealth(planet, age, 'employed', 'none', 800);
        setFoodStock(planet, age, 'unableToWork', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, age, 'unableToWork', 'none')).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Smooth kernel / multi-modal
    // -----------------------------------------------------------------------

    it('smooth kernel: supporters at various distances contribute', () => {
        const childAge = 10;
        const exactAge = childAge + GENERATION_GAP;
        const offsetAge = childAge + GENERATION_GAP + 5;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, exactAge, 'employed', 'none', 100);
        setPopulation(planet, offsetAge, 'employed', 'none', 100);

        setWealth(planet, exactAge, 'employed', 'none', 1000);
        setWealth(planet, offsetAge, 'employed', 'none', 1000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, exactAge, 'employed', 'none')).toBeLessThan(1000);
        expect(getWealth(planet, offsetAge, 'employed', 'none')).toBeLessThan(1000);

        const exactContrib = 1000 - getWealth(planet, exactAge, 'employed', 'none');
        const offsetContrib = 1000 - getWealth(planet, offsetAge, 'employed', 'none');
        expect(exactContrib).toBeGreaterThan(offsetContrib);
    });

    it('grandparent (n=2 peak) supports grandchild', () => {
        const childAge = 5;
        const grandparentAge = childAge + 2 * GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, grandparentAge, 'employed', 'none', 100);
        setWealth(planet, grandparentAge, 'employed', 'none', 1000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, grandparentAge, 'employed', 'none')).toBeLessThan(1000);
        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBeGreaterThan(0);
    });

    it('great-grandparent (n=3 peak) supports great-grandchild', () => {
        if (GENERATION_KERNEL_N < 3) {
            return;
        }

        const childAge = 5;
        const greatGrandparentAge = childAge + 3 * GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, greatGrandparentAge, 'unoccupied', 'none', 100);
        setWealth(planet, greatGrandparentAge, 'unoccupied', 'none', 5000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, greatGrandparentAge, 'unoccupied', 'none')).toBeLessThan(5000);
        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Elderly as supporters
    // -----------------------------------------------------------------------

    it('wealthy elderly transfer wealth to younger generations', () => {
        const elderlyAge = 75;
        const childAge = 10;

        setPopulation(planet, elderlyAge, 'unoccupied', 'none', 100);
        setPopulation(planet, childAge, 'unoccupied', 'none', 100);

        setWealth(planet, elderlyAge, 'unoccupied', 'none', 5000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, elderlyAge, 'unoccupied', 'none')).toBeLessThan(5000);
        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBeGreaterThan(0);
    });

    it('elderly with capacity < 1 give less than prime-age supporter with same wealth', () => {
        const childAge = 5;
        setPopulation(planet, childAge, 'unoccupied', 'none', 50000);

        const foodPrice = planet.priceLevel ?? 1.0;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const workingFloor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;
        const supporterMean = workingFloor + 0.5;

        // --- Scenario 1: prime-age supporter at exact GENERATION_GAP ---
        const primeAge = childAge + GENERATION_GAP;

        setPopulation(planet, primeAge, 'employed', 'none', 100);
        setWealth(planet, primeAge, 'employed', 'none', supporterMean);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);
        const primeContrib = supporterMean - getWealth(planet, primeAge, 'employed', 'none');

        // --- Scenario 2: elderly supporter ---
        setWealth(planet, childAge, 'unoccupied', 'none', 0);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);
        setPopulation(planet, primeAge, 'employed', 'none', 0);
        setWealth(planet, primeAge, 'employed', 'none', 0);

        const elderlyAge = 80;
        setPopulation(planet, elderlyAge, 'unoccupied', 'none', 100);
        setWealth(planet, elderlyAge, 'unoccupied', 'none', supporterMean);

        intergenerationalTransfersTick(gs);
        const elderlyContrib = supporterMean - getWealth(planet, elderlyAge, 'unoccupied', 'none');

        expect(primeContrib).toBeGreaterThan(0);
        expect(elderlyContrib).toBeGreaterThan(0);
        expect(primeContrib).toBeGreaterThan(elderlyContrib);
    });

    it('elderly deplete faster under starvation (lower floor)', () => {
        const foodPrice = planet.priceLevel ?? 1.0;
        const baseFoodCost = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;

        const elderlyFloor = ELDERLY_FLOOR_FRACTION * baseFoodCost;
        const workingFloor = SUPPORTER_SURVIVAL_FRACTION * baseFoodCost;
        const sharedWealth = (elderlyFloor + workingFloor) / 2;

        const childAge = 5;
        const workingAge = 30;
        const elderlyAge = 80;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, workingAge, 'employed', 'none', 100);
        setPopulation(planet, elderlyAge, 'unoccupied', 'none', 100);

        setWealth(planet, workingAge, 'employed', 'none', sharedWealth);
        setWealth(planet, elderlyAge, 'unoccupied', 'none', sharedWealth);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, workingAge, 'employed', 'none')).toBeCloseTo(sharedWealth, 5);
        expect(getWealth(planet, elderlyAge, 'unoccupied', 'none')).toBeLessThan(sharedWealth);
    });

    // -----------------------------------------------------------------------
    // Continuous capacity
    // -----------------------------------------------------------------------

    it('children (age < 16) never act as supporters regardless of wealth', () => {
        const youngAge = 5;
        setPopulation(planet, youngAge, 'unoccupied', 'none', 100);
        setWealth(planet, youngAge, 'unoccupied', 'none', 10000);

        const elderlyAge = 70;
        setPopulation(planet, elderlyAge, 'unoccupied', 'none', 100);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, youngAge, 'unoccupied', 'none')).toBe(10000);
    });

    it('young adults (16-21) have partial support capacity', () => {
        const youngAdultAge = 19;
        const childAge = 0;

        setPopulation(planet, youngAdultAge, 'employed', 'none', 100);
        setPopulation(planet, childAge, 'unoccupied', 'none', 1000);
        setWealth(planet, youngAdultAge, 'employed', 'none', 1000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, youngAdultAge, 'employed', 'none')).toBeLessThan(1000);
    });

    it('no transfer to working-age non-disabled adults', () => {
        const workingAge = 40;
        const supporterAge = workingAge + GENERATION_GAP;

        setPopulation(planet, workingAge, 'employed', 'none', 100);
        setPopulation(planet, supporterAge, 'employed', 'none', 100);

        setWealth(planet, supporterAge, 'employed', 'none', 1000);
        setWealth(planet, workingAge, 'employed', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, workingAge, 'employed', 'none')).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Inequality friction
    // -----------------------------------------------------------------------

    it('inequality reduces effective transfer capacity', () => {
        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 10000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        const foodPrice = planet.priceLevel ?? 1.0;
        const survivalFloor =
            SUPPORTER_SURVIVAL_FRACTION * FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK * foodPrice;
        const supporterMean = survivalFloor + 0.1;

        // Scenario 1: zero variance
        setPopulation(planet, supporterAge, 'employed', 'none', 50);
        setWealth(planet, supporterAge, 'employed', 'none', supporterMean);

        intergenerationalTransfersTick(gs);
        const childWealth1 = getWealth(planet, childAge, 'unoccupied', 'none');

        // Reset
        setWealth(planet, childAge, 'unoccupied', 'none', 0);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        // Scenario 2: high variance
        setWealth(planet, supporterAge, 'employed', 'none', supporterMean, supporterMean * supporterMean);

        intergenerationalTransfersTick(gs);
        const childWealth2 = getWealth(planet, childAge, 'unoccupied', 'none');

        expect(childWealth1).toBeGreaterThan(0);
        expect(childWealth2).toBeLessThan(childWealth1);
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    it('handles empty planet gracefully', () => {
        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix;
        expect(matrix).toBeDefined();
        let total = 0;
        for (let age = 0; age < matrix!.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    total += matrix![age][edu][occ];
                }
            }
        }
        expect(total).toBe(0);
    });

    it('handles planet with only children (no supporters)', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 500);
        setPopulation(planet, 10, 'unoccupied', 'none', 500);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, 5, 'unoccupied', 'none')).toBe(0);
        expect(getWealth(planet, 10, 'unoccupied', 'none')).toBe(0);
    });

    it('handles planet with only elderly (mutual support through capacity)', () => {
        setPopulation(planet, 70, 'unoccupied', 'none', 100);
        setPopulation(planet, 80, 'unoccupied', 'none', 100);
        setWealth(planet, 80, 'unoccupied', 'none', 5000);
        setFoodStock(planet, 70, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        const poorElderlyWealth = getWealth(planet, 70, 'unoccupied', 'none');
        expect(poorElderlyWealth).toBeGreaterThan(0);
    });

    it('handles single person planet', () => {
        setPopulation(planet, 30, 'employed', 'none', 1);
        setWealth(planet, 30, 'employed', 'none', 100);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, 30, 'employed', 'none')).toBe(100);
    });

    it('does not produce negative wealth', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 10000);
        setPopulation(planet, 30, 'employed', 'none', 10);
        setWealth(planet, 30, 'employed', 'none', 0.001);
        setFoodStock(planet, 5, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        const dem = planet.population.demography;
        for (let age = 0; age < dem.length; age++) {
            for (const occ of OCCUPATIONS) {
                for (const edu of educationLevelKeys) {
                    for (const skill of SKILL) {
                        const cat = dem[age][occ][edu][skill];
                        if (cat.total > 0) {
                            expect(cat.wealth.mean).toBeGreaterThanOrEqual(-1e-10);
                        }
                    }
                }
            }
        }
    });

    it('multiple education levels at same age all contribute', () => {
        const childAge = 10;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'employed', 'none', 50);
        setPopulation(planet, supporterAge, 'employed', 'primary', 50);
        setWealth(planet, supporterAge, 'employed', 'none', 1000);
        setWealth(planet, supporterAge, 'employed', 'primary', 1000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        expect(getWealth(planet, supporterAge, 'employed', 'none')).toBeLessThan(1000);
        expect(getWealth(planet, supporterAge, 'employed', 'primary')).toBeLessThan(1000);
    });

    it('conservation holds with elderly supporters in the mix', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 200);
        setPopulation(planet, 30, 'employed', 'none', 300);
        setPopulation(planet, 70, 'unoccupied', 'none', 100);
        setPopulation(planet, 80, 'unoccupied', 'none', 50);
        setPopulation(planet, 90, 'unoccupied', 'none', 20);

        setWealth(planet, 30, 'employed', 'none', 500);
        setWealth(planet, 80, 'unoccupied', 'none', 10000);
        setWealth(planet, 90, 'unoccupied', 'none', 3000);

        const wealthBefore = totalWealth(planet);

        intergenerationalTransfersTick(gs);

        const wealthAfter = totalWealth(planet);
        expect(Math.abs(wealthAfter - wealthBefore)).toBeLessThan(1e-6);
    });

    it('conservation holds under extreme conditions', () => {
        for (let age = 0; age <= 100; age++) {
            setPopulation(planet, age, 'unoccupied', 'none', 10);
            if (age >= 18 && age <= 65) {
                setPopulation(planet, age, 'employed', 'none', 20);
                setWealth(planet, age, 'employed', 'none', 100 + age * 10, age * 5);
            }
        }

        setWealth(planet, 75, 'unoccupied', 'none', 5000, 100);
        setWealth(planet, 85, 'unoccupied', 'none', 3000, 200);

        const wealthBefore = totalWealth(planet);

        intergenerationalTransfersTick(gs);

        const wealthAfter = totalWealth(planet);
        expect(Math.abs(wealthAfter - wealthBefore)).toBeLessThan(1e-4);
    });
});

// ===========================================================================
// Transfer matrix helper tests
// ===========================================================================

describe('createZeroTransferMatrix', () => {
    it('creates a matrix of correct length', () => {
        const matrix = createZeroTransferMatrix(50);
        expect(matrix.length).toBe(50);
    });

    it('initialises all cells to zero', () => {
        const matrix = createZeroTransferMatrix(10);
        for (let age = 0; age < 10; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    expect(matrix[age][edu][occ]).toBe(0);
                }
            }
        }
    });
});

describe('sumTransferMatrix', () => {
    it('returns 0 for a zero matrix', () => {
        const matrix = createZeroTransferMatrix(10);
        expect(sumTransferMatrix(matrix)).toBe(0);
    });

    it('sums all cells correctly', () => {
        const matrix = createZeroTransferMatrix(5);
        matrix[0].none.unoccupied = 100;
        matrix[2].primary.employed = -60;
        matrix[4].secondary.employed = -40;
        expect(sumTransferMatrix(matrix)).toBeCloseTo(0, 10);
    });
});

// ===========================================================================
// Transfer matrix zero-sum & cell-level validation
// ===========================================================================

describe('transfer matrix invariants', () => {
    let planet: Planet;
    let gov: Agent;
    let gs: GameState;

    beforeEach(() => {
        ({ planet, gov } = makePlanetWithPopulation({}));
        gs = makeGameState(planet, gov);
    });

    it('matrix is globally zero-sum after basic transfer', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 200);
        setPopulation(planet, 30, 'employed', 'none', 300);
        setWealth(planet, 30, 'employed', 'none', 500);
        setFoodStock(planet, 5, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix!;
        expect(Math.abs(sumTransferMatrix(matrix))).toBeLessThan(1e-6);
    });

    it('sum of negative cells equals sum of positive cells', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 100);
        setPopulation(planet, 10, 'unoccupied', 'primary', 100);
        setPopulation(planet, 35, 'employed', 'none', 200);
        setPopulation(planet, 40, 'employed', 'primary', 150);
        setPopulation(planet, 70, 'unoccupied', 'none', 80);

        setWealth(planet, 35, 'employed', 'none', 1000);
        setWealth(planet, 40, 'employed', 'primary', 800);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix!;
        let sumPositive = 0;
        let sumNegative = 0;
        for (let age = 0; age < matrix.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    const val = matrix[age][edu][occ];
                    if (val > 0) {
                        sumPositive += val;
                    } else {
                        sumNegative += val;
                    }
                }
            }
        }
        expect(Math.abs(sumPositive + sumNegative)).toBeLessThan(1e-6);
    });

    it('matrix records per-cell detail (not just per-age)', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 50);
        setPopulation(planet, 5, 'unoccupied', 'primary', 50);
        setPopulation(planet, 30, 'employed', 'none', 200);
        setWealth(planet, 30, 'employed', 'none', 2000);
        setFoodStock(planet, 5, 'unoccupied', 'none', 0);
        setFoodStock(planet, 5, 'unoccupied', 'primary', 0);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix!;
        expect(matrix[5].none.unoccupied).toBeGreaterThan(0);
        expect(matrix[5].primary.unoccupied).toBeGreaterThan(0);
        expect(matrix[30].none.employed).toBeLessThan(0);
    });

    it('no dependents → matrix is all zeros', () => {
        setPopulation(planet, 30, 'employed', 'none', 200);
        setPopulation(planet, 40, 'employed', 'primary', 100);
        setWealth(planet, 30, 'employed', 'none', 500);
        setWealth(planet, 40, 'employed', 'primary', 800);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix!;
        expect(sumTransferMatrix(matrix)).toBe(0);
        for (let age = 0; age < matrix.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    expect(matrix[age][edu][occ]).toBe(0);
                }
            }
        }
    });

    it('no supporters → matrix is all zeros', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 500);
        setPopulation(planet, 10, 'unoccupied', 'none', 500);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix!;
        expect(sumTransferMatrix(matrix)).toBe(0);
    });

    it('single-age population → matrix is all zeros', () => {
        setPopulation(planet, 30, 'employed', 'none', 1);
        setWealth(planet, 30, 'employed', 'none', 100);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix!;
        expect(sumTransferMatrix(matrix)).toBe(0);
    });

    it('elderly-only planet with rich/poor still balances', () => {
        setPopulation(planet, 70, 'unoccupied', 'none', 100);
        setPopulation(planet, 80, 'unoccupied', 'none', 100);
        setWealth(planet, 80, 'unoccupied', 'none', 5000);
        setFoodStock(planet, 70, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix!;
        expect(Math.abs(sumTransferMatrix(matrix))).toBeLessThan(1e-6);
    });

    it('extreme inequality still produces zero-sum matrix', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 10000);
        setPopulation(planet, 30, 'employed', 'none', 10);
        setWealth(planet, 30, 'employed', 'none', 0.001);
        setFoodStock(planet, 5, 'unoccupied', 'none', 0);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix!;
        expect(Math.abs(sumTransferMatrix(matrix))).toBeLessThan(1e-6);
    });

    it('complex multi-age scenario conserves matrix sum', () => {
        for (let age = 0; age <= 100; age++) {
            setPopulation(planet, age, 'unoccupied', 'none', 10);
            if (age >= 18 && age <= 65) {
                setPopulation(planet, age, 'employed', 'none', 20);
                setWealth(planet, age, 'employed', 'none', 100 + age * 10, age * 5);
            }
        }
        setWealth(planet, 75, 'unoccupied', 'none', 5000, 100);
        setWealth(planet, 85, 'unoccupied', 'none', 3000, 200);

        intergenerationalTransfersTick(gs);

        const matrix = planet.population.lastTransferMatrix!;
        expect(Math.abs(sumTransferMatrix(matrix))).toBeLessThan(1e-4);
    });
});
