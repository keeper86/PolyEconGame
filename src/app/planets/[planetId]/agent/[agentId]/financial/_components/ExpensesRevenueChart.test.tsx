import { screen } from '@testing-library/react';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { PREVIOUS_DECEMBER_END_IDX } from '@/lib/historyChartAxis';
import { TICKS_PER_MONTH } from '@/simulation/constants';
import type { FinancialChartPoint, FinancialLive, FinancialPoint } from './financialChartLogic';
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
const SERIES_COLOURS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f43f5e'];
const EXPENSE_STROKES = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

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

const ZERO_START_REVENUE = [0, 0, 0, 1, 10, 200];

const ZERO_START_HISTORY: FinancialPoint[] = ZERO_START_REVENUE.map((revenue, index) => ({
    bucket: 721 + index * 360,
    avgNetBalance: 0,
    avgAssetValue: 0,
    avgMonthlyNetIncome: revenue,
    avgWages: 0,
    sumPurchases: 0,
    sumClaimPayments: 0,
    sumInterestPaid: 0,
    sumWealthTaxPaid: 0,
}));

const drawnSeries = (container: HTMLElement): (string | null)[] =>
    [...container.querySelectorAll('path.recharts-area-curve')]
        .filter((path) => path.getAttribute('d') !== null)
        .map((path) => path.getAttribute('stroke'));

const curvePath = (container: HTMLElement, stroke: string): string =>
    [...container.querySelectorAll('path.recharts-area-curve')]
        .find((candidate) => candidate.getAttribute('stroke') === stroke && candidate.getAttribute('d') !== null)
        ?.getAttribute('d') ?? '';

const curveYs = (d: string): number[] =>
    (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_, index) => index % 2 === 1);

const curveSegments = (d: string): number => (d.match(/M/g) ?? []).length;

const axisBottomY = (container: HTMLElement): number =>
    Number(container.querySelector('.recharts-xAxis .recharts-cartesian-axis-line')?.getAttribute('y'));

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

    it('rests the inactive income/loss curve on the zero axis so neither line vanishes', () => {
        const profitable = HISTORY.map((point) => ({ ...point, avgMonthlyNetIncome: 2000 }));

        const { container: losing } = renderWithIntl(<ExpensesRevenueChart data={HISTORY} granularity='yearly' />);
        const losingBottom = axisBottomY(losing);
        const losingIncome = curveYs(curvePath(losing, '#10b981'));
        const losingLoss = curveYs(curvePath(losing, '#f43f5e'));

        expect(losingIncome.length).toBeGreaterThan(0);
        expect(losingLoss.length).toBeGreaterThan(0);
        expect(losingIncome.every((y) => Math.abs(y - losingBottom) < 1)).toBe(true);
        expect(losingLoss.some((y) => y < losingBottom - 1)).toBe(true);

        const { container: gaining } = renderWithIntl(<ExpensesRevenueChart data={profitable} granularity='yearly' />);
        const gainingBottom = axisBottomY(gaining);
        const gainingIncome = curveYs(curvePath(gaining, '#10b981'));
        const gainingLoss = curveYs(curvePath(gaining, '#f43f5e'));

        expect(gainingIncome.some((y) => y < gainingBottom - 1)).toBe(true);
        expect(gainingLoss.every((y) => Math.abs(y - gainingBottom) < 1)).toBe(true);
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

    it('stacks the expense series smallest-first in log mode', () => {
        const { container } = renderWithIntl(
            <ExpensesRevenueChart data={WIDE_RANGE_HISTORY} granularity='yearly' live={WIDE_RANGE_LIVE} />,
        );

        expect(drawnSeries(container).filter((stroke) => EXPENSE_STROKES.includes(stroke ?? ''))).toEqual([
            '#f59e0b',
            '#8b5cf6',
            '#3b82f6',
            '#ec4899',
        ]);
    });

    it('starts a zero-then-rising series on the bottom axis in log mode instead of mid-air', () => {
        const { container } = renderWithIntl(<ExpensesRevenueChart data={ZERO_START_HISTORY} granularity='yearly' />);

        const yStart = (stroke: string): number => {
            const path = [...container.querySelectorAll('path.recharts-area-curve')]
                .filter((candidate) => candidate.getAttribute('d') !== null)
                .find((candidate) => candidate.getAttribute('stroke') === stroke);
            const match = /^M(-?[\d.]+),(-?[\d.]+)/.exec(path?.getAttribute('d') ?? '');
            return match ? Number(match[2]) : Number.NaN;
        };
        const axisLine = container.querySelector('.recharts-xAxis .recharts-cartesian-axis-line');
        const bottom = Number(axisLine?.getAttribute('y'));

        expect(Number.isFinite(bottom)).toBe(true);
        expect(Math.abs(yStart('#06b6d4') - bottom)).toBeLessThan(1);
        expect(Math.abs(yStart('#10b981') - bottom)).toBeLessThan(1);
    });
});

describe('ExpensesRevenueChart monthly', () => {
    const monthly: FinancialChartPoint[] = [
        {
            bucket: 1,
            monthIdx: PREVIOUS_DECEMBER_END_IDX,
            avgNetBalance: 5000,
            avgAssetValue: 20000,
            avgMonthlyNetIncome: 900,
            avgWages: 400,
            sumPurchases: 300,
            sumClaimPayments: 100,
            sumInterestPaid: 40,
            sumWealthTaxPaid: 10,
        },
        ...Array.from({ length: 12 }, (_, index) => ({
            bucket: index * TICKS_PER_MONTH + 1,
            monthIdx: index + 1,
            avgNetBalance: 5000,
            avgAssetValue: 20000,
            avgMonthlyNetIncome: 1000 + index,
            avgWages: 400,
            sumPurchases: 300,
            sumClaimPayments: 100,
            sumInterestPaid: 40,
            sumWealthTaxPaid: 10,
        })),
    ];

    it('renders the end-positioned monthly series without NaN coordinates', () => {
        const { container } = renderWithIntl(<ExpensesRevenueChart data={monthly} granularity='monthly' />);

        const paths = [...container.querySelectorAll('path.recharts-area-curve, path.recharts-area-area')].map(
            (path) => path.getAttribute('d') ?? '',
        );

        expect(paths.length).toBeGreaterThan(0);
        expect(paths.filter((d) => d.includes('NaN'))).toEqual([]);
        expect(container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length).toBe(12);
    });

    const zigzag: FinancialChartPoint[] = Array.from({ length: 12 }, (_, index) => ({
        bucket: index * TICKS_PER_MONTH + 1,
        monthIdx: index + 1,
        avgNetBalance: 5000,
        avgAssetValue: 20000,
        avgMonthlyNetIncome: index % 2 === 0 ? 500 : -500,
        avgWages: 0,
        sumPurchases: 0,
        sumClaimPayments: 0,
        sumInterestPaid: 0,
        sumWealthTaxPaid: 0,
    }));

    it('keeps both income and loss continuous when the monthly sign flips every month', () => {
        const { container } = renderWithIntl(<ExpensesRevenueChart data={zigzag} granularity='monthly' />);

        expect(curveSegments(curvePath(container, '#10b981'))).toBe(1);
        expect(curveSegments(curvePath(container, '#f43f5e'))).toBe(1);
    });
});
