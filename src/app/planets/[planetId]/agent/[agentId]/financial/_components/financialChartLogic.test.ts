import { describe, expect, it } from 'vitest';
import {
    alignedYDomains,
    bucketDecadeMid,
    bucketYearMid,
    computeExpensesRevenueBuckets,
    computeFinancialGhostData,
    computeFinancialMonthlyData,
    formatDecadeLabel,
    formatYearLabel,
    type FinancialLive,
    type FinancialPoint,
} from './financialChartLogic';
import { MONTHS_PER_YEAR, PREVIOUS_DECEMBER_IDX } from '@/lib/historyChartAxis';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';

const isLivePoint = (point: { monthIdx: number }): boolean =>
    point.monthIdx !== PREVIOUS_DECEMBER_IDX && point.monthIdx % 1 !== 0.5;

function gameTickFor(gameYear: number, monthIndex: number, day: number): number {
    return gameYear * TICKS_PER_YEAR + monthIndex * TICKS_PER_MONTH + (day - 1) + 1;
}

function financialYear(gameYear: number, netBalance: number): FinancialPoint[] {
    return Array.from({ length: 12 }, (_, monthIndex) => ({
        bucket: gameTickFor(gameYear, monthIndex, TICKS_PER_MONTH),
        avgNetBalance: netBalance,
        avgAssetValue: netBalance * 2,
        avgMonthlyNetIncome: netBalance / 2,
        avgWages: netBalance / 4,
        sumPurchases: netBalance / 8,
        sumClaimPayments: netBalance / 16,
        sumInterestPaid: netBalance / 32,
        sumWealthTaxPaid: netBalance / 64,
    }));
}

describe('computeFinancialMonthlyData live point', () => {
    const data = [...financialYear(0, 100), ...financialYear(1, 200)];
    const live: FinancialLive = {
        tick: gameTickFor(1, 3, 6),
        avgNetBalance: 1111,
        avgAssetValue: 2222,
        avgMonthlyNetIncome: 3333,
        avgWages: 444,
        sumPurchases: 55,
        sumClaimPayments: 6,
        sumInterestPaid: 7,
        sumWealthTaxPaid: 8,
    };

    it('appends the live point at the fractional month index, mixing levels and filling up accumulators', () => {
        const result = computeFinancialMonthlyData(data, live.tick, live);
        const livePoint = result.find(isLivePoint);
        const progress = 6 / TICKS_PER_MONTH;
        expect(livePoint).toBeDefined();
        expect(livePoint?.avgNetBalance).toBeCloseTo(200 + (1111 - 200) * progress, 6);
        expect(livePoint?.avgAssetValue).toBeCloseTo(400 + (2222 - 400) * progress, 6);
        expect(livePoint?.avgMonthlyNetIncome).toBeCloseTo(100 * (1 - progress) + 3333, 6);
        expect(livePoint?.avgWages).toBeCloseTo(50 * (1 - progress) + 444, 6);
        expect(livePoint?.sumPurchases).toBeCloseTo(25 * (1 - progress) + 55, 6);
        expect(livePoint?.sumClaimPayments).toBeCloseTo(12.5 * (1 - progress) + 6, 6);
        expect(livePoint?.monthIdx).toBeCloseTo(3 + 5 / TICKS_PER_MONTH, 5);
    });

    it('adds the live extrapolation from the first tick of a month', () => {
        const firstDay = { ...live, tick: gameTickFor(1, 3, 1) };
        const result = computeFinancialMonthlyData(data, firstDay.tick, firstDay);
        const livePoint = result.find(isLivePoint);
        const progress = 1 / TICKS_PER_MONTH;
        expect(livePoint?.avgNetBalance).toBeCloseTo(200 + (1111 - 200) * progress, 6);
        expect(livePoint?.avgAssetValue).toBeCloseTo(400 + (2222 - 400) * progress, 6);
        expect(livePoint?.sumPurchases).toBeCloseTo(25 * (1 - progress) + 55, 6);
    });

    it('omits the live point when no live data is provided', () => {
        const result = computeFinancialMonthlyData(data, live.tick);
        expect(result.some(isLivePoint)).toBe(false);
        expect(result.some((p) => p.avgNetBalance === 1111)).toBe(false);
    });
});

describe('computeFinancialGhostData live threshold', () => {
    const data = [...financialYear(0, 100), ...financialYear(1, 200)];

    it('starts the previous-year ghost series at the current month', () => {
        const live: FinancialLive = {
            tick: gameTickFor(1, 3, 6),
            avgNetBalance: 0,
            avgAssetValue: 0,
            avgMonthlyNetIncome: 0,
            avgWages: 0,
            sumPurchases: 0,
            sumClaimPayments: 0,
            sumInterestPaid: 0,
            sumWealthTaxPaid: 0,
        };
        const ghost = computeFinancialGhostData(data, live.tick, live);
        const monthIdxs = ghost.map((p) => p.monthIdx);
        expect(monthIdxs.includes(2.5)).toBe(false);
        expect(monthIdxs.includes(3.5)).toBe(true);
        expect(monthIdxs.includes(11.5)).toBe(true);
    });

    it('drops the oldest ghost month once the live tick passes its midpoint', () => {
        const live: FinancialLive = {
            tick: gameTickFor(1, 3, 25),
            avgNetBalance: 0,
            avgAssetValue: 0,
            avgMonthlyNetIncome: 0,
            avgWages: 0,
            sumPurchases: 0,
            sumClaimPayments: 0,
            sumInterestPaid: 0,
            sumWealthTaxPaid: 0,
        };
        const ghost = computeFinancialGhostData(data, live.tick, live);
        expect(ghost.map((p) => p.monthIdx)).toEqual([4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]);
    });
});

function expensesPoint(
    gameYear: number,
    sumPurchases: number,
    sumClaimPayments: number,
    sumInterestPaid = 0,
    sumWealthTaxPaid = 0,
): FinancialPoint {
    return {
        bucket: gameTickFor(gameYear, 0, 1),
        avgNetBalance: 0,
        avgAssetValue: 0,
        avgMonthlyNetIncome: 600,
        avgWages: 300,
        sumPurchases,
        sumClaimPayments,
        sumInterestPaid,
        sumWealthTaxPaid,
    };
}

describe('computeExpensesRevenueBuckets', () => {
    it('reports yearly purchases and claims as monthly equivalents', () => {
        const rows = computeExpensesRevenueBuckets(
            [expensesPoint(0, 1200, 240), expensesPoint(1, 1200, 240)],
            'yearly',
            'linear',
        );
        expect(rows.map((r) => r.purchases)).toEqual([100, 100]);
        expect(rows.map((r) => r.claimPayments)).toEqual([20, 20]);
        expect(rows.map((r) => r.revenue)).toEqual([600, 600]);
    });

    it('reports decade purchases and claims as monthly equivalents', () => {
        const rows = computeExpensesRevenueBuckets([expensesPoint(0, 1200, 240)], 'decade', 'linear');
        expect(rows.map((r) => r.purchases)).toEqual([10]);
        expect(rows.map((r) => r.claimPayments)).toEqual([2]);
    });

    it('reports yearly interest plus wealth tax as a combined monthly misc line', () => {
        const rows = computeExpensesRevenueBuckets([expensesPoint(0, 0, 0, 240, 120)], 'yearly', 'linear');
        expect(rows.map((r) => r.misc)).toEqual([30]);
    });

    it('reports decade interest plus wealth tax as a combined monthly misc line', () => {
        const rows = computeExpensesRevenueBuckets([expensesPoint(0, 0, 0, 240, 120)], 'decade', 'linear');
        expect(rows.map((r) => r.misc)).toEqual([3]);
    });

    it('averages the previous bucket with the live month across the months elapsed in the current year', () => {
        const live: FinancialLive = {
            tick: gameTickFor(2, 6, 1),
            avgNetBalance: 0,
            avgAssetValue: 0,
            avgMonthlyNetIncome: 700,
            avgWages: 350,
            sumPurchases: 1300,
            sumClaimPayments: 260,
            sumInterestPaid: 240,
            sumWealthTaxPaid: 120,
        };
        const rows = computeExpensesRevenueBuckets([expensesPoint(1, 1200, 240)], 'yearly', 'linear', live);
        const liveRow = rows[rows.length - 1];
        const elapsedMonths = 6 + 1 / TICKS_PER_MONTH;
        expect(liveRow.revenue).toBeCloseTo((6 * 600 + 700) / elapsedMonths, 6);
        expect(liveRow.wages).toBeCloseTo((6 * 300 + 350) / elapsedMonths, 6);
        expect(liveRow.purchases).toBeCloseTo((6 * 100 + 1300) / elapsedMonths, 6);
        expect(liveRow.claimPayments).toBeCloseTo((6 * 20 + 260) / elapsedMonths, 6);
        expect(liveRow.misc).toBeCloseTo(360 / elapsedMonths, 6);
    });

    it('averages the previous decade bucket with the live month across the months elapsed in the current decade', () => {
        const live: FinancialLive = {
            tick: gameTickFor(5, 0, 1),
            avgNetBalance: 0,
            avgAssetValue: 0,
            avgMonthlyNetIncome: 700,
            avgWages: 350,
            sumPurchases: 1300,
            sumClaimPayments: 260,
            sumInterestPaid: 240,
            sumWealthTaxPaid: 120,
        };
        const rows = computeExpensesRevenueBuckets([expensesPoint(0, 1200, 240)], 'decade', 'linear', live);
        const liveRow = rows[rows.length - 1];
        const elapsedMonths = 5 * MONTHS_PER_YEAR + 1 / TICKS_PER_MONTH;
        expect(liveRow.purchases).toBeCloseTo((5 * MONTHS_PER_YEAR * 10 + 1300) / elapsedMonths, 6);
        expect(liveRow.claimPayments).toBeCloseTo((5 * MONTHS_PER_YEAR * 2 + 260) / elapsedMonths, 6);
        expect(liveRow.misc).toBeCloseTo(360 / elapsedMonths, 6);
    });

    it('sorts unordered buckets so the live point mixes with the most recent one', () => {
        const rows = computeExpensesRevenueBuckets(
            [expensesPoint(1, 1200, 240), expensesPoint(0, 1200, 240)],
            'yearly',
            'linear',
        );
        expect(rows.map((r) => r.year)).toEqual([2200.5, 2201.5]);
    });
});

function zeroFraction([lo, hi]: [number, number]): number {
    return Math.abs(lo) / (hi - lo);
}

const TOLERANCE = 1e-6;

describe('alignedYDomains', () => {
    it('returns domains where zero sits at the same vertical fraction on both axes', () => {
        const balance = [80_000, 150_000, 300_000, -50_000, -280_000];
        const income = [250_000, -320_000, 100_000];

        const [dA, dB] = alignedYDomains(balance, income);

        expect(zeroFraction(dA)).toBeCloseTo(zeroFraction(dB), 5);
    });

    it('zero fraction is aligned when both axes straddle zero', () => {
        const [dA, dB] = alignedYDomains([-100, 200], [-50, 150]);
        expect(zeroFraction(dA)).toBeCloseTo(zeroFraction(dB), 5);
    });

    it('domains always include zero', () => {
        const [dA, dB] = alignedYDomains([10, 20, 30], [5, 15]);
        expect(dA[0]).toBeLessThanOrEqual(0);
        expect(dA[1]).toBeGreaterThanOrEqual(0);
        expect(dB[0]).toBeLessThanOrEqual(0);
        expect(dB[1]).toBeGreaterThanOrEqual(0);
    });

    it('all input values fall within their respective domain', () => {
        const balance = [300_000, -290_000, 100_000];
        const income = [280_000, -330_000, 50_000];

        const [dA, dB] = alignedYDomains(balance, income);

        for (const v of balance) {
            expect(v).toBeGreaterThanOrEqual(dA[0] - TOLERANCE);
            expect(v).toBeLessThanOrEqual(dA[1] + TOLERANCE);
        }
        for (const v of income) {
            expect(v).toBeGreaterThanOrEqual(dB[0] - TOLERANCE);
            expect(v).toBeLessThanOrEqual(dB[1] + TOLERANCE);
        }
    });

    it('works when one axis is entirely positive', () => {
        const balance = [100, 200, 300];
        const income = [-50, 100, 200];

        const [dA, dB] = alignedYDomains(balance, income);

        expect(zeroFraction(dA)).toBeCloseTo(zeroFraction(dB), 5);
        expect(dA[0]).toBeLessThanOrEqual(0);
        expect(dA[1]).toBeGreaterThanOrEqual(300);
        expect(dB[0]).toBeLessThanOrEqual(-50);
        expect(dB[1]).toBeGreaterThanOrEqual(200);
    });

    it('works when one axis is entirely negative', () => {
        const balance = [-300, -100, -50];
        const income = [-200, 100, 50];

        const [dA, dB] = alignedYDomains(balance, income);

        expect(zeroFraction(dA)).toBeCloseTo(zeroFraction(dB), 5);
        expect(dA[0]).toBeLessThanOrEqual(-300);
        expect(dA[1]).toBeGreaterThanOrEqual(0);
    });

    it('symmetric data produces a zero fraction near 0.5', () => {
        const [dA, dB] = alignedYDomains([-100, 100], [-200, 200]);
        expect(zeroFraction(dA)).toBeCloseTo(0.5, 1);
        expect(zeroFraction(dB)).toBeCloseTo(0.5, 1);
    });

    it('handles empty axis gracefully — still returns finite numbers', () => {
        const [dA, dB] = alignedYDomains([], [100, -100]);
        expect(Number.isFinite(dA[0])).toBe(true);
        expect(Number.isFinite(dA[1])).toBe(true);
        expect(Number.isFinite(dB[0])).toBe(true);
        expect(Number.isFinite(dB[1])).toBe(true);
    });

    it('lo is always less than hi for both axes', () => {
        const cases: [number[], number[]][] = [
            [
                [1, 2, 3],
                [4, 5, 6],
            ],
            [
                [-3, -2, -1],
                [-6, -5, -4],
            ],
            [
                [-100, 200],
                [50, 300],
            ],
            [[0], [0]],
        ];
        for (const [a, b] of cases) {
            const [dA, dB] = alignedYDomains(a, b);
            expect(dA[0]).toBeLessThan(dA[1]);
            expect(dB[0]).toBeLessThan(dB[1]);
        }
    });
});

describe('bucket interval midpoints', () => {
    it('centres the first yearly bucket (1) inside its year', () => {
        expect(bucketYearMid(1)).toBe(2200.5);
    });

    it('centres later yearly buckets inside the year they cover', () => {
        expect(bucketYearMid(361)).toBe(2201.5);
        expect(bucketYearMid(721)).toBe(2202.5);
    });

    it('centres the first decade bucket (1) inside its decade', () => {
        expect(bucketDecadeMid(1)).toBe(2205);
    });

    it('centres later decade buckets inside the decade they cover', () => {
        expect(bucketDecadeMid(3601)).toBe(2215);
    });
});

describe('year tooltip labels', () => {
    it('names the year the interval covers', () => {
        expect(formatYearLabel('en', 2200.5)).toBe('Year 2200');
        expect(formatYearLabel('en', 2201.5)).toBe('Year 2201');
    });

    it('floors fractional live positions to their year', () => {
        expect(formatYearLabel('en', 2201.997)).toBe('Year 2201');
    });

    it('names the decade the interval covers', () => {
        expect(formatDecadeLabel('en', 2205)).toBe('2200s');
        expect(formatDecadeLabel('en', 2215)).toBe('2210s');
    });
});
