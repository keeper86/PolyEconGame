import { tickToDate } from '@/components/client/TickDisplay';
import {
    PREVIOUS_DECEMBER_IDX,
    blendLive,
    bucketProgress,
    ghostMonthVisible,
    monthCentre,
} from '@/lib/historyChartAxis';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';

export type RawPoint = { bucket: number; avgPrice: number; minPrice: number; maxPrice: number; priceFloor: number };

export type ChartPoint = {
    tick: number;
    year: number;
    monthIdx?: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    priceFloor: number;
};

export type LiveData = {
    tick: number;
    price: number;
    avgPrice?: number;
    minPrice?: number;
    maxPrice?: number;
    priceFloor?: number;
};

export function computeMonthlyData(allPts: RawPoint[], live: LiveData, productName: string): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);

    if (pts.length === 0 && live.tick === 0) {
        return [];
    }

    const latestYear = live
        ? tickToDate(live.tick).year
        : pts.length > 0
          ? tickToDate(pts[pts.length - 1].bucket).year
          : 0;

    const result: ChartPoint[] = pts
        .filter((p) => tickToDate(p.bucket).year === latestYear)
        .map((p) => {
            return {
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                monthIdx: monthCentre(p.bucket),
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
                priceFloor: p.priceFloor,
            };
        });

    const prevDecPoint = pts.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });

    if (prevDecPoint) {
        result.unshift({
            tick: prevDecPoint.bucket,
            year: prevDecPoint.bucket / TICKS_PER_YEAR,
            monthIdx: PREVIOUS_DECEMBER_IDX,
            avgPrice: prevDecPoint.avgPrice,
            minPrice: prevDecPoint.minPrice,
            maxPrice: prevDecPoint.maxPrice,
            priceFloor: prevDecPoint.priceFloor,
        });
    } else {
        const lastBeforeCurrentYear = [...pts].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBeforeCurrentYear) {
            result.unshift({
                tick: lastBeforeCurrentYear.bucket,
                year: lastBeforeCurrentYear.bucket / TICKS_PER_YEAR,
                monthIdx: PREVIOUS_DECEMBER_IDX,
                avgPrice: lastBeforeCurrentYear.avgPrice,
                minPrice: lastBeforeCurrentYear.minPrice,
                maxPrice: lastBeforeCurrentYear.maxPrice,
                priceFloor: lastBeforeCurrentYear.priceFloor,
            });
        } else {
            const fallbackPrice = initialMarketPrices[productName] ?? 1;
            result.unshift({
                tick: 0,
                year: latestYear - 1,
                monthIdx: PREVIOUS_DECEMBER_IDX,
                avgPrice: fallbackPrice,
                minPrice: fallbackPrice,
                maxPrice: fallbackPrice,
                priceFloor: fallbackPrice,
            });
        }
    }

    if (live) {
        const { year: liveYear, monthIndex: liveMonthIdx, day: liveDay } = tickToDate(live.tick);
        if (liveYear === latestYear) {
            const dayFraction = Math.max(liveDay - 1, 0.001) / TICKS_PER_MONTH;
            const fractionalMonthIdx = liveMonthIdx + dayFraction;
            const prevPoint = result.length > 0 ? result[result.length - 1] : undefined;
            const progress = bucketProgress(live.tick, 'monthly');

            result.push({
                tick: live.tick,
                year: live.tick / TICKS_PER_YEAR,
                monthIdx: fractionalMonthIdx,
                avgPrice: blendLive(prevPoint?.avgPrice, live.avgPrice ?? live.price, progress),
                minPrice: blendLive(prevPoint?.minPrice, live.minPrice ?? live.price, progress),
                maxPrice: blendLive(prevPoint?.maxPrice, live.maxPrice ?? live.price, progress),
                priceFloor: blendLive(prevPoint?.priceFloor, live.priceFloor ?? live.price, progress),
            });
        }
    }

    return result;
}

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
        .filter((p) => tickToDate(p.bucket).year === latestYear - 1 && ghostMonthVisible(p.bucket, fractionalThreshold))
        .map((p) => {
            return {
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                monthIdx: monthCentre(p.bucket),
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
                priceFloor: p.priceFloor,
            };
        });
}
