import { START_YEAR, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';

const MONTHS_PER_YEAR = TICKS_PER_YEAR / TICKS_PER_MONTH;

export function liveYearX(tick: number): number {
    const simTick = tick - 1;
    const year = Math.floor(simTick / TICKS_PER_YEAR) + START_YEAR;
    const withinYear = simTick % TICKS_PER_YEAR;
    const monthIndex = Math.floor(withinYear / TICKS_PER_MONTH);
    const dayFraction = (withinYear % TICKS_PER_MONTH) / TICKS_PER_MONTH;
    return year + (monthIndex + dayFraction) / MONTHS_PER_YEAR;
}
