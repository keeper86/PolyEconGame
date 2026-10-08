import { tickToDate } from '@/components/client/TickDisplay';
import type { Granularity } from '@/components/client/GranularityButtonGroup';
import { liveYearX } from '@/lib/chartTime';
import {
    PREVIOUS_DECEMBER_END_IDX,
    PREVIOUS_DECEMBER_IDX,
    blendLive,
    bucketAverageToDate,
    bucketProgress,
    decadeCentre,
    extrapolateLive,
    monthCentre,
    monthEnd,
    yearCentre,
} from '@/lib/historyChartAxis';
import { TICKS_PER_MONTH } from '@/simulation/constants';
import { computeNetIncome } from '@/simulation/financial/netIncome';

export type { Granularity };
export { formatDecadeLabel, formatYearLabel } from '@/lib/historyChartAxis';
export { decadeCentre as bucketDecadeMid, yearCentre as bucketYearMid } from '@/lib/historyChartAxis';
export { decadeEnd as bucketDecadeEnd, yearEnd as bucketYearEnd } from '@/lib/historyChartAxis';
export { MONTHLY_GRID_VALUES, MONTHLY_TICKS as MONTHLY_X_TICKS } from '@/lib/historyChartAxis';

export type FinancialPoint = {
    bucket: number;
    avgNetBalance: number;
    avgAssetValue: number;
    avgMonthlyNetIncome: number;
    avgWages: number;
    sumPurchases: number;
    sumClaimPayments: number;
    sumInterestPaid: number;
    sumWealthTaxPaid: number;
};

export function naturalDomain(vals: number[]): [number, number] {
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
}

export function alignedYDomains(valsA: number[], valsB: number[]): [[number, number], [number, number]] {
    const [loA, hiA] = naturalDomain(valsA);
    const [loB, hiB] = naturalDomain(valsB);
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
    sumInterestPaid: number;
    sumWealthTaxPaid: number;
};

export type MonthlyPosition = 'centre' | 'end';

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
        sumInterestPaid: live.sumInterestPaid,
        sumWealthTaxPaid: live.sumWealthTaxPaid,
        monthIdx: monthIndex + Math.max(day - 1, 0.001) / TICKS_PER_MONTH,
    };
}

export function computeFinancialMonthlyData(
    allPts: FinancialRawPoint[],
    currentTick: number,
    live?: FinancialLive,
    position: MonthlyPosition = 'centre',
): FinancialChartPoint[] {
    if (allPts.length === 0 || currentTick === 0) {
        return [];
    }

    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    const latestYear = tickToDate(currentTick).year;
    const monthX = position === 'end' ? monthEnd : monthCentre;
    const anchorIdx = position === 'end' ? PREVIOUS_DECEMBER_END_IDX : PREVIOUS_DECEMBER_IDX;

    const result: FinancialChartPoint[] = pts
        .filter((p) => tickToDate(p.bucket).year === latestYear)
        .map((p) => ({
            ...p,
            monthIdx: monthX(p.bucket),
        }));

    const prevDecPoint = pts.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });

    if (prevDecPoint) {
        result.unshift({ ...prevDecPoint, monthIdx: anchorIdx });
    } else {
        const lastBeforeCurrentYear = [...pts].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBeforeCurrentYear) {
            result.unshift({ ...lastBeforeCurrentYear, monthIdx: anchorIdx });
        }
    }

    if (live && live.tick > 0) {
        const previous = result[result.length - 1];
        const progress = bucketProgress(live.tick, 'monthly');
        result.push({
            ...liveFinancialPoint(live),
            avgNetBalance: blendLive(previous?.avgNetBalance, live.avgNetBalance, progress),
            avgAssetValue: blendLive(previous?.avgAssetValue, live.avgAssetValue, progress),
            avgMonthlyNetIncome: extrapolateLive(previous?.avgMonthlyNetIncome, live.avgMonthlyNetIncome, progress),
            avgWages: extrapolateLive(previous?.avgWages, live.avgWages, progress),
            sumPurchases: extrapolateLive(previous?.sumPurchases, live.sumPurchases, progress),
            sumClaimPayments: extrapolateLive(previous?.sumClaimPayments, live.sumClaimPayments, progress),
            sumInterestPaid: extrapolateLive(previous?.sumInterestPaid, live.sumInterestPaid, progress),
            sumWealthTaxPaid: extrapolateLive(previous?.sumWealthTaxPaid, live.sumWealthTaxPaid, progress),
        });
    }

    return result;
}

export function computeFinancialGhostData(
    allPts: FinancialRawPoint[],
    currentTick: number,
    live?: FinancialLive,
    position: MonthlyPosition = 'centre',
): FinancialChartPoint[] {
    if (allPts.length === 0 || currentTick === 0) {
        return [];
    }

    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    const anchorTick = live && live.tick > 0 ? live.tick : currentTick;
    const { year: latestYear, monthIndex: currentMonthIndex, day: currentDay } = tickToDate(anchorTick);

    const currentMonthIdx = currentMonthIndex + Math.max(currentDay - 1, 0.001) / TICKS_PER_MONTH;
    const monthX = position === 'end' ? monthEnd : monthCentre;

    return pts
        .filter(
            (p) =>
                tickToDate(p.bucket).year === latestYear - 1 &&
                monthX(p.bucket) - 1 / TICKS_PER_MONTH > currentMonthIdx,
        )
        .map((p) => ({
            ...p,
            monthIdx: monthX(p.bucket),
        }));
}

export type ExpensesRevenueBucketRow = {
    xVal: number;
    year: number;
    monthIndex: number;
    revenue: number | null;
    wages: number | null;
    purchases: number | null;
    claimPayments: number | null;
    misc: number | null;
    income: number | null;
    loss: number | null;
    ghostRevenue: null;
    ghostWages: null;
    ghostPurchases: null;
    ghostClaimPayments: null;
    ghostMisc: null;
    ghostIncome: null;
    ghostLoss: null;
};

export function splitNetIncome(netIncome: number): { income: number | null; loss: number | null } {
    return { income: netIncome > 0 ? netIncome : null, loss: netIncome < 0 ? -netIncome : null };
}

export const EXPENSE_SERIES_KEYS = ['wages', 'purchases', 'claimPayments', 'misc'] as const;
export type ExpenseSeriesKey = (typeof EXPENSE_SERIES_KEYS)[number];

export function expenseMagnitudeOrder(
    rows: ReadonlyArray<Record<ExpenseSeriesKey, number | null>>,
): ExpenseSeriesKey[] {
    const average = (key: ExpenseSeriesKey): number => {
        let total = 0;
        let count = 0;
        for (const row of rows) {
            const value = row[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                total += Math.abs(value);
                count += 1;
            }
        }
        return count === 0 ? 0 : total / count;
    };
    return [...EXPENSE_SERIES_KEYS].sort((a, b) => average(a) - average(b));
}

export type ResolutionRow = {
    wages: number | null;
    purchases: number | null;
    claimPayments: number | null;
    misc: number | null;
    revenue: number | null;
    ghostWages: number | null;
    ghostPurchases: number | null;
    ghostClaimPayments: number | null;
    ghostMisc: number | null;
    ghostRevenue: number | null;
};

function stackedTotal(values: readonly (number | null)[]): number | null {
    let total = 0;
    let any = false;
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            total += value;
            any = true;
        }
    }
    return any ? total : null;
}

export function expenseResolutionMagnitudes(rows: ReadonlyArray<ResolutionRow>): number[] {
    const magnitudes: number[] = [];
    const collect = (value: number | null) => {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            magnitudes.push(value);
        }
    };
    for (const row of rows) {
        const segments = [row.wages, row.purchases, row.claimPayments, row.misc];
        const ghostSegments = [row.ghostWages, row.ghostPurchases, row.ghostClaimPayments, row.ghostMisc];
        for (const segment of segments) {
            collect(segment);
        }
        for (const segment of ghostSegments) {
            collect(segment);
        }
        collect(stackedTotal(segments));
        collect(stackedTotal(ghostSegments));
        collect(row.revenue);
        collect(row.ghostRevenue);
    }
    return magnitudes;
}

export type LogFloorRow = ResolutionRow & {
    income: number | null;
    loss: number | null;
    ghostIncome: number | null;
    ghostLoss: number | null;
};

export function applyLogFloor(rows: readonly LogFloorRow[], segmentFloor: number, lineFloor: number): LogFloorRow[] {
    const keepOr = (value: number | null, floor: number): number | null =>
        value === null ? null : value > 0 ? value : floor;
    const whenPresent = (value: number | null, present: number | null, floor: number): number | null =>
        present === null ? null : value !== null && value > 0 ? value : floor;
    return rows.map((row) => ({
        ...row,
        wages: keepOr(row.wages, segmentFloor),
        purchases: keepOr(row.purchases, segmentFloor),
        claimPayments: keepOr(row.claimPayments, segmentFloor),
        misc: keepOr(row.misc, segmentFloor),
        ghostWages: keepOr(row.ghostWages, segmentFloor),
        ghostPurchases: keepOr(row.ghostPurchases, segmentFloor),
        ghostClaimPayments: keepOr(row.ghostClaimPayments, segmentFloor),
        ghostMisc: keepOr(row.ghostMisc, segmentFloor),
        revenue: keepOr(row.revenue, lineFloor),
        ghostRevenue: keepOr(row.ghostRevenue, lineFloor),
        income: whenPresent(row.income, row.revenue, lineFloor),
        loss: whenPresent(row.loss, row.revenue, lineFloor),
        ghostIncome: whenPresent(row.ghostIncome, row.ghostRevenue, lineFloor),
        ghostLoss: whenPresent(row.ghostLoss, row.ghostRevenue, lineFloor),
    }));
}

export function computeExpensesRevenueBuckets(
    data: FinancialPoint[],
    granularity: 'yearly' | 'decade',
    live?: FinancialLive,
): ExpensesRevenueBucketRow[] {
    const monthsPerBucket = granularity === 'decade' ? 120 : 12;
    const rows: ExpensesRevenueBucketRow[] = [...data]
        .sort((a, b) => a.bucket - b.bucket)
        .map((p) => {
            const xVal = granularity === 'decade' ? decadeCentre(p.bucket) : yearCentre(p.bucket);
            const { income, loss } = splitNetIncome(
                computeNetIncome({
                    revenue: p.avgMonthlyNetIncome,
                    wages: p.avgWages,
                    purchases: p.sumPurchases / monthsPerBucket,
                    claimPayments: p.sumClaimPayments / monthsPerBucket,
                    interestPaid: p.sumInterestPaid / monthsPerBucket,
                    wealthTaxPaid: p.sumWealthTaxPaid / monthsPerBucket,
                }),
            );
            return {
                xVal,
                year: xVal,
                monthIndex: tickToDate(p.bucket).monthIndex,
                revenue: p.avgMonthlyNetIncome,
                wages: p.avgWages,
                purchases: p.sumPurchases / monthsPerBucket,
                claimPayments: p.sumClaimPayments / monthsPerBucket,
                misc: (p.sumInterestPaid + p.sumWealthTaxPaid) / monthsPerBucket,
                income,
                loss,
                ghostRevenue: null,
                ghostWages: null,
                ghostPurchases: null,
                ghostClaimPayments: null,
                ghostMisc: null,
                ghostIncome: null,
                ghostLoss: null,
            };
        });

    if (!live || live.tick <= 0) {
        return rows;
    }

    const previous = rows[rows.length - 1];
    const revenue = bucketAverageToDate(
        previous?.revenue ?? undefined,
        live.avgMonthlyNetIncome,
        live.tick,
        granularity,
    );
    const wages = bucketAverageToDate(previous?.wages ?? undefined, live.avgWages, live.tick, granularity);
    const purchases = bucketAverageToDate(previous?.purchases ?? undefined, live.sumPurchases, live.tick, granularity);
    const claimPayments = bucketAverageToDate(
        previous?.claimPayments ?? undefined,
        live.sumClaimPayments,
        live.tick,
        granularity,
    );
    const misc = bucketAverageToDate(
        previous?.misc ?? undefined,
        live.sumInterestPaid + live.sumWealthTaxPaid,
        live.tick,
        granularity,
    );
    const { income, loss } = splitNetIncome(
        (revenue ?? 0) - (wages ?? 0) - (purchases ?? 0) - (claimPayments ?? 0) - (misc ?? 0),
    );
    rows.push({
        xVal: liveYearX(live.tick),
        year: tickToDate(live.tick).year,
        monthIndex: 0,
        revenue,
        wages,
        purchases,
        claimPayments,
        misc,
        income,
        loss,
        ghostRevenue: null,
        ghostWages: null,
        ghostPurchases: null,
        ghostClaimPayments: null,
        ghostMisc: null,
        ghostIncome: null,
        ghostLoss: null,
    });
    return rows;
}
