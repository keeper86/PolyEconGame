'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { TICKS_PER_YEAR } from '@/simulation/constants';
import React, { useMemo } from 'react';
import { Area, AreaChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Bucket sizes in ticks for each granularity.
const BUCKET_TICKS = { monthly: 30, yearly: 360, decade: 3600 } as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type Props = {
    planetId: string;
    productName: string;
    /** Live price from the already-fetched market data (current tick). */
    live?: {
        tick: number;
        price: number;
    };
};

export default function ProductPriceHistoryChart({ planetId, productName, live }: Props): React.ReactElement {
    const trpc = useTRPC();

    const { data: monthly, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({
            planetId,
            productName,
            granularity: 'monthly',
            limit: 12,
        }),
    );
    const { data: yearly, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({ planetId, productName, granularity: 'yearly', limit: 9 }),
    );
    const { data: decade, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({ planetId, productName, granularity: 'decade' }),
    );

    const isLoading = loadingMonthly || loadingYearly || loadingDecade;

    // The minimum bucket (in ticks) that is monthly-granularity data — used for x-axis label formatting.
    const monthlyThreshold = useMemo(() => {
        const pts = monthly?.history ?? [];
        if (pts.length === 0) {
            return Infinity;
        }
        return Math.min(...pts.map((p) => p.bucket));
    }, [monthly]);

    const plotData = useMemo(() => {
        type Point = { bucket: number; avgPrice: number; minPrice: number; maxPrice: number };

        const toPoints = (history: typeof monthly): Point[] =>
            (history?.history ?? []).map((r) => ({
                bucket: r.bucket,
                avgPrice: r.avgPrice,
                minPrice: r.minPrice,
                maxPrice: r.maxPrice,
            }));

        const decadePoints = toPoints(decade);
        const yearlyPoints = toPoints(yearly);
        const monthlyPoints = toPoints(monthly);

        const coveredByDecade = new Set(decadePoints.map((p) => Math.floor(p.bucket / BUCKET_TICKS.decade)));
        const filteredYearly = yearlyPoints.filter(
            (p) => !coveredByDecade.has(Math.floor(p.bucket / BUCKET_TICKS.decade)),
        );

        const coveredByYearly = new Set(
            [...yearlyPoints, ...filteredYearly].map((p) => Math.floor(p.bucket / BUCKET_TICKS.yearly)),
        );
        const filteredMonthly = monthlyPoints.filter(
            (p) => !coveredByYearly.has(Math.floor(p.bucket / BUCKET_TICKS.yearly)),
        );

        const merged: Array<{ tick: number; year: number; avgPrice: number; minPrice: number; maxPrice: number }> = [
            ...decadePoints,
            ...filteredYearly,
            ...filteredMonthly,
        ]
            .sort((a, b) => a.bucket - b.bucket)
            .map((p) => ({
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
            }));

        if (live && merged.length > 0) {
            const last = merged[merged.length - 1];
            merged.push({
                tick: live.tick,
                year: live.tick / TICKS_PER_YEAR,
                avgPrice: live.price,
                minPrice: Math.min(last.minPrice, live.price),
                maxPrice: Math.max(last.maxPrice, live.price),
            });
        }

        return merged;
    }, [decade, yearly, monthly, live]);

    const [minData, maxData, minAvgData, maxAvgData] = useMemo(() => {
        if (plotData.length === 0) {
            return [0, 1, 0, 1];
        }
        return [
            Math.min(...plotData.map((d) => d.minPrice)),
            Math.max(...plotData.map((d) => d.maxPrice)),
            Math.min(...plotData.map((d) => d.avgPrice)),
            Math.max(...plotData.map((d) => d.avgPrice)),
        ];
    }, [plotData]);

    // Y-axis domain with a small padding so a flat line is visible in the middle.
    const yDomain = useMemo((): [number, number] => {
        if (!Number.isFinite(minData) || !Number.isFinite(maxData) || minData === maxData) {
            const v = Number.isFinite(minData) ? minData : 0;
            return [v * 0.95 - 0.0001, v * 1.05 + 0.0001];
        }
        const pad = (maxData - minData) * 0.08;
        return [minData - pad, maxData + pad];
    }, [minData, maxData]);

    const withLogScale = useMemo(() => {
        if (minAvgData <= 0 || !Number.isFinite(minAvgData) || !Number.isFinite(maxAvgData)) {
            return false;
        }
        return minAvgData / maxAvgData >= 10;
    }, [minAvgData, maxAvgData]);

    const logTicks = useMemo(() => {
        if (!withLogScale) {
            return undefined;
        }
        const prices = plotData.map((d) => d.avgPrice).filter((v) => v > 0);
        if (prices.length === 0) {
            return undefined;
        }
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        if (minP === maxP) {
            return [minP];
        }
        const result: number[] = [];
        for (let e = Math.floor(Math.log10(minP)); e <= Math.ceil(Math.log10(maxP)); e++) {
            result.push(Math.pow(10, e));
        }
        return result;
    }, [withLogScale, plotData]);

    const formatPrice = (v: number): string => (Number.isFinite(v) ? v.toFixed(4) : String(v));

    const formatXTick = (tick: number): string => {
        if (typeof tick !== 'number') {
            return String(tick);
        }
        const tickVal = tick * TICKS_PER_YEAR; // year → ticks
        if (tickVal >= monthlyThreshold) {
            // Monthly label: show "MonY" e.g. "Apr5"
            const year = Math.floor(tick);
            const monthIdx = Math.round((tick - year) * 12);
            const monthName = MONTH_NAMES[monthIdx % 12] ?? MONTH_NAMES[0];
            return `${monthName}`;
        }
        // Year or decade label
        return Number.isInteger(tick) ? `Y${tick}` : `Y${tick.toFixed(0)}`;
    };

    const tooltipLabelFormatter = (label: number): string => {
        if (typeof label !== 'number') {
            return String(label);
        }
        const tickVal = label * TICKS_PER_YEAR;
        if (tickVal >= monthlyThreshold) {
            const year = Math.floor(label);
            const monthFrac = label - year;
            const monthIdx = Math.round(monthFrac * 12);
            const totalMonths = year * 12 + monthIdx;
            const monthInYear = totalMonths % 12;
            const displayYear = Math.floor(totalMonths / 12);
            return `${MONTH_NAMES[monthInYear]} Y${displayYear}`;
        }
        return `Y${label.toFixed(2)}`;
    };

    const tooltipFormatter = (value: number, name: string): [string, string] => {
        const labels: Record<string, string> = {
            avgPrice: 'Avg price',
            minPrice: 'Min price',
            maxPrice: 'Max price',
        };
        return [formatPrice(value), labels[name] ?? name];
    };

    if (isLoading) {
        return <div className='text-xs text-muted-foreground'>Loading price history…</div>;
    }

    const gradId = `colorRange_${productName.replace(/\s+/g, '_')}`;

    return (
        <div className='space-y-1'>
            <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart data={plotData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id={gradId} x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#38bdf8' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#38bdf8' stopOpacity={0.08} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey='year'
                            type='number'
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            axisLine={{ stroke: '#334155' }}
                            tickLine={false}
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={formatXTick}
                            minTickGap={40}
                        />
                        <YAxis
                            type='number'
                            scale={withLogScale ? 'log' : 'linear'}
                            domain={withLogScale ? ['auto', 'auto'] : yDomain}
                            allowDataOverflow
                            ticks={withLogScale ? logTicks : undefined}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                            width={56}
                            tickFormatter={(v) => (typeof v === 'number' ? formatPrice(v) : String(v))}
                        />
                        <Tooltip
                            contentStyle={{
                                background: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '6px',
                                fontSize: 12,
                            }}
                            itemStyle={{ color: '#e2e8f0' }}
                            labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                            formatter={tooltipFormatter}
                            labelFormatter={tooltipLabelFormatter}
                        />
                        <Legend
                            iconType='circle'
                            iconSize={8}
                            wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                            formatter={(value) =>
                                (
                                    ({
                                        avgPrice: 'Avg price',
                                        minPrice: 'Min',
                                        maxPrice: 'Max',
                                    }) as Record<string, string>
                                )[value] ?? value
                            }
                        />
                        {/* Max price — top boundary of the band with fill down to minPrice */}
                        <Area
                            type='monotone'
                            dataKey='maxPrice'
                            stroke='#38bdf8'
                            strokeWidth={1}
                            strokeDasharray='3 3'
                            fill={`url(#${gradId})`}
                            dot={false}
                            activeDot={false}
                            name='maxPrice'
                        />
                        {/* Min price — bottom boundary, wipes out the fill below it */}
                        <Area
                            type='monotone'
                            dataKey='minPrice'
                            stroke='#38bdf8'
                            strokeWidth={1}
                            strokeDasharray='3 3'
                            fill='var(--background, #0f172a)'
                            dot={false}
                            activeDot={false}
                            name='minPrice'
                        />
                        {/* Avg price as a bright line on top */}
                        <Area
                            type='monotone'
                            dataKey='avgPrice'
                            stroke='#f59e0b'
                            strokeWidth={2}
                            fill='none'
                            dot={false}
                            activeDot={{ r: 3, fill: '#f59e0b', stroke: '#1e293b', strokeWidth: 2 }}
                            name='avgPrice'
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
