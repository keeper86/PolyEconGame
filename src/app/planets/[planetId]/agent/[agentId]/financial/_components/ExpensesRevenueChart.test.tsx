import { screen } from '@testing-library/react';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import type { FinancialPoint } from './financialChartLogic';
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

const SERIES_LABELS_EN = ['Revenue', 'Wages', 'Purchases', 'Claims', 'Interest & tax'];
const SERIES_LABELS_DE = ['Erlös', 'Löhne', 'Einkäufe', 'Nutzungsrechte', 'Zinsen & Steuern'];
const SERIES_COLOURS = ['#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#10b981'];

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
});
