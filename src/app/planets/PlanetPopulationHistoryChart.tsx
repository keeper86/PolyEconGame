'use client';

import React from 'react';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import PlanetPopulationChartRecharts from './PlanetPopulationChartRecharts';

/** Refetch interval — matches the snapshot interval so data updates whenever
 *  a new cold snapshot (and population history row) is written. */
const REFETCH_INTERVAL_MS = 1000;

type Props = {
    planetId: string;
};

/**
 * Fetches the planet_population_history rows for a single planet via tRPC
 * and renders them as an area chart with population + starvation level.
 */
export default function PlanetPopulationHistoryChart({ planetId }: Props): React.ReactElement {
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getPlanetPopulationHistory.queryOptions({ planetId }),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    if (isLoading) {
        return <div className='text-xs text-muted-foreground'>Loading population history…</div>;
    }

    const chartData = (data?.history ?? []).map((r) => ({
        tick: r.tick,
        value: r.population,
        starvation: r.starvationLevel,
    }));

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
                    <span>
                        Pop:{' '}
                        {(lastRow?.value ?? 0).toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                        })}
                    </span>
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
