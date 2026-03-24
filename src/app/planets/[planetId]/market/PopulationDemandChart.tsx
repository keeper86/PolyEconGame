'use client';

import React from 'react';
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import { formatNumbers } from '@/lib/utils';

export type PopulationBidEntry = {
    bidPrice: number;
    bidQuantity: number;
    lastBought: number;
    fillRatio: number;
    lastSpent: number;
};

type Props = {
    bids: PopulationBidEntry[];
};

function fillRatioColor(fillRatio: number): string {
    if (fillRatio >= 0.99) {
        return '#22c55e';
    } // green (fully filled)
    if (fillRatio >= 0.01) {
        return '#f59e0b';
    } // amber (partial)
    return '#94a3b8'; // slate (unfilled)
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: PopulationBidEntry }[] }) {
    if (!active || !payload?.length) {
        return null;
    }
    const d = payload[0].payload;
    return (
        <div className='bg-background border rounded px-2 py-1.5 text-xs shadow-md space-y-0.5'>
            <p className='font-semibold'>Population Segment</p>
            <p>
                Bid Price: <span className='font-mono'>{formatNumbers(d.bidPrice)}</span>
            </p>
            <p>
                Demanded: <span className='font-mono'>{formatNumbers(d.bidQuantity)}</span> t
            </p>
            <p>
                Bought: <span className='font-mono'>{formatNumbers(d.lastBought)}</span> t (
                {formatNumbers(d.fillRatio * 100)}%)
            </p>
            <p>
                Spent: <span className='font-mono'>{formatNumbers(d.lastSpent)}</span>
            </p>
        </div>
    );
}

export default function PopulationDemandChart({ bids }: Props) {
    if (!bids || bids.length === 0) {
        return <div className='text-xs text-muted-foreground py-4'>No population demand this tick.</div>;
    }

    // Sort descending by bidPrice
    const sorted = [...bids].sort((a, b) => b.bidPrice - a.bidPrice);

    const data = sorted.map((b, i) => ({
        ...b,
        name: `Dec. ${i + 1}`,
        // For log scale, values must be strictly > 0.
        // We cap the bottom at a small value just for the visualization height.
        displayPrice: Math.max(0.01, b.bidPrice),
    }));
    // Compute nice log ticks that include full even limits at the extrema
    // e.g. ..., 0.01, 0.1, 1, 10, 100
    function computeLogTicks(values: number[], base = 10, minFloor = 0.01) {
        if (!values || values.length === 0) {
            return [minFloor, 1];
        }
        const minVal = Math.max(minFloor, Math.min(...values));
        const maxVal = Math.max(...values, minVal);

        const expMin = Math.floor(Math.log10(minVal));
        const expMax = Math.ceil(Math.log10(maxVal));

        const ticks: number[] = [];
        for (let e = expMin; e <= expMax; e++) {
            ticks.push(Math.pow(base, e));
        }
        // Ensure ticks are unique and sorted
        return Array.from(new Set(ticks)).sort((a, b) => a - b);
    }

    const priceValues = data.map((d) => d.displayPrice);
    const logTicks = computeLogTicks(priceValues, 10, 0.01);
    const yDomain: [number, number] = [logTicks[0], logTicks[logTicks.length - 1]];

    return (
        <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width='100%' height='100%'>
                <ComposedChart data={data} margin={{ top: 8, right: 36, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' />
                    <XAxis
                        dataKey='name'
                        type='category'
                        tick={{ fontSize: 10 }}
                        label={{
                            value: 'Population Deciles by quantity (highest bid first)',
                            position: 'insideBottom',
                            offset: -4,
                            fontSize: 10,
                        }}
                    />
                    <YAxis
                        tick={{ fontSize: 10 }}
                        scale='log'
                        domain={yDomain}
                        ticks={logTicks}
                        allowDataOverflow
                        label={{ value: 'Bid Price (¤/t)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                        tickFormatter={(v) => formatNumbers(v as number)}
                    />
                    <Tooltip content={<CustomTooltip />} />

                    <Bar dataKey='displayPrice' name='Bid Price' barSize={32}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={fillRatioColor(entry.fillRatio)} fillOpacity={0.85} />
                        ))}
                    </Bar>
                </ComposedChart>
            </ResponsiveContainer>
            <div className='flex items-center gap-3 mt-1 justify-center text-[10px] text-muted-foreground'>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm bg-green-500' />
                    Fully filled
                </span>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm bg-amber-500' />
                    Partial fill
                </span>
                <span className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm bg-slate-400' />
                    Unfilled
                </span>
            </div>
        </div>
    );
}
