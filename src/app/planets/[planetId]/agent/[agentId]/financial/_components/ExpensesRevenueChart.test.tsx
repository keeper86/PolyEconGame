import { screen } from '@testing-library/react';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { FinancialLive, FinancialPoint } from './financialChartLogic';
import { ExpensesRevenueChart } from './ExpensesRevenueChart';

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('recharts')>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: React.ReactElement }) => {
            const chartElement = children as React.ReactElement<{ width?: number; height?: number }>;
            return React.cloneElement(chartElement, { width: 600, height: 200 });
        },
    };
});

const HISTORY: FinancialPoint[] = [
    {
        bucket: 720,
        avgNetBalance: 5000,
        avgAssetValue: 20000,
        avgMonthlyNetIncome: 1000,
        avgWages: 400,
        sumPurchases: 4800,
        sumClaimPayments: 3600,
        sumInterestPaid: 1800,
        sumWealthTaxPaid: 600,
    },
    {
        bucket: 1080,
        avgNetBalance: 6000,
        avgAssetValue: 24000,
        avgMonthlyNetIncome: 1200,
        avgWages: 450,
        sumPurchases: 6000,
        sumClaimPayments: 4080,
        sumInterestPaid: 2400,
        sumWealthTaxPaid: 720,
    },
];

const SERIES_LABELS_EN = ['Revenue', 'Wages', 'Purchases', 'Claims', 'Interest & tax', 'Income', 'Loss'];
const SERIES_LABELS_DE = ['Erlös', 'Löhne', 'Einkäufe', 'Nutzungsrechte', 'Zinsen & Steuern', 'Gewinn', 'Verlust'];
const SERIES_COLOURS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

const WIDE_RANGE_ROWS: [number, number, number][] = [
    [3601, 0, 9470],
    [3961, 0, 7694],
    [4321, 1121, 8495],
    [4681, 3353, 11579],
    [5041, 3070, 15181],
    [5401, 3000, 18906],
    [5761, 2958, 22887],
    [6121, 2828, 27069],
    [6481, 2638, 31393],
    [6841, 2580, 35928],
    [7201, 2506, 37166],
];

const WIDE_RANGE_HISTORY: FinancialPoint[] = WIDE_RANGE_ROWS.map(([bucket, avgWages, sumInterestPaid]) => ({
    bucket,
    avgNetBalance: 5000,
    avgAssetValue: 20000,
    avgMonthlyNetIncome: 0,
    avgWages,
    sumPurchases: 0,
    sumClaimPayments: 0,
    sumInterestPaid,
    sumWealthTaxPaid: 0,
}));

const WIDE_RANGE_LIVE: FinancialLive = {
    tick: 7620,
    avgNetBalance: 5000,
    avgAssetValue: 20000,
    avgMonthlyNetIncome: 0,
    avgWages: 2500,
    sumPurchases: 0,
    sumClaimPayments: 0,
    sumInterestPaid: 38000,
    sumWealthTaxPaid: 0,
};

const drawnSeries = (container: HTMLElement): (string | null)[] =>
    [...container.querySelectorAll('path.recharts-area-curve')]
        .filter((path) => path.getAttribute('d') !== null)
        .map((path) => path.getAttribute('stroke'));

describe('ExpensesRevenueChart', () => {
    it.each([
        ['en' as const, SERIES_LABELS_EN],
        ['de' as const, SERIES_LABELS_DE],
    ])('labels every series in %s', (locale, labels) => {
        renderWithIntl(<ExpensesRevenueChart data={HISTORY} granularity='yearly' />, { locale });

        for (const label of labels) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
    });

    it('draws a curve for every series from the history fields', () => {
        const { container } = renderWithIntl(<ExpensesRevenueChart data={HISTORY} granularity='yearly' />);

        expect(drawnSeries(container)).toEqual(SERIES_COLOURS);
    });

    it('draws the claim payments curve from the claimPayments field', () => {
        const claimCurve = (data: FinancialPoint[]): string | null => {
            const { container } = renderWithIntl(<ExpensesRevenueChart data={data} granularity='yearly' />);
            const path = [...container.querySelectorAll('path.recharts-area-curve')].find(
                (candidate) => candidate.getAttribute('stroke') === '#8b5cf6',
            );
            return path?.getAttribute('d') ?? null;
        };

        const rising = claimCurve(HISTORY);
        const flat = claimCurve(HISTORY.map((point) => ({ ...point, sumClaimPayments: 3600 })));

        expect(rising).not.toBeNull();
        expect(flat).not.toBeNull();
        expect(rising).not.toBe(flat);
    });

    it('draws the income curve for profitable months and the loss curve for loss-making months', () => {
        const profitable = HISTORY.map((point) => ({ ...point, avgMonthlyNetIncome: 2000 }));

        const { container: losing } = renderWithIntl(<ExpensesRevenueChart data={HISTORY} granularity='yearly' />);
        expect(drawnSeries(losing)).toContain('#f43f5e');
        expect(drawnSeries(losing)).not.toContain('#10b981');

        const { container: gaining } = renderWithIntl(<ExpensesRevenueChart data={profitable} granularity='yearly' />);
        expect(drawnSeries(gaining)).toContain('#10b981');
        expect(drawnSeries(gaining)).not.toContain('#f43f5e');
    });

    it('emits no NaN coordinates for stacked areas on the wide-range axis', () => {
        const { container } = renderWithIntl(
            <ExpensesRevenueChart data={WIDE_RANGE_HISTORY} granularity='yearly' live={WIDE_RANGE_LIVE} />,
        );

        const paths = [...container.querySelectorAll('path.recharts-area-curve, path.recharts-area-area')].map(
            (path) => path.getAttribute('d') ?? '',
        );

        expect(paths.length).toBeGreaterThan(0);
        expect(paths.filter((d) => d.includes('NaN'))).toEqual([]);
    });
});
