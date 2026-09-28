import { describe, expect, it } from 'vitest';
import { formatNumberWithUnit } from './utils';

describe('formatNumberWithUnit', () => {
    it('falls back to the default locale', () => {
        expect(formatNumberWithUnit(1500, 'none')).toBe('1.5k');
    });

    it('infers the decimal separator from the locale', () => {
        expect(formatNumberWithUnit(1500, 'none', undefined, 'de')).toBe('1,5k');
        expect(formatNumberWithUnit(2_500_000, 'persons', undefined, 'de')).toBe('2,5M');
        expect(formatNumberWithUnit(0.0005, 'none', undefined, 'de')).toBe('<0,001');
    });

    it('localises the day unit', () => {
        expect(formatNumberWithUnit(1, 'days', undefined, 'en')).toBe('1 day');
        expect(formatNumberWithUnit(5, 'days', undefined, 'en')).toBe('5 days');
        expect(formatNumberWithUnit(1, 'days', undefined, 'de')).toBe('1 Tag');
        expect(formatNumberWithUnit(5, 'days', undefined, 'de')).toBe('5 Tage');
    });

    it('keeps the unit symbols locale neutral', () => {
        expect(formatNumberWithUnit(1500, 'tonnes', undefined, 'de')).toBe('1,5kt');
        expect(formatNumberWithUnit(1500, 'litres', undefined, 'de')).toBe('1,5kℓ');
        expect(formatNumberWithUnit(1500, 'percent', undefined, 'de')).toBe('1,5k%');
    });

    it('keeps the em dash for missing values', () => {
        expect(formatNumberWithUnit(null, 'none', undefined, 'de')).toBe('—');
    });
});
