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

    it('formats the month name in the requested locale', () => {
        expect(mapTickToDate(1, false, 'en')).toContain('January');
        expect(mapTickToDate(1, false, 'de')).toContain('Januar');
        expect(mapTickToDate(1, true, 'de')).toContain('Jan');
    });

    it('returns a placeholder instead of throwing for out-of-range ticks', () => {
        expect(() => mapTickToDate(100_000_000)).not.toThrow();
        expect(mapTickToDate(100_000_000)).toBe('—');
    });
});
