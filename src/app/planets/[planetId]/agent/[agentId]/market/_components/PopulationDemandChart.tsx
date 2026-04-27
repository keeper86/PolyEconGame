'use client';

import React from 'react';
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import { formatNumberWithUnit } from '@/lib/utils';

export type PopulationBidEntry = {
    priceMin: number;
    priceMax: number;
    priceMid: number;
    demandedQuantity: number;
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
            <p className='font-semibold'>Price Range</p>
            <p>
                Price:{' '}
                <span className='font-mono'>
                    {formatNumberWithUnit(d.priceMin, 'currency')} – {formatNumberWithUnit(d.priceMax, 'currency')}
                </span>{' '}
                ¤/t
            </p>
            <p>
                Demanded: <span className='font-mono'>{formatNumberWithUnit(d.demandedQuantity, 'tonnes')}</span>
            </p>
            <p>
                Bought: <span className='font-mono'>{formatNumberWithUnit(d.lastBought, 'tonnes')}</span> (
                {formatNumberWithUnit(d.fillRatio * 100, 'percent')})
            </p>
            <p>
                Spent: <span className='font-mono'>{formatNumberWithUnit(d.lastSpent, 'currency')}</span>
            </p>
        </div>
    );
}

function computeLogTicks(values: number[], base = 10, minFloor = 1e-4) {
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
    return Array.from(new Set(ticks)).sort((a, b) => a - b);
}

export default function PopulationDemandChart({ bids }: Props) {
    if (!bids || bids.length === 0) {
        return <div className='text-xs text-muted-foreground py-4'>No population demand this tick.</div>;
    }

    // Sort by ascending priceMid so bars go left-to-right (lowest price first)
    const data = [...bids]
        .sort((a, b) => a.priceMid - b.priceMid)
        .map((b) => ({
            ...b,
            // recharts needs a string key for categorical X axis; use formatted price mid
            name: formatNumberWithUnit(b.priceMid, 'currency'),
            displayQuantity: b.demandedQuantity,
        }));

    const priceMids = data.map((d) => d.priceMid);
    const logTicks = computeLogTicks(priceMids);
    const xDomain: [number, number] = [
        Math.pow(10, Math.floor(Math.log10(Math.max(1e-4, Math.min(...priceMids))))),
        Math.pow(10, Math.ceil(Math.log10(Math.max(...priceMids)))),
    ];

    return (
        <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width='100%' height='100%'>
                <ComposedChart data={data} margin={{ top: 8, right: 36, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='var(--border)' />
                    <XAxis
                        dataKey='priceMid'
                        type='number'
                        scale='log'
                        domain={xDomain}
                        ticks={logTicks}
                        allowDataOverflow
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatNumberWithUnit(v as number, 'currency')}
                        label={{
                            value: 'Bid Price (¤/t)',
                            position: 'insideBottom',
                            offset: -14,
                            fontSize: 10,
                        }}
                    />
                    <YAxis
                        tick={{ fontSize: 10 }}
                        scale='linear'
                        label={{ value: 'Quantity (t)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                        tickFormatter={(v) => formatNumberWithUnit(v as number, 'tonnes')}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey='displayQuantity' name='Demanded' barSize={14}>
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
