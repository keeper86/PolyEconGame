'use client';

import { useLocale } from 'next-intl';
import { defaultLocale, type Locale } from '@/i18n/config';
import { useSimulationTick } from '@/hooks/useSimulationQuery';
import { START_YEAR, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import { useIsSmallScreen } from '@/hooks/useMobile';

export const tickToDate = (tick: number): { year: number; monthIndex: number; day: number } => {
    const simTick = tick - 1;

    const year = Math.floor(simTick / TICKS_PER_YEAR) + START_YEAR;
    const tickWithinYear = simTick % TICKS_PER_YEAR;
    const monthIndex = Math.floor(tickWithinYear / TICKS_PER_MONTH);
    const day = (tickWithinYear % TICKS_PER_MONTH) + 1;

    return { year, monthIndex, day };
};

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

const dateFormatter = (locale: Locale, short: boolean): Intl.DateTimeFormat => {
    const key = `${locale}:${short ? 'short' : 'long'}`;
    let formatter = dateFormatterCache.get(key);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: short ? 'short' : 'long',
            day: 'numeric',
            timeZone: 'UTC',
        });
        dateFormatterCache.set(key, formatter);
    }
    return formatter;
};

export const mapTickToDate = (tick: number, short = false, locale: Locale = defaultLocale): string => {
    const { year, monthIndex, day } = tickToDate(tick);

    const date = new Date(Date.UTC(year, monthIndex, day));
    if (Number.isNaN(date.getTime())) {
        return '—';
    }
    return dateFormatter(locale, short).format(date);
};

export default function TickDisplay() {
    const tick = useSimulationTick();
    const smallScreen = useIsSmallScreen();
    const locale = useLocale();

    return (
        <div
            className={`text-sm text-muted-foreground ${smallScreen ? 'w-[90px]' : 'w-[140px]'}  text-right tabular-nums`}
        >
            {tick > 0 ? mapTickToDate(tick, smallScreen, locale) : '—'}
        </div>
    );
}
