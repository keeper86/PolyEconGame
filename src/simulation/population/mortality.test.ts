import { describe, expect, it } from 'vitest';
import { TICKS_PER_YEAR } from '../constants';
import { computeEnvironmentalMortality, computeMortalityProbabilityPerTick, mortalityComponentsPerTick } from './mortality';
import { convertAnnualToPerTick } from '../utils/convertAnnualToPerTick';

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

describe('mortalityComponentsPerTick', () => {
    it('sums to the total mortality probability when uncapped', () => {
        const env = 0.001;
        for (const age of [5, 30, 50, 70]) {
            for (const starvation of [0, 0.25, 0.6]) {
                const total = computeMortalityProbabilityPerTick(starvation, env, age);
                const parts = mortalityComponentsPerTick(starvation, env, age);
                const sum = parts.baseline + parts.environment + parts.starvation;
                expect(sum).toBeCloseTo(total, 12);
            }
        }
    });

    it('attributes nothing to starvation when starvation is zero', () => {
        const parts = mortalityComponentsPerTick(0, 0.002, 40);
        expect(parts.starvation).toBe(0);
        expect(parts.environment).toBeGreaterThan(0);
        expect(parts.baseline).toBeGreaterThan(0);
    });

    it('shifts the share from baseline to starvation as starvation rises', () => {
        const calm = mortalityComponentsPerTick(0.1, 0.001, 40);
        const starving = mortalityComponentsPerTick(0.7, 0.001, 40);
        expect(starving.starvation).toBeGreaterThan(calm.starvation);
        expect(starving.starvation / (starving.baseline + starving.starvation)).toBeGreaterThan(
            calm.starvation / (calm.baseline + calm.starvation),
        );
    });

    it('keeps the baseline share at one when starvation and environment are zero', () => {
        const parts = mortalityComponentsPerTick(0, 0, 40);
        expect(parts.starvation).toBe(0);
        expect(parts.environment).toBe(0);
        expect(parts.baseline).toBeCloseTo(computeMortalityProbabilityPerTick(0, 0, 40), 12);
    });
});
