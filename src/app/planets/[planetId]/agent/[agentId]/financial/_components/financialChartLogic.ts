
import { tickToDate } from '@/components/client/TickDisplay';

export type Granularity = 'monthly' | 'yearly' | 'decade';

export type FinancialPoint = {
    bucket: number;
    avgNetBalance: number;
    avgMonthlyNetIncome: number;
    avgWages: number;
    sumPurchases: number;
    sumClaimPayments: number;
};

export const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const;
export const MONTHLY_X_TICKS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5];
export const MONTHLY_GRID_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function bucketDecadeLabel(bucket: number): string {
    const { year } = tickToDate(bucket);
    return `${year}s`;
}

export function yDomain(vals: number[]): [number, number] | ['auto', 'auto'] {
    const finite = vals.filter(Number.isFinite);
    if (finite.length === 0) {
        return ['auto', 'auto'];
    }
    const lo = Math.min(...finite);
    const hi = Math.max(...finite);
    if (lo === hi) {
        return [lo * 0.9 - 0.001, hi * 1.1 + 0.001];
    }
    const pad = (hi - lo) * 0.08;
    return [Math.max(0, lo - pad), hi + pad];
}

/** @deprecated Use FinancialPoint */
export type FinancialRawPoint = FinancialPoint;

export type FinancialChartPoint = FinancialPoint & {
    monthIdx: number;
};

export function computeFinancialMonthlyData(allPts: FinancialRawPoint[], currentTick: number): FinancialChartPoint[] {
    if (allPts.length === 0 || currentTick === 0) {
        return [];
    }

    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    const latestYear = tickToDate(currentTick).year;

    const result: FinancialChartPoint[] = pts
        .filter((p) => tickToDate(p.bucket).year === latestYear)
        .map((p) => ({
            ...p,
            monthIdx: tickToDate(p.bucket).monthIndex + 1,
        }));

    // ── Anchor at monthIdx=0 (previous December or nearest predecessor) ──────
    const prevDecPoint = pts.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });

    if (prevDecPoint) {
        result.unshift({ ...prevDecPoint, monthIdx: 0 });
    } else {
        const lastBeforeCurrentYear = [...pts].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBeforeCurrentYear) {
            result.unshift({ ...lastBeforeCurrentYear, monthIdx: 0 });
        }
    }

    return result;
}

export function computeFinancialGhostData(allPts: FinancialRawPoint[], currentTick: number): FinancialChartPoint[] {
    if (allPts.length === 0 || currentTick === 0) {
        return [];
    }

    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    const { year: latestYear, monthIndex: currentMonthIndex } = tickToDate(currentTick);

    const currentMonthIdx = currentMonthIndex + 1;

    return pts
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            return year === latestYear - 1 && monthIndex + 1 >= currentMonthIdx;
        })
        .map((p) => ({
            ...p,
            monthIdx: tickToDate(p.bucket).monthIndex + 1,
        }));
}
