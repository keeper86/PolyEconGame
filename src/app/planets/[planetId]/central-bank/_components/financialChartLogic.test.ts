import { describe, expect, it } from 'vitest';
import {
    bucketDecadeEnd,
    bucketDecadeLabel,
    bucketYearEnd,
    computeCostOfLivingMonthlyData,
    computeMacroMonthlyData,
    formatYearStart,
    raiseWagesMonotone,
} from './financialChartLogic';
import type { CostOfLivingLive, CostOfLivingPoint, EconomyPoint, MacroLive } from './financialChartLogic';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';

function gameTickFor(gameYear: number, monthIndex: number, day: number): number {
    return gameYear * TICKS_PER_YEAR + monthIndex * TICKS_PER_MONTH + (day - 1) + 1;
}

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
        const livePoint = result.find((p) => p.monthIdx !== undefined && !Number.isInteger(p.monthIdx));
        expect(livePoint).toBeDefined();
        expect(livePoint?.gdp).toBe(999);
        expect(livePoint?.bankEquity).toBe(888);
        expect(livePoint?.moneySupply).toBe(777);
        expect(livePoint?.monthIdx).toBeCloseTo(2 + 4 / TICKS_PER_MONTH, 5);
    });

    it('omits the live point when no live data is provided', () => {
        const result = computeMacroMonthlyData(data, live.tick);
        expect(result.every((p) => Number.isInteger(p.monthIdx))).toBe(true);
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
        const livePoint = result.find((p) => p.monthIdx !== undefined && !Number.isInteger(p.monthIdx));
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
        expect(result.every((p) => Number.isInteger(p.monthIdx))).toBe(true);
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

describe('bucket interval ends', () => {
    it('maps the first yearly bucket (0) to the end of its year', () => {
        expect(bucketYearEnd(0)).toBe(2201);
    });

    it('maps later yearly buckets to the end of the year they cover', () => {
        expect(bucketYearEnd(360)).toBe(2202);
        expect(bucketYearEnd(720)).toBe(2203);
    });

    it('maps the first decade bucket (0) to the end of its decade', () => {
        expect(bucketDecadeEnd(0)).toBe(2210);
        expect(bucketDecadeLabel(0)).toBe('2210s');
    });

    it('maps later decade buckets to the end of the decade they cover', () => {
        expect(bucketDecadeEnd(3600)).toBe(2220);
        expect(bucketDecadeLabel(3600)).toBe('2220s');
    });
});

describe('formatYearStart', () => {
    it('prefixes the year boundary with Start of', () => {
        expect(formatYearStart(2201)).toBe('Start of 2201');
        expect(formatYearStart(2210)).toBe('Start of 2210');
    });

    it('floors fractional live positions to their year', () => {
        expect(formatYearStart(2201.997)).toBe('Start of 2201');
    });
});
