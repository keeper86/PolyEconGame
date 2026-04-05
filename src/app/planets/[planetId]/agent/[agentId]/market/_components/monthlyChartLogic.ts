/**
 * Pure logic extracted from MonthlyChart useMemo hooks.
 *
 * Each monthly bucket value represents the LAST game-tick of that month.
 * decode it with tickToDate(bucket) — NOT tickToDate(bucket + 1) — so that:
 *   - January bucket  → { year: N, monthIndex: 0  } → monthIdx 1
 *   - December bucket → { year: N, monthIndex: 11 } → monthIdx 12
 *
 * monthIdx is 1-indexed throughout (0 = anchor / previous-December).
 */

import { tickToDate } from '@/components/client/TickDisplay';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';

export type RawPoint = { bucket: number; avgPrice: number; minPrice: number; maxPrice: number };

export type ChartPoint = {
    tick: number;
    year: number;
    monthIdx?: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
};

export type LiveData = {
    tick: number;
    price: number;
    avgPrice?: number;
    minPrice?: number;
    maxPrice?: number;
};

/**
 * Build the current-year series for the monthly chart.
 *
 * Returns an array of ChartPoints that always starts with an anchor point
 * (monthIdx=0, previous December) followed by the completed months of the
 * current year (monthIdx 1..M-1) and a live point at the fractional position.
 *
 * @param allPts  All historical monthly buckets (unsorted, any scope).
 * @param live    Current live tick data.
 * @param productName  Product name used only for the initial-price fallback.
 */
export function computeMonthlyData(allPts: RawPoint[], live: LiveData, productName: string): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);

    const latestYear = live
        ? tickToDate(live.tick).year
        : pts.length > 0
          ? tickToDate(pts[pts.length - 1].bucket).year
          : 0;

    const result: ChartPoint[] = pts
        .filter((p) => tickToDate(p.bucket).year === latestYear)
        .map((p) => {
            const { monthIndex } = tickToDate(p.bucket);
            return {
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                monthIdx: monthIndex + 1,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
            };
        });

    // ── Anchor at monthIdx=0 (previous December or nearest predecessor) ──────
    const prevDecPoint = pts.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });

    if (prevDecPoint) {
        result.unshift({
            tick: prevDecPoint.bucket,
            year: prevDecPoint.bucket / TICKS_PER_YEAR,
            monthIdx: 0,
            avgPrice: prevDecPoint.avgPrice,
            minPrice: prevDecPoint.minPrice,
            maxPrice: prevDecPoint.maxPrice,
        });
    } else {
        const lastBeforeCurrentYear = [...pts].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBeforeCurrentYear) {
            result.unshift({
                tick: lastBeforeCurrentYear.bucket,
                year: lastBeforeCurrentYear.bucket / TICKS_PER_YEAR,
                monthIdx: 0,
                avgPrice: lastBeforeCurrentYear.avgPrice,
                minPrice: lastBeforeCurrentYear.minPrice,
                maxPrice: lastBeforeCurrentYear.maxPrice,
            });
        } else {
            // Truly first year of simulation with no prior data at all.
            const fallbackPrice = initialMarketPrices[productName] ?? 1;
            result.unshift({
                tick: 0,
                year: latestYear - 1,
                monthIdx: 0,
                avgPrice: fallbackPrice,
                minPrice: fallbackPrice,
                maxPrice: fallbackPrice,
            });
        }
    }

    // ── Live (fractional) point ───────────────────────────────────────────────
    if (live) {
        const { year: liveYear, monthIndex: liveMonthIdx, day: liveDay } = tickToDate(live.tick);
        if (liveYear === latestYear) {
            // On day 1, (liveDay-1)/TICKS_PER_MONTH === 0 exactly, which collides with either the
            // anchor (January) or the just-completed month (all other months).  Use a tiny epsilon
            // so the live point always lands strictly after the preceding integer position.
            const dayFraction = Math.max(liveDay - 1, 0.001) / TICKS_PER_MONTH;
            const fractionalMonthIdx = liveMonthIdx + dayFraction;
            const liveAvg = live.avgPrice ?? live.price;
            const liveMin = live.minPrice ?? live.price;
            const liveMax = live.maxPrice ?? live.price;

            // Blend with the last completed month for the first BLEND_TICKS ticks to smooth
            // the hard transition when avg/min/max reset at month start.
            const BLEND_TICKS = 10;
            const tickInMonth = liveDay;
            const prevPoint = result.length > 0 ? result[result.length - 1] : null;
            let blendedAvg = liveAvg;
            let blendedMin = liveMin;
            let blendedMax = liveMax;
            if (prevPoint && tickInMonth < BLEND_TICKS && tickInMonth > 0) {
                const newWeight = tickInMonth / BLEND_TICKS;
                const oldWeight = 1 - newWeight;
                blendedAvg = oldWeight * prevPoint.avgPrice + newWeight * liveAvg;
                blendedMin = oldWeight * prevPoint.minPrice + newWeight * liveMin;
                blendedMax = oldWeight * prevPoint.maxPrice + newWeight * liveMax;
            }

            result.push({
                tick: live.tick,
                year: live.tick / TICKS_PER_YEAR,
                monthIdx: fractionalMonthIdx,
                avgPrice: blendedAvg,
                minPrice: blendedMin,
                maxPrice: blendedMax,
            });
        }
    }

    return result;
}

/**
 * Build the ghost (previous-year) series for the monthly chart.
 *
 * Returns the months from the previous year whose monthIdx is strictly greater
 * than the current live fractional position — i.e. months not yet reached in
 * the current year. Together with the non-anchor points in computeMonthlyData
 * they should always sum to exactly 13 (12 monthly markers + 1 live point).
 *
 * @param allPts  All historical monthly buckets (same set as computeMonthlyData).
 * @param live    Current live tick data.
 * @param data    The output of computeMonthlyData (used for fallback latestYear).
 */
export function computeMonthlyGhostData(allPts: RawPoint[], live: LiveData, data: ChartPoint[]): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);

    const { monthIndex: liveMi, day: liveDay } = tickToDate(live.tick);
    const fractionalThreshold = live
        ? liveMi + Math.max(liveDay - 1, 0.001) / TICKS_PER_MONTH
        : data.length > 0
          ? (data[data.length - 1].monthIdx ?? -1)
          : -1;

    const latestYear = live
        ? tickToDate(live.tick).year
        : data.length > 0
          ? tickToDate(data[data.length - 1].tick).year
          : 0;

    return pts
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            // Only include months that are strictly after the current fractional position so
            // the ghost line never overlaps or goes backward relative to current-year data.
            return year === latestYear - 1 && monthIndex + 1 > fractionalThreshold;
        })
        .map((p) => {
            const { monthIndex } = tickToDate(p.bucket);
            return {
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                monthIdx: monthIndex + 1,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
            };
        });
}
