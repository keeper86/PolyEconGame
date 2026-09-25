import { describe, expect, it } from 'vitest';
import {
    bucketDecadeMid,
    bucketYearMid,
    computeCostOfLivingMonthlyData,
    computeMacroMonthlyData,
    decadeDisplayRows,
    formatDecadeLabel,
    formatYearLabel,
    raiseWagesMonotone,
} from './financialChartLogic';
import type { CostOfLivingLive, CostOfLivingPoint, EconomyPoint, MacroLive } from './financialChartLogic';
import { DECADE_WINDOW, PREVIOUS_DECEMBER_IDX, decadeStart } from '@/lib/historyChartAxis';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';

function gameTickFor(gameYear: number, monthIndex: number, day: number): number {
    return gameYear * TICKS_PER_YEAR + monthIndex * TICKS_PER_MONTH + (day - 1) + 1;
}

const isLivePoint = (point: { monthIdx?: number }): boolean =>
    point.monthIdx !== undefined && point.monthIdx !== PREVIOUS_DECEMBER_IDX && point.monthIdx % 1 !== 0.5;

function macroYear(gameYear: number, gdp: number): EconomyPoint[] {
    return Array.from({ length: 12 }, (_, monthIndex) => ({
        bucket: gameTickFor(gameYear, monthIndex, TICKS_PER_MONTH),
        avgGdp: gdp,
        avgBankEquity: gdp * 2,
        avgMoneySupply: gdp * 3,
    }));
}

function costYear(gameYear: number, cost: number): CostOfLivingPoint[] {
    return Array.from({ length: 12 }, (_, monthIndex) => ({
        bucket: gameTickFor(gameYear, monthIndex, TICKS_PER_MONTH),
        avgCostOfLiving: cost,
        avgCostOfLivingRich: cost * 2,
        avgWageEdu0: 10,
        avgWageEdu1: 20,
        avgWageEdu2: 30,
        avgWageEdu3: 40,
    }));
}

describe('computeMacroMonthlyData live point', () => {
    const data = [...macroYear(0, 100), ...macroYear(1, 200)];
    const live: MacroLive = { tick: gameTickFor(1, 2, 5), gdp: 999, bankEquity: 888, moneySupply: 777 };

    it('appends the live point at the fractional month index', () => {
        const result = computeMacroMonthlyData(data, live.tick, live);
        const livePoint = result.find(isLivePoint);
        expect(livePoint).toBeDefined();
        expect(livePoint?.gdp).toBe(999);
        expect(livePoint?.bankEquity).toBe(888);
        expect(livePoint?.moneySupply).toBe(777);
        expect(livePoint?.monthIdx).toBeCloseTo(2 + 4 / TICKS_PER_MONTH, 5);
    });

    it('omits the live point when no live data is provided', () => {
        const result = computeMacroMonthlyData(data, live.tick);
        expect(result.some(isLivePoint)).toBe(false);
        expect(result.some((p) => p.gdp === 999)).toBe(false);
    });

    it('never leaks live values into the ghost series', () => {
        const result = computeMacroMonthlyData(data, live.tick, live);
        const ghosts = result.filter((p) => p.ghostGdp !== null);
        expect(ghosts.length).toBeGreaterThan(0);
        expect(ghosts.every((p) => p.ghostGdp !== 999)).toBe(true);
    });
});

describe('computeCostOfLivingMonthlyData live point', () => {
    const data = [...costYear(0, 5), ...costYear(1, 8)];
    const live: CostOfLivingLive = {
        tick: gameTickFor(1, 4, 10),
        costOfLiving: 12,
        costOfLivingRich: 20,
        wageEdu0: 100,
        wageEdu1: 200,
        wageEdu2: 300,
        wageEdu3: 400,
    };

    it('appends the live point at the fractional month index', () => {
        const result = computeCostOfLivingMonthlyData(data, live.tick, live);
        const livePoint = result.find(isLivePoint);
        expect(livePoint).toBeDefined();
        expect(livePoint?.costOfLiving).toBe(12);
        expect(livePoint?.costOfLivingRich).toBe(20);
        expect(livePoint?.costOfLivingRichDiff).toBe(8);
        expect(livePoint?.wageEdu0).toBe(100);
        expect(livePoint?.wageEdu3).toBe(400);
        expect(livePoint?.monthIdx).toBeCloseTo(4 + 9 / TICKS_PER_MONTH, 5);
    });

    it('omits the live point when no live data is provided', () => {
        const result = computeCostOfLivingMonthlyData(data, live.tick);
        expect(result.some(isLivePoint)).toBe(false);
        expect(result.some((p) => p.costOfLiving === 12)).toBe(false);
    });
});

describe('raiseWagesMonotone', () => {
    it('keeps already-monotone wages unchanged', () => {
        expect(raiseWagesMonotone([10, 20, 30, 40])).toEqual([10, 20, 30, 40]);
    });

    it('raises every higher edu to the max when wages descend', () => {
        expect(raiseWagesMonotone([100, 50, 30, 10])).toEqual([100, 100, 100, 100]);
    });

    it('raises only the violating higher edus for mixed input', () => {
        expect(raiseWagesMonotone([100, 8, 5])).toEqual([100, 100, 100]);
    });

    it('equals the running maximum of each prefix', () => {
        const input = [3, 1, 7, 2, 4];
        const result = raiseWagesMonotone(input);
        for (let i = 0; i < input.length; i++) {
            expect(result[i]).toBe(Math.max(...input.slice(0, i + 1)));
        }
    });

    it('never lowers a wage and keeps the lowest level untouched', () => {
        const input = [50, 10, 20, 5];
        const result = raiseWagesMonotone(input);
        expect(result[0]).toBe(input[0]);
        expect(result[result.length - 1]).toBe(Math.max(...input));
        for (let i = 0; i < input.length; i++) {
            expect(result[i]).toBeGreaterThanOrEqual(input[i]);
        }
    });

    it('produces a non-decreasing sequence for arbitrary input', () => {
        const cases = [
            [10, 8, 5],
            [1, 2, 3, 4, 5],
            [5, 4, 3, 2, 1],
            [1, 5, 2, 4, 3],
            [-1, -2, -3],
            [0, 0, 0, 0],
        ];
        for (const input of cases) {
            const result = raiseWagesMonotone(input);
            for (let i = 0; i < result.length - 1; i++) {
                expect(result[i]).toBeLessThanOrEqual(result[i + 1]);
            }
        }
    });

    it('handles empty and single-element arrays', () => {
        expect(raiseWagesMonotone([])).toEqual([]);
        expect(raiseWagesMonotone([42])).toEqual([42]);
    });

    it('does not mutate the input array', () => {
        const input = [50, 10, 20];
        raiseWagesMonotone(input);
        expect(input).toEqual([50, 10, 20]);
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
        expect(formatYearLabel(2200.5)).toBe('Year 2200');
        expect(formatYearLabel(2201.5)).toBe('Year 2201');
    });

    it('floors fractional live positions to their year', () => {
        expect(formatYearLabel(2201.997)).toBe('Year 2201');
    });

    it('names the decade the interval covers', () => {
        expect(formatDecadeLabel(2205)).toBe('2200s');
        expect(formatDecadeLabel(2215)).toBe('2210s');
    });
});

describe('decadeDisplayRows', () => {
    it('keeps only the most recent DECADE_WINDOW buckets in ascending order', () => {
        const rows = Array.from({ length: DECADE_WINDOW + 3 }, (_, i) => ({ bucket: i * TICKS_PER_YEAR + 1 }));

        const display = decadeDisplayRows(rows);

        expect(display).toHaveLength(DECADE_WINDOW);
        expect(display.map((p) => p.bucket)).toEqual(
            Array.from({ length: DECADE_WINDOW }, (_, i) => (i + 3) * TICKS_PER_YEAR + 1),
        );
    });

    it('sorts unordered input before slicing', () => {
        const rows = [{ bucket: 30 }, { bucket: 10 }, { bucket: 20 }];

        expect(decadeDisplayRows(rows).map((p) => p.bucket)).toEqual([10, 20, 30]);
    });

    it('anchors the decade axis at the first displayed bucket rather than the oldest bucket', () => {
        const rows = Array.from({ length: 200 }, (_, i) => ({ bucket: i * TICKS_PER_YEAR + 1 }));

        const display = decadeDisplayRows(rows);

        expect(decadeStart(display[0].bucket)).toBeGreaterThan(decadeStart(rows[0].bucket));
    });
});
