'use client';

import { useTRPC } from '@/lib/trpc';
import { START_YEAR, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useSession } from 'next-auth/react';

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

const mapTickToDate = (tick: number): string => {
    const simTick = tick - 1;

    const year = Math.floor(simTick / TICKS_PER_YEAR) + START_YEAR;
    const tickWithinYear = simTick % TICKS_PER_YEAR;
    const monthIndex = Math.floor(tickWithinYear / TICKS_PER_MONTH);
    const day = (tickWithinYear % TICKS_PER_MONTH) + 1;

    return `${day.toString().padStart(2, '0')}. ${MONTH_NAMES[monthIndex]} ${year}`;
};

/** Client wrapper that fetches the current tick from the simulation and displays it. */
export default function TickDisplay() {
    const trpc = useTRPC();
    const loggedIn = useSession().status === 'authenticated';
    const { data } = useSimulationQuery(trpc.simulation.getCurrentTick.queryOptions(undefined, { enabled: loggedIn }));
    const tick = data?.tick ?? 0;

    return <div>{tick > 0 ? mapTickToDate(tick) : '—'}</div>;
}
