'use client';

import React from 'react';
import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import PlanetPopulationChartRecharts from './PlanetPopulationChartRecharts';
import { TICKS_PER_YEAR } from '@/simulation/constants';

type Props = {
    planetId: string;
    live?: {
        tick: number;
        population: number;
        starvationLevel: number;
    };
};

export default function PlanetPopulationHistoryChart({ planetId, live }: Props): React.ReactElement {
    const trpc = useTRPC();

    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getPlanetPopulationHistory.queryOptions({ planetId }),
    );

    if (isLoading) {
        return <div className='text-xs text-muted-foreground'>Loading population history…</div>;
    }

    const chartData = (data?.history ?? []).map((r) => ({
        year: r.tick / TICKS_PER_YEAR,
        value: r.population,
        starvation: r.starvationLevel,
    }));

    if (live && (chartData.length === 0 || live.tick / TICKS_PER_YEAR > chartData[chartData.length - 1].year)) {
        chartData.push({
            year: live.tick / TICKS_PER_YEAR,
            value: live.population,
            starvation: live.starvationLevel,
        });
    }

    if (chartData.length === 0) {
        return (
            <div className='text-xs text-muted-foreground'>
                No population history yet — recorded every snapshot interval.
            </div>
        );
    }

    const lastRow = chartData[chartData.length - 1];

    return (
        <div className='space-y-1'>
            <div className='flex items-baseline justify-between'>
                <span className='text-xs text-muted-foreground'>
                    {chartData.length} data point{chartData.length !== 1 ? 's' : ''}
                </span>
                <span className='text-xs text-muted-foreground tabular-nums space-x-3'>
                    <span>Pop: {(lastRow?.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    <span
                        className={
                            (lastRow?.starvation ?? 0) > 0.1
                                ? 'text-red-500'
                                : (lastRow?.starvation ?? 0) > 0
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                        }
                    >
                        Starvation: {((lastRow?.starvation ?? 0) * 100).toFixed(2)}%
                    </span>
                </span>
            </div>
            <PlanetPopulationChartRecharts data={chartData} height={160} />
        </div>
    );
}
