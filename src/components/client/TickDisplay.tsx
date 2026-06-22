'use client';

import { useSimulationTick } from '@/hooks/useSimulationQuery';
import { START_YEAR, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';

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

export const tickToDate = (tick: number): { year: number; monthIndex: number; day: number } => {
    const simTick = tick - 1;

    const year = Math.floor(simTick / TICKS_PER_YEAR) + START_YEAR;
    const tickWithinYear = simTick % TICKS_PER_YEAR;
    const monthIndex = Math.floor(tickWithinYear / TICKS_PER_MONTH);
    const day = (tickWithinYear % TICKS_PER_MONTH) + 1;

    return { year, monthIndex, day };
};

export const mapTickToDate = (tick: number): string => {
    const { year, monthIndex, day } = tickToDate(tick);

    return `${day.toString().padStart(2, '0')}. ${MONTH_NAMES[monthIndex]} ${year}`;
};

export default function TickDisplay() {
    const tick = useSimulationTick();

    return <div>{tick > 0 ? mapTickToDate(tick) : '—'}</div>;
}
