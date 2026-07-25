'use client';

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TickResult, SellDiagnostics, BuyDiagnostics } from './pricingSimulator';
import { PRICE_FLOOR } from '@/simulation/constants';

interface PricingChartProps {
    results: TickResult[];
    costFloor: number;
    marketPrice: number;
    onSelectTick: (tick: number) => void;
}

export default function PricingChart({ results, costFloor, marketPrice, onSelectTick }: PricingChartProps) {
    const chartData = useMemo(() => {
        return results.map((r) => {
            const diag = r.diagnostics;
            const isSell = 'sellThroughRate' in diag;
            const rate = isSell ? (diag as SellDiagnostics).sellThroughRate : (diag as BuyDiagnostics).fillRate;

            return {
                tick: r.tick,
                price: r.price,
                costFloor,
                marketPrice,
                priceFloor: PRICE_FLOOR,
                rate,
                rateLabel: isSell ? 'Sell-Through' : 'Fill Rate',
                soldOrBought: r.soldOrBought,
                inventory: r.inventory,
            };
        });
    }, [results, costFloor, marketPrice]);

    const yDomain = useMemo((): [number, number] => {
        if (chartData.length === 0) {
            return [0, 100];
        }
        const prices = chartData.flatMap((d) => [d.price, d.costFloor, d.marketPrice, d.priceFloor]);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const pad = (max - min) * 0.1;
        return [Math.max(0, min - pad), max + pad];
    }, [chartData]);

    const formatYAxis = (v: number) => {
        if (v >= 1_000_000) {
            return `${(v / 1_000_000).toFixed(1)}M`;
        }
        if (v >= 1_000) {
            return `${(v / 1_000).toFixed(1)}k`;
        }
        return v.toFixed(2);
    };

    if (chartData.length === 0) {
        return (
            <div className='flex items-center justify-center h-64 text-muted-foreground text-sm'>
                Run a simulation to see the price trajectory
            </div>
        );
    }

    return (
        <div className='w-full h-72'>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart
                    data={chartData}
                    onClick={(e) => {
                        if (e?.activeLabel !== undefined) {
                            onSelectTick(Number(e.activeLabel));
                        }
                    }}
                >
                    <defs>
                        <linearGradient id='priceGrad' x1='0' x2='0' y1='0' y2='1'>
                            <stop offset='5%' stopColor='#f59e0b' stopOpacity={0.35} />
                            <stop offset='95%' stopColor='#f59e0b' stopOpacity={0.05} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray='3 3' stroke='#334155' strokeOpacity={0.5} />
                    <XAxis
                        dataKey='tick'
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        label={{
                            value: 'Tick',
                            position: 'insideBottom',
                            offset: -4,
                            style: { fontSize: 10, fill: '#94a3b8' },
                        }}
                    />
                    <YAxis
                        yAxisId='price'
                        domain={yDomain}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={60}
                        tickFormatter={formatYAxis}
                    />
                    <YAxis
                        yAxisId='rate'
                        orientation='right'
                        domain={[0, 1]}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                        tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) {
                                return null;
                            }
                            return (
                                <div className='bg-popover border border-border rounded-md p-2 text-xs shadow-md space-y-1'>
                                    <div className='font-medium text-foreground'>Tick {label}</div>
                                    {payload.map((p) => (
                                        <div key={p.name} style={{ color: p.color }}>
                                            {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
                                        </div>
                                    ))}
                                </div>
                            );
                        }}
                    />
                    <Legend
                        verticalAlign='bottom'
                        content={({ payload }) => {
                            if (!payload) {
                                return null;
                            }
                            return (
                                <div className='flex justify-center gap-4 flex-wrap text-[11px] text-muted-foreground pt-2'>
                                    {payload.map((p) => (
                                        <span key={p.value} className='flex items-center gap-1'>
                                            <span
                                                className='inline-block w-3 h-0.5 rounded'
                                                style={{ backgroundColor: p.color }}
                                            />
                                            {p.value}
                                        </span>
                                    ))}
                                </div>
                            );
                        }}
                    />
                    <Area
                        yAxisId='price'
                        type='monotone'
                        dataKey='price'
                        stroke='#f59e0b'
                        strokeWidth={2}
                        fill='url(#priceGrad)'
                        dot={false}
                        activeDot={{ r: 4, fill: '#f59e0b', stroke: '#1e293b', strokeWidth: 2 }}
                        name='Price'
                        isAnimationActive={false}
                    />
                    <Area
                        yAxisId='price'
                        type='monotone'
                        dataKey='costFloor'
                        stroke='#ef4444'
                        strokeWidth={1.5}
                        strokeDasharray='4 3'
                        fill='none'
                        dot={false}
                        activeDot={false}
                        name='Cost Floor'
                        isAnimationActive={false}
                    />
                    <Area
                        yAxisId='price'
                        type='monotone'
                        dataKey='marketPrice'
                        stroke='#38bdf8'
                        strokeWidth={1}
                        strokeDasharray='2 2'
                        fill='none'
                        dot={false}
                        activeDot={false}
                        name='Market Price'
                        isAnimationActive={false}
                    />
                    <Area
                        yAxisId='rate'
                        type='monotone'
                        dataKey='rate'
                        stroke='#22c55e'
                        strokeWidth={1.5}
                        fill='none'
                        dot={false}
                        activeDot={false}
                        name='Rate'
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
