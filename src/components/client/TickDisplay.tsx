'use client';

import { useTRPC } from '@/lib/trpc';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';

/** Client wrapper that fetches the current tick from the simulation and displays it. */
export default function TickDisplay() {
    const trpc = useTRPC();
    const { data } = useSimulationQuery(trpc.simulation.getCurrentTick.queryOptions());
    const tick = data?.tick ?? 0;

    const mapTickToDate = (tick: number): string => {
        const year = Math.floor(tick / TICKS_PER_YEAR) + 2200;
        const monthsIntoYear = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_MONTH);
        const daysIntoMonth = tick % TICKS_PER_MONTH;

        // day is 1-based; pad single-digit days with a leading zero to avoid layout shifts
        const day = daysIntoMonth + 1;
        const dayDisplay = day.toString().padStart(2, '0');

        const startUnixTime = new Date(year, monthsIntoYear, daysIntoMonth);
        const monthName = startUnixTime.toLocaleDateString('en-US', {
            month: 'long',
        });
        return `${dayDisplay}. ${monthName} ${year}`;
    };

    return <div>{tick > 0 ? mapTickToDate(tick) : '—'}</div>;
}
