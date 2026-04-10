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

/**
 * Compute two y-axis domains such that the zero line sits at the same
 * vertical fraction on both axes, making them directly comparable.
 */
export function alignedYDomains(valsA: number[], valsB: number[]): [[number, number], [number, number]] {
    const computeNatural = (vals: number[]): [number, number] => {
        const finite = vals.filter(Number.isFinite);
        if (finite.length === 0) {
            return [0, 0];
        }
        const lo = Math.min(0, ...finite);
        const hi = Math.max(0, ...finite);
        if (lo === hi) {
            return [lo - 0.001, hi + 0.001];
        }
        const pad = (hi - lo) * 0.08;
        return [lo - pad, hi + pad];
    };

    const [loA, hiA] = computeNatural(valsA);
    const [loB, hiB] = computeNatural(valsB);
    const spanA = hiA - loA;
    const spanB = hiB - loB;

    // Zero fraction: how far from the bottom is zero, for each axis
    const pA = spanA > 0 ? Math.abs(loA) / spanA : 0.5;
    const pB = spanB > 0 ? Math.abs(loB) / spanB : 0.5;
    // Use the larger zero-fraction so neither series clips
    const p = Math.max(pA, pB);

    // Expand each axis so that zero sits at fraction p from the bottom
    const totalA = Math.max(spanA, Math.abs(hiA) / (1 - p + 0.0001), Math.abs(loA) / (p + 0.0001));
    const totalB = Math.max(spanB, Math.abs(hiB) / (1 - p + 0.0001), Math.abs(loB) / (p + 0.0001));

    return [
        [-p * totalA, (1 - p) * totalA],
        [-p * totalB, (1 - p) * totalB],
    ];
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
