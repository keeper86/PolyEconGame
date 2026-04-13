'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumbers } from '@/lib/utils';
import React, { useMemo } from 'react';
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
    alignedYDomains,
    bucketDecadeLabel,
    type FinancialChartPoint,
    type FinancialPoint,
    type Granularity,
    MONTHLY_GRID_VALUES,
    MONTHLY_X_TICKS,
    MONTH_NAMES,
} from './financialChartLogic';

export function BalanceFlowChart({
    data,
    ghostData,
    granularity,
}: {
    data: FinancialChartPoint[] | FinancialPoint[];
    ghostData?: FinancialChartPoint[];
    granularity: Granularity;
}) {
    const chartData = useMemo(() => {
        if (granularity === 'monthly') {
            const currentPts = data as FinancialChartPoint[];
            const ghostPts = ghostData ?? [];

            const currentByMonthIdx = new Map(currentPts.map((p) => [p.monthIdx, p]));
            const ghostByMonthIdx = new Map(ghostPts.map((p) => [p.monthIdx, p]));
            const allIdxs = new Set([...currentByMonthIdx.keys(), ...ghostByMonthIdx.keys()]);
            return Array.from(allIdxs)
                .sort((a, b) => a - b)
                .map((monthIdx) => {
                    const curr = currentByMonthIdx.get(monthIdx);
                    const ghost = ghostByMonthIdx.get(monthIdx);
                    const year = curr ? tickToDate(curr.bucket).year : ghost ? tickToDate(ghost.bucket).year : 0;
                    const netIncome = curr
                        ? curr.avgMonthlyNetIncome - (curr.avgWages + curr.sumPurchases + curr.sumClaimPayments)
                        : null;
                    const ghostNetIncome = ghost
                        ? ghost.avgMonthlyNetIncome - (ghost.avgWages + ghost.sumPurchases + ghost.sumClaimPayments)
                        : null;
                    return {
                        monthIdx,
                        year,
                        netBalance: curr?.avgNetBalance ?? null,
                        netIncome: netIncome,
                        ghostNetBalance: ghost?.avgNetBalance ?? null,
                        ghostNetIncome: ghostNetIncome,
                    };
                });
        }
        return (data as FinancialPoint[]).map((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            return {
                xVal: year + 1,
                year: year + 1,
                monthIndex,
                label: granularity === 'decade' ? bucketDecadeLabel(p.bucket) : undefined,
                netBalance: p.avgNetBalance,
                netIncome: p.avgMonthlyNetIncome - (p.avgWages + p.sumPurchases + p.sumClaimPayments),
                ghostNetBalance: null,
                ghostNetIncome: null,
            };
        });
    }, [data, ghostData, granularity]);

    const [domainBalance, domainIncome] = useMemo(() => {
        const balanceVals = chartData
            .map((p) => p.netBalance ?? p.ghostNetBalance)
            .filter((v): v is number => v !== null);
        const incomeVals = chartData.map((p) => p.netIncome ?? p.ghostNetIncome).filter((v): v is number => v !== null);
        return alignedYDomains(balanceVals, incomeVals);
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
            const yearlyPts = data as FinancialPoint[];
            const xMin = yearlyPts.length > 0 ? tickToDate(yearlyPts[0].bucket).year + 1 : 0;
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
        <Card>
            <CardContent className='px-3 pt-3 pb-2'>
                <p className='text-xs font-semibold text-muted-foreground mb-2'>Net Balance &amp; Cash Flow</p>
                <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer width='100%' height='100%'>
                        <AreaChart data={chartData} margin={{ top: 0, right: -20, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id='gradBalance2' x1='0' x2='0' y1='0' y2='1'>
                                    <stop offset='5%' stopColor='#4f46e5' stopOpacity={0.45} />
                                    <stop offset='95%' stopColor='#4f46e5' stopOpacity={0.08} />
                                </linearGradient>
                                <linearGradient id='gradIncome2' x1='0' x2='0' y1='0' y2='1'>
                                    <stop offset='5%' stopColor='#06b6d4' stopOpacity={0.45} />
                                    <stop offset='95%' stopColor='#06b6d4' stopOpacity={0.08} />
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
                                domain={domainBalance}
                                tick={{ fontSize: 10, fill: '#4f46e5' }}
                                axisLine={false}
                                tickLine={false}
                                width={56}
                                tickFormatter={(v) => formatNumbers(v as number)}
                            />
                            <YAxis
                                yAxisId='right'
                                orientation='right'
                                type='number'
                                domain={domainIncome}
                                tick={{ fontSize: 10, fill: '#06b6d4' }}
                                axisLine={false}
                                tickLine={false}
                                width={56}
                                tickFormatter={(v) => formatNumbers(v as number)}
                            />
                            <Tooltip content={<FinancialTooltip labelFormatter={tooltipLabelFormatter} />} />
                            <ReferenceLine
                                yAxisId='left'
                                y={0}
                                stroke='#94a3b8'
                                strokeOpacity={0.5}
                                strokeDasharray='3 3'
                            />
                            <ReferenceLine yAxisId='right' y={0} stroke='#94a3b8' strokeOpacity={0} />
                            <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                            <Area
                                yAxisId='left'
                                type='monotone'
                                dataKey='netBalance'
                                stroke='#4f46e5'
                                strokeWidth={2}
                                fill='url(#gradBalance2)'
                                dot={false}
                                activeDot={{ r: 3, fill: '#4f46e5', stroke: '#1e293b', strokeWidth: 2 }}
                                connectNulls={false}
                            />
                            <Area
                                yAxisId='right'
                                type='monotone'
                                dataKey='netIncome'
                                stroke='#06b6d4'
                                strokeWidth={2}
                                fill='url(#gradIncome2)'
                                dot={false}
                                activeDot={{ r: 3, fill: '#06b6d4', stroke: '#1e293b', strokeWidth: 2 }}
                                connectNulls={false}
                            />
                            <Area
                                yAxisId='left'
                                type='monotone'
                                dataKey='ghostNetBalance'
                                stroke='#4f46e5'
                                strokeWidth={1}
                                strokeOpacity={0.5}
                                strokeDasharray='4 2'
                                fill='none'
                                dot={false}
                                activeDot={false}
                                legendType='none'
                                isAnimationActive={false}
                                connectNulls={false}
                            />
                            <Area
                                yAxisId='right'
                                type='monotone'
                                dataKey='ghostNetIncome'
                                stroke='#06b6d4'
                                strokeWidth={1}
                                strokeOpacity={0.5}
                                strokeDasharray='4 2'
                                fill='none'
                                dot={false}
                                activeDot={false}
                                legendType='none'
                                isAnimationActive={false}
                                connectNulls={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
