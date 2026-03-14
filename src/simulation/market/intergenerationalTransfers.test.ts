import { beforeEach, describe, expect, it } from 'vitest';

import {
    ELDERLY_FLOOR_FRACTION,
    ELDERLY_MIN_AGE,
    FOOD_BUFFER_TARGET_TICKS,
    FOOD_PER_PERSON_PER_TICK,
    GENERATION_GAP,
    GENERATION_KERNEL_N,
    PRECAUTIONARY_RESERVE_TICKS,
    SUPPORTER_SURVIVAL_FRACTION,
} from '../constants';
import type { Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import type { Occupation } from '../population/population';
import { OCCUPATIONS, SKILL } from '../population/population';
import { makePlanetWithPopulation } from '../utils/testHelper';
import {
    createZeroTransferMatrix,
    effectiveSurplus,
    generationAmplitude,
    intergenerationalTransfersForPlanet,
    sumTransferMatrix,
    survivalFloorForAge,
} from './intergenerationalTransfers';

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
    it('amplitudes are always positive', () => {
        for (let n = -5; n <= 5; n++) {
            expect(generationAmplitude(n)).toBeGreaterThan(0);
        }
    });

    it('amplitudes decay for larger |n|', () => {
        // n=+1 (parent supporting child) is the peak — highest amplitude of all
        expect(generationAmplitude(1)).toBeGreaterThan(generationAmplitude(0));
        expect(generationAmplitude(1)).toBeGreaterThan(generationAmplitude(-1));
        // Positive side: decays away from peak at n=+1
        expect(generationAmplitude(1)).toBeGreaterThan(generationAmplitude(2));
        expect(generationAmplitude(2)).toBeGreaterThan(generationAmplitude(3));
        // Negative side: decays as n becomes more negative
        expect(generationAmplitude(-1)).toBeGreaterThan(generationAmplitude(-2));
        expect(generationAmplitude(-2)).toBeGreaterThan(generationAmplitude(-3));
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

    beforeEach(() => {
        ({ planet } = makePlanetWithPopulation({}));
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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

        expect(getWealth(planet, elderlyAge, 'unoccupied', 'none')).toBeGreaterThan(0);
    });

    it('does not transfer when supporter has no surplus', () => {
        const childAge = 5;
        const supporterAge = childAge + GENERATION_GAP;

        setPopulation(planet, childAge, 'unoccupied', 'none', 100);
        setPopulation(planet, supporterAge, 'unoccupied', 'none', 100);
        setWealth(planet, supporterAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

        expect(getWealth(planet, age, 'unoccupied', 'none')).toBeGreaterThan(0);
        expect(getWealth(planet, age, 'employed', 'none')).toBeLessThan(500);
    });

    it('supports disabled at working age via unified kernel transfers', () => {
        const age = 40;
        setPopulation(planet, age, 'employed', 'none', 100);
        setPopulation(planet, age, 'unableToWork', 'none', 50);
        setWealth(planet, age, 'employed', 'none', 800);
        setFoodStock(planet, age, 'unableToWork', 'none', 0);

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

        expect(getWealth(planet, elderlyAge, 'unoccupied', 'none')).toBeLessThan(5000);
        expect(getWealth(planet, childAge, 'unoccupied', 'none')).toBeGreaterThan(0);
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

        intergenerationalTransfersForPlanet(planet);

        expect(getWealth(planet, workingAge, 'employed', 'none')).toBeCloseTo(sharedWealth, 5);
        expect(getWealth(planet, elderlyAge, 'unoccupied', 'none')).toBeLessThan(sharedWealth);
    });

    // -----------------------------------------------------------------------
    // Continuous capacity
    // -----------------------------------------------------------------------

    it('children (age = 0) never act as supporters regardless of wealth', () => {
        const youngAge = 0;
        setPopulation(planet, youngAge, 'unoccupied', 'none', 100);
        setWealth(planet, youngAge, 'unoccupied', 'none', 10000);

        const elderlyAge = 70;
        setPopulation(planet, elderlyAge, 'unoccupied', 'none', 100);

        intergenerationalTransfersForPlanet(planet);

        expect(getWealth(planet, youngAge, 'unoccupied', 'none')).toBeCloseTo(10000, 1);
    });

    it('young adults (16-21) have partial support capacity', () => {
        const youngAdultAge = 19;
        const childAge = 0;

        setPopulation(planet, youngAdultAge, 'employed', 'none', 100);
        setPopulation(planet, childAge, 'unoccupied', 'none', 1000);
        setWealth(planet, youngAdultAge, 'employed', 'none', 1000);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        intergenerationalTransfersForPlanet(planet);

        expect(getWealth(planet, youngAdultAge, 'employed', 'none')).toBeLessThan(1000);
    });

    it('no transfer to working-age non-disabled adults', () => {
        const workingAge = 40;
        const supporterAge = workingAge + GENERATION_GAP;

        setPopulation(planet, workingAge, 'employed', 'none', 100);
        setPopulation(planet, supporterAge, 'employed', 'none', 100);

        setWealth(planet, supporterAge, 'employed', 'none', 1000);
        setWealth(planet, workingAge, 'employed', 'none', 0);

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);
        const childWealth1 = getWealth(planet, childAge, 'unoccupied', 'none');

        // Reset
        setWealth(planet, childAge, 'unoccupied', 'none', 0);
        setFoodStock(planet, childAge, 'unoccupied', 'none', 0);

        // Scenario 2: high variance
        setWealth(planet, supporterAge, 'employed', 'none', supporterMean, supporterMean * supporterMean);

        intergenerationalTransfersForPlanet(planet);
        const childWealth2 = getWealth(planet, childAge, 'unoccupied', 'none');

        expect(childWealth1).toBeGreaterThan(0);
        expect(childWealth2).toBeLessThan(childWealth1);
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    it('handles empty planet gracefully', () => {
        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

        expect(getWealth(planet, 5, 'unoccupied', 'none')).toBe(0);
        expect(getWealth(planet, 10, 'unoccupied', 'none')).toBe(0);
    });

    it('handles planet with only elderly (mutual support through capacity)', () => {
        setPopulation(planet, 70, 'unoccupied', 'none', 100);
        setPopulation(planet, 80, 'unoccupied', 'none', 100);
        setWealth(planet, 80, 'unoccupied', 'none', 5000);
        setFoodStock(planet, 70, 'unoccupied', 'none', 0);

        intergenerationalTransfersForPlanet(planet);

        const poorElderlyWealth = getWealth(planet, 70, 'unoccupied', 'none');
        expect(poorElderlyWealth).toBeGreaterThan(0);
    });

    it('handles single person planet', () => {
        setPopulation(planet, 30, 'employed', 'none', 1);
        setWealth(planet, 30, 'employed', 'none', 100);

        intergenerationalTransfersForPlanet(planet);

        expect(getWealth(planet, 30, 'employed', 'none')).toBe(100);
    });

    it('does not produce negative wealth', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 10000);
        setPopulation(planet, 30, 'employed', 'none', 10);
        setWealth(planet, 30, 'employed', 'none', 0.001);
        setFoodStock(planet, 5, 'unoccupied', 'none', 0);

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

    beforeEach(() => {
        ({ planet } = makePlanetWithPopulation({}));
    });

    it('matrix is globally zero-sum after basic transfer', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 200);
        setPopulation(planet, 30, 'employed', 'none', 300);
        setWealth(planet, 30, 'employed', 'none', 500);
        setFoodStock(planet, 5, 'unoccupied', 'none', 0);

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

        const matrix = planet.population.lastTransferMatrix!;
        expect(sumTransferMatrix(matrix)).toBe(0);
    });

    it('single-age population → matrix is all zeros', () => {
        setPopulation(planet, 30, 'employed', 'none', 1);
        setWealth(planet, 30, 'employed', 'none', 100);

        intergenerationalTransfersForPlanet(planet);

        const matrix = planet.population.lastTransferMatrix!;
        expect(sumTransferMatrix(matrix)).toBe(0);
    });

    it('elderly-only planet with rich/poor still balances', () => {
        setPopulation(planet, 70, 'unoccupied', 'none', 100);
        setPopulation(planet, 80, 'unoccupied', 'none', 100);
        setWealth(planet, 80, 'unoccupied', 'none', 5000);
        setFoodStock(planet, 70, 'unoccupied', 'none', 0);

        intergenerationalTransfersForPlanet(planet);

        const matrix = planet.population.lastTransferMatrix!;
        expect(Math.abs(sumTransferMatrix(matrix))).toBeLessThan(1e-6);
    });

    it('extreme inequality still produces zero-sum matrix', () => {
        setPopulation(planet, 5, 'unoccupied', 'none', 10000);
        setPopulation(planet, 30, 'employed', 'none', 10);
        setWealth(planet, 30, 'employed', 'none', 0.001);
        setFoodStock(planet, 5, 'unoccupied', 'none', 0);

        intergenerationalTransfersForPlanet(planet);

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

        intergenerationalTransfersForPlanet(planet);

        const matrix = planet.population.lastTransferMatrix!;
        expect(Math.abs(sumTransferMatrix(matrix))).toBeLessThan(1e-4);
    });
});
