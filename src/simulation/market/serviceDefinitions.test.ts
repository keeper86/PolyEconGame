import { describe, expect, it } from 'vitest';
import { HOUSING_BUILD_MONTHS, HOUSING_LIFETIME_MONTHS, TICKS_PER_MONTH } from '../constants';
import { constructionServiceResourceType } from '../planet/services';
import { makePlanet } from '../utils/testHelper';
import {
    householdDemandPriority,
    referenceMonthlyIncome,
    SERVICE_DEFINITIONS,
    SERVICE_TIERS,
} from './serviceDefinitions';

describe('wage-grounded Engel saturation', () => {
    it('is scale-invariant: rescaling wealth and reference income by the same factor leaves the rate unchanged', () => {
        for (const key of ['grocery', 'retail', 'construction'] as const) {
            const def = SERVICE_DEFINITIONS[key];
            const low = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 100, variance: 0 }, 30);
            const high = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 100000, variance: 0 }, 30000);
            expect(low).toBeCloseTo(high, 10);
        }
    });

    it('derives reference income from the live planet wage', () => {
        const planet = makePlanet();
        planet.wagePerEdu = { none: 10, primary: 10, secondary: 10, tertiary: 10 };
        expect(referenceMonthlyIncome(planet)).toBe(10 * TICKS_PER_MONTH);
    });
});

describe('Construction-as-housing sector', () => {
    it('reuses the existing Construction resource and is the residual demand (last in priority, not a tier)', () => {
        expect(SERVICE_DEFINITIONS.construction.resource).toBe(constructionServiceResourceType);
        expect(householdDemandPriority[householdDemandPriority.length - 1]).toBe(constructionServiceResourceType.name);
        const tierServices = SERVICE_TIERS.flatMap((tier) => tier.services);
        expect(tierServices).not.toContain('construction');
    });

    it('has a lifetime-scale buffer but a short build time (decoupled refill)', () => {
        const def = SERVICE_DEFINITIONS.construction;
        expect(def.bufferTargetTicks).toBe(HOUSING_LIFETIME_MONTHS * TICKS_PER_MONTH);
        expect(def.refillTicks).toBe(HOUSING_BUILD_MONTHS * TICKS_PER_MONTH);
        expect(def.refillTicks).toBeLessThan(def.bufferTargetTicks);
    });

    it('has a hard wealth threshold: zero demand below it, linear rise above it', () => {
        const def = SERVICE_DEFINITIONS.construction;
        const refIncome = 30;
        const below = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 300, variance: 0 }, refIncome);
        expect(below).toBe(0);
        const modest = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 660, variance: 0 }, refIncome);
        const wealthy = def.consumptionRatePerPersonPerTick(30, 'employed', { mean: 960, variance: 0 }, refIncome);
        expect(modest).toBeGreaterThan(0);
        expect(wealthy).toBeGreaterThan(modest);
        expect(wealthy).toBeCloseTo(modest * 2, 5);
    });

    it('decays at the base rate regardless of wealth (houses perish over a lifetime)', () => {
        const def = SERVICE_DEFINITIONS.construction;
        const refIncome = 30;
        const poor = def.decayRatePerPersonPerTick(30, 'employed', { mean: 0, variance: 0 }, refIncome);
        const rich = def.decayRatePerPersonPerTick(30, 'employed', { mean: 6000, variance: 0 }, refIncome);
        expect(poor).toBe(rich);
        expect(poor).toBeGreaterThan(0);
    });
});
