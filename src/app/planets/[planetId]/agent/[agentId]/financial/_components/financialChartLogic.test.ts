import { describe, expect, it } from 'vitest';
import { alignedYDomains } from './financialChartLogic';

/** Zero fraction: position of 0 within [lo, hi], measured from the bottom. */
function zeroFraction([lo, hi]: [number, number]): number {
    return Math.abs(lo) / (hi - lo);
}

const TOLERANCE = 1e-6;

describe('alignedYDomains', () => {
    it('returns domains where zero sits at the same vertical fraction on both axes', () => {
        const balance = [80_000, 150_000, 300_000, -50_000, -280_000];
        const income = [250_000, -320_000, 100_000];

        const [dA, dB] = alignedYDomains(balance, income);

        expect(zeroFraction(dA)).toBeCloseTo(zeroFraction(dB), 5);
    });

    it('zero fraction is aligned when both axes straddle zero', () => {
        const [dA, dB] = alignedYDomains([-100, 200], [-50, 150]);
        expect(zeroFraction(dA)).toBeCloseTo(zeroFraction(dB), 5);
    });

    it('domains always include zero', () => {
        const [dA, dB] = alignedYDomains([10, 20, 30], [5, 15]);
        expect(dA[0]).toBeLessThanOrEqual(0);
        expect(dA[1]).toBeGreaterThanOrEqual(0);
        expect(dB[0]).toBeLessThanOrEqual(0);
        expect(dB[1]).toBeGreaterThanOrEqual(0);
    });

    it('all input values fall within their respective domain', () => {
        const balance = [300_000, -290_000, 100_000];
        const income = [280_000, -330_000, 50_000];

        const [dA, dB] = alignedYDomains(balance, income);

        for (const v of balance) {
            expect(v).toBeGreaterThanOrEqual(dA[0] - TOLERANCE);
            expect(v).toBeLessThanOrEqual(dA[1] + TOLERANCE);
        }
        for (const v of income) {
            expect(v).toBeGreaterThanOrEqual(dB[0] - TOLERANCE);
            expect(v).toBeLessThanOrEqual(dB[1] + TOLERANCE);
        }
    });

    it('works when one axis is entirely positive', () => {
        const balance = [100, 200, 300];
        const income = [-50, 100, 200];

        const [dA, dB] = alignedYDomains(balance, income);

        expect(zeroFraction(dA)).toBeCloseTo(zeroFraction(dB), 5);
        expect(dA[0]).toBeLessThanOrEqual(0);
        expect(dA[1]).toBeGreaterThanOrEqual(300);
        expect(dB[0]).toBeLessThanOrEqual(-50);
        expect(dB[1]).toBeGreaterThanOrEqual(200);
    });

    it('works when one axis is entirely negative', () => {
        const balance = [-300, -100, -50];
        const income = [-200, 100, 50];

        const [dA, dB] = alignedYDomains(balance, income);

        expect(zeroFraction(dA)).toBeCloseTo(zeroFraction(dB), 5);
        expect(dA[0]).toBeLessThanOrEqual(-300);
        expect(dA[1]).toBeGreaterThanOrEqual(0);
    });

    it('symmetric data produces a zero fraction near 0.5', () => {
        const [dA, dB] = alignedYDomains([-100, 100], [-200, 200]);
        expect(zeroFraction(dA)).toBeCloseTo(0.5, 1);
        expect(zeroFraction(dB)).toBeCloseTo(0.5, 1);
    });

    it('handles empty axis gracefully — still returns finite numbers', () => {
        const [dA, dB] = alignedYDomains([], [100, -100]);
        expect(Number.isFinite(dA[0])).toBe(true);
        expect(Number.isFinite(dA[1])).toBe(true);
        expect(Number.isFinite(dB[0])).toBe(true);
        expect(Number.isFinite(dB[1])).toBe(true);
    });

    it('lo is always less than hi for both axes', () => {
        const cases: [number[], number[]][] = [
            [[1, 2, 3], [4, 5, 6]],
            [[-3, -2, -1], [-6, -5, -4]],
            [[-100, 200], [50, 300]],
            [[0], [0]],
        ];
        for (const [a, b] of cases) {
            const [dA, dB] = alignedYDomains(a, b);
            expect(dA[0]).toBeLessThan(dA[1]);
            expect(dB[0]).toBeLessThan(dB[1]);
        }
    });
});
