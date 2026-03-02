import { describe, it, expect } from 'vitest';

import { TICKS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_YEAR, isMonthBoundary, isYearBoundary } from '../constants';

// ---------------------------------------------------------------------------
// Time hierarchy constants
// ---------------------------------------------------------------------------

describe('time hierarchy constants', () => {
    it('TICKS_PER_YEAR is derived as TICKS_PER_MONTH * MONTHS_PER_YEAR', () => {
        expect(TICKS_PER_YEAR).toBe(TICKS_PER_MONTH * MONTHS_PER_YEAR);
    });

    it('TICKS_PER_YEAR equals 360', () => {
        expect(TICKS_PER_YEAR).toBe(360);
    });

    it('TICKS_PER_MONTH equals 30', () => {
        expect(TICKS_PER_MONTH).toBe(30);
    });

    it('MONTHS_PER_YEAR equals 12', () => {
        expect(MONTHS_PER_YEAR).toBe(12);
    });
});

// ---------------------------------------------------------------------------
// Boundary functions
// ---------------------------------------------------------------------------

describe('isMonthBoundary', () => {
    it('returns false for tick 0', () => {
        expect(isMonthBoundary(0)).toBe(false);
    });

    it('returns false for non-multiple ticks', () => {
        expect(isMonthBoundary(1)).toBe(false);
        expect(isMonthBoundary(TICKS_PER_MONTH - 1)).toBe(false);
    });

    it('returns true for exact multiples of TICKS_PER_MONTH', () => {
        expect(isMonthBoundary(TICKS_PER_MONTH)).toBe(true);
        expect(isMonthBoundary(TICKS_PER_MONTH * 2)).toBe(true);
        expect(isMonthBoundary(TICKS_PER_YEAR)).toBe(true);
    });
});

describe('isYearBoundary', () => {
    it('returns false for tick 0', () => {
        expect(isYearBoundary(0)).toBe(false);
    });

    it('returns false for month boundaries that are not year boundaries', () => {
        expect(isYearBoundary(TICKS_PER_MONTH)).toBe(false);
        expect(isYearBoundary(TICKS_PER_YEAR - TICKS_PER_MONTH)).toBe(false);
    });

    it('returns true for exact multiples of TICKS_PER_YEAR', () => {
        expect(isYearBoundary(TICKS_PER_YEAR)).toBe(true);
        expect(isYearBoundary(TICKS_PER_YEAR * 2)).toBe(true);
    });

    it('every year boundary is also a month boundary', () => {
        for (let y = 1; y <= 3; y++) {
            const tick = y * TICKS_PER_YEAR;
            expect(isYearBoundary(tick)).toBe(true);
            expect(isMonthBoundary(tick)).toBe(true);
        }
    });
});
