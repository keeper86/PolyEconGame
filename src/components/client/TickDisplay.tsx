'use client';

import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';

export default function TickDisplay({ tick }: { tick: number }) {
    // we have TICKS_PER_MONTH and 12 months per year
    // so we need to map tick 0 to "1 Jan 2200"
    // and then we calculate the ticksPerYear and can map ticks into unixTimeseconds.
    // We will just add unixTime to the start and the time mapping should be smooth
    // Lets show "month year: week" for the date format, e.g. "Jan 2200: Week 3"
    const mapTickToDate = (tick: number): string => {
        const elapsedYears = Math.floor(tick / TICKS_PER_YEAR);
        const monthsIntoYear = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_MONTH);
        const daysIntoMonth = (tick % TICKS_PER_MONTH) % TICKS_PER_MONTH;

        const startUnixTime = new Date(2200 + elapsedYears, monthsIntoYear, daysIntoMonth);
        return (
            startUnixTime.toLocaleString('en-US', { month: 'short', year: 'numeric' }) +
            `: Week ${Math.floor((tick % TICKS_PER_YEAR) / 7) + 1}: Day ${daysIntoMonth + 1}`
        );
    };

    return (
        <div className='rounded border p-2 inline-block bg-white/5'>
            <div className='text-sm text-slate-400'>Date</div>
            <div className='text-xl font-mono'>{tick > 0 ? mapTickToDate(tick) : '—'}</div>
        </div>
    );
}
