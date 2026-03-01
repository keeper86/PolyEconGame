/**
 * population/mortality.test.ts
 *
 * Unit tests for the mortality sub-system: annual-to-per-tick conversion,
 * environmental mortality, and combined per-tick mortality calculations.
 */

import { describe, it, expect } from 'vitest';
import { TICKS_PER_YEAR } from '../constants';
import {
    convertAnnualToPerTick,
    computeEnvironmentalMortality,
    computeExtraAnnualMortality,
    perTickMortality,
    MAX_MORTALITY_PER_TICK,
} from './mortality';

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
        expect(result.pollutionMortalityRate).toBe(0);
        expect(result.disasterDeathProbability).toBe(0);
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
        expect(result.pollutionMortalityRate).toBeCloseTo(50 * 0.006, 8);
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
        expect(result.disasterDeathProbability).toBeCloseTo(expected, 8);
    });
});

describe('computeExtraAnnualMortality', () => {
    it('returns zero with no pollution or disasters', () => {
        const envMort = { pollutionMortalityRate: 0, disasterDeathProbability: 0 };
        expect(computeExtraAnnualMortality(envMort)).toBe(0);
    });

    it('sums pollution + disaster only (starvation excluded to avoid double counting)', () => {
        const envMort = { pollutionMortalityRate: 0.1, disasterDeathProbability: 0.05 };
        expect(computeExtraAnnualMortality(envMort)).toBeCloseTo(0.15, 8);
    });

    it('pollution and disaster are additive', () => {
        const envMort = { pollutionMortalityRate: 0.2, disasterDeathProbability: 0.03 };
        expect(computeExtraAnnualMortality(envMort)).toBeCloseTo(0.23, 8);
    });
});

describe('perTickMortality', () => {
    it('returns 0-ish for young people in clean conditions', () => {
        // A 20-year-old with no starvation and no extra mortality
        const mort = perTickMortality(20, 0, 0);
        expect(mort).toBeGreaterThan(0);
        expect(mort).toBeLessThan(0.001); // very low
    });

    it('returns high mortality for very old age', () => {
        const mort = perTickMortality(99, 0, 0);
        expect(mort).toBeGreaterThan(0.0005);
    });

    it('is capped at MAX_MORTALITY_PER_TICK', () => {
        // Extreme starvation + extreme extra mortality
        const mort = perTickMortality(80, 1, 1);
        expect(mort).toBeLessThanOrEqual(MAX_MORTALITY_PER_TICK);
    });

    it('starvation amplifies base mortality', () => {
        const normal = perTickMortality(50, 0, 0);
        const starved = perTickMortality(50, 1, 0);
        expect(starved).toBeGreaterThan(normal);
    });

    it('extra annual mortality increases per-tick mortality', () => {
        const noExtra = perTickMortality(30, 0, 0);
        const withExtra = perTickMortality(30, 0, 0.5);
        expect(withExtra).toBeGreaterThan(noExtra);
    });

    it('partial starvation (S=0.5) does not collapse a young population', () => {
        // At S=0.5, base mortality is amplified by (1 + 0.25 × 9) = 3.25×; extra is only env factors.
        const mort = perTickMortality(30, 0.5, 0);
        // Annual mortality still low for a 30-year-old even at moderate starvation
        expect(mort).toBeLessThan(0.01);
    });

    it('severe starvation (S=0.9) is high but most young people survive per tick', () => {
        // Without starvation
        const mortNormal = perTickMortality(25, 0, 0);
        // With S=0.9: base amplified by (1 + 0.81 × 9) = 8.29×; use 6× as conservative lower bound
        const mort = perTickMortality(25, 0.9, 0);
        // Should be clearly higher than normal
        expect(mort).toBeGreaterThan(mortNormal * 6);
        // Still a per-tick survival rate above 95%
        expect(mort).toBeLessThan(0.05);
    });
});
