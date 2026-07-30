import { describe, it, expect } from 'vitest';
import {
    computeFlowRates,
    computeResourceFlowData,
    elapsedTicksThisMonth,
} from '../../src/app/planets/[planetId]/agent/[agentId]/storage/_components/resourceFlowNormalizer';
import { TICKS_PER_MONTH } from '@/simulation/constants';

describe('resourceFlowNormalizer', () => {
    describe('computeFlowRates', () => {
        it('computes correct rates from all three timeframes', () => {
            const rates = computeFlowRates(100, 1500, 3000, 15);
            expect(rates.lastTickRate).toBe(100);
            expect(rates.currentMonthAvgRate).toBe(1500 / 15); // 100
            expect(rates.prevMonthAvgRate).toBe(3000 / TICKS_PER_MONTH); // 100
        });

        it('returns zero currentMonthAvgRate when elapsed ticks is 0', () => {
            const rates = computeFlowRates(50, 200, 900, 0);
            expect(rates.lastTickRate).toBe(50);
            expect(rates.currentMonthAvgRate).toBe(0);
            expect(rates.prevMonthAvgRate).toBe(900 / TICKS_PER_MONTH);
        });

        it('handles zero values', () => {
            const rates = computeFlowRates(0, 0, 0, 15);
            expect(rates.lastTickRate).toBe(0);
            expect(rates.currentMonthAvgRate).toBe(0);
            expect(rates.prevMonthAvgRate).toBe(0);
        });

        it('handles negative values (sell-side net outflow)', () => {
            const rates = computeFlowRates(-10, -300, -600, 30);
            expect(rates.lastTickRate).toBe(-10);
            expect(rates.currentMonthAvgRate).toBe(-10);
            expect(rates.prevMonthAvgRate).toBe(-20);
        });
    });

    describe('computeResourceFlowData', () => {
        it('aggregates inflow as production + bought', () => {
            const data = computeResourceFlowData(
                { prod: 50, cons: 10, depr: 5, bought: 20, sold: 15 },
                { produced: 1000, consumed: 200, depreciated: 100, bought: 400, sold: 300 },
                { produced: 1200, consumed: 240, depreciated: 120, bought: 360, sold: 240 },
                20,
            );

            // Inflow = prod + bought
            expect(data.inflow.lastTickRate).toBe(70);
            expect(data.inflow.currentMonthAvgRate).toBe((1000 + 400) / 20);
            expect(data.inflow.prevMonthAvgRate).toBe((1200 + 360) / TICKS_PER_MONTH);

            // Outflow = cons + sold
            expect(data.outflow.lastTickRate).toBe(25);
            expect(data.outflow.currentMonthAvgRate).toBe((200 + 300) / 20);
            expect(data.outflow.prevMonthAvgRate).toBe((240 + 240) / TICKS_PER_MONTH);

            // Depreciation = depr only
            expect(data.depreciation.lastTickRate).toBe(5);
            expect(data.depreciation.currentMonthAvgRate).toBe(100 / 20);
            expect(data.depreciation.prevMonthAvgRate).toBe(120 / TICKS_PER_MONTH);
        });

        it('handles empty activity', () => {
            const data = computeResourceFlowData(
                { prod: 0, cons: 0, depr: 0, bought: 0, sold: 0 },
                { produced: 0, consumed: 0, depreciated: 0, bought: 0, sold: 0 },
                { produced: 0, consumed: 0, depreciated: 0, bought: 0, sold: 0 },
                10,
            );

            expect(data.inflow.lastTickRate).toBe(0);
            expect(data.outflow.lastTickRate).toBe(0);
            expect(data.depreciation.lastTickRate).toBe(0);
        });
    });

    describe('elapsedTicksThisMonth', () => {
        it('returns tick mod when non-zero', () => {
            expect(elapsedTicksThisMonth(1)).toBe(1);
            expect(elapsedTicksThisMonth(15)).toBe(15);
            expect(elapsedTicksThisMonth(29)).toBe(29);
        });

        it('returns TICKS_PER_MONTH on month boundary (tick % 30 === 0)', () => {
            expect(elapsedTicksThisMonth(0)).toBe(TICKS_PER_MONTH);
            expect(elapsedTicksThisMonth(30)).toBe(TICKS_PER_MONTH);
            expect(elapsedTicksThisMonth(60)).toBe(TICKS_PER_MONTH);
        });
    });
});
