'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { liveYearX } from '@/lib/chartTime';
import {
    blendLive,
    bucketProgress,
    decadeStart,
    decadeWindowAxis,
    formatMonthLabel,
    yearStart,
    yearWindowAxis,
} from '@/lib/historyChartAxis';
import { formatNumberWithUnit } from '@/lib/utils';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FinancialTooltip } from './FinancialTooltip';
import {
    MONTHLY_GRID_VALUES,
    MONTHLY_X_TICKS,
    MONTH_NAMES,
    bucketDecadeMid,
    bucketYearMid,
    computeCostOfLivingMonthlyData,
    decadeDisplayRows,
    formatDecadeLabel,
    formatYearLabel,
    raiseWagesMonotone,
    type CostOfLivingChartPoint,
    type CostOfLivingLive,
    type CostOfLivingPoint,
    type Granularity,
} from './financialChartLogic';

export type { CostOfLivingPoint };

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
    live,
}: {
    data: CostOfLivingPoint[];
    granularity: Granularity;
    planetId?: string;
    currentTick: number;
    live?: CostOfLivingLive;
}) {
    const liveRow = useMemo(
        () =>
            live && live.tick > 0
                ? (() => {
                      const [wageEdu0, wageEdu1, wageEdu2, wageEdu3] = raiseWagesMonotone([
                          live.wageEdu0,
                          live.wageEdu1,
                          live.wageEdu2,
                          live.wageEdu3,
                      ]);
                      return {
                          xVal: liveYearX(live.tick),
                          year: tickToDate(live.tick).year,
                          costOfLiving: live.costOfLiving,
                          costOfLivingRich: live.costOfLivingRich,
                          costOfLivingRichDiff: live.costOfLivingRich - live.costOfLiving,
                          wageEdu0,
                          wageEdu1,
                          wageEdu2,
                          wageEdu3,
                      };
                  })()
                : null,
        [live],
    );

    const decadeDisplayData = useMemo(() => decadeDisplayRows(data), [data]);

    const chartData = useMemo((): CostOfLivingChartPoint[] => {
        if (granularity === 'monthly') {
            return computeCostOfLivingMonthlyData(data, currentTick, live);
        }
        const takeLive = (rows: CostOfLivingChartPoint[]): CostOfLivingChartPoint[] => {
            if (!liveRow || !live) {
                return rows;
            }
            const previous = rows[rows.length - 1];
            const progress = bucketProgress(live.tick, granularity);
            return [
                ...rows,
                {
                    ...liveRow,
                    costOfLiving: blendLive(previous?.costOfLiving ?? undefined, liveRow.costOfLiving, progress),
                    costOfLivingRich: blendLive(
                        previous?.costOfLivingRich ?? undefined,
                        liveRow.costOfLivingRich,
                        progress,
                    ),
                    costOfLivingRichDiff: blendLive(
                        previous?.costOfLivingRichDiff ?? undefined,
                        liveRow.costOfLivingRichDiff,
                        progress,
                    ),
                    wageEdu0: blendLive(previous?.wageEdu0 ?? undefined, liveRow.wageEdu0, progress),
                    wageEdu1: blendLive(previous?.wageEdu1 ?? undefined, liveRow.wageEdu1, progress),
                    wageEdu2: blendLive(previous?.wageEdu2 ?? undefined, liveRow.wageEdu2, progress),
                    wageEdu3: blendLive(previous?.wageEdu3 ?? undefined, liveRow.wageEdu3, progress),
                },
            ];
        };
        if (granularity === 'yearly') {
            const sorted = [...data].sort((a, b) => a.bucket - b.bucket);
            return takeLive(
                sorted.slice(-11).map((p) => {
                    const { monthIndex } = tickToDate(p.bucket);
                    const yearMid = bucketYearMid(p.bucket);
                    const [wageEdu0, wageEdu1, wageEdu2, wageEdu3] = raiseWagesMonotone([
                        p.avgWageEdu0,
                        p.avgWageEdu1,
                        p.avgWageEdu2,
                        p.avgWageEdu3,
                    ]);
                    return {
                        xVal: yearMid,
                        year: yearMid,
                        monthIndex,
                        costOfLiving: p.avgCostOfLiving,
                        costOfLivingRich: p.avgCostOfLivingRich,
                        costOfLivingRichDiff: p.avgCostOfLivingRich - p.avgCostOfLiving,
                        wageEdu0,
                        wageEdu1,
                        wageEdu2,
                        wageEdu3,
                    };
                }),
            );
        }

        return takeLive(
            decadeDisplayData.map((p) => {
                const yearMid = bucketDecadeMid(p.bucket);
                const [wageEdu0, wageEdu1, wageEdu2, wageEdu3] = raiseWagesMonotone([
                    p.avgWageEdu0,
                    p.avgWageEdu1,
                    p.avgWageEdu2,
                    p.avgWageEdu3,
                ]);
                return {
                    xVal: yearMid,
                    year: yearMid,
                    costOfLiving: p.avgCostOfLiving,
                    costOfLivingRich: p.avgCostOfLivingRich,
                    costOfLivingRichDiff: p.avgCostOfLivingRich - p.avgCostOfLiving,
                    wageEdu0,
                    wageEdu1,
                    wageEdu2,
                    wageEdu3,
                };
            }),
        );
    }, [data, granularity, currentTick, live, liveRow, decadeDisplayData]);

    const domain = useMemo(() => {
        const allVals: number[] = [];
        for (const p of chartData) {
            for (const v of [
                p.costOfLiving,
                p.costOfLivingRich,
                'costOfLivingRichDiff' in p
                    ? (p as { costOfLivingRichDiff: number | null }).costOfLivingRichDiff
                    : null,
                p.wageEdu0,
                p.wageEdu1,
                p.wageEdu2,
                p.wageEdu3,
                'ghostCostOfLiving' in p ? (p as CostOfLivingChartPoint).ghostCostOfLiving : null,
                'ghostCostOfLivingRich' in p ? (p as CostOfLivingChartPoint).ghostCostOfLivingRich : null,
                'ghostCostOfLivingRichDiff' in p ? (p as CostOfLivingChartPoint).ghostCostOfLivingRichDiff : null,
                'ghostWageEdu0' in p ? (p as CostOfLivingChartPoint).ghostWageEdu0 : null,
                'ghostWageEdu1' in p ? (p as CostOfLivingChartPoint).ghostWageEdu1 : null,
                'ghostWageEdu2' in p ? (p as CostOfLivingChartPoint).ghostWageEdu2 : null,
                'ghostWageEdu3' in p ? (p as CostOfLivingChartPoint).ghostWageEdu3 : null,
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
            const displayData = sorted.slice(-11);
            const axis = yearWindowAxis(
                displayData.length > 0 ? yearStart(displayData[0].bucket) : undefined,
                liveRow?.xVal,
            );
            return {
                dataKey: 'xVal' as const,
                type: 'number' as const,
                domain: axis.domain,
                ticks: axis.ticks,
                tickFormatter: axis.tickFormatter,
                gridVertical: true,
                gridValues: axis.gridValues,
            };
        }
        const lastDecadeX =
            decadeDisplayData.length > 0
                ? bucketDecadeMid(decadeDisplayData[decadeDisplayData.length - 1].bucket)
                : undefined;
        const decade = decadeWindowAxis(
            decadeDisplayData.length > 0 ? decadeStart(decadeDisplayData[0].bucket) : undefined,
            liveRow?.xVal ?? lastDecadeX,
        );
        return {
            dataKey: 'xVal' as const,
            type: 'number' as const,
            domain: decade.domain,
            ticks: decade.ticks,
            tickFormatter: decade.tickFormatter,
            gridVertical: true,
            gridValues: decade.gridValues,
        };
    }, [granularity, data, decadeDisplayData, liveRow]);

    const tooltipLabelFormatter = useMemo(() => {
        if (granularity === 'monthly') {
            const byMonthIdx = new Map(
                chartData
                    .filter((p): p is { monthIdx: number; year: number } & typeof p => 'monthIdx' in p)
                    .map((p) => [p.monthIdx, formatMonthLabel(p.monthIdx, p.year)]),
            );
            return (label: number) => byMonthIdx.get(label) ?? '';
        }
        return granularity === 'decade' ? formatDecadeLabel : formatYearLabel;
    }, [granularity, chartData]);

    return (
        <div className='flex flex-col items-start gap-1'>
            <p className='text-xs font-semibold text-muted-foreground mb-2'>Cost of Living & Wages</p>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                        <defs>
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
                            allowDataOverflow={granularity === 'monthly'}
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

                        <Area
                            type='monotone'
                            dataKey='ghostCostOfLiving'
                            stroke='#ef4444'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            stackId='ghostColStack'
                            legendType='none'
                            dot={{ r: 2, fill: '#ef4444', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='ghostCostOfLivingRichDiff'
                            stroke='#ef4444'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            stackId='ghostColStack'
                            legendType='none'
                            dot={{ r: 2, fill: '#ef4444', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
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

                        <Area
                            type='monotone'
                            dataKey='costOfLiving'
                            name='Cost of Living'
                            stroke='#ef4444'
                            strokeWidth={2}
                            fill='#ef4444'
                            fillOpacity={0.08}
                            stackId='colStack'
                            legendType='none'
                            dot={{ r: 2.5, fill: '#ef4444' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='costOfLivingRichDiff'
                            name='Cost of Living'
                            stroke='#ef4444'
                            strokeWidth={2}
                            fill='url(#colRichGrad)'
                            stackId='colStack'
                            dot={{ r: 2.5, fill: '#ef4444' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            type='monotone'
                            dataKey='wageEdu0'
                            name='Wage None'
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
                            name='Wage Primary'
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
                            name='Wage Secondary'
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
                            name='Wage Tertiary'
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
