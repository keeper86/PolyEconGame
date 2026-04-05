/**
 * ProductPriceHistoryChart.test.ts
 *
 * Tests the core data-transformation logic for the monthly price chart.
 *
 * Invariant (given ≥12 months of history):
 *   At *any* tick within year N: data.length + ghostData.length === 14
 *
 * Breakdown:
 *   data  = 1 anchor (previous-December at monthIdx=0)
 *         + M-1 completed months (monthIdx 1..M-1)
 *         + 1 live fractional point
 *   ghost = 12-M months from the previous year (monthIdx M+1..12 in 1-based)
 *
 * December is intentionally "doubled": it serves as both the leading anchor
 * point (monthIdx=0) in `data` and as the last ghost month (monthIdx=12)
 * visible in January. This gives the chart a continuous look over the year
 * boundary. Hence the total is 14, not 13.
 */

import { computeMonthlyData, computeMonthlyGhostData } from './monthlyChartLogic';
import type { ChartPoint, LiveData, RawPoint } from './monthlyChartLogic';
import { tickToDate } from '@/components/client/TickDisplay';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import { describe, expect, it } from 'vitest';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const PRODUCT_NAME = 'TestProduct';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function makeBucket(gameYear: number, monthIndex: number): number {
    // Last game-tick of the month: simTickEnd = year*360 + month*30 + 29, gameTick = simTickEnd + 1
    const simTickEnd = gameYear * TICKS_PER_YEAR + monthIndex * TICKS_PER_MONTH + (TICKS_PER_MONTH - 1);
    return simTickEnd + 1;
}

function makeRawPoint(gameYear: number, monthIndex: number, price = 10): RawPoint {
    return { bucket: makeBucket(gameYear, monthIndex), avgPrice: price, minPrice: price * 0.9, maxPrice: price * 1.1 };
}

function makeTwoYearsOfData(year0 = 0, year1 = 1): RawPoint[] {
    const points: RawPoint[] = [];
    for (let m = 0; m < 12; m++) {
        points.push(makeRawPoint(year0, m, 8));
    }
    for (let m = 0; m < 12; m++) {
        points.push(makeRawPoint(year1, m, 12));
    }
    return points;
}

/**
 * Game tick for a given game-year (0-based), 0-based monthIndex, and 1-based day.
 * gameTick = gameYear*360 + monthIndex*30 + (day-1) + 1
 */
function gameTickFor(gameYear: number, monthIndex: number, day: number): number {
    return gameYear * TICKS_PER_YEAR + monthIndex * TICKS_PER_MONTH + (day - 1) + 1;
}

function completedMonthCount(data: ChartPoint[]): number {
    return data.filter((p) => p.monthIdx && p.monthIdx > 0 && Number.isInteger(p.monthIdx)).length;
}

// ─── Invariant tests ──────────────────────────────────────────────────────────

describe('MonthlyChart data invariant: data.length + ghost.length === 14', () => {
    const allPoints = makeTwoYearsOfData(0, 1);

    it('should have exactly 14 total points (data + ghost) at every sampled tick in year 1', () => {
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            for (let day = 1; day <= TICKS_PER_MONTH; day += 3) {
                const tick = gameTickFor(1, monthIndex, day);
                const live: LiveData = { tick, price: 11, avgPrice: 11, minPrice: 10, maxPrice: 12 };
                const completedBuckets = allPoints.filter((p) => p.bucket < tick);

                const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
                const ghostData = computeMonthlyGhostData(completedBuckets, live, data);
                const total = data.length + ghostData.length;

                if (total !== 14) {
                    const { year, monthIndex: mi, day: d } = tickToDate(tick);
                    failures.push(
                        `${MONTH_NAMES[mi]} ${d} Y${year}: data=${data.length} ghost=${ghostData.length} total=${total} (expected 14)`,
                    );
                }
            }
        }

        if (failures.length > 0) {
            throw new Error(`Invariant violated at ${failures.length} tick(s):\n${failures.join('\n')}`);
        }
    });

    it('should have exactly 1 anchor point (monthIdx === 0) at all times', () => {
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            for (let day = 1; day <= TICKS_PER_MONTH; day += 5) {
                const tick = gameTickFor(1, monthIndex, day);
                const live: LiveData = { tick, price: 11 };
                const completedBuckets = allPoints.filter((p) => p.bucket < tick);

                const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
                const anchorPoints = data.filter((p) => p.monthIdx === 0);

                if (anchorPoints.length !== 1) {
                    const { year, monthIndex: mi, day: d } = tickToDate(tick);
                    failures.push(
                        `${MONTH_NAMES[mi]} ${d} Y${year}: expected 1 anchor (monthIdx=0), got ${anchorPoints.length}`,
                    );
                }
            }
        }

        if (failures.length > 0) {
            throw new Error(`Anchor invariant violated:\n${failures.join('\n')}`);
        }
    });

    it('should have exactly 1 live (fractional) point in data at all times', () => {
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            for (let day = 1; day <= TICKS_PER_MONTH; day += 5) {
                const tick = gameTickFor(1, monthIndex, day);
                const live: LiveData = { tick, price: 11 };
                const completedBuckets = allPoints.filter((p) => p.bucket < tick);

                const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);

                const { monthIndex: mi, day: d } = tickToDate(tick);
                const fractionalMonthIdx = mi + (d - 1) / TICKS_PER_MONTH;
                // Live point is the last point pushed: it has the exact fractional monthIdx.
                const livePoint = data[data.length - 1];
                const isLive =
                    livePoint?.monthIdx !== undefined &&
                    Math.abs((livePoint.monthIdx ?? 0) - fractionalMonthIdx) < 0.001;

                if (!isLive) {
                    failures.push(
                        `${MONTH_NAMES[mi]} ${d}: last data point monthIdx=${livePoint?.monthIdx?.toFixed(3)} expected≈${fractionalMonthIdx.toFixed(3)}`,
                    );
                }
            }
        }

        if (failures.length > 0) {
            throw new Error(`Live-point invariant violated:\n${failures.join('\n')}`);
        }
    });

    it('should have no monthIdx overlap between current completed months and ghost data', () => {
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            for (let day = 2; day <= TICKS_PER_MONTH; day += 5) {
                const tick = gameTickFor(1, monthIndex, day);
                const live: LiveData = { tick, price: 11 };
                const completedBuckets = allPoints.filter((p) => p.bucket < tick);

                const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
                const ghostData = computeMonthlyGhostData(completedBuckets, live, data);

                // Completed months in data: integer monthIdx > 0 (excludes anchor at 0 and live which is fractional)
                const completedMonthIdxs = new Set(
                    data
                        .filter((p) => p.monthIdx !== undefined && p.monthIdx > 0 && Number.isInteger(p.monthIdx))
                        .map((p) => p.monthIdx as number),
                );
                const ghostMonthIdxs = new Set(ghostData.map((p) => p.monthIdx as number));
                const overlapping = [...completedMonthIdxs].filter((idx) => ghostMonthIdxs.has(idx));

                if (overlapping.length > 0) {
                    const { monthIndex: mi, day: d } = tickToDate(tick);
                    failures.push(
                        `${MONTH_NAMES[mi]} ${d}: monthIdx overlap between current completed months and ghost: [${overlapping.join(', ')}]`,
                    );
                }
            }
        }

        if (failures.length > 0) {
            throw new Error(`Overlap invariant violated:\n${failures.join('\n')}`);
        }
    });

    /**
     * Mid-month breakdown at day 15 for each month M (0-based monthIndex):
     *   data    = 1 anchor + M completed months + 1 live  → data.length = M + 2
     *   ghost   = months M..11 of prev year (1-based monthIdx M+1..12) → 12 - M points
     *   total   = (M+2) + (12-M) = 14
     */
    it('should have correct per-month breakdown at mid-month (day 15)', () => {
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const day = 15;
            const tick = gameTickFor(1, monthIndex, day);
            const live: LiveData = { tick, price: 11, avgPrice: 11, minPrice: 10, maxPrice: 12 };
            const completedBuckets = allPoints.filter((p) => p.bucket < tick);

            const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
            const ghostData = computeMonthlyGhostData(completedBuckets, live, data);

            const expectedDataLength = monthIndex + 2; // anchor + M completed + 1 live
            const expectedGhostLength = 12 - monthIndex; // months M..11 of prev year

            const label = `${MONTH_NAMES[monthIndex]} day ${day}`;
            if (data.length !== expectedDataLength) {
                failures.push(`${label}: data.length=${data.length} expected=${expectedDataLength}`);
            }
            if (ghostData.length !== expectedGhostLength) {
                failures.push(`${label}: ghost.length=${ghostData.length} expected=${expectedGhostLength}`);
            }
            if (data.length + ghostData.length !== 14) {
                failures.push(`${label}: total=${data.length + ghostData.length} expected=14`);
            }
            if (completedMonthCount(data) !== monthIndex) {
                failures.push(`${label}: completed=${completedMonthCount(data)} expected=${monthIndex}`);
            }
        }

        if (failures.length > 0) {
            throw new Error(`Per-month breakdown violated:\n${failures.join('\n')}`);
        }
    });
});

describe('MonthlyChart data invariant: boundary edge cases', () => {
    it('first day of January: data=[anchor,live], ghost=all 12 prev-year months, total=14', () => {
        const allPoints = makeTwoYearsOfData(0, 1);
        const tick = gameTickFor(1, 0, 1); // Jan 1 of game year 1
        const live: LiveData = { tick, price: 11 };
        const completedBuckets = allPoints.filter((p) => p.bucket < tick);

        const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
        const ghostData = computeMonthlyGhostData(completedBuckets, live, data);

        expect(completedMonthCount(data)).toBe(0);
        expect(data.length).toBe(2); // anchor + live
        expect(ghostData.length).toBe(12);
        expect(data.length + ghostData.length).toBe(14);
    });

    it('last day of December: data=[anchor+11completed+live], ghost=[Dec prev year], total=14', () => {
        const allPoints = makeTwoYearsOfData(0, 1);
        const tick = gameTickFor(1, 11, TICKS_PER_MONTH); // Dec 30 of game year 1
        const live: LiveData = { tick, price: 11 };
        const completedBuckets = allPoints.filter((p) => p.bucket < tick);

        const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
        const ghostData = computeMonthlyGhostData(completedBuckets, live, data);

        expect(completedMonthCount(data)).toBe(11); // Jan-Nov
        expect(data.length).toBe(13); // anchor + 11 completed + live
        expect(ghostData.length).toBe(1); // December of prev year
        expect(data.length + ghostData.length).toBe(14);
    });

    it('first day of every month: total is always 14', () => {
        const allPoints = makeTwoYearsOfData(0, 1);
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const tick = gameTickFor(1, monthIndex, 1);
            const live: LiveData = { tick, price: 11 };
            const completedBuckets = allPoints.filter((p) => p.bucket < tick);

            const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
            const ghostData = computeMonthlyGhostData(completedBuckets, live, data);
            const total = data.length + ghostData.length;

            if (total !== 14) {
                failures.push(
                    `${MONTH_NAMES[monthIndex]} day 1: data=${data.length} ghost=${ghostData.length} total=${total}`,
                );
            }
        }

        if (failures.length > 0) {
            throw new Error(failures.join('\n'));
        }
    });

    it('last day of every month: total is always 14', () => {
        const allPoints = makeTwoYearsOfData(0, 1);
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const tick = gameTickFor(1, monthIndex, TICKS_PER_MONTH);
            const live: LiveData = { tick, price: 11 };
            const completedBuckets = allPoints.filter((p) => p.bucket < tick);

            const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
            const ghostData = computeMonthlyGhostData(completedBuckets, live, data);
            const total = data.length + ghostData.length;

            if (total !== 14) {
                failures.push(
                    `${MONTH_NAMES[monthIndex]} day ${TICKS_PER_MONTH}: data=${data.length} ghost=${ghostData.length} total=${total}`,
                );
            }
        }

        if (failures.length > 0) {
            throw new Error(failures.join('\n'));
        }
    });

    /**
     * Ghost data must extend all the way to December (monthIdx=12) at every tick
     * throughout the year. Without this, prior-year December data disappears from
     * the chart whenever the current month advances past a certain point.
     */
    it('ghost data always contains December (monthIdx=12) at every tick of the year', () => {
        const allPoints = makeTwoYearsOfData(0, 1);
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            for (let day = 1; day <= TICKS_PER_MONTH; day += 3) {
                const tick = gameTickFor(1, monthIndex, day);
                const live: LiveData = { tick, price: 11 };
                const completedBuckets = allPoints.filter((p) => p.bucket < tick);

                const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
                const ghostData = computeMonthlyGhostData(completedBuckets, live, data);

                const hasDecember = ghostData.some((p) => p.monthIdx === 12);
                if (!hasDecember) {
                    const { year, monthIndex: mi, day: d } = tickToDate(tick);
                    failures.push(`${MONTH_NAMES[mi]} ${d} Y${year}: ghost data missing monthIdx=12 (December)`);
                }
            }
        }

        if (failures.length > 0) {
            throw new Error(`Ghost December invariant violated:\n${failures.join('\n')}`);
        }
    });

    /**
     * Ghost data must form a contiguous range from the current month to December.
     * If we are in month M (1-based), ghost must contain exactly monthIdx M, M+1, … 12.
     * (The current live month M itself is in ghost because it hasn't completed yet.)
     */
    it('ghost data covers exactly the contiguous range from current month to December', () => {
        const allPoints = makeTwoYearsOfData(0, 1);
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const day = 15; // mid-month to avoid boundary epsilon effects
            const tick = gameTickFor(1, monthIndex, day);
            const live: LiveData = { tick, price: 11 };
            const completedBuckets = allPoints.filter((p) => p.bucket < tick);

            const data = computeMonthlyData(completedBuckets, live, PRODUCT_NAME);
            const ghostData = computeMonthlyGhostData(completedBuckets, live, data);

            const ghostMonthIdxs = ghostData.map((p) => p.monthIdx as number).sort((a, b) => a - b);
            // From mid-month M (monthIndex 0-based → 1-based M = monthIndex+1):
            //   threshold ≈ monthIndex + 0.47
            //   ghost monthIdx > threshold → monthIdx >= monthIndex + 1
            const expectedStart = monthIndex + 1;
            const expectedRange = Array.from({ length: 12 - monthIndex }, (_, i) => expectedStart + i);

            const label = `${MONTH_NAMES[monthIndex]} day ${day}`;
            if (JSON.stringify(ghostMonthIdxs) !== JSON.stringify(expectedRange)) {
                failures.push(`${label}: ghost monthIdxs=[${ghostMonthIdxs}] expected=[${expectedRange}]`);
            }
        }

        if (failures.length > 0) {
            throw new Error(`Ghost range invariant violated:\n${failures.join('\n')}`);
        }
    });
});

/**
 * Simulate the real-world data constraint: the server returns only the most-recent
 * N monthly buckets (limit=13 in the component query).
 *
 * With the corrected tickToDate(bucket) decode (no +1), limit=13 is sufficient:
 * at any month M in year N, the 13 most-recent buckets always include all of
 * the prev-year months needed for ghost data (M..12).
 */
describe('MonthlyChart with server-limited data (limit=13)', () => {
    /** Return only the most-recent `limit` completed buckets before `tick`. */
    function limitedBuckets(allPts: RawPoint[], tick: number, limit: number): RawPoint[] {
        return [...allPts]
            .filter((p) => p.bucket < tick)
            .sort((a, b) => b.bucket - a.bucket)
            .slice(0, limit);
    }

    it('limit=13 gives total=14 at every month throughout year 1', () => {
        const allPoints = makeTwoYearsOfData(0, 1);
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const day = 15;
            const tick = gameTickFor(1, monthIndex, day);
            const live: LiveData = { tick, price: 11, avgPrice: 11, minPrice: 10, maxPrice: 12 };
            const pts = limitedBuckets(allPoints, tick, 13);

            const data = computeMonthlyData(pts, live, PRODUCT_NAME);
            const ghostData = computeMonthlyGhostData(pts, live, data);
            const total = data.length + ghostData.length;

            if (total !== 14) {
                failures.push(
                    `${MONTH_NAMES[monthIndex]} day ${day}: data=${data.length} ghost=${ghostData.length} total=${total} (expected 14) with limit=13`,
                );
            }
        }

        if (failures.length > 0) {
            throw new Error(failures.join('\n'));
        }
    });

    it('limit=13 gives full ghost coverage (monthIdx 1–12) in January', () => {
        const allPoints = makeTwoYearsOfData(0, 1);
        const tick = gameTickFor(1, 0, 15); // mid-January
        const live: LiveData = { tick, price: 11 };
        const pts = limitedBuckets(allPoints, tick, 13);

        const data = computeMonthlyData(pts, live, PRODUCT_NAME);
        const ghostData = computeMonthlyGhostData(pts, live, data);

        const ghostIdxs = ghostData.map((p) => p.monthIdx as number).sort((a, b) => a - b);
        expect(ghostIdxs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it('limit=13 gives complete ghost range at every month (no gaps)', () => {
        const allPoints = makeTwoYearsOfData(0, 1);
        const failures: string[] = [];

        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const day = 15;
            const tick = gameTickFor(1, monthIndex, day);
            const live: LiveData = { tick, price: 11 };
            const pts = limitedBuckets(allPoints, tick, 13);

            const data = computeMonthlyData(pts, live, PRODUCT_NAME);
            const ghostData = computeMonthlyGhostData(pts, live, data);

            const ghostIdxs = ghostData.map((p) => p.monthIdx as number).sort((a, b) => a - b);
            const expectedStart = monthIndex + 1;
            const expectedRange = Array.from({ length: 12 - monthIndex }, (_, i) => expectedStart + i);

            if (JSON.stringify(ghostIdxs) !== JSON.stringify(expectedRange)) {
                failures.push(`${MONTH_NAMES[monthIndex]}: ghost=[${ghostIdxs}] expected=[${expectedRange}]`);
            }
        }

        if (failures.length > 0) {
            throw new Error(`Ghost gaps with limit=13:\n${failures.join('\n')}`);
        }
    });
});
