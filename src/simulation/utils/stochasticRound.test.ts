/**
 * utils/stochasticRound.test.ts
 *
 * Tests for the stochastic rounding utility and its PRNG.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { stochasticRound, seedRng, nextRandom } from './stochasticRound';

beforeEach(() => {
    seedRng(42);
});

describe('nextRandom', () => {
    it('returns values in [0, 1)', () => {
        for (let i = 0; i < 10_000; i++) {
            const v = nextRandom();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('is deterministic for the same seed', () => {
        seedRng(123);
        const a = Array.from({ length: 100 }, () => nextRandom());
        seedRng(123);
        const b = Array.from({ length: 100 }, () => nextRandom());
        expect(a).toEqual(b);
    });

    it('produces different sequences for different seeds', () => {
        seedRng(1);
        const a = Array.from({ length: 10 }, () => nextRandom());
        seedRng(2);
        const b = Array.from({ length: 10 }, () => nextRandom());
        expect(a).not.toEqual(b);
    });
});

describe('stochasticRound', () => {
    it('returns integer values unchanged', () => {
        expect(stochasticRound(5)).toBe(5);
        expect(stochasticRound(0)).toBe(0);
        expect(stochasticRound(100)).toBe(100);
    });

    it('returns 0 for NaN or Infinity', () => {
        expect(stochasticRound(NaN)).toBe(0);
        expect(stochasticRound(Infinity)).toBe(0);
        expect(stochasticRound(-Infinity)).toBe(0);
    });

    it('always returns floor or ceil', () => {
        for (let i = 0; i < 1000; i++) {
            const x = Math.random() * 100;
            const result = stochasticRound(x);
            expect(result === Math.floor(x) || result === Math.ceil(x)).toBe(true);
        }
    });

    it('is unbiased: mean of many samples ≈ input value', () => {
        seedRng(42);
        const x = 0.8;
        const N = 100_000;
        let sum = 0;
        for (let i = 0; i < N; i++) {
            sum += stochasticRound(x);
        }
        const mean = sum / N;
        // Within 1% of the expected value
        expect(mean).toBeCloseTo(x, 1);
    });

    it('correctly handles small fractional values (the core use-case)', () => {
        seedRng(42);
        const x = 0.3; // e.g. births per tick on a small planet
        const N = 100_000;
        let ones = 0;
        for (let i = 0; i < N; i++) {
            const r = stochasticRound(x);
            expect(r === 0 || r === 1).toBe(true);
            if (r === 1) {
                ones++;
            }
        }
        // Should be ≈ 30% ones
        expect(ones / N).toBeCloseTo(0.3, 1);
    });

    it('handles values > 1 with fractional part', () => {
        seedRng(42);
        const x = 7.6;
        const N = 100_000;
        let sum = 0;
        for (let i = 0; i < N; i++) {
            sum += stochasticRound(x);
        }
        const mean = sum / N;
        expect(mean).toBeCloseTo(x, 1);
    });

    it('is deterministic for the same seed', () => {
        seedRng(99);
        const a = Array.from({ length: 50 }, () => stochasticRound(3.7));
        seedRng(99);
        const b = Array.from({ length: 50 }, () => stochasticRound(3.7));
        expect(a).toEqual(b);
    });
});
