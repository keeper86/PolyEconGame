/**
 * population/mortality.test.ts
 *
 * Unit tests for the mortality sub-system: annual-to-per-tick conversion,
 * environmental mortality, and combined per-tick mortality calculations.
 *
 * NOTE: `convertAnnualToPerTick` has moved to `population.ts`.
 * `perTickMortality` now takes (age, extraAnnualMortality) — starvation
 * is handled per-category inside `applyMortality`, not in the rate function.
 */

import { describe, expect, it } from 'vitest';
import { TICKS_PER_YEAR } from '../constants';
import { computeEnvironmentalMortality } from './mortality';
import { convertAnnualToPerTick } from './population';

describe('convertAnnualToPerTick', () => {
    it('returns 0 for annual rate 0', () => {
        expect(convertAnnualToPerTick(0)).toBe(0);
    });

    it('returns 1 for annual rate 1', () => {
        expect(convertAnnualToPerTick(1)).toBe(1);
    });

    it('returns 1 for annual rate > 1', () => {
        expect(convertAnnualToPerTick(1.5)).toBe(1);
    });

    it('compounding per-tick rates reproduce the annual rate', () => {
        const annualRate = 0.1;
        const perTick = convertAnnualToPerTick(annualRate);
        const reconstructedAnnual = 1 - Math.pow(1 - perTick, TICKS_PER_YEAR);
        expect(reconstructedAnnual).toBeCloseTo(annualRate, 8);
    });

    it('works for small annual rates', () => {
        const annualRate = 0.001;
        const perTick = convertAnnualToPerTick(annualRate);
        expect(perTick).toBeGreaterThan(0);
        expect(perTick).toBeLessThan(annualRate);
    });
});

describe('computeEnvironmentalMortality', () => {
    it('returns zero with clean environment', () => {
        const env = {
            pollution: { air: 0, water: 0, soil: 0 },
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        };
        const result = computeEnvironmentalMortality(env);
        expect(result).toBe(0);
    });

    it('pollution mortality scales with air pollution', () => {
        const env = {
            pollution: { air: 50, water: 0, soil: 0 },
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        };
        const result = computeEnvironmentalMortality(env);
        expect(result).toBeCloseTo(50 * 0.006, 8);
    });

    it('disaster mortality includes all disaster types', () => {
        const env = {
            pollution: { air: 0, water: 0, soil: 0 },
            naturalDisasters: { earthquakes: 10, floods: 20, storms: 30 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        };
        const result = computeEnvironmentalMortality(env);
        const expected = 10 * 0.0005 + 20 * 0.00005 + 30 * 0.000015;
        expect(result).toBeCloseTo(expected, 8);
    });
});
