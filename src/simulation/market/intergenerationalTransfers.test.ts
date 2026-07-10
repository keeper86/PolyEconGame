import { beforeEach, describe, expect, it } from 'vitest';

import { GENERATION_GAP, RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY, SUPPORT_WEIGHT_SIGMA } from '../constants';
import { SERVICE_DEFINITIONS } from './serviceDefinitions';
import type { Planet } from '../planet/planet';

const groceryDef = SERVICE_DEFINITIONS.grocery;

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
import { groceryServiceResourceType } from '../planet/services';

const GROCERY_SERVICE = groceryServiceResourceType.name;

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

    cat.services.grocery.buffer = total > 0 ? (opts?.foodStock ?? 0) / total : 0;
}

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

describe('supportWeight', () => {
    it('returns a non-negative value for all inputs', () => {
        for (const diff of [-100, -50, -25, -10, 0, 10, 25, 50, 100]) {
            const w = supportWeight(diff);
            expect(w).toBeGreaterThanOrEqual(0);
        }
    });

    it('peaks near ageDifference = GENERATION_GAP (parent supporting child)', () => {
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
        expect(supportWeight(0)).toBeGreaterThan(0);
    });

    it('returns near-zero weight at extreme age differences', () => {
        expect(supportWeight(200)).toBeLessThan(1e-6);
        expect(supportWeight(-200)).toBeLessThan(1e-6);
    });

    it('positive ageDifference (supporter older) yields positive weight', () => {
        expect(supportWeight(GENERATION_GAP)).toBeGreaterThan(0);
    });

    it('negative ageDifference (supporter younger) yields positive weight', () => {
        expect(supportWeight(-GENERATION_GAP)).toBeGreaterThan(0);
    });

    it('weight at 2× generational gap is lower but still positive (grandparent-grandchild)', () => {
        const grandparent = supportWeight(2 * GENERATION_GAP);
        const parent = supportWeight(GENERATION_GAP);
        expect(grandparent).toBeGreaterThan(0);

        expect(grandparent).toBeLessThan(parent);
    });
});

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
        const result = effectiveSurplus(20, 0, 10, 50);
        expect(result).toBeCloseTo((20 - 10) * 50, 6);
    });

    it('reduces effective surplus when variance is high (precautionary discount)', () => {
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
        expect(effectiveSurplus(10 + 5e-7, 0, 10, 100)).toBe(0);
    });
});

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

        m[1].primary.employed = 100;
        m[2].primary.employed = -100;

        expect(sumTransferMatrix(m)).toBeCloseTo(0, 8);
    });

    it('returns a non-zero normalised value when matrix is unbalanced', () => {
        const m = createZeroTransferMatrix(2);
        m[0].none.unoccupied = 50;

        expect(Math.abs(sumTransferMatrix(m))).toBeCloseTo(1, 6);
    });
});

describe('intergenerationalTransfersForPlanet – no-op scenarios', () => {
    it('does nothing when the demography is empty (all zeros)', () => {
        const planet = makePlanet();
        intergenerationalTransfersForPlanet(planet);
        expect(totalHouseholdWealth(planet)).toBe(0);
    });

    it('does nothing when all food stocks are already at or above target', () => {
        const planet = makePlanet();
        const foodTarget = groceryDef.bufferTargetTicks;

        placePeople(planet, 40, 1000, { wealthMean: 500, foodStock: foodTarget * 1000 });

        placePeople(planet, 2, 200, { wealthMean: 0, foodStock: foodTarget * 200 });

        const wealthBefore = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);
        expect(totalHouseholdWealth(planet)).toBeCloseTo(wealthBefore, 4);
    });

    it('does nothing when potential supporters have no surplus above the floor', () => {
        const planet = makePlanet();
        const foodTarget = groceryDef.bufferTargetTicks;
        const baseFoodCost = foodTarget * (planet.marketPrices[GROCERY_SERVICE] ?? 1.0);

        placePeople(planet, 35, 500, { wealthMean: baseFoodCost, foodStock: foodTarget * 500 });

        placePeople(planet, 1, 100, { wealthMean: 0, foodStock: 0 });

        const wealthBefore = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);

        expect(totalHouseholdWealth(planet)).toBeCloseTo(wealthBefore, 4);
    });
});

describe('intergenerationalTransfersForPlanet – parent to infant', () => {
    let planet: Planet;
    const PARENT_AGE = GENERATION_GAP;
    const INFANT_AGE = 0;

    const foodTarget = groceryDef.bufferTargetTicks;

    beforeEach(() => {
        planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });

        placePeople(planet, PARENT_AGE, 1000, {
            wealthMean: 1000,
            foodStock: foodTarget * 1000,
        });

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

        expect(Math.abs(after - before)).toBeLessThan(1e-6 * Math.abs(before) + 1e-4);
    });

    it('infants with higher food-stock deficit receive more than those with less deficit', () => {
        const healthcareDef = SERVICE_DEFINITIONS.healthcare;
        const groceryPrice = planet.marketPrices[groceryDef.resource.name] ?? 0;
        const healthcarePrice = planet.marketPrices[healthcareDef.resource.name] ?? 0;
        const survivalFloor =
            (groceryDef.consumptionRatePerPersonPerTick(30, 'employed') * groceryPrice +
                healthcareDef.consumptionRatePerPersonPerTick(30, 'employed') * healthcarePrice) *
            RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY;
        placePeople(planet, PARENT_AGE, 1000, {
            wealthMean: survivalFloor * 2,
            foodStock: foodTarget * 1000,
        });

        const partialFood = foodTarget * 0.5 * 100;
        planet.population.demography[1].unoccupied.none.novice.total = 100;
        planet.population.demography[1].unoccupied.none.novice.wealth = { mean: 0, variance: 0 };
        planet.population.demography[1].unoccupied.none.novice.services.grocery.buffer = partialFood / 100;

        intergenerationalTransfersForPlanet(planet);

        const age0PerCapita = wealthAt(planet, 0) / 200;
        const age1PerCapita = wealthAt(planet, 1) / 100;

        expect(age0PerCapita).toBeGreaterThan(age1PerCapita);
    });
});

describe('intergenerationalTransfersForPlanet – elderly support', () => {
    it('elderly with empty food stocks receive wealth from working-age adults', () => {
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

        const WORKING_AGE = 40;
        const ELDERLY_AGE = WORKING_AGE + GENERATION_GAP;

        placePeople(planet, WORKING_AGE, 2000, {
            wealthMean: 500,
            foodStock: foodTarget * 2000,
        });

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
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

        placePeople(planet, 40, 2000, { wealthMean: 500, foodStock: foodTarget * 2000 });
        placePeople(planet, 65, 300, { wealthMean: 0, foodStock: 0 });

        const before = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);
        const after = totalHouseholdWealth(planet);

        expect(Math.abs(after - before)).toBeLessThan(1e-6 * Math.abs(before) + 1e-4);
    });
});

describe('intergenerationalTransfersForPlanet – wealth conservation', () => {
    it('total wealth is conserved across a multi-age population', () => {
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

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
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

        placePeople(planet, 0, 100, { wealthMean: 0, foodStock: 0 });
        placePeople(planet, 30, 500, { wealthMean: 300, foodStock: foodTarget * 500 });
        placePeople(planet, 65, 200, { wealthMean: 0, foodStock: 0 });

        intergenerationalTransfersForPlanet(planet);

        const normalisedSum = sumTransferMatrix(planet.population.lastTransferMatrix);

        expect(Math.abs(normalisedSum)).toBeLessThan(1e-4);
    });
});

describe('intergenerationalTransfersForPlanet – insufficient surplus', () => {
    it('makes no transfer when all potential supporters are at or below the survival floor', () => {
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

        const groceryPrice = planet.marketPrices[GROCERY_SERVICE] ?? 1.0;
        const floor = groceryDef.consumptionRatePerPersonPerTick(30, 'employed') * groceryPrice;

        placePeople(planet, 30, 500, { wealthMean: floor, foodStock: foodTarget * 500 });

        placePeople(planet, 0, 100, { wealthMean: 0, foodStock: 0 });

        const infantWealthBefore = wealthAt(planet, 0);
        intergenerationalTransfersForPlanet(planet);

        expect(wealthAt(planet, 0)).toBeCloseTo(infantWealthBefore, 8);
    });

    it('makes no transfer when needy ages are outside all supporter weight ranges', () => {
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

        placePeople(planet, 50, 1000, { wealthMean: 500, foodStock: foodTarget * 1000 });

        const before = totalHouseholdWealth(planet);
        intergenerationalTransfersForPlanet(planet);

        expect(totalHouseholdWealth(planet)).toBeCloseTo(before, 8);
    });
});

describe('intergenerationalTransfersForPlanet – support weight preference', () => {
    it('age group closer to GENERATION_GAP from needy contributes more than a distant group', () => {
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

        const INFANT_AGE = 0;

        const PARENT_AGE = GENERATION_GAP;
        const GREATGRAND_AGE = 3 * GENERATION_GAP;

        const initialWealth = 1000;
        placePeople(planet, PARENT_AGE, 500, {
            wealthMean: initialWealth,
            foodStock: foodTarget * 500,
        });
        placePeople(planet, GREATGRAND_AGE, 500, {
            wealthMean: initialWealth,
            foodStock: foodTarget * 500,
        });

        placePeople(planet, INFANT_AGE, 200, { wealthMean: 0, foodStock: 0 });

        intergenerationalTransfersForPlanet(planet);

        const parentGiven = initialWealth * 500 - wealthAt(planet, PARENT_AGE);
        const ggGiven = initialWealth * 500 - wealthAt(planet, GREATGRAND_AGE);

        expect(parentGiven).toBeGreaterThan(ggGiven);
    });
});

describe('intergenerationalTransfersForPlanet – lastTransferMatrix', () => {
    it('sets lastTransferMatrix on the planet after the tick', () => {
        const planet = makePlanet();
        expect(planet.population.lastTransferMatrix).toEqual([]);

        intergenerationalTransfersForPlanet(planet);

        expect(planet.population.lastTransferMatrix).toHaveLength(planet.population.demography.length);
    });

    it('matrix entries are negative for givers and positive for receivers', () => {
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

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
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

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
        const planet = makePlanet({ marketPrices: { [GROCERY_SERVICE]: 1.0 } });
        const foodTarget = groceryDef.bufferTargetTicks;

        const PARENT_AGE = GENERATION_GAP;
        placePeople(planet, PARENT_AGE, 1000, { wealthMean: 1000, foodStock: foodTarget * 1000 });
        placePeople(planet, 0, 200, { wealthMean: 0, foodStock: 0 });

        intergenerationalTransfersForPlanet(planet);

        const matrix = planet.population.lastTransferMatrix;

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
