'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { liveYearX } from '@/lib/chartTime';
import { formatNumberWithUnit } from '@/lib/utils';
import { useMemo } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { FinancialTooltip } from './FinancialTooltip';
import {
    MONTHLY_GRID_VALUES,
    MONTHLY_X_TICKS,
    MONTH_NAMES,
    bucketDecadeMid,
    bucketYearMid,
    computeMacroMonthlyData,
    formatDecadeLabel,
    formatYearLabel,
    type EconomyPoint,
    type MacroChartPoint,
    type MacroLive,
    type Granularity,
} from './financialChartLogic';

export type { EconomyPoint };

export function PlanetMacroChart({
    data,
    granularity,
    planetId,
    currentTick,
    live,
}: {
    data: EconomyPoint[];
    granularity: Granularity;
    planetId?: string;
    currentTick: number;
    live?: MacroLive;
}) {
    const liveRow: MacroChartPoint | null = useMemo(
        () =>
            live && live.tick > 0
                ? {
                      xVal: liveYearX(live.tick),
                      year: tickToDate(live.tick).year,
                      gdp: live.gdp,
                      bankEquity: live.bankEquity,
                      moneySupply: live.moneySupply,
                      ghostGdp: null,
                      ghostBankEquity: null,
                      ghostMoneySupply: null,
                  }
                : null,
        [live],
    );

    const chartData = useMemo((): MacroChartPoint[] => {
        if (granularity === 'monthly') {
            return computeMacroMonthlyData(data, currentTick, live);
        }
        const takeLive = (rows: MacroChartPoint[]): MacroChartPoint[] => (liveRow ? [...rows, liveRow] : rows);
        if (granularity === 'yearly') {
            const sorted = [...data].sort((a, b) => a.bucket - b.bucket);
            return takeLive(
                sorted.slice(-11).map((p) => {
                    const { monthIndex } = tickToDate(p.bucket);
                    const yearMid = bucketYearMid(p.bucket);
                    return {
                        xVal: yearMid,
                        year: yearMid,
                        monthIndex,
                        gdp: p.avgGdp,
                        bankEquity: p.avgBankEquity,
                        moneySupply: p.avgMoneySupply,
                        ghostGdp: null,
                        ghostBankEquity: null,
                        ghostMoneySupply: null,
                    };
                }),
            );
        }

        return takeLive(
            data.map((p) => {
                const yearMid = bucketDecadeMid(p.bucket);
                return {
                    xVal: yearMid,
                    year: yearMid,
                    gdp: p.avgGdp,
                    bankEquity: p.avgBankEquity,
                    moneySupply: p.avgMoneySupply,
                    ghostGdp: null,
                    ghostBankEquity: null,
                    ghostMoneySupply: null,
                };
            }),
        );
    }, [data, granularity, currentTick, live, liveRow]);

    const domainCurrency = useMemo(() => {
        const vals: number[] = [];
        for (const p of chartData) {
            for (const v of [
                p.gdp,
                p.bankEquity,
                p.moneySupply,
                'ghostGdp' in p ? p.ghostGdp : null,
                'ghostBankEquity' in p ? p.ghostBankEquity : null,
                'ghostMoneySupply' in p ? p.ghostMoneySupply : null,
            ]) {
                if (v !== null && v !== undefined) {
                    vals.push(v);
                }
            }
        }
        const finite = vals.filter(Number.isFinite);
        if (finite.length === 0) {
            return [0, 0] as [number, number];
        }
        const lo = 0;
        const hi = Math.max(0, ...finite);
        if (lo === hi) {
            return [0, hi + 0.001] as [number, number];
        }
        const pad = (hi - lo) * 0.08;
        return [lo, hi + pad] as [number, number];
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
            const xMin = displayData.length > 0 ? bucketYearMid(displayData[0].bucket) : 0;
            const xMax = liveRow ? Math.max(xMin + 10, liveRow.xVal ?? xMin + 10) : xMin + 10;
            return {
                dataKey: 'xVal' as const,
                type: 'number' as const,
                domain: [xMin, xMax] as [number, number],
                ticks: Array.from({ length: 11 }, (_, i) => xMin + i),
                tickFormatter: (v: number) => String(Math.floor(v)),
                gridVertical: true,
                gridValues: Array.from({ length: 11 }, (_, i) => xMin + i),
            };
        }
        return {
            dataKey: 'xVal' as const,
            type: 'number' as const,
            domain: ['dataMin', 'dataMax'] as [string, string],
            ticks: undefined,
            tickFormatter: (v: number) => formatDecadeLabel(v),
            gridVertical: false,
            gridValues: undefined,
        };
    }, [granularity, data, liveRow]);

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
        return granularity === 'decade' ? formatDecadeLabel : formatYearLabel;
    }, [granularity, chartData]);

    return (
        <div className='flex flex-col items-start gap-1'>
            <p className='text-xs font-semibold text-muted-foreground mb-2'>Macroeconomic Indicators</p>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <AreaChart data={chartData} margin={{ top: 0, right: -20, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id='gdpGrad' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#10b981' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#10b981' stopOpacity={0.08} />
                            </linearGradient>
                            <linearGradient id='equityGrad' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#4f46e5' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#4f46e5' stopOpacity={0.08} />
                            </linearGradient>
                            <linearGradient id='moneyGrad' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor='#f59e0b' stopOpacity={0.45} />
                                <stop offset='95%' stopColor='#f59e0b' stopOpacity={0.08} />
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
                            yAxisId='left'
                            type='number'
                            domain={domainCurrency}
                            tick={{ fontSize: 10, fill: '#4f46e5' }}
                            axisLine={false}
                            tickLine={false}
                            width={56}
                            tickFormatter={(v) => formatNumberWithUnit(v as number, 'currency', planetId)}
                        />
                        <Tooltip
                            content={<FinancialTooltip labelFormatter={tooltipLabelFormatter} planetId={planetId} />}
                        />
                        <ReferenceLine
                            yAxisId='left'
                            y={0}
                            stroke='#94a3b8'
                            strokeOpacity={0.5}
                            strokeDasharray='3 3'
                        />
                        <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                        {}
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='ghostGdp'
                            stroke='#10b981'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#10b981', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='ghostBankEquity'
                            stroke='#4f46e5'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#4f46e5', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='ghostMoneySupply'
                            stroke='#f59e0b'
                            strokeWidth={1}
                            strokeOpacity={0.5}
                            strokeDasharray='4 2'
                            fill='none'
                            dot={{ r: 2, fill: '#f59e0b', fillOpacity: 0.4, stroke: 'none' }}
                            activeDot={false}
                            legendType='none'
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        {}
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='gdp'
                            name='GDP'
                            stroke='#10b981'
                            strokeWidth={2}
                            fill='url(#gdpGrad)'
                            dot={{ r: 2.5, fill: '#10b981' }}
                            activeDot={{ r: 3, fill: '#10b981', stroke: '#1e293b', strokeWidth: 2 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='bankEquity'
                            name='Bank Equity'
                            stroke='#4f46e5'
                            strokeWidth={1.5}
                            fill='url(#equityGrad)'
                            dot={{ r: 2, fill: '#4f46e5' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                        <Area
                            yAxisId='left'
                            type='monotone'
                            dataKey='moneySupply'
                            name='Money Supply'
                            stroke='#f59e0b'
                            strokeWidth={1.5}
                            fill='url(#moneyGrad)'
                            dot={{ r: 2, fill: '#f59e0b' }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
