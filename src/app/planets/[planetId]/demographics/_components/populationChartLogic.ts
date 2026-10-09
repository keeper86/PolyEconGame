import { tickToDate } from '@/components/client/TickDisplay';
import { liveYearX } from '@/lib/chartTime';
import {
    DECADE_WINDOW,
    PREVIOUS_DECEMBER_END_IDX,
    YEAR_WINDOW,
    decadeCentre,
    decadeStart,
    monthEnd,
    yearCentre,
    yearStart,
} from '@/lib/historyChartAxis';
import { TICKS_PER_MONTH } from '@/simulation/constants';

export type PopulationBucketPoint = {
    bucket: number;
    avgPopulation: number;
};

export type PopulationLive = {
    tick: number;
    population: number;
};

export type MonthlyPopulationPoint = {
    tick: number;
    monthIndex: number;
    monthIdx: number;
    value: number;
    isLive: boolean;
};

export type MonthlyPopulationGhostPoint = {
    tick: number;
    monthIndex: number;
    monthIdx: number;
    value: number;
};

function liveMonthPosition(tick: number): { monthIndex: number; monthIdx: number } {
    const { monthIndex, day } = tickToDate(tick);
    return { monthIndex, monthIdx: monthIndex + Math.max(day - 1, 0.001) / TICKS_PER_MONTH };
}

export function computeMonthlyPopulation(
    buckets: PopulationBucketPoint[],
    live: PopulationLive,
): MonthlyPopulationPoint[] {
    const pts = [...buckets].sort((a, b) => a.bucket - b.bucket);
    if (pts.length === 0 && live.tick <= 0) {
        return [];
    }

    const latestYear =
        live.tick > 0 ? tickToDate(live.tick).year : pts.length > 0 ? tickToDate(pts[pts.length - 1].bucket).year : 0;

    const result: MonthlyPopulationPoint[] = pts
        .filter((p) => tickToDate(p.bucket).year === latestYear)
        .map((p) => ({
            tick: p.bucket,
            monthIndex: tickToDate(p.bucket).monthIndex,
            monthIdx: monthEnd(p.bucket),
            value: p.avgPopulation,
            isLive: false,
        }));

    const prevDecPoint = pts.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });
    const anchor = prevDecPoint ?? [...pts].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
    if (anchor) {
        result.unshift({
            tick: anchor.bucket,
            monthIndex: tickToDate(anchor.bucket).monthIndex,
            monthIdx: PREVIOUS_DECEMBER_END_IDX,
            value: anchor.avgPopulation,
            isLive: false,
        });
    }

    if (live.tick > 0 && tickToDate(live.tick).year === latestYear) {
        const { monthIndex, monthIdx } = liveMonthPosition(live.tick);
        result.push({ tick: live.tick, monthIndex, monthIdx, value: live.population, isLive: true });
    }

    return result.sort((a, b) => a.monthIdx - b.monthIdx);
}

export function computeMonthlyPopulationGhost(
    buckets: PopulationBucketPoint[],
    live: PopulationLive,
): MonthlyPopulationGhostPoint[] {
    if (live.tick <= 0) {
        return [];
    }
    const pts = [...buckets].sort((a, b) => a.bucket - b.bucket);
    const liveYear = tickToDate(live.tick).year;
    const { monthIdx: livePosition } = liveMonthPosition(live.tick);

    return pts
        .filter(
            (p) =>
                tickToDate(p.bucket).year === liveYear - 1 && monthEnd(p.bucket) - 1 / TICKS_PER_MONTH > livePosition,
        )
        .map((p) => ({
            tick: p.bucket,
            monthIndex: tickToDate(p.bucket).monthIndex,
            monthIdx: monthEnd(p.bucket),
            value: p.avgPopulation,
        }));
}

export type PopulationAxisPoint = {
    tick: number;
    xPos: number;
    labelYear: number;
    value: number;
};

function liveAxisPoint(live: PopulationLive): PopulationAxisPoint {
    const xPos = liveYearX(live.tick);
    return { tick: live.tick, xPos, labelYear: xPos, value: live.population };
}

export function computeYearlyPopulation(
    buckets: PopulationBucketPoint[],
    live?: PopulationLive,
): PopulationAxisPoint[] {
    const rows = [...buckets]
        .sort((a, b) => a.bucket - b.bucket)
        .slice(-YEAR_WINDOW)
        .map((p) => ({
            tick: p.bucket,
            xPos: yearCentre(p.bucket),
            labelYear: yearStart(p.bucket),
            value: p.avgPopulation,
        }));
    return live && live.tick > 0 ? [...rows, liveAxisPoint(live)] : rows;
}

export function computeDecadePopulation(
    buckets: PopulationBucketPoint[],
    live?: PopulationLive,
): PopulationAxisPoint[] {
    const rows = [...buckets]
        .sort((a, b) => a.bucket - b.bucket)
        .slice(-DECADE_WINDOW)
        .map((p) => ({
            tick: p.bucket,
            xPos: decadeCentre(p.bucket),
            labelYear: decadeStart(p.bucket),
            value: p.avgPopulation,
        }));
    return live && live.tick > 0 ? [...rows, liveAxisPoint(live)] : rows;
}
