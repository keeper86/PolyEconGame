import { describe, expect, it } from 'vitest';
import { liveYearX } from './chartTime';

describe('liveYearX', () => {
    it('maps a tick to a fractional calendar year', () => {
        expect(liveYearX(1)).toBe(2200);
        expect(liveYearX(31)).toBeCloseTo(2200 + 1 / 12, 6);
        expect(liveYearX(361)).toBe(2201);
    });

    it('advances within a month and within a year', () => {
        expect(liveYearX(30)).toBeCloseTo(2200 + 29 / 30 / 12, 6);
        expect(liveYearX(360)).toBeCloseTo(2200 + (11 + 29 / 30) / 12, 6);
    });

    it('is strictly ahead of the last completed year boundary', () => {
        expect(liveYearX(30)).toBeGreaterThan(2200);
        expect(liveYearX(30)).toBeLessThan(2201);
    });
});
