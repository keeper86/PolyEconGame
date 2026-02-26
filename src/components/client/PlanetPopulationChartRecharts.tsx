'use client';
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function PlanetPopulationChartRecharts({
    data,
    height = 120,
}: {
    data: { tick: number; value: number }[];
    height?: number;
}): React.ReactElement {
    if (!data || data.length === 0) {
        return <div className='text-sm text-gray-500'>No data</div>;
    }

    // Recharts expects data ordered from left->right. We store newest first in the UI state,
    // so reverse for plotting (older -> newer left->right).
    // Prefer using Recharts' built-in logarithmic scale instead of pre-taking Math.log.
    // Only enable log scale when all values are finite and > 0 (log undefined for <= 0).
    const useLogScale = data.every((d) => Number.isFinite(d.value) && d.value > 0);
    const plotData = data.slice().reverse();

    // Prepare log-scale ticks and a number formatter for axis ticks/tooltips.
    // Use powers-of-10 ticks when using log scale so labels are clean.
    let logTicks: number[] | undefined = undefined;
    if (useLogScale) {
        const vals = plotData.map((d) => d.value).filter((v) => Number.isFinite(v) && v > 0);
        if (vals.length > 0) {
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const minExp = Math.floor(Math.log10(min));
            const maxExp = Math.ceil(Math.log10(max));
            const ticks: number[] = [];
            for (let e = minExp; e <= maxExp; e++) {
                ticks.push(Math.pow(10, e));
            }
            logTicks = ticks;
        }
    }

    // Format numbers for axis ticks and tooltips. Prefer Intl.NumberFormat with
    // scientific notation when available; fall back to toExponential.
    const sciFormatter = (() => {
        try {
            // notation: 'scientific' may not be supported in some older engines
            return new Intl.NumberFormat(undefined, { notation: 'scientific', maximumFractionDigits: 2 });
        } catch (_e) {
            return null;
        }
    })();

    const formatNumber = (v: number): string => {
        if (!Number.isFinite(v)) {
            return String(v);
        }
        if (v === 0) {
            return '0';
        }
        const abs = Math.abs(v);
        // decide when to use scientific / exponential
        if (abs >= 1e6 || abs < 1e-3) {
            if (sciFormatter) {
                return sciFormatter.format(v);
            }
            return v.toExponential(2).replace('e+', 'e');
        }
        if (abs >= 1000) {
            return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
        }
        return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    };

    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={plotData} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                    <defs>
                        <linearGradient id='colorPop' x1='0' x2='0' y1='0' y2='1'>
                            <stop offset='5%' stopColor='#4f46e5' stopOpacity={0.8} />
                            <stop offset='95%' stopColor='#4f46e5' stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                    <XAxis
                        dataKey='tick'
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => (typeof v === 'number' ? String(Math.floor(v / 365)) : String(v))}
                    />
                    <YAxis
                        type='number'
                        // use 'log' when safe, otherwise fall back to automatic (linear)
                        scale={useLogScale ? 'log' : 'auto'}
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 11 }}
                        // when using log scale prefer nice powers-of-10 ticks
                        ticks={useLogScale ? logTicks : undefined}
                        // format numbers using our helper
                        tickFormatter={(v) => (typeof v === 'number' ? formatNumber(v) : String(v))}
                    />
                    <Tooltip formatter={(value) => (typeof value === 'number' ? formatNumber(value) : String(value))} />
                    <Area type='monotone' dataKey='value' stroke='#4f46e5' fill='url(#colorPop)' />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
