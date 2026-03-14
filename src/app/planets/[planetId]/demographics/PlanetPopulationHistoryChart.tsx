'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { TICKS_PER_YEAR } from '@/simulation/constants';
import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = {
    planetId: string;
    live?: {
        tick: number;
        population: number;
        starvationLevel: number;
    };
};

function PlanetPopulationChartRecharts({
    data,
}: {
    data: { year: number; value: number; starvation?: number }[];
}): React.ReactElement {
    if (!data || data.length === 0) {
        return <div className='text-sm text-gray-500'>No data</div>;
    }

    const hasStarvation = data.some((d) => d.starvation !== undefined && d.starvation !== null);

    const plotData = data
        .slice()
        .sort((a, b) => a.year - b.year)
        .map((d) => ({
            ...d,
            starvationPct: d.starvation !== undefined ? d.starvation * 100 : undefined,
        }));

    const minYear = Math.floor(plotData[0].year);
    const maxYear = Math.ceil(plotData[plotData.length - 1].year);

    return (
        <ResponsiveContainer width='100%' minHeight={200} minWidth={310}>
            <AreaChart data={plotData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id='colorPop' x1='0' x2='0' y1='0' y2='1'>
                        <stop offset='5%' stopColor='#4f46e5' stopOpacity={0.8} />
                        <stop offset='95%' stopColor='#4f46e5' stopOpacity={0} />
                    </linearGradient>
                    {hasStarvation && (
                        <linearGradient id='colorStarvation' x1='0' x2='0' y1='0' y2='1'>
                            <stop offset='5%' stopColor='#ef4444' stopOpacity={0.6} />
                            <stop offset='95%' stopColor='#ef4444' stopOpacity={0} />
                        </linearGradient>
                    )}
                </defs>
                <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                <XAxis
                    dataKey='year'
                    type='number'
                    tick={{ fontSize: 11 }}
                    domain={[minYear, maxYear]}
                    tickFormatter={(v) =>
                        typeof v === 'number'
                            ? Number.isInteger(v)
                                ? `y${v + 2200}`
                                : `y${(v + 2200).toFixed(1)}`
                            : String(v)
                    }
                />
                <YAxis
                    yAxisId='left'
                    type='number'
                    scale={'auto'}
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (typeof v === 'number' ? formatNumbers(v) : String(v))}
                />
                {hasStarvation && (
                    <YAxis
                        yAxisId='right'
                        orientation='right'
                        type='number'
                        label={{
                            value: 'Starvation Level (%)',
                            angle: -90,
                            position: 'insideCenter',

                            fill: '#ef4444',
                            fontSize: 10,
                        }}
                        domain={[0, 100]}
                        tick={{ fontSize: 12, fill: '#ef4444' }}
                        tickFormatter={(v) => `${typeof v === 'number' ? v.toFixed(0) : v}`}
                    />
                )}
                <Tooltip
                    labelFormatter={(label: number) => `${Number.isInteger(label) ? label : label.toFixed(2)}`}
                    formatter={(value: number, name: string) => {
                        if (name === 'starvationPct') {
                            return [`${value.toFixed(2)}%`, 'Starvation'];
                        }
                        return [formatNumbers(value), 'Population'];
                    }}
                />
                <Area
                    yAxisId='left'
                    type='monotone'
                    dataKey='value'
                    name='value'
                    stroke='#4f46e5'
                    fill='url(#colorPop)'
                />
                {hasStarvation && (
                    <Area
                        yAxisId='right'
                        type='monotone'
                        dataKey='starvationPct'
                        name='starvationPct'
                        stroke='#ef4444'
                        fill='url(#colorStarvation)'
                    />
                )}
            </AreaChart>
        </ResponsiveContainer>
    );
}

export default function PlanetPopulationHistoryChart({ planetId }: Props): React.ReactElement {
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

    return <PlanetPopulationChartRecharts data={chartData} />;
}
