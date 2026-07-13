import { tickToDate } from '@/components/client/TickDisplay';
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
            const { monthIndex } = tickToDate(p.bucket);
            return {
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                monthIdx: monthIndex + 1,
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
            monthIdx: 0,
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
                monthIdx: 0,
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
                monthIdx: 0,
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
            const liveAvg = live.avgPrice ?? live.price;
            const liveMin = live.minPrice ?? live.price;
            const liveMax = live.maxPrice ?? live.price;
            const livePriceFloor = live.priceFloor ?? live.price;

            const BLEND_TICKS = 10;
            const tickInMonth = liveDay;
            const prevPoint = result.length > 0 ? result[result.length - 1] : null;
            let blendedAvg = liveAvg;
            let blendedMin = liveMin;
            let blendedMax = liveMax;
            let blendedPriceFloor = livePriceFloor;
            if (prevPoint && tickInMonth < BLEND_TICKS && tickInMonth > 0) {
                const newWeight = tickInMonth / BLEND_TICKS;
                const oldWeight = 1 - newWeight;
                blendedAvg = oldWeight * prevPoint.avgPrice + newWeight * liveAvg;
                blendedMin = oldWeight * prevPoint.minPrice + newWeight * liveMin;
                blendedMax = oldWeight * prevPoint.maxPrice + newWeight * liveMax;
                blendedPriceFloor = oldWeight * prevPoint.priceFloor + newWeight * livePriceFloor;
            }

            result.push({
                tick: live.tick,
                year: live.tick / TICKS_PER_YEAR,
                monthIdx: fractionalMonthIdx,
                avgPrice: blendedAvg,
                minPrice: blendedMin,
                maxPrice: blendedMax,
                priceFloor: blendedPriceFloor,
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
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);

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
                priceFloor: p.priceFloor,
            };
        });
}