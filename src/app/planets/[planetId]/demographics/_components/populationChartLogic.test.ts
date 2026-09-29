import { describe, expect, it } from 'vitest';
import { PREVIOUS_DECEMBER_END_IDX } from '@/lib/historyChartAxis';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import { computeMonthlyPopulation, computeMonthlyPopulationGhost } from './populationChartLogic';
import type { PopulationBucketPoint, PopulationLive } from './populationChartLogic';

function bucketTick(yearOffset: number, monthIndex: number): number {
    return yearOffset * TICKS_PER_YEAR + monthIndex * TICKS_PER_MONTH + 1;
}

function liveTick(yearOffset: number, monthIndex: number, day: number): number {
    return yearOffset * TICKS_PER_YEAR + monthIndex * TICKS_PER_MONTH + day;
}

function bucketsFor(yearOffset: number, value: number, months: number): PopulationBucketPoint[] {
    return Array.from({ length: months }, (_, monthIndex) => ({
        bucket: bucketTick(yearOffset, monthIndex),
        avgPopulation: value + monthIndex,
    }));
}

const buckets = [...bucketsFor(0, 1000, 12), ...bucketsFor(1, 2000, 2)];
const live: PopulationLive = { tick: liveTick(1, 2, 5), population: 2100 };

describe('computeMonthlyPopulation', () => {
    it('places each month bucket at the end of its interval', () => {
        const result = computeMonthlyPopulation(buckets, live);
        const historic = result.filter((p) => !p.isLive && p.monthIdx !== PREVIOUS_DECEMBER_END_IDX);
        expect(historic.map((p) => p.monthIdx)).toEqual([1, 2]);
        expect(historic.map((p) => p.monthIndex)).toEqual([0, 1]);
        expect(historic.map((p) => p.value)).toEqual([2000, 2001]);
    });

    it('anchors the series at the previous December interval end', () => {
        const result = computeMonthlyPopulation(buckets, live);
        expect(result[0].monthIdx).toBe(PREVIOUS_DECEMBER_END_IDX);
        expect(result[0].monthIndex).toBe(11);
        expect(result[0].value).toBe(1011);
    });

    it('appends the live sample at its fractional month position', () => {
        const result = computeMonthlyPopulation(buckets, live);
        const point = result[result.length - 1];
        expect(point.isLive).toBe(true);
        expect(point.monthIdx).toBeCloseTo(2 + 4 / TICKS_PER_MONTH, 6);
        expect(point.value).toBe(2100);
    });

    it('sorts every point by its plotted position', () => {
        const positions = computeMonthlyPopulation(buckets, live).map((p) => p.monthIdx);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    it('keeps a flat series flat up to the live sample', () => {
        const flat = [
            ...bucketsFor(0, 5000, 12).map((p) => ({ ...p, avgPopulation: 5000 })),
            ...bucketsFor(1, 5000, 2).map((p) => ({ ...p, avgPopulation: 5000 })),
        ];
        const result = computeMonthlyPopulation(flat, { tick: liveTick(1, 2, 5), population: 5000 });
        expect(result.every((p) => p.value === 5000)).toBe(true);
    });

    it('returns nothing before the first bucket or live tick', () => {
        expect(computeMonthlyPopulation([], { tick: 0, population: 0 })).toEqual([]);
    });
});

describe('computeMonthlyPopulationGhost', () => {
    it('plots previous year months at the interval end while they stay ahead of the live sample', () => {
        const ghost = computeMonthlyPopulationGhost(buckets, live);
        expect(ghost.map((p) => p.monthIdx)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(ghost.map((p) => p.monthIndex)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        expect(ghost[0].value).toBe(1002);
    });

    it('returns nothing without a live tick', () => {
        expect(computeMonthlyPopulationGhost(buckets, { tick: 0, population: 0 })).toEqual([]);
    });
});
