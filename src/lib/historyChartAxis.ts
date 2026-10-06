import { tickToDate } from '@/components/client/TickDisplay';
import { type Locale } from '@/i18n/config';
import { START_YEAR, TICKS_PER_MONTH } from '@/simulation/constants';
import de from '../i18n/messages/de.json';
import en from '../i18n/messages/en.json';

const catalogs = { en, de } as const;

const MONTH_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
    en: new Intl.DateTimeFormat('en', { month: 'short' }),
    de: new Intl.DateTimeFormat('de', { month: 'short' }),
};

export const monthShortName = (locale: Locale, monthIndex: number): string =>
    MONTH_FORMATTERS[locale].format(new Date(Date.UTC(2000, monthIndex, 1)));

export const MONTHS_PER_YEAR = 12;
export const YEAR_WINDOW = 11;
export const DECADE_WINDOW = 50;
export const DECADE_YEARS = 10;
export const PREVIOUS_DECEMBER_IDX = -0.5;
export const PREVIOUS_DECEMBER_END_IDX = 0;
export const MONTHLY_TICKS = Array.from({ length: MONTHS_PER_YEAR }, (_, i) => i + 0.5);
export const MONTHLY_GRID_VALUES = Array.from({ length: MONTHS_PER_YEAR + 1 }, (_, i) => i);
export const HISTORY_BUCKET_LIMIT = {
    monthly: MONTHS_PER_YEAR + 1,
    yearly: YEAR_WINDOW,
    decade: DECADE_WINDOW,
} as const;

export type HistoryAxis = {
    domain: [number, number];
    ticks: number[];
    tickFormatter: (value: number) => string;
    gridValues: number[];
};

export function monthCentre(bucket: number): number {
    return tickToDate(bucket).monthIndex + 0.5;
}

export function monthEnd(bucket: number): number {
    return tickToDate(bucket).monthIndex + 1;
}

export function ghostMonthVisible(bucket: number, livePosition: number): boolean {
    return monthCentre(bucket) - 1 / TICKS_PER_MONTH > livePosition;
}

export function isLiveMonthPoint(monthIdx?: number): boolean {
    return monthIdx !== undefined && monthIdx > PREVIOUS_DECEMBER_IDX && monthIdx % 1 !== 0.5;
}

export function bucketProgress(tick: number, granularity: 'monthly' | 'yearly' | 'decade'): number {
    const { year, monthIndex, day } = tickToDate(tick);
    const monthFrac = monthIndex + Math.max(day, 0) / TICKS_PER_MONTH;
    if (granularity === 'monthly') {
        return Math.min(1, Math.max(day, 0) / TICKS_PER_MONTH);
    }
    if (granularity === 'yearly') {
        return monthFrac / MONTHS_PER_YEAR;
    }
    const decadeStartYear = Math.floor(year / DECADE_YEARS) * DECADE_YEARS;
    return (year - decadeStartYear + monthFrac / MONTHS_PER_YEAR) / DECADE_YEARS;
}

export function blendLive(previous: number | undefined, live: number, progress: number): number {
    if (previous === undefined) {
        return live;
    }
    const weight = Math.min(1, Math.max(0, progress));
    return previous * (1 - weight) + live * weight;
}

export function extrapolateLive(previous: number | undefined, live: number, progress: number): number {
    if (previous === undefined) {
        return live;
    }
    const weight = Math.min(1, Math.max(0, progress));
    return previous * (1 - weight) + live;
}

export function monthsIntoBucket(tick: number, granularity: 'yearly' | 'decade'): number {
    const { year, monthIndex, day } = tickToDate(tick);
    const monthsBeforeBucket =
        granularity === 'decade' ? (year - Math.floor(year / DECADE_YEARS) * DECADE_YEARS) * MONTHS_PER_YEAR : 0;
    return monthsBeforeBucket + monthIndex + Math.min(1, Math.max(day, 0) / TICKS_PER_MONTH);
}

export function bucketAverageToDate(
    previous: number | undefined,
    liveMonthToDate: number,
    tick: number,
    granularity: 'yearly' | 'decade',
): number {
    const monthProgress = Math.min(1, Math.max(tickToDate(tick).day, 0) / TICKS_PER_MONTH);
    const elapsed = monthsIntoBucket(tick, granularity);
    if (previous === undefined) {
        return monthProgress > 0 ? liveMonthToDate / monthProgress : liveMonthToDate;
    }
    if (elapsed <= 0) {
        return previous;
    }
    return ((elapsed - monthProgress) * previous + liveMonthToDate) / elapsed;
}

export function yearCentre(bucket: number): number {
    return tickToDate(bucket).year + 0.5;
}

export function yearStart(bucket: number): number {
    return tickToDate(bucket).year;
}

export function yearEnd(bucket: number): number {
    return yearStart(bucket) + 1;
}

export function decadeCentre(bucket: number): number {
    return decadeStart(bucket) + DECADE_YEARS / 2;
}

export function decadeStart(bucket: number): number {
    return Math.floor(tickToDate(bucket).year / DECADE_YEARS) * DECADE_YEARS;
}

export function decadeEnd(bucket: number): number {
    return decadeStart(bucket) + DECADE_YEARS;
}

export function monthAxis(locale: Locale): HistoryAxis {
    return {
        domain: [0, MONTHS_PER_YEAR],
        ticks: MONTHLY_TICKS,
        tickFormatter: (value) => monthShortName(locale, Math.floor(value)),
        gridValues: MONTHLY_GRID_VALUES,
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
    const windowEnd = firstDecade + DECADE_WINDOW * DECADE_YEARS;
    const dataEnd =
        extendTo === undefined ? firstDecade + DECADE_YEARS : Math.ceil(extendTo / DECADE_YEARS) * DECADE_YEARS;
    const last = Math.min(windowEnd, Math.max(firstDecade + DECADE_YEARS, dataEnd));
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

export function formatYearLabel(locale: Locale, value: number): string {
    return catalogs[locale].Charts.year.replace('{year}', String(Math.floor(value)));
}

export function formatDecadeLabel(locale: Locale, value: number): string {
    const decade = Math.floor(value / DECADE_YEARS) * DECADE_YEARS;
    return catalogs[locale].Charts.decade.replace('{decade}', String(decade));
}

export function formatMonthLabel(locale: Locale, monthIdx: number, year: number): string {
    if (monthIdx === PREVIOUS_DECEMBER_IDX) {
        return catalogs[locale].Charts.previousDecember;
    }
    return `${monthShortName(locale, Math.floor(monthIdx))} ${year}`;
}
