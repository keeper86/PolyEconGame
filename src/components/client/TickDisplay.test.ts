import { describe, expect, it } from 'vitest';
import { mapTickToDate, tickToDate } from '@/components/client/TickDisplay';

describe('tickToDate', () => {
    it('converts the first tick to the start date', () => {
        expect(tickToDate(1)).toEqual({ year: 2200, monthIndex: 0, day: 1 });
    });
});

describe('mapTickToDate', () => {
    it('formats a normal tick as a date string', () => {
        expect(mapTickToDate(1)).toContain('2200');
        expect(mapTickToDate(1, true)).toContain('2200');
    });

    it('returns a placeholder instead of throwing for out-of-range ticks', () => {
        expect(() => mapTickToDate(100_000_000)).not.toThrow();
        expect(mapTickToDate(100_000_000)).toBe('—');
    });
});
