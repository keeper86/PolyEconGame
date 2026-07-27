'use client';

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SimSnapshot, ChainNodeConfig } from './chainSimulator';

interface ChainChartProps {
    snapshots: SimSnapshot[];
    nodes: ChainNodeConfig[];
}

const NODE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];

function formatYAxis(v: number) {
    if (v >= 1_000_000) {
        return `${(v / 1_000_000).toFixed(1)}M`;
    }
    if (v >= 1_000) {
        return `${(v / 1_000).toFixed(1)}k`;
    }
    return v.toFixed(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) {
        return null;
    }
    return (
        <div className='bg-popover border border-border rounded-md shadow-md p-3 text-xs space-y-1'>
            <p className='font-semibold text-foreground'>Tick {label}</p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {payload.map((entry: any) => (
                <div key={entry.name} className='flex items-center gap-2'>
                    <span className='w-2.5 h-2.5 rounded-full' style={{ backgroundColor: entry.color }} />
                    <span className='text-muted-foreground'>{entry.name}:</span>
                    <span className='font-medium text-foreground'>{formatYAxis(entry.value)}</span>
                </div>
            ))}
        </div>
    );
}

export function ScaleChart({ snapshots, nodes }: ChainChartProps) {
    const chartData = useMemo(() => {
        return snapshots.map((s) => {
            const row: Record<string, number | string> = { tick: s.tick };
            for (const nc of nodes) {
                row[`${nc.id}_scale`] = s.nodes[nc.id]?.scale ?? 0;
                row[`${nc.id}_max`] = nc.maxScale;
            }
            return row;
        });
    }, [snapshots, nodes]);

    if (chartData.length === 0) {
        return (
            <div className='flex items-center justify-center h-48 text-muted-foreground text-sm'>
                Run simulation to see scale
            </div>
        );
    }

    return (
        <div className='w-full h-48'>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={chartData}>
                    <defs>
                        {nodes.map((nc, i) => (
                            <linearGradient key={nc.id} id={`scaleGrad_${nc.id}`} x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor={NODE_COLORS[i % NODE_COLORS.length]} stopOpacity={0.3} />
                                <stop offset='95%' stopColor={NODE_COLORS[i % NODE_COLORS.length]} stopOpacity={0.05} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
                    <XAxis dataKey='tick' className='text-[10px]' tickLine={false} />
                    <YAxis className='text-[10px]' tickLine={false} tickFormatter={formatYAxis} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType='circle' className='text-xs' />
                    {nodes.map((nc, i) => (
                        <Area
                            key={nc.id}
                            type='monotone'
                            dataKey={`${nc.id}_scale`}
                            name={`${nc.name} Scale`}
                            stroke={NODE_COLORS[i % NODE_COLORS.length]}
                            fill={`url(#scaleGrad_${nc.id})`}
                            strokeWidth={2}
                            dot={false}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export function InventoryChart({ snapshots, nodes }: ChainChartProps) {
    const chartData = useMemo(() => {
        return snapshots.map((s) => {
            const row: Record<string, number | string> = { tick: s.tick };
            for (const nc of nodes) {
                row[`${nc.id}_inv`] = s.nodes[nc.id]?.inventory ?? 0;
            }
            return row;
        });
    }, [snapshots, nodes]);

    if (chartData.length === 0) {
        return (
            <div className='flex items-center justify-center h-48 text-muted-foreground text-sm'>
                Run simulation to see inventory
            </div>
        );
    }

    return (
        <div className='w-full h-48'>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={chartData}>
                    <defs>
                        {nodes.map((nc, i) => (
                            <linearGradient key={nc.id} id={`invGrad_${nc.id}`} x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor={NODE_COLORS[i % NODE_COLORS.length]} stopOpacity={0.3} />
                                <stop offset='95%' stopColor={NODE_COLORS[i % NODE_COLORS.length]} stopOpacity={0.05} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
                    <XAxis dataKey='tick' className='text-[10px]' tickLine={false} />
                    <YAxis className='text-[10px]' tickLine={false} tickFormatter={formatYAxis} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType='circle' className='text-xs' />
                    {nodes.map((nc, i) => (
                        <Area
                            key={nc.id}
                            type='monotone'
                            dataKey={`${nc.id}_inv`}
                            name={`${nc.name} Inventory`}
                            stroke={NODE_COLORS[i % NODE_COLORS.length]}
                            fill={`url(#invGrad_${nc.id})`}
                            strokeWidth={2}
                            dot={false}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export function PriceChart({ snapshots, nodes }: ChainChartProps) {
    const chartData = useMemo(() => {
        return snapshots.map((s) => {
            const row: Record<string, number | string> = { tick: s.tick };
            for (const nc of nodes) {
                row[`${nc.id}_price`] = s.nodes[nc.id]?.price ?? 0;
                row[`${nc.id}_costFloor`] = nc.costFloor;
            }
            return row;
        });
    }, [snapshots, nodes]);

    if (chartData.length === 0) {
        return (
            <div className='flex items-center justify-center h-48 text-muted-foreground text-sm'>
                Run simulation to see prices
            </div>
        );
    }

    return (
        <div className='w-full h-48'>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={chartData}>
                    <defs>
                        {nodes.map((nc, i) => (
                            <linearGradient key={nc.id} id={`priceGrad_${nc.id}`} x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor={NODE_COLORS[i % NODE_COLORS.length]} stopOpacity={0.3} />
                                <stop offset='95%' stopColor={NODE_COLORS[i % NODE_COLORS.length]} stopOpacity={0.05} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
                    <XAxis dataKey='tick' className='text-[10px]' tickLine={false} />
                    <YAxis className='text-[10px]' tickLine={false} tickFormatter={formatYAxis} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType='circle' className='text-xs' />
                    {nodes.map((nc, i) => (
                        <>
                            <Area
                                key={nc.id}
                                type='monotone'
                                dataKey={`${nc.id}_price`}
                                name={`${nc.name} Price`}
                                stroke={NODE_COLORS[i % NODE_COLORS.length]}
                                fill={`url(#priceGrad_${nc.id})`}
                                strokeWidth={2}
                                dot={false}
                            />
                            <Area
                                key={`${nc.id}_floor`}
                                type='monotone'
                                dataKey={`${nc.id}_costFloor`}
                                name={`${nc.name} Cost Floor`}
                                stroke={NODE_COLORS[i % NODE_COLORS.length]}
                                fill='transparent'
                                strokeWidth={1}
                                strokeDasharray='4 4'
                                dot={false}
                            />
                        </>
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export function SignalChart({ snapshots, nodes }: ChainChartProps) {
    const chartData = useMemo(() => {
        return snapshots.map((s) => {
            const row: Record<string, number | string> = { tick: s.tick };
            for (const nc of nodes) {
                row[`${nc.id}_signal`] = s.nodes[nc.id]?.signal ?? 0;
            }
            return row;
        });
    }, [snapshots, nodes]);

    if (chartData.length === 0) {
        return (
            <div className='flex items-center justify-center h-32 text-muted-foreground text-sm'>
                Run simulation to see signal
            </div>
        );
    }

    return (
        <div className='w-full h-32'>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={chartData}>
                    <defs>
                        {nodes.map((nc, i) => (
                            <linearGradient key={nc.id} id={`sigGrad_${nc.id}`} x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor={NODE_COLORS[i % NODE_COLORS.length]} stopOpacity={0.3} />
                                <stop offset='95%' stopColor={NODE_COLORS[i % NODE_COLORS.length]} stopOpacity={0.05} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
                    <XAxis dataKey='tick' className='text-[10px]' tickLine={false} />
                    <YAxis domain={[-1, 1]} className='text-[10px]' tickLine={false} tickFormatter={formatYAxis} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType='circle' className='text-xs' />
                    {nodes.map((nc, i) => (
                        <Area
                            key={nc.id}
                            type='monotone'
                            dataKey={`${nc.id}_signal`}
                            name={`${nc.name} Signal`}
                            stroke={NODE_COLORS[i % NODE_COLORS.length]}
                            fill={`url(#sigGrad_${nc.id})`}
                            strokeWidth={2}
                            dot={false}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
