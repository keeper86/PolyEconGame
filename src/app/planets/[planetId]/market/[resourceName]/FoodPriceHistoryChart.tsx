'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { TICKS_PER_YEAR } from '@/simulation/constants';
import React from 'react';
import { Area, AreaChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = {
    planetId: string;
    /** Live values from the already-fetched planet food data (current tick). */
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

    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getPlanetPopulationHistory.queryOptions({ planetId }),
    );

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

    // Append a live data point at the current tick so the chart extends
    // to "now" instead of stopping at the last yearly snapshot.
    if (live) {
        plotData.push({
            year: live.tick / TICKS_PER_YEAR,
            foodPrice: live.foodPrice,
            starvationPct: live.starvationLevel * 100,
        });
    }

    const lastRow = plotData[plotData.length - 1];

    // Compute explicit log-scale ticks to avoid Recharts generating duplicate
    // floating-point tick values (which causes React key collisions).
    const logTicks = (() => {
        const prices = plotData.map((d) => d.foodPrice).filter((v) => v > 0);
        if (prices.length === 0) {
            return undefined;
        }
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        if (minP === maxP) {
            return [minP];
        }
        const minExp = Math.floor(Math.log10(minP));
        const maxExp = Math.ceil(Math.log10(maxP));
        const result: number[] = [];
        for (let e = minExp; e <= maxExp; e++) {
            result.push(Math.pow(10, e));
        }
        return result;
    })();

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
                        <XAxis
                            dataKey='year'
                            type='number'
                            tick={{ fontSize: 11 }}
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(v) =>
                                typeof v === 'number' ? (Number.isInteger(v) ? `Y${v}` : `Y${v.toFixed(1)}`) : String(v)
                            }
                        />
                        <YAxis
                            yAxisId='left'
                            type='number'
                            scale='log'
                            domain={['auto', 'auto']}
                            allowDataOverflow
                            ticks={logTicks}
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
