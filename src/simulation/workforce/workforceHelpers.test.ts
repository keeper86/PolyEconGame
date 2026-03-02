import { describe, it, expect } from 'vitest';

import { mortalityProbability } from '../population/populationHelpers';

import {
    MAX_TENURE_YEARS,
    NOTICE_PERIOD_MONTHS,
    DEFAULT_HIRE_AGE_MEAN,
    RETIREMENT_AGE,
    createWorkforceDemography,
    emptyTenureCohort,
    experienceMultiplier,
    ageProductivityMultiplier,
    normalCdf,
    expectedRateForMoments,
    totalDepartingFiredForEdu,
    totalRetiringForEdu,
} from './workforceHelpers';

// ---------------------------------------------------------------------------
// experienceMultiplier
// ---------------------------------------------------------------------------

describe('experienceMultiplier', () => {
    it('returns 1.0 for 0 tenure years', () => {
        expect(experienceMultiplier(0)).toBe(1.0);
    });

    it('returns 1.5 for 10+ tenure years', () => {
        expect(experienceMultiplier(10)).toBe(1.5);
        expect(experienceMultiplier(40)).toBe(1.5);
    });

    it('interpolates linearly between 0 and 10 years', () => {
        expect(experienceMultiplier(5)).toBeCloseTo(1.25, 5);
    });
});

// ---------------------------------------------------------------------------
// emptyTenureCohort / createWorkforceDemography
// ---------------------------------------------------------------------------

describe('emptyTenureCohort', () => {
    it('has zeroed active, departing, and retiring arrays for all education levels', () => {
        const cohort = emptyTenureCohort();
        for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as const) {
            expect(cohort.active[edu]).toBe(0);
            expect(cohort.departing[edu]).toHaveLength(NOTICE_PERIOD_MONTHS);
            expect(cohort.departing[edu].every((v) => v === 0)).toBe(true);
            expect(cohort.retiring[edu]).toHaveLength(NOTICE_PERIOD_MONTHS);
            expect(cohort.retiring[edu].every((v) => v === 0)).toBe(true);
        }
    });

    it('initialises ageMoments with DEFAULT_HIRE_AGE_MEAN and zero variance', () => {
        const cohort = emptyTenureCohort();
        for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as const) {
            expect(cohort.ageMoments[edu].mean).toBe(DEFAULT_HIRE_AGE_MEAN);
            expect(cohort.ageMoments[edu].variance).toBe(0);
        }
    });
});

describe('createWorkforceDemography', () => {
    it('creates MAX_TENURE_YEARS + 1 cohorts', () => {
        const wf = createWorkforceDemography();
        expect(wf).toHaveLength(MAX_TENURE_YEARS + 1);
    });
});

// ---------------------------------------------------------------------------
// ageProductivityMultiplier
// ---------------------------------------------------------------------------

describe('ageProductivityMultiplier', () => {
    it('returns 0.8 for workers aged 18 or younger', () => {
        expect(ageProductivityMultiplier(14)).toBe(0.8);
        expect(ageProductivityMultiplier(18)).toBe(0.8);
    });

    it('returns 1.0 for peak-productivity ages (30–50)', () => {
        expect(ageProductivityMultiplier(30)).toBe(1.0);
        expect(ageProductivityMultiplier(40)).toBe(1.0);
        expect(ageProductivityMultiplier(50)).toBe(1.0);
    });

    it('interpolates between 18 and 30', () => {
        const v = ageProductivityMultiplier(24);
        expect(v).toBeGreaterThan(0.8);
        expect(v).toBeLessThan(1.0);
    });

    it('declines after age 50', () => {
        expect(ageProductivityMultiplier(60)).toBeLessThan(1.0);
        expect(ageProductivityMultiplier(70)).toBeLessThan(ageProductivityMultiplier(60));
    });

    it('does not go below 0.7', () => {
        expect(ageProductivityMultiplier(100)).toBeGreaterThanOrEqual(0.7);
    });
});

// ---------------------------------------------------------------------------
// RETIREMENT_AGE
// ---------------------------------------------------------------------------

describe('RETIREMENT_AGE', () => {
    it('is 67', () => {
        expect(RETIREMENT_AGE).toBe(67);
    });
});

// ---------------------------------------------------------------------------
// normalCdf
// ---------------------------------------------------------------------------

describe('normalCdf', () => {
    it('returns 0.5 for z = 0', () => {
        expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    });

    it('returns ~0.8413 for z = 1', () => {
        expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    });

    it('returns ~0.1587 for z = -1', () => {
        expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
    });

    it('returns ~0.9772 for z = 2', () => {
        expect(normalCdf(2)).toBeCloseTo(0.9772, 3);
    });

    it('returns 0 for very negative z', () => {
        expect(normalCdf(-10)).toBe(0);
    });

    it('returns 1 for very positive z', () => {
        expect(normalCdf(10)).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// expectedRateForMoments
// ---------------------------------------------------------------------------

describe('expectedRateForMoments', () => {
    it('evaluates at mean age for delta distribution (variance = 0)', () => {
        const rateFn = (age: number) => age * 0.01;
        const result = expectedRateForMoments({ mean: 50, variance: 0 }, rateFn);
        expect(result).toBe(rateFn(50));
    });

    it('evaluates at rounded mean for low variance (< 1)', () => {
        const rateFn = (age: number) => age * 0.01;
        const result = expectedRateForMoments({ mean: 50.7, variance: 0.5 }, rateFn);
        expect(result).toBe(rateFn(51));
    });

    it('returns higher expected rate when mean is in a high-rate region', () => {
        // Exponential-like rate function: old = high, young = low
        const rateFn = (age: number) => Math.pow(age / 100, 3);
        const young = expectedRateForMoments({ mean: 25, variance: 25 }, rateFn);
        const old = expectedRateForMoments({ mean: 75, variance: 25 }, rateFn);
        expect(old).toBeGreaterThan(young * 5); // 75³/25³ = 27×, with variance smoothing should be >> 5×
    });

    it('accounts for variance spreading weight into high-rate tails', () => {
        // A constant rate function: variance should not change the expected value
        const constRate = () => 0.05;
        const narrow = expectedRateForMoments({ mean: 40, variance: 1 }, constRate);
        const wide = expectedRateForMoments({ mean: 40, variance: 100 }, constRate);
        expect(narrow).toBeCloseTo(wide, 5);
    });

    it('with convex rate function, higher variance increases expected rate', () => {
        // Rate = age² / 10000  (convex)
        const convexRate = (age: number) => (age * age) / 10000;
        const narrow = expectedRateForMoments({ mean: 50, variance: 4 }, convexRate);
        const wide = expectedRateForMoments({ mean: 50, variance: 200 }, convexRate);
        // Jensen's inequality: E[f(X)] > f(E[X]) for convex f, larger variance = larger E
        expect(wide).toBeGreaterThan(narrow);
    });

    it('works with the real mortalityProbability function', () => {
        const rateAt30 = expectedRateForMoments({ mean: 30, variance: 25 }, mortalityProbability);
        const rateAt80 = expectedRateForMoments({ mean: 80, variance: 25 }, mortalityProbability);
        // Mortality at 80 (90/1000) vs 30 (1.4/1000) — huge difference
        expect(rateAt80).toBeGreaterThan(rateAt30 * 20);
    });
});

// ---------------------------------------------------------------------------
// totalDepartingFiredForEdu / totalRetiringForEdu
// ---------------------------------------------------------------------------

describe('totalDepartingFiredForEdu', () => {
    it('sums fired workers across all cohorts and slots', () => {
        const wf = createWorkforceDemography();
        wf[0].departingFired.primary[0] = 10;
        wf[0].departingFired.primary[5] = 20;
        wf[3].departingFired.primary[11] = 7;

        expect(totalDepartingFiredForEdu(wf, 'primary')).toBe(37);
        expect(totalDepartingFiredForEdu(wf, 'none')).toBe(0);
    });
});

describe('totalRetiringForEdu', () => {
    it('sums retiring workers across all cohorts and slots', () => {
        const wf = createWorkforceDemography();
        wf[1].retiring.secondary[0] = 5;
        wf[1].retiring.secondary[11] = 15;
        wf[10].retiring.secondary[6] = 8;

        expect(totalRetiringForEdu(wf, 'secondary')).toBe(28);
        expect(totalRetiringForEdu(wf, 'none')).toBe(0);
    });
});
