import { describe, expect, it } from 'vitest';
import { liveYearX } from '@/lib/chartTime';
import { PREVIOUS_DECEMBER_END_IDX } from '@/lib/historyChartAxis';
import { START_YEAR, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import {
    computeDecadePopulation,
    computeMonthlyPopulation,
    computeMonthlyPopulationGhost,
    computeYearlyPopulation,
} from './populationChartLogic';
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

describe('computeYearlyPopulation', () => {
    const yearlyBuckets: PopulationBucketPoint[] = [
        { bucket: bucketTick(0, 0), avgPopulation: 1000 },
        { bucket: bucketTick(1, 0), avgPopulation: 1100 },
        { bucket: bucketTick(2, 0), avgPopulation: 1200 },
    ];

    it('places each averaged year at the interval centre, not the year end', () => {
        const rows = computeYearlyPopulation(yearlyBuckets);
        expect(rows.map((p) => p.xPos)).toEqual([START_YEAR + 0.5, START_YEAR + 1.5, START_YEAR + 2.5]);
        expect(rows.map((p) => p.labelYear)).toEqual([START_YEAR, START_YEAR + 1, START_YEAR + 2]);
        expect(rows.map((p) => p.value)).toEqual([1000, 1100, 1200]);
    });

    it('appends the live sample at its fractional year position', () => {
        const rows = computeYearlyPopulation(yearlyBuckets, live);
        expect(rows).toHaveLength(yearlyBuckets.length + 1);
        expect(rows[rows.length - 1].xPos).toBeCloseTo(liveYearX(live.tick), 6);
        expect(rows[rows.length - 1].value).toBe(live.population);
    });
});

describe('computeDecadePopulation', () => {
    const decadeBuckets: PopulationBucketPoint[] = [
        { bucket: bucketTick(0, 0), avgPopulation: 1000 },
        { bucket: bucketTick(10, 0), avgPopulation: 1100 },
        { bucket: bucketTick(20, 0), avgPopulation: 1200 },
    ];

    it('places each averaged decade at the interval centre, not the decade end', () => {
        const rows = computeDecadePopulation(decadeBuckets);
        expect(rows.map((p) => p.xPos)).toEqual([START_YEAR + 5, START_YEAR + 15, START_YEAR + 25]);
        expect(rows.map((p) => p.labelYear)).toEqual([START_YEAR, START_YEAR + 10, START_YEAR + 20]);
    });

    it('appends the live sample at its fractional year position', () => {
        const rows = computeDecadePopulation(decadeBuckets, live);
        expect(rows).toHaveLength(decadeBuckets.length + 1);
        expect(rows[rows.length - 1].xPos).toBeCloseTo(liveYearX(live.tick), 6);
    });
});
