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
    it('includes starvation component (quadratic)', () => {
        const envMort = { pollutionMortalityRate: 0, disasterDeathProbability: 0 };
        expect(computeExtraAnnualMortality(envMort, 0)).toBe(0);
        expect(computeExtraAnnualMortality(envMort, 1)).toBe(1); // 1² = 1
        expect(computeExtraAnnualMortality(envMort, 0.5)).toBeCloseTo(Math.pow(0.5, 2), 8);
    });

    it('sums pollution + disaster + starvation', () => {
        const envMort = { pollutionMortalityRate: 0.1, disasterDeathProbability: 0.05 };
        const starv = 0.5;
        const expected = 0.1 + 0.05 + Math.pow(0.5, 2);
        expect(computeExtraAnnualMortality(envMort, starv)).toBeCloseTo(expected, 8);
    });

    it('partial food (S=0.5) produces moderate extra mortality', () => {
        const envMort = { pollutionMortalityRate: 0, disasterDeathProbability: 0 };
        const extra = computeExtraAnnualMortality(envMort, 0.5);
        // S² = 0.25 → 25% extra annual mortality
        expect(extra).toBeCloseTo(0.25, 8);
        expect(extra).toBeLessThan(0.5); // not devastating
    });

    it('severe shortage (S=0.9) produces high but not total extra mortality', () => {
        const envMort = { pollutionMortalityRate: 0, disasterDeathProbability: 0 };
        const extra = computeExtraAnnualMortality(envMort, 0.9);
        // S² = 0.81
        expect(extra).toBeCloseTo(0.81, 8);
        expect(extra).toBeLessThan(1); // not total wipeout
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
        // At S=0.5, extra = 0.25.  For a 30-year-old this should be survivable.
        const mort = perTickMortality(30, 0.5, Math.pow(0.5, 2));
        // Annual mortality < 30% → per-tick is small
        expect(mort).toBeLessThan(0.01);
    });

    it('severe starvation (S=0.9) is high but most young people survive per tick', () => {
        const mort = perTickMortality(25, 0.9, Math.pow(0.9, 2));
        // Should be noticeable but not a per-tick wipeout
        expect(mort).toBeGreaterThan(0.001);
        expect(mort).toBeLessThan(0.1);
    });
});
