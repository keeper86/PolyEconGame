'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { formatNumberWithUnit } from '@/lib/utils';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FinancialTooltip } from './FinancialTooltip';
import {
    MONTHLY_GRID_VALUES,
    MONTHLY_X_TICKS,
    MONTH_NAMES,
    bucketDecadeLabel,
    type Granularity,
} from './financialChartLogic';

export type CostOfLivingPoint = {
    bucket: number;
    avgCostOfLiving: number;
    avgCostOfLivingRich: number;
    avgWageEdu0: number;
    avgWageEdu1: number;
    avgWageEdu2: number;
    avgWageEdu3: number;
};

type ChartPoint = {
    monthIdx?: number;
    year: number;
    xVal?: number;
    label?: string;
    costOfLiving: number | null;
    costOfLivingRich: number | null;
    wageEdu0: number | null;
    wageEdu1: number | null;
    wageEdu2: number | null;
    wageEdu3: number | null;
    /** Ghost-prefixed fields for last-year comparison */
    ghostCostOfLiving?: number | null;
    ghostCostOfLivingRich?: number | null;
    ghostWageEdu0?: number | null;
    ghostWageEdu1?: number | null;
    ghostWageEdu2?: number | null;
    ghostWageEdu3?: number | null;
};

function computeMonthlyData(data: CostOfLivingPoint[], currentTick: number): ChartPoint[] {
    if (data.length === 0 || currentTick === 0) {
        return [];
    }
    const sorted = [...data].sort((a, b) => a.bucket - b.bucket);
    const latestYear = tickToDate(currentTick).year;

    function toCP(p: CostOfLivingPoint, idx: number, ghost: boolean): ChartPoint {
        const base = ghost ? null : p.avgCostOfLiving;
        const baseRich = ghost ? null : p.avgCostOfLivingRich;
        const w0 = ghost ? null : p.avgWageEdu0;
        const w1 = ghost ? null : p.avgWageEdu1;
        const w2 = ghost ? null : p.avgWageEdu2;
        const w3 = ghost ? null : p.avgWageEdu3;
        const gBase = ghost ? p.avgCostOfLiving : null;
        const gBaseRich = ghost ? p.avgCostOfLivingRich : null;
        const gw0 = ghost ? p.avgWageEdu0 : null;
        const gw1 = ghost ? p.avgWageEdu1 : null;
        const gw2 = ghost ? p.avgWageEdu2 : null;
        const gw3 = ghost ? p.avgWageEdu3 : null;
        return {
            monthIdx: idx,
            year: tickToDate(p.bucket).year,
            costOfLiving: base,
            costOfLivingRich: baseRich,
            wageEdu0: w0,
            wageEdu1: w1,
            wageEdu2: w2,
            wageEdu3: w3,
            ghostCostOfLiving: gBase,
            ghostCostOfLivingRich: gBaseRich,
            ghostWageEdu0: gw0,
            ghostWageEdu1: gw1,
            ghostWageEdu2: gw2,
            ghostWageEdu3: gw3,
        };
    }

    // Current year points with monthIdx
    const current: ChartPoint[] = [];
    for (const p of sorted) {
        if (tickToDate(p.bucket).year === latestYear) {
            current.push(toCP(p, tickToDate(p.bucket).monthIndex + 1, false));
        }
    }

    // Anchor at monthIdx=0 (previous December)
    const prevDecPoint = sorted.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });
    if (prevDecPoint) {
        current.unshift(toCP(prevDecPoint, 0, false));
    } else {
        const lastBefore = [...sorted].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBefore) {
            current.unshift(toCP(lastBefore, 0, false));
        }
    }

    // Ghost data: same months from last year not yet reached
    const { monthIndex: currentMonthIndex } = tickToDate(currentTick);
    const currentMonthIdx = currentMonthIndex + 1;
    const ghostPoints = sorted
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            return year === latestYear - 1 && monthIndex + 1 >= currentMonthIdx;
        })
        .map((p) => toCP(p, tickToDate(p.bucket).monthIndex + 1, true));

    // Merge
    const currentByMonth = new Map(current.map((p) => [p.monthIdx!, p]));
    const ghostByMonth = new Map(ghostPoints.map((p) => [p.monthIdx!, p]));
    const allIdxs = new Set([...currentByMonth.keys(), ...ghostByMonth.keys()]);

    const merged: ChartPoint[] = [];
    for (const monthIdx of [...allIdxs].sort((a, b) => a - b)) {
        const curr = currentByMonth.get(monthIdx);
        const ghost = ghostByMonth.get(monthIdx);
        merged.push(curr ?? ghost!);
    }

    return merged;
}

const yDomain = (vals: number[]): [number, number] | ['auto', 'auto'] => {
    const finite = vals.filter(Number.isFinite);
    if (finite.length === 0) {
        return ['auto', 'auto'];
    }
    const lo = Math.min(...finite);
    const hi = Math.max(...finite);
    if (lo === hi) {
        return [lo * 0.9 - 0.001, hi * 1.1 + 0.001];
    }
    const pad = (hi - lo) * 0.08;
    return [Math.max(0, lo - pad), hi + pad];
};

const WAGE_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef'] as const;

export function PlanetCostOfLivingChart({
    data,
    granularity,
    planetId,
    currentTick,
}: {
    data: CostOfLivingPoint[];
    granularity: Granularity;
    planetId?: string;
    currentTick: number;
}) {
    const chartData = useMemo(() => {
        if (granularity === 'monthly') {
            return computeMonthlyData(data, currentTick);
        }
        if (granularity === 'yearly') {
            const sorted = [...data].sort((a, b) => a.bucket - b.bucket);
            return sorted.slice(-11).map((p) => {
                const { year, monthIndex } = tickToDate(p.bucket);
                return {
                    xVal: year + 1,
                    year: year + 1,
                    monthIndex,
                    costOfLiving: p.avgCostOfLiving,
                    costOfLivingRich: p.avgCostOfLivingRich,
                    wageEdu0: p.avgWageEdu0,
                    wageEdu1: p.avgWageEdu1,
                    wageEdu2: p.avgWageEdu2,
                    wageEdu3: p.avgWageEdu3,
                };
            });
        }
        // decade
        return data.map((p) => {
            const { year } = tickToDate(p.bucket);
            return {
                label: bucketDecadeLabel(p.bucket),
                year,
                costOfLiving: p.avgCostOfLiving,
                costOfLivingRich: p.avgCostOfLivingRich,
                wageEdu0: p.avgWageEdu0,
                wageEdu1: p.avgWageEdu1,
                wageEdu2: p.avgWageEdu2,
                wageEdu3: p.avgWageEdu3,
            };
        });
    }, [data, granularity, currentTick]);

    const domain = useMemo(() => {
        const allVals: number[] = [];
        for (const p of chartData) {
            for (const v of [
                p.costOfLiving,
                p.costOfLivingRich,
                p.wageEdu0,
                p.wageEdu1,
                p.wageEdu2,
                p.wageEdu3,
                'ghostCostOfLiving' in p ? (p as ChartPoint).ghostCostOfLiving : null,
                'ghostCostOfLivingRich' in p ? (p as ChartPoint).ghostCostOfLivingRich : null,
                'ghostWageEdu0' in p ? (p as ChartPoint).ghostWageEdu0 : null,
                'ghostWageEdu1' in p ? (p as ChartPoint).ghostWageEdu1 : null,
                'ghostWageEdu2' in p ? (p as ChartPoint).ghostWageEdu2 : null,
                'ghostWageEdu3' in p ? (p as ChartPoint).ghostWageEdu3 : null,
            ]) {
                if (v !== null && v !== undefined) {
                    allVals.push(v);
                }
            }
        }
        return yDomain(allVals);
    }, [chartData]);

    const xAxisProps = useMemo(() => {
        if (granularity === 'monthly') {
            return {
                dataKey: 'monthIdx' as const,
                type: 'number' as const,
                domain: [0, 12] as [number, number],
                ticks: MONTHLY_X_TICKS,
                tickFormatter: (v: number) => MONTH_NAMES[(Math.ceil(v) + 11) % 12] ?? '',
                gridVertical: true,
                gridValues: MONTHLY_GRID_VALUES,
            };
        }
        if (granularity === 'yearly') {
            const sorted = [...data].sort((a, b) => a.bucket - b.bucket);
            const xMin = sorted.length > 0 ? tickToDate(sorted[0].bucket).year + 1 : 0;
            return {
                dataKey: 'xVal' as const,
                type: 'number' as const,
                domain: [xMin, xMin + 10] as [number, number],
                ticks: Array.from({ length: 10 }, (_, i) => xMin + i + 0.5),
                tickFormatter: (v: number) => String(Math.floor(v)),
                gridVertical: true,
                gridValues: Array.from({ length: 11 }, (_, i) => xMin + i),
            };
        }
        return {
            dataKey: 'label' as const,
            type: 'category' as const,
            domain: undefined,
            ticks: undefined,
            tickFormatter: undefined,
            gridVertical: false,
            gridValues: undefined,
        };
    }, [granularity, data]);

    const tooltipLabelFormatter = useMemo(() => {
        if (granularity === 'monthly') {
            const byMonthIdx = new Map(
                chartData
                    .filter((p): p is { monthIdx: number; year: number } & typeof p => 'monthIdx' in p)
                    .map((p) => [
                        p.monthIdx,
                        p.monthIdx === 0 ? 'Previous December' : `${MONTH_NAMES[p.monthIdx - 1] ?? ''} ${p.year}`,
                    ]),
            );
            return (label: number) => byMonthIdx.get(label) ?? '';
        }
        if (granularity === 'yearly') {
            return (label: number) => String(Math.floor(label));
        }
        return undefined;
    }, [granularity, chartData]);

    return (
        <div className='flex flex-col items-start gap-1'>
            <p className='text-xs font-semibold text-muted-foreground mb-2'>Cost of Living & Wages</p>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                        <defs>
                            <linearGradient id='colGrad' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#ef4444' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#ef4444' stopOpacity={0.08} />
                            </linearGradient>
                            <linearGradient id='colRichGrad' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#f97316' stopOpacity={0.35} />
                                <stop offset='95%' stopColor='#f97316' stopOpacity={0.05} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            vertical={xAxisProps.gridVertical}
                            horizontal={false}
                            verticalValues={xAxisProps.gridValues}
                            stroke='#334155'
                            strokeOpacity={xAxisProps.gridVertical ? 0.7 : 1}
                        />
                        <XAxis
                            dataKey={xAxisProps.dataKey}
                            type={xAxisProps.type}
                            domain={xAxisProps.domain}
                            ticks={xAxisProps.ticks}
                            tickFormatter={xAxisProps.tickFormatter}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            axisLine={{ stroke: '#334155' }}
                            tickLine={false}
                            minTickGap={xAxisProps.ticks ? 0 : 36}
                        />
                        <YAxis
                            type='number'
                            domain={domain}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                            width={56}
                            tickFormatter={(v) => formatNumberWithUnit(v as number, 'currency', planetId)}
                        />
                        <Tooltip
                            content={<FinancialTooltip labelFormatter={tooltipLabelFormatter} planetId={planetId} />}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                        {/* Ghost lines */}
                        <Area
                            type='monotone'
                            dataKey='ghostCostOfLiving'
                            stroke='#ef4444'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#ef4444', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='ghostCostOfLivingRich'
                            stroke='#f97316'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#f97316', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='ghostWageEdu0'
                            stroke={WAGE_COLORS[0]}
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: WAGE_COLORS[0], fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='ghostWageEdu1'
                            stroke={WAGE_COLORS[1]}
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: WAGE_COLORS[1], fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='ghostWageEdu2'
                            stroke={WAGE_COLORS[2]}
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: WAGE_COLORS[2], fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='ghostWageEdu3'
                            stroke={WAGE_COLORS[3]}
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: WAGE_COLORS[3], fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        {/* Main series */}
                        <Area
                            type='monotone'
                            dataKey='costOfLiving'
                            name='Cost of Living'
                            stroke='#ef4444'
                            strokeWidth={2}
                            fill='url(#colGrad)'
                            dot={{ r: 2.5, fill: '#ef4444' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='costOfLivingRich'
                            name='Cost of Living (Rich)'
                            stroke='#f97316'
                            strokeWidth={1.5}
                            strokeDasharray='4 2'
                            fill='url(#colRichGrad)'
                            dot={{ r: 2, fill: '#f97316' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='wageEdu0'
                            name='Wage (None)'
                            stroke={WAGE_COLORS[0]}
                            strokeWidth={1.5}
                            fill='none'
                            dot={{ r: 1.5, fill: WAGE_COLORS[0] }}
                            activeDot={{ r: 2.5 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='wageEdu1'
                            name='Wage (Primary)'
                            stroke={WAGE_COLORS[1]}
                            strokeWidth={1.5}
                            fill='none'
                            dot={{ r: 1.5, fill: WAGE_COLORS[1] }}
                            activeDot={{ r: 2.5 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='wageEdu2'
                            name='Wage (Secondary)'
                            stroke={WAGE_COLORS[2]}
                            strokeWidth={1.5}
                            fill='none'
                            dot={{ r: 1.5, fill: WAGE_COLORS[2] }}
                            activeDot={{ r: 2.5 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='wageEdu3'
                            name='Wage (Tertiary)'
                            stroke={WAGE_COLORS[3]}
                            strokeWidth={1.5}
                            fill='none'
                            dot={{ r: 1.5, fill: WAGE_COLORS[3] }}
                            activeDot={{ r: 2.5 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
