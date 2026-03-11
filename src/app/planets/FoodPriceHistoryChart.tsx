'use client';

import React from 'react';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { TICKS_PER_YEAR } from '@/simulation/constants';

/** Refetch interval — matches the snapshot interval so data updates whenever
 *  a new cold snapshot (and population history row) is written. */
const REFETCH_INTERVAL_MS = 1000;

type Props = {
    planetId: string;
    /** Live values from the already-fetched planet detail (current tick). */
    live?: {
        tick: number;
        foodPrice: number;
        starvationLevel: number;
    };
};

/**
 * Fetches the planet_population_history rows for a single planet via tRPC
 * and renders the food price (price level) as an area chart.
 * When `live` is provided the chart extends to the current tick.
 */
export default function FoodPriceHistoryChart({ planetId, live }: Props): React.ReactElement {
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getPlanetPopulationHistory.queryOptions({ planetId }),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    if (isLoading) {
        return <div className='text-xs text-muted-foreground'>Loading price history…</div>;
    }

    const plotData = (data?.history ?? [])
        .map((r) => ({
            year: r.tick / TICKS_PER_YEAR,
            foodPrice: r.foodPrice,
            starvationPct: r.starvationLevel * 100,
        }))
        .sort((a, b) => a.year - b.year);

    const maxYear = Math.ceil(plotData[plotData.length - 1].year);

    // Append a live data point at the current tick so the chart extends
    // to "now" instead of stopping at the last yearly snapshot.
    if (live && (plotData.length === 0 || live.tick / TICKS_PER_YEAR > plotData[plotData.length - 1].year)) {
        plotData.push({
            year: live.tick / TICKS_PER_YEAR,
            foodPrice: live.foodPrice,
            starvationPct: live.starvationLevel * 100,
        });
    }

    if (plotData.length === 0) {
        return (
            <div className='text-xs text-muted-foreground'>
                No price history yet — recorded every snapshot interval.
            </div>
        );
    }

    const lastRow = plotData[plotData.length - 1];

    const formatPrice = (v: number): string => {
        if (!Number.isFinite(v)) {
            return String(v);
        }
        return v.toFixed(4);
    };

    return (
        <div className='space-y-1'>
            <div className='flex items-baseline justify-between'>
                <span className='text-xs text-muted-foreground'>
                    {plotData.length} data point{plotData.length !== 1 ? 's' : ''}
                </span>
                <span className='text-xs text-muted-foreground tabular-nums space-x-3'>
                    <span>Price: {formatPrice(lastRow?.foodPrice ?? 0)}</span>
                    <span
                        className={
                            (lastRow?.starvationPct ?? 0) > 10
                                ? 'text-red-500'
                                : (lastRow?.starvationPct ?? 0) > 0
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                        }
                    >
                        Starvation: {(lastRow?.starvationPct ?? 0).toFixed(2)}%
                    </span>
                </span>
            </div>
            <div style={{ width: '100%', height: 160 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart data={plotData} margin={{ top: 6, right: 40, left: 6, bottom: 6 }}>
                        <defs>
                            <linearGradient id='colorFoodPrice' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#f59e0b' stopOpacity={0.8} />
                                <stop offset='95%' stopColor='#f59e0b' stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id='colorStarvationPrice' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#ef4444' stopOpacity={0.6} />
                                <stop offset='95%' stopColor='#ef4444' stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                        <XAxis
                            dataKey='year'
                            type='number'
                            tick={{ fontSize: 11 }}
                            domain={[0, maxYear]}
                            tickFormatter={(v) =>
                                typeof v === 'number' ? (Number.isInteger(v) ? `Y${v}` : `Y${v.toFixed(1)}`) : String(v)
                            }
                        />
                        <YAxis
                            yAxisId='left'
                            type='number'
                            scale='log'
                            domain={['auto', 'auto']}
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => (typeof v === 'number' ? formatPrice(v) : String(v))}
                        />
                        <YAxis
                            yAxisId='right'
                            orientation='right'
                            type='number'
                            domain={[0, 100]}
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => `${typeof v === 'number' ? v.toFixed(0) : v}%`}
                        />
                        <Tooltip
                            formatter={(value: number, name: string) => {
                                if (name === 'starvationPct') {
                                    return [`${value.toFixed(2)}%`, 'Starvation'];
                                }
                                return [formatPrice(value), 'Price level'];
                            }}
                        />
                        <Legend formatter={(value) => (value === 'starvationPct' ? 'Starvation %' : 'Price level')} />
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='foodPrice'
                            stroke='#f59e0b'
                            fill='url(#colorFoodPrice)'
                        />
                        <Area
                            yAxisId='right'
                            type='monotone'
                            dataKey='starvationPct'
                            stroke='#ef4444'
                            fill='url(#colorStarvationPrice)'
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
