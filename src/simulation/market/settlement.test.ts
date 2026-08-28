import { describe, expect, it } from 'vitest';
import type { TradeRecord } from './marketTypes';
import { computeMarketSummary } from './settlement';

describe('computeMarketSummary — clearing price signal', () => {
    it('reports the marginal price (highest trade price), not the volume-weighted average', () => {
        const trades: TradeRecord[] = [
            { price: 10, quantity: 10 },
            { price: 12, quantity: 10 },
            { price: 14, quantity: 10 },
        ];

        const { clearingPrice, totalVolume, totalRevenue } = computeMarketSummary(trades, 100);

        expect(clearingPrice).toBe(14);
        expect(totalVolume).toBe(30);
        expect(totalRevenue).toBeCloseTo(360, 6);
    });

    it('reports the single tier price when all volume trades at one price', () => {
        const trades: TradeRecord[] = [
            { price: 2.5, quantity: 100 },
            { price: 2.5, quantity: 50 },
        ];

        const { clearingPrice } = computeMarketSummary(trades, 5);

        expect(clearingPrice).toBe(2.5);
    });

    it('falls back to the reference price when nothing traded', () => {
        const { clearingPrice, totalVolume, totalRevenue } = computeMarketSummary([], 42);

        expect(clearingPrice).toBe(42);
        expect(totalVolume).toBe(0);
        expect(totalRevenue).toBe(0);
    });
});
