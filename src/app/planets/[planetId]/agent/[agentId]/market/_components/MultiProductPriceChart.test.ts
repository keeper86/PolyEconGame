import type { Granularity } from '@/components/client/GranularityButtonGroup';
import { DECADE_WINDOW, DECADE_YEARS, MONTHS_PER_YEAR, YEAR_WINDOW } from '@/lib/historyChartAxis';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import { describe, expect, it } from 'vitest';
import { emptyXDomain, pickResults } from './MultiProductPriceChart';

const WINDOW_SPANS = {
    monthly: TICKS_PER_MONTH * MONTHS_PER_YEAR,
    yearly: TICKS_PER_YEAR * YEAR_WINDOW,
    decade: TICKS_PER_YEAR * DECADE_YEARS * DECADE_WINDOW,
};

describe('emptyXDomain', () => {
    it('spans the full window from the simulation start before any tick ran', () => {
        expect(emptyXDomain('monthly', 0)).toEqual([0, WINDOW_SPANS.monthly]);
        expect(emptyXDomain('yearly', 0)).toEqual([0, WINDOW_SPANS.yearly]);
        expect(emptyXDomain('decade', 0)).toEqual([0, WINDOW_SPANS.decade]);
    });

    it('spans the full window while the simulation is younger than the window', () => {
        expect(emptyXDomain('yearly', TICKS_PER_YEAR + 17)).toEqual([0, WINDOW_SPANS.yearly]);
        expect(emptyXDomain('decade', TICKS_PER_YEAR * 20 + 17)).toEqual([0, WINDOW_SPANS.decade]);
    });

    it('spans eleven years for yearly and keeps the window span for every granularity', () => {
        const liveTick = TICKS_PER_YEAR * 40 + 17;
        expect(emptyXDomain('yearly', liveTick)).toEqual([TICKS_PER_YEAR * 30, TICKS_PER_YEAR * 41]);
        for (const granularity of ['monthly', 'yearly', 'decade'] as const) {
            const [start, end] = emptyXDomain(granularity, liveTick);
            expect(end - start).toBe(WINDOW_SPANS[granularity]);
            expect(end).toBeGreaterThanOrEqual(liveTick);
            expect(start).toBeGreaterThanOrEqual(0);
        }
    });
});

const priceResult = (productName: string, granularity: Granularity, isLoading = false) => ({
    productName,
    granularity,
    history: [{ bucket: 0, avgPrice: 1, priceFloor: 1 }],
    isLoading,
});

describe('pickResults', () => {
    it('returns only entries for the currently selected granularity', () => {
        const map = {
            'monthly:steel': priceResult('steel', 'monthly'),
            'yearly:steel': priceResult('steel', 'yearly'),
            'yearly:water': priceResult('water', 'yearly'),
        };
        expect(pickResults(map, ['steel', 'water'], 'yearly').map((r) => r.productName)).toEqual(['steel', 'water']);
        expect(pickResults(map, ['steel', 'water'], 'monthly').map((r) => r.productName)).toEqual(['steel']);
    });

    it('keeps a previously populated granularity so switching back restores the selection', () => {
        const map = { 'monthly:steel': priceResult('steel', 'monthly') };
        expect(pickResults(map, ['steel'], 'yearly')).toEqual([]);
        expect(pickResults(map, ['steel'], 'monthly')).toHaveLength(1);
    });

    it('skips products that have no cached result yet', () => {
        const map = { 'decade:steel': priceResult('steel', 'decade') };
        expect(pickResults(map, ['steel', 'water'], 'decade')).toHaveLength(1);
    });
});
