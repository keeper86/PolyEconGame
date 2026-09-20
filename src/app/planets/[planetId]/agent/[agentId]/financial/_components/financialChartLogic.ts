import { tickToDate } from '@/components/client/TickDisplay';
import { TICKS_PER_MONTH } from '@/simulation/constants';
export type { Granularity } from '@/components/client/GranularityButtonGroup';

export type FinancialPoint = {
    bucket: number;
    avgNetBalance: number;
    avgAssetValue: number;
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

export function bucketYearEnd(bucket: number): number {
    return tickToDate(bucket + 1).year + 1;
}

export function bucketDecadeEnd(bucket: number): number {
    return tickToDate(bucket + 1).year + 10;
}

export function bucketDecadeLabel(bucket: number): string {
    return `${bucketDecadeEnd(bucket)}s`;
}

export function formatYearStart(xVal: number): string {
    return `Start of ${Math.floor(xVal)}`;
}

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

    const pA = spanA > 0 ? Math.abs(loA) / spanA : 0.5;
    const pB = spanB > 0 ? Math.abs(loB) / spanB : 0.5;

    const p = Math.max(pA, pB);

    const totalA = Math.max(spanA, Math.abs(hiA) / (1 - p + 0.0001), Math.abs(loA) / (p + 0.0001));
    const totalB = Math.max(spanB, Math.abs(hiB) / (1 - p + 0.0001), Math.abs(loB) / (p + 0.0001));

    return [
        [-p * totalA, (1 - p) * totalA],
        [-p * totalB, (1 - p) * totalB],
    ];
}

export type FinancialRawPoint = FinancialPoint;

export type FinancialChartPoint = FinancialPoint & {
    monthIdx: number;
};

export type FinancialLive = {
    tick: number;
    avgNetBalance: number;
    avgAssetValue: number;
    avgMonthlyNetIncome: number;
    avgWages: number;
    sumPurchases: number;
    sumClaimPayments: number;
};

function liveFinancialPoint(live: FinancialLive): FinancialChartPoint {
    const { monthIndex, day } = tickToDate(live.tick);
    return {
        bucket: live.tick,
        avgNetBalance: live.avgNetBalance,
        avgAssetValue: live.avgAssetValue,
        avgMonthlyNetIncome: live.avgMonthlyNetIncome,
        avgWages: live.avgWages,
        sumPurchases: live.sumPurchases,
        sumClaimPayments: live.sumClaimPayments,
        monthIdx: monthIndex + Math.max(day - 1, 0.001) / TICKS_PER_MONTH,
    };
}

export function computeFinancialMonthlyData(
    allPts: FinancialRawPoint[],
    currentTick: number,
    live?: FinancialLive,
): FinancialChartPoint[] {
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

    if (live && live.tick > 0) {
        result.push(liveFinancialPoint(live));
    }

    return result;
}

export function computeFinancialGhostData(
    allPts: FinancialRawPoint[],
    currentTick: number,
    live?: FinancialLive,
): FinancialChartPoint[] {
    if (allPts.length === 0 || currentTick === 0) {
        return [];
    }

    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    const anchorTick = live && live.tick > 0 ? live.tick : currentTick;
    const { year: latestYear, monthIndex: currentMonthIndex, day: currentDay } = tickToDate(anchorTick);

    const currentMonthIdx = currentMonthIndex + Math.max(currentDay - 1, 0.001) / TICKS_PER_MONTH;

    return pts
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            return year === latestYear - 1 && monthIndex + 1 > currentMonthIdx;
        })
        .map((p) => ({
            ...p,
            monthIdx: tickToDate(p.bucket).monthIndex + 1,
        }));
}
