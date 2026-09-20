import { tickToDate } from '@/components/client/TickDisplay';
import { monthAxis, monthCentre } from '@/lib/historyChartAxis';
import { TICKS_PER_MONTH } from '@/simulation/constants';

export type { Granularity } from '@/components/client/GranularityButtonGroup';
export { MONTH_NAMES, formatDecadeLabel, formatYearLabel } from '@/lib/historyChartAxis';
export { decadeCentre as bucketDecadeMid, yearCentre as bucketYearMid } from '@/lib/historyChartAxis';

const MONTHLY_AXIS = monthAxis();

export const MONTHLY_X_TICKS = MONTHLY_AXIS.ticks;
export const MONTHLY_GRID_VALUES = MONTHLY_AXIS.gridValues;

export function raiseWagesMonotone(wages: number[]): number[] {
    const raised = [...wages];
    for (let i = 0; i < raised.length - 1; i++) {
        if (raised[i] > raised[i + 1]) {
            raised[i + 1] = raised[i];
        }
    }
    return raised;
}

function liveMonthIndex(tick: number): { monthIdx: number; year: number } {
    const { year, monthIndex, day } = tickToDate(tick);
    const dayFraction = Math.max(day - 1, 0.001) / TICKS_PER_MONTH;
    return { monthIdx: monthIndex + dayFraction, year };
}

export type EconomyPoint = {
    bucket: number;
    avgGdp: number;
    avgBankEquity: number;
    avgMoneySupply: number;
};

export type MacroLive = {
    tick: number;
    gdp: number;
    bankEquity: number;
    moneySupply: number;
};

export type MacroChartPoint = {
    monthIdx?: number;
    year: number;
    xVal?: number;
    gdp: number | null;
    bankEquity: number | null;
    moneySupply: number | null;
    ghostGdp: number | null;
    ghostBankEquity: number | null;
    ghostMoneySupply: number | null;
};

function toMacroPoint(e: EconomyPoint, idx: number, ghost: boolean): MacroChartPoint {
    return {
        monthIdx: idx,
        year: tickToDate(e.bucket).year,
        gdp: ghost ? null : e.avgGdp,
        bankEquity: ghost ? null : e.avgBankEquity,
        moneySupply: ghost ? null : e.avgMoneySupply,
        ghostGdp: ghost ? e.avgGdp : null,
        ghostBankEquity: ghost ? e.avgBankEquity : null,
        ghostMoneySupply: ghost ? e.avgMoneySupply : null,
    };
}

export function computeMacroMonthlyData(
    data: EconomyPoint[],
    currentTick: number,
    live?: MacroLive,
): MacroChartPoint[] {
    if (data.length === 0 || currentTick === 0) {
        return [];
    }
    const sorted = [...data].sort((a, b) => a.bucket - b.bucket);
    const latestYear = tickToDate(currentTick).year;

    const current: MacroChartPoint[] = [];
    for (const p of sorted) {
        if (tickToDate(p.bucket).year === latestYear) {
            current.push(toMacroPoint(p, monthCentre(p.bucket), false));
        }
    }

    const prevDecPoint = sorted.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });
    if (prevDecPoint) {
        current.unshift(toMacroPoint(prevDecPoint, 0, false));
    } else {
        const lastBefore = [...sorted].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBefore) {
            current.unshift(toMacroPoint(lastBefore, 0, false));
        }
    }

    const { monthIndex: currentMonthIndex, day: currentDay } = tickToDate(currentTick);
    const currentMonthIdx = currentMonthIndex + Math.max(currentDay - 1, 0.001) / TICKS_PER_MONTH;
    const ghostPoints = sorted
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            return year === latestYear - 1 && monthIndex + 0.5 > currentMonthIdx;
        })
        .map((p) => toMacroPoint(p, monthCentre(p.bucket), true));

    const merged = [...current, ...ghostPoints];

    if (live && live.tick > 0) {
        const { monthIdx, year } = liveMonthIndex(live.tick);
        merged.push({
            monthIdx,
            year,
            gdp: live.gdp,
            bankEquity: live.bankEquity,
            moneySupply: live.moneySupply,
            ghostGdp: null,
            ghostBankEquity: null,
            ghostMoneySupply: null,
        });
    }

    return merged.sort((a, b) => (a.monthIdx ?? 0) - (b.monthIdx ?? 0));
}

export type CostOfLivingPoint = {
    bucket: number;
    avgCostOfLiving: number;
    avgCostOfLivingRich: number;
    avgWageEdu0: number;
    avgWageEdu1: number;
    avgWageEdu2: number;
    avgWageEdu3: number;
};

export type CostOfLivingLive = {
    tick: number;
    costOfLiving: number;
    costOfLivingRich: number;
    wageEdu0: number;
    wageEdu1: number;
    wageEdu2: number;
    wageEdu3: number;
};

export type CostOfLivingChartPoint = {
    monthIdx?: number;
    year: number;
    xVal?: number;
    costOfLiving: number | null;
    costOfLivingRich: number | null;
    costOfLivingRichDiff: number | null;
    wageEdu0: number | null;
    wageEdu1: number | null;
    wageEdu2: number | null;
    wageEdu3: number | null;
    ghostCostOfLiving?: number | null;
    ghostCostOfLivingRich?: number | null;
    ghostCostOfLivingRichDiff?: number | null;
    ghostWageEdu0?: number | null;
    ghostWageEdu1?: number | null;
    ghostWageEdu2?: number | null;
    ghostWageEdu3?: number | null;
};

function toCostOfLivingPoint(p: CostOfLivingPoint, idx: number, ghost: boolean): CostOfLivingChartPoint {
    const [w0r, w1r, w2r, w3r] = raiseWagesMonotone([p.avgWageEdu0, p.avgWageEdu1, p.avgWageEdu2, p.avgWageEdu3]);
    const diff = p.avgCostOfLivingRich - p.avgCostOfLiving;
    return {
        monthIdx: idx,
        year: tickToDate(p.bucket).year,
        costOfLiving: ghost ? null : p.avgCostOfLiving,
        costOfLivingRich: ghost ? null : p.avgCostOfLivingRich,
        costOfLivingRichDiff: ghost ? null : diff,
        wageEdu0: ghost ? null : w0r,
        wageEdu1: ghost ? null : w1r,
        wageEdu2: ghost ? null : w2r,
        wageEdu3: ghost ? null : w3r,
        ghostCostOfLiving: ghost ? p.avgCostOfLiving : null,
        ghostCostOfLivingRich: ghost ? p.avgCostOfLivingRich : null,
        ghostCostOfLivingRichDiff: ghost ? diff : null,
        ghostWageEdu0: ghost ? w0r : null,
        ghostWageEdu1: ghost ? w1r : null,
        ghostWageEdu2: ghost ? w2r : null,
        ghostWageEdu3: ghost ? w3r : null,
    };
}

export function computeCostOfLivingMonthlyData(
    data: CostOfLivingPoint[],
    currentTick: number,
    live?: CostOfLivingLive,
): CostOfLivingChartPoint[] {
    if (data.length === 0 || currentTick === 0) {
        return [];
    }
    const sorted = [...data].sort((a, b) => a.bucket - b.bucket);
    const latestYear = tickToDate(currentTick).year;

    const current: CostOfLivingChartPoint[] = [];
    for (const p of sorted) {
        if (tickToDate(p.bucket).year === latestYear) {
            current.push(toCostOfLivingPoint(p, monthCentre(p.bucket), false));
        }
    }

    const prevDecPoint = sorted.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });
    if (prevDecPoint) {
        current.unshift(toCostOfLivingPoint(prevDecPoint, 0, false));
    } else {
        const lastBefore = [...sorted].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBefore) {
            current.unshift(toCostOfLivingPoint(lastBefore, 0, false));
        }
    }

    const { monthIndex: currentMonthIndex, day: currentDay } = tickToDate(currentTick);
    const currentMonthIdx = currentMonthIndex + Math.max(currentDay - 1, 0.001) / TICKS_PER_MONTH;
    const ghostPoints = sorted
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            return year === latestYear - 1 && monthIndex + 0.5 > currentMonthIdx;
        })
        .map((p) => toCostOfLivingPoint(p, monthCentre(p.bucket), true));

    const currentByMonth = new Map(current.map((p) => [p.monthIdx!, p]));
    const ghostByMonth = new Map(ghostPoints.map((p) => [p.monthIdx!, p]));
    const allIdxs = new Set([...currentByMonth.keys(), ...ghostByMonth.keys()]);
    const merged = [...allIdxs]
        .sort((a, b) => a - b)
        .map((monthIdx) => currentByMonth.get(monthIdx) ?? ghostByMonth.get(monthIdx)!);

    if (live && live.tick > 0) {
        const { monthIdx, year } = liveMonthIndex(live.tick);
        const [w0, w1, w2, w3] = raiseWagesMonotone([live.wageEdu0, live.wageEdu1, live.wageEdu2, live.wageEdu3]);
        merged.push({
            monthIdx,
            year,
            costOfLiving: live.costOfLiving,
            costOfLivingRich: live.costOfLivingRich,
            costOfLivingRichDiff: live.costOfLivingRich - live.costOfLiving,
            wageEdu0: w0,
            wageEdu1: w1,
            wageEdu2: w2,
            wageEdu3: w3,
        });
    }

    return merged.sort((a, b) => (a.monthIdx ?? 0) - (b.monthIdx ?? 0));
}
