'use client';

import { format } from 'date-fns';
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

export const mapTickToDate = (tick: number, short = false): string => {
    const { year, monthIndex, day } = tickToDate(tick);

    const date = new Date(year, monthIndex, day);
    return format(date, short ? 'dd. MMM yyyy' : 'dd. MMMM yyyy');
};

export default function TickDisplay() {
    const tick = useSimulationTick();
    const smallScreen = useIsSmallScreen();

    return (
        <div
            className={`text-sm text-muted-foreground ${smallScreen ? 'w-[90px]' : 'w-[140px]'}  text-right tabular-nums`}
        >
            {tick > 0 ? mapTickToDate(tick, smallScreen) : '—'}
        </div>
    );
}
