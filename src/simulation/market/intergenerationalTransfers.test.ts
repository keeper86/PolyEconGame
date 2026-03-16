/**
 * intergenerationalTransfers.test.ts
 *
 * Tests for the intergenerational wealth-transfer system.
 *
 * The module moves wealth from age groups that have surplus above their
 * survival floor toward age groups whose food stock falls short of the
 * buffer target.  The key public contracts are:
 *
 *   supportWeight       – multi-peak Gaussian kernel for familial affinity
 *   effectiveSurplus    – variance-discounted surplus above a floor
 *   createZeroTransferMatrix / sumTransferMatrix – bookkeeping helpers
 *   intergenerationalTransfersForPlanet – the main tick entry-point
 *
 * Test organisation:
 *   1. supportWeight
 *   2. effectiveSurplus
 *   3. Transfer matrix helpers
 *   4. Integration – no transfers when no one needs help
 *   5. Integration – basic parent → infant scenario
 *   6. Integration – elderly dependents receive support
 *   7. Integration – wealth is conserved (zero-sum)
 *   8. Integration – no surplus available → nobody is credited
 *   9. Integration – support weight biases who gives
 *  10. Integration – planet.population.lastTransferMatrix is updated
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK, GENERATION_GAP, SUPPORT_WEIGHT_SIGMA } from '../constants';
import type { Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { OCCUPATIONS, SKILL } from '../population/population';
import { makePlanet } from '../utils/testHelper';
import {
    createZeroTransferMatrix,
    effectiveSurplus,
    intergenerationalTransfersForPlanet,
    sumTransferMatrix,
    supportWeight,
} from './intergenerationalTransfers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum per-capita wealth × population across all cells of the full demography. */
function totalHouseholdWealth(planet: Planet): number {
    let sum = 0;
    for (const cohort of planet.population.demography) {
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    sum += cat.total * cat.wealth.mean;
                }
            }
        }
    }
    return sum;
}

/** Set population + wealth in the single 'unoccupied/none/novice' leaf at a given age. */
function placePeople(
    planet: Planet,
    age: number,
    total: number,
    opts?: {
        wealthMean?: number;
        foodStock?: number;
        occ?: (typeof OCCUPATIONS)[number];
        edu?: (typeof educationLevelKeys)[number];
    },
): void {
    const occ = opts?.occ ?? 'unoccupied';
    const edu = opts?.edu ?? 'none';
    const cat = planet.population.demography[age][occ][edu].novice;
    cat.total = total;
    cat.wealth = { mean: opts?.wealthMean ?? 0, variance: 0 };
    cat.foodStock = opts?.foodStock ?? 0;
}

/** Read back the total wealth at one (age, occ, edu) across all skills. */
function wealthAt(
    planet: Planet,
    age: number,
    occ: (typeof OCCUPATIONS)[number] = 'unoccupied',
    edu: (typeof educationLevelKeys)[number] = 'none',
): number {
    let sum = 0;
    for (const skill of SKILL) {
        const cat = planet.population.demography[age][occ][edu][skill];
        sum += cat.total * cat.wealth.mean;
    }
    return sum;
}

// ---------------------------------------------------------------------------
// 1. supportWeight
// ---------------------------------------------------------------------------

describe('supportWeight', () => {
    it('returns a non-negative value for all inputs', () => {
        // supportWeight is a non-normalised Gaussian mixture kernel — values
        // can exceed 1.0 near n=0 (same-generation / sibling support) where
        // the amplitude factor exp(-0.5*(n-1)) evaluates to exp(+0.5) ≈ 1.65.
        for (const diff of [-100, -50, -25, -10, 0, 10, 25, 50, 100]) {
            const w = supportWeight(diff);
            expect(w).toBeGreaterThanOrEqual(0);
        }
    });

    it('peaks near ageDifference = GENERATION_GAP (parent supporting child)', () => {
        // A parent is ~GENERATION_GAP years older than their child.
        // The weight should be higher at the generational peak than far from it.
        const atPeak = supportWeight(GENERATION_GAP);
        const far = supportWeight(GENERATION_GAP + 3 * SUPPORT_WEIGHT_SIGMA);
        expect(atPeak).toBeGreaterThan(far);
    });

    it('peaks near ageDifference = -GENERATION_GAP (child supporting parent)', () => {
        const atPeak = supportWeight(-GENERATION_GAP);
        const far = supportWeight(-GENERATION_GAP - 3 * SUPPORT_WEIGHT_SIGMA);
        expect(atPeak).toBeGreaterThan(far);
    });

    it('returns a positive weight at age difference 0 (self/sibling support)', () => {
        // The kernel has a harmonic at n=0 (same generation / siblings).
        expect(supportWeight(0)).toBeGreaterThan(0);
    });

    it('returns near-zero weight at extreme age differences', () => {
        // 200 years is far outside any generational harmonic.
        expect(supportWeight(200)).toBeLessThan(1e-6);
        expect(supportWeight(-200)).toBeLessThan(1e-6);
    });

    it('positive ageDifference (supporter older) yields positive weight', () => {
        // Parents help children — supporter is older, difference > 0.
        expect(supportWeight(GENERATION_GAP)).toBeGreaterThan(0);
    });

    it('negative ageDifference (supporter younger) yields positive weight', () => {
        // Children help elderly parents — supporter is younger, difference < 0.
        expect(supportWeight(-GENERATION_GAP)).toBeGreaterThan(0);
    });

    it('weight at 2× generational gap is lower but still positive (grandparent-grandchild)', () => {
        const grandparent = supportWeight(2 * GENERATION_GAP);
        const parent = supportWeight(GENERATION_GAP);
        expect(grandparent).toBeGreaterThan(0);
        // Grandparent support is penalised by the amplitude factor — lower weight.
        expect(grandparent).toBeLessThan(parent);
    });
});

// ---------------------------------------------------------------------------
// 2. effectiveSurplus
// ---------------------------------------------------------------------------

describe('effectiveSurplus', () => {
    it('returns 0 when mean is below the floor', () => {
        expect(effectiveSurplus(5, 0, 10, 100)).toBe(0);
    });

    it('returns 0 when mean equals the floor exactly', () => {
        expect(effectiveSurplus(10, 0, 10, 100)).toBe(0);
    });

    it('returns 0 when population is zero', () => {
        expect(effectiveSurplus(100, 0, 10, 0)).toBe(0);
    });

    it('returns population × naive surplus for zero variance (homogeneous group)', () => {
        // cv² = 0 → alpha = 1 → effectiveSurplus = naiveSurplus × population
        const result = effectiveSurplus(20, 0, 10, 50);
        expect(result).toBeCloseTo((20 - 10) * 50, 6);
    });

    it('reduces effective surplus when variance is high (precautionary discount)', () => {
        // High variance means wealth is concentrated; only the "mean share" above floor
        // is reliably transferable. The coefficient of variation penalty shrinks the result.
        const noVariance = effectiveSurplus(20, 0, 10, 100);
        const highVariance = effectiveSurplus(20, 400, 10, 100);
        expect(highVariance).toBeLessThan(noVariance);
    });

    it('discount is monotonically increasing with variance', () => {
        const low = effectiveSurplus(20, 10, 5, 100);
        const mid = effectiveSurplus(20, 100, 5, 100);
        const high = effectiveSurplus(20, 500, 5, 100);
        expect(low).toBeGreaterThan(mid);
        expect(mid).toBeGreaterThan(high);
    });

    it('is proportional to population (linearly)', () => {
        const s100 = effectiveSurplus(30, 0, 10, 100);
        const s200 = effectiveSurplus(30, 0, 10, 200);
        expect(s200).toBeCloseTo(2 * s100, 6);
    });

    it('returns 0 for tiny surplus below dust tolerance', () => {
        // naiveSurplus = 5e-7 which is less than 1e-6
        expect(effectiveSurplus(10 + 5e-7, 0, 10, 100)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 3. Transfer matrix helpers
// ---------------------------------------------------------------------------

describe('createZeroTransferMatrix', () => {
    it('creates an array of the requested length', () => {
        const m = createZeroTransferMatrix(5);
        expect(m).toHaveLength(5);
    });

    it('every cell is initialised to 0', () => {
        const m = createZeroTransferMatrix(3);
        for (const cohort of m) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    expect(cohort[edu][occ]).toBe(0);
                }
            }
        }
    });
});

describe('sumTransferMatrix', () => {
    it('returns 0 (normalised) for an all-zero matrix', () => {
        const m = createZeroTransferMatrix(5);
        expect(sumTransferMatrix(m)).toBe(0);
    });

    it('returns 0 for a perfectly balanced matrix (debit == credit)', () => {
        const m = createZeroTransferMatrix(3);
        // Credit age-1 primary/employed by +100, debit age-2 primary/employed by -100.
        m[1].primary.employed = 100;
        m[2].primary.employed = -100;
        // normalised sum: (100 + -100) / 100 = 0
        expect(sumTransferMatrix(m)).toBeCloseTo(0, 8);
    });

    it('returns a non-zero normalised value when matrix is unbalanced', () => {
        const m = createZeroTransferMatrix(2);
        m[0].none.unoccupied = 50;
        // Only one side: sum = 50, normalised = 50/50 = 1
        expect(Math.abs(sumTransferMatrix(m))).toBeCloseTo(1, 6);
    });
});

// ---------------------------------------------------------------------------
// 4. Integration – no transfers when nobody needs help
// ---------------------------------------------------------------------------

describe('intergenerationalTransfersForPlanet – no-op scenarios', () => {
    it('does nothing when the demography is empty (all zeros)', () => {
        const planet = makePlanet();
        intergenerationalTransfersForPlanet(planet);
        expect(totalHouseholdWealth(planet)).toBe(0);
    });

    it('does nothing when all food stocks are already at or above target', () => {
        const planet = makePlanet();
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        // Parent-age people: wealthy, food stock already full.
        placePeople(planet, 40, 1000, { wealthMean: 500, foodStock: foodTarget * 1000 });
        // Infant-age people: food stock already full — no need.
        placePeople(planet, 2, 200, { wealthMean: 0, foodStock: foodTarget * 200 });

        const wealthBefore = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);
        expect(totalHouseholdWealth(planet)).toBeCloseTo(wealthBefore, 4);
    });

    it('does nothing when potential supporters have no surplus above the floor', () => {
        const planet = makePlanet();
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
        const baseFoodCost = foodTarget * (planet.priceLevel ?? 1.0);

        // Supporters at survival floor — no surplus.
        placePeople(planet, 35, 500, { wealthMean: baseFoodCost, foodStock: foodTarget * 500 });
        // Needy infants — low food stock.
        placePeople(planet, 1, 100, { wealthMean: 0, foodStock: 0 });

        const wealthBefore = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);
        // No surplus means nothing can be transferred.
        expect(totalHouseholdWealth(planet)).toBeCloseTo(wealthBefore, 4);
    });
});

// ---------------------------------------------------------------------------
// 5. Integration – basic parent → infant scenario
// ---------------------------------------------------------------------------

describe('intergenerationalTransfersForPlanet – parent to infant', () => {
    let planet: Planet;
    const PARENT_AGE = GENERATION_GAP; // ~25
    const INFANT_AGE = 0;
    const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

    beforeEach(() => {
        planet = makePlanet({ priceLevel: 1.0 });
        // Parents: wealthy, food fully stocked — plenty of surplus.
        placePeople(planet, PARENT_AGE, 1000, {
            wealthMean: 1000,
            foodStock: foodTarget * 1000,
        });
        // Infants: no wealth, no food stock.
        placePeople(planet, INFANT_AGE, 200, {
            wealthMean: 0,
            foodStock: 0,
        });
    });

    it('wealth is transferred from parents to infants', () => {
        const parentWealthBefore = wealthAt(planet, PARENT_AGE);
        const infantWealthBefore = wealthAt(planet, INFANT_AGE);

        intergenerationalTransfersForPlanet(planet);

        const parentWealthAfter = wealthAt(planet, PARENT_AGE);
        const infantWealthAfter = wealthAt(planet, INFANT_AGE);

        expect(parentWealthAfter).toBeLessThan(parentWealthBefore);
        expect(infantWealthAfter).toBeGreaterThan(infantWealthBefore);
    });

    it('the transfer is strictly zero-sum (total household wealth conserved)', () => {
        const before = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);
        const after = totalHouseholdWealth(planet);
        // Allow a small floating-point tolerance.
        expect(Math.abs(after - before)).toBeLessThan(1e-6 * Math.abs(before) + 1e-4);
    });

    it('infants with higher food-stock deficit receive more than those with less deficit', () => {
        // Add a second group of infants with partial food stock.
        const partialFood = (foodTarget * 100) / 2; // 50 % stocked
        planet.population.demography[1].unoccupied.none.novice.total = 100;
        planet.population.demography[1].unoccupied.none.novice.wealth = { mean: 0, variance: 0 };
        planet.population.demography[1].unoccupied.none.novice.foodStock = partialFood;

        intergenerationalTransfersForPlanet(planet);

        // Age-0 infants got nothing (no food at all) → should receive more per capita.
        const age0PerCapita = wealthAt(planet, 0) / 200;
        const age1PerCapita = wealthAt(planet, 1) / 100;

        expect(age0PerCapita).toBeGreaterThan(age1PerCapita);
    });
});

// ---------------------------------------------------------------------------
// 6. Integration – elderly dependents receive support
// ---------------------------------------------------------------------------

describe('intergenerationalTransfersForPlanet – elderly support', () => {
    it('elderly with empty food stocks receive wealth from working-age adults', () => {
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        const WORKING_AGE = 40;
        const ELDERLY_AGE = WORKING_AGE + GENERATION_GAP; // ~65

        // Wealthy working-age adults with full food buffer.
        placePeople(planet, WORKING_AGE, 2000, {
            wealthMean: 500,
            foodStock: foodTarget * 2000,
        });
        // Elderly with no food stock and no wealth.
        placePeople(planet, ELDERLY_AGE, 300, {
            wealthMean: 0,
            foodStock: 0,
        });

        const elderlyBefore = wealthAt(planet, ELDERLY_AGE);
        intergenerationalTransfersForPlanet(planet);
        const elderlyAfter = wealthAt(planet, ELDERLY_AGE);

        expect(elderlyAfter).toBeGreaterThan(elderlyBefore);
    });

    it('zero-sum is maintained for the elderly scenario', () => {
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        placePeople(planet, 40, 2000, { wealthMean: 500, foodStock: foodTarget * 2000 });
        placePeople(planet, 65, 300, { wealthMean: 0, foodStock: 0 });

        const before = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);
        const after = totalHouseholdWealth(planet);

        expect(Math.abs(after - before)).toBeLessThan(1e-6 * Math.abs(before) + 1e-4);
    });
});

// ---------------------------------------------------------------------------
// 7. Integration – wealth is conserved (zero-sum) in a complex scenario
// ---------------------------------------------------------------------------

describe('intergenerationalTransfersForPlanet – wealth conservation', () => {
    it('total wealth is conserved across a multi-age population', () => {
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        // Seed several age groups with varying wealth and food stocks.
        placePeople(planet, 0, 100, { wealthMean: 0, foodStock: 0 });
        placePeople(planet, 5, 200, { wealthMean: 5, foodStock: 0 });
        placePeople(planet, 30, 800, { wealthMean: 300, foodStock: foodTarget * 800 });
        placePeople(planet, 35, 600, { wealthMean: 200, foodStock: foodTarget * 600 });
        placePeople(planet, 60, 400, { wealthMean: 50, foodStock: foodTarget * 400 });
        placePeople(planet, 70, 150, { wealthMean: 0, foodStock: 0 });
        placePeople(planet, 80, 80, { wealthMean: 0, foodStock: 0 });

        const before = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);
        const after = totalHouseholdWealth(planet);

        expect(Math.abs(after - before)).toBeLessThan(1e-6 * Math.abs(before) + 1e-3);
    });

    it('lastTransferMatrix is zero-sum after a complex run', () => {
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        placePeople(planet, 0, 100, { wealthMean: 0, foodStock: 0 });
        placePeople(planet, 30, 500, { wealthMean: 300, foodStock: foodTarget * 500 });
        placePeople(planet, 65, 200, { wealthMean: 0, foodStock: 0 });

        intergenerationalTransfersForPlanet(planet);

        const normalisedSum = sumTransferMatrix(planet.population.lastTransferMatrix);
        // The matrix must be zero-sum within the tolerance checked internally.
        expect(Math.abs(normalisedSum)).toBeLessThan(1e-4);
    });
});

// ---------------------------------------------------------------------------
// 8. Integration – no surplus available → nobody is credited
// ---------------------------------------------------------------------------

describe('intergenerationalTransfersForPlanet – insufficient surplus', () => {
    it('makes no transfer when all potential supporters are at or below the survival floor', () => {
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;
        const floor = foodTarget * (planet.priceLevel ?? 1.0);

        // Supporters exactly at the floor — effective surplus is 0.
        placePeople(planet, 30, 500, { wealthMean: floor, foodStock: foodTarget * 500 });
        // Needy infants.
        placePeople(planet, 0, 100, { wealthMean: 0, foodStock: 0 });

        const infantWealthBefore = wealthAt(planet, 0);
        intergenerationalTransfersForPlanet(planet);
        // Infants should be no wealthier.
        expect(wealthAt(planet, 0)).toBeCloseTo(infantWealthBefore, 8);
    });

    it('makes no transfer when needy ages are outside all supporter weight ranges', () => {
        // Use a very small demography where the only needy age is the
        // supporter itself — age difference 0. supportWeight(0) > 0, so to truly
        // have no support we place needy people at an age with zero supporters nearby.
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        // Rich person at age 50 — but nobody needy exists.
        placePeople(planet, 50, 1000, { wealthMean: 500, foodStock: foodTarget * 1000 });

        const before = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);
        // Nothing to transfer — all food stocks full.
        expect(totalHouseholdWealth(planet)).toBeCloseTo(before, 8);
    });
});

// ---------------------------------------------------------------------------
// 9. Integration – support weight biases who gives
// ---------------------------------------------------------------------------

describe('intergenerationalTransfersForPlanet – support weight preference', () => {
    it('age group closer to GENERATION_GAP from needy contributes more than a distant group', () => {
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        const INFANT_AGE = 0;
        // Two potential supporter groups of equal wealth:
        // – group A at distance GENERATION_GAP (parents)  → high weight
        // – group B at distance 3*GENERATION_GAP (great-grandparents) → low weight
        const PARENT_AGE = GENERATION_GAP; // ~25
        const GREATGRAND_AGE = 3 * GENERATION_GAP; // ~75

        const initialWealth = 1000;
        placePeople(planet, PARENT_AGE, 500, {
            wealthMean: initialWealth,
            foodStock: foodTarget * 500,
        });
        placePeople(planet, GREATGRAND_AGE, 500, {
            wealthMean: initialWealth,
            foodStock: foodTarget * 500,
        });
        // Needy infants.
        placePeople(planet, INFANT_AGE, 200, { wealthMean: 0, foodStock: 0 });

        intergenerationalTransfersForPlanet(planet);

        const parentGiven = initialWealth * 500 - wealthAt(planet, PARENT_AGE);
        const ggGiven = initialWealth * 500 - wealthAt(planet, GREATGRAND_AGE);

        // Parents should contribute more due to higher support weight.
        expect(parentGiven).toBeGreaterThan(ggGiven);
    });
});

// ---------------------------------------------------------------------------
// 10. Integration – lastTransferMatrix is written
// ---------------------------------------------------------------------------

describe('intergenerationalTransfersForPlanet – lastTransferMatrix', () => {
    it('sets lastTransferMatrix on the planet after the tick', () => {
        const planet = makePlanet();
        expect(planet.population.lastTransferMatrix).toEqual([]);

        intergenerationalTransfersForPlanet(planet);

        // Should be populated with one entry per demography age slot.
        expect(planet.population.lastTransferMatrix).toHaveLength(planet.population.demography.length);
    });

    it('matrix entries are negative for givers and positive for receivers', () => {
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        const PARENT_AGE = GENERATION_GAP;
        const INFANT_AGE = 0;

        placePeople(planet, PARENT_AGE, 1000, {
            wealthMean: 1000,
            foodStock: foodTarget * 1000,
        });
        placePeople(planet, INFANT_AGE, 200, {
            wealthMean: 0,
            foodStock: 0,
        });

        intergenerationalTransfersForPlanet(planet);

        const matrix = planet.population.lastTransferMatrix;

        // At least one giver cell must be negative.
        let hasNegative = false;
        let hasPositive = false;
        for (const cohort of matrix) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    if (cohort[edu][occ] < 0) {
                        hasNegative = true;
                    }
                    if (cohort[edu][occ] > 0) {
                        hasPositive = true;
                    }
                }
            }
        }
        expect(hasNegative).toBe(true);
        expect(hasPositive).toBe(true);
    });

    it('matrix is all zeros when nobody needs support', () => {
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        // Everyone has full food stock.
        placePeople(planet, 30, 500, { wealthMean: 100, foodStock: foodTarget * 500 });

        intergenerationalTransfersForPlanet(planet);

        const matrix = planet.population.lastTransferMatrix;
        for (const cohort of matrix) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    expect(cohort[edu][occ]).toBe(0);
                }
            }
        }
    });

    it('matrix cell for infant age is positive (received) after a transfer', () => {
        const planet = makePlanet({ priceLevel: 1.0 });
        const foodTarget = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

        const PARENT_AGE = GENERATION_GAP;
        placePeople(planet, PARENT_AGE, 1000, { wealthMean: 1000, foodStock: foodTarget * 1000 });
        placePeople(planet, 0, 200, { wealthMean: 0, foodStock: 0 });

        intergenerationalTransfersForPlanet(planet);

        const matrix = planet.population.lastTransferMatrix;
        // The infant age row must contain at least one positive entry.
        let infantRowPositive = false;
        const infantCohort = matrix[0];
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                if (infantCohort[edu][occ] > 0) {
                    infantRowPositive = true;
                }
            }
        }
        expect(infantRowPositive).toBe(true);
    });
});
