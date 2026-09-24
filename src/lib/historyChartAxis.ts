import { tickToDate } from '@/components/client/TickDisplay';
import { START_YEAR, TICKS_PER_MONTH } from '@/simulation/constants';

export const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const;

export const MONTHS_PER_YEAR = 12;
export const YEAR_WINDOW = 11;
export const DECADE_WINDOW = 50;
export const DECADE_YEARS = 10;
export const PREVIOUS_DECEMBER_IDX = 0;

export type HistoryAxis = {
    domain: [number, number];
    ticks: number[];
    tickFormatter: (value: number) => string;
    gridValues: number[];
};

export function monthCentre(bucket: number): number {
    return tickToDate(bucket).monthIndex + 0.5;
}

export function ghostMonthVisible(bucket: number, livePosition: number): boolean {
    return monthCentre(bucket) - 1 / TICKS_PER_MONTH > livePosition;
}

export function isLiveMonthPoint(monthIdx?: number): boolean {
    return monthIdx !== undefined && monthIdx > PREVIOUS_DECEMBER_IDX && monthIdx % 1 !== 0.5;
}

export function yearCentre(bucket: number): number {
    return tickToDate(bucket).year + 0.5;
}

export function yearStart(bucket: number): number {
    return tickToDate(bucket).year;
}

export function decadeCentre(bucket: number): number {
    return decadeStart(bucket) + DECADE_YEARS / 2;
}

export function decadeStart(bucket: number): number {
    return Math.floor(tickToDate(bucket).year / DECADE_YEARS) * DECADE_YEARS;
}

export function monthAxis(): HistoryAxis {
    return {
        domain: [0, MONTHS_PER_YEAR],
        ticks: Array.from({ length: MONTHS_PER_YEAR }, (_, i) => i + 0.5),
        tickFormatter: (value) => MONTH_NAMES[Math.floor(value)] ?? '',
        gridValues: Array.from({ length: MONTHS_PER_YEAR + 1 }, (_, i) => i),
    };
}

export function yearAxis(firstYear: number, extendTo?: number): HistoryAxis {
    const last = Math.max(firstYear + YEAR_WINDOW, ...(extendTo === undefined ? [] : [Math.ceil(extendTo)]));
    const span = last - firstYear;
    return {
        domain: [firstYear, last],
        ticks: Array.from({ length: span }, (_, i) => firstYear + i + 0.5),
        tickFormatter: (value) => String(Math.floor(value)),
        gridValues: Array.from({ length: span + 1 }, (_, i) => firstYear + i),
    };
}

export function yearWindowAxis(firstYear: number | undefined, endYear: number | undefined): HistoryAxis {
    if (firstYear !== undefined) {
        return yearAxis(firstYear, endYear);
    }
    const start = endYear === undefined ? START_YEAR : Math.max(START_YEAR, Math.ceil(endYear) - YEAR_WINDOW);
    return yearAxis(start, endYear);
}

export function decadeAxis(firstDecade: number, extendTo?: number): HistoryAxis {
    const last = Math.max(
        firstDecade + DECADE_WINDOW * DECADE_YEARS,
        ...(extendTo === undefined ? [] : [Math.ceil(extendTo / DECADE_YEARS) * DECADE_YEARS]),
    );
    const span = (last - firstDecade) / DECADE_YEARS;
    return {
        domain: [firstDecade, last],
        ticks: Array.from({ length: span }, (_, i) => firstDecade + i * DECADE_YEARS + DECADE_YEARS / 2),
        tickFormatter: (value) => `${Math.floor(value / DECADE_YEARS) * DECADE_YEARS}s`,
        gridValues: Array.from({ length: span + 1 }, (_, i) => firstDecade + i * DECADE_YEARS),
    };
}

export function decadeWindowAxis(firstDecade: number | undefined, endYear: number | undefined): HistoryAxis {
    if (firstDecade !== undefined) {
        return decadeAxis(firstDecade, endYear);
    }
    const span = DECADE_WINDOW * DECADE_YEARS;
    const start =
        endYear === undefined
            ? START_YEAR
            : Math.max(START_YEAR, Math.ceil(endYear / DECADE_YEARS) * DECADE_YEARS - span);
    return decadeAxis(start, endYear);
}

export function formatYearLabel(value: number): string {
    return `Year ${Math.floor(value)}`;
}

export function formatDecadeLabel(value: number): string {
    return `${Math.floor(value / DECADE_YEARS) * DECADE_YEARS}s`;
}

export function formatMonthLabel(monthIdx: number, year: number): string {
    if (monthIdx === PREVIOUS_DECEMBER_IDX) {
        return 'Previous December';
    }
    return `${MONTH_NAMES[Math.floor(monthIdx)] ?? ''} ${year}`;
}
