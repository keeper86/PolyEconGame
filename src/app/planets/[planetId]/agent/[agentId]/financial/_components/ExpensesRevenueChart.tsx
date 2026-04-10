'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumbers } from '@/lib/utils';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FinancialTooltip } from './FinancialTooltip';
import {
    MONTHLY_GRID_VALUES,
    MONTHLY_X_TICKS,
    MONTH_NAMES,
    bucketDecadeLabel,
    type FinancialChartPoint,
    type FinancialPoint,
    type Granularity,
} from './financialChartLogic';

export function ExpensesRevenueChart({
    data,
    ghostData,
    granularity,
}: {
    data: FinancialChartPoint[] | FinancialPoint[];
    ghostData?: FinancialChartPoint[];
    granularity: Granularity;
}) {
    const yDomain = (vals: number[]): [number, number] | ['auto', 'auto'] => {
        const finite = vals.filter(Number.isFinite);
        if (finite.length === 0) {
            return ['auto', 'auto'];
        }
        const lo = Math.min(0, ...finite);
        const hi = Math.max(0, ...finite);
        if (lo === hi) {
            return [lo * 0.9 - 0.001, hi * 1.1 + 0.001];
        }
        const pad = (hi - lo) * 0.08;
        return [Math.max(0, lo - pad), hi + pad];
    };

    const { scale, domain, yTicks } = useMemo(() => {
        const allVals = [...data, ...(ghostData ?? [])].flatMap((p) => [
            p.avgMonthlyNetIncome,
            p.avgWages,
            p.sumPurchases,
            p.sumClaimPayments,
        ]);
        const positive = allVals.filter((v) => v > 0);
        if (positive.length >= 2) {
            const lo = Math.min(...positive);
            const hi = Math.max(...positive);
            if (hi / lo >= 10) {
                const ticks: number[] = [];
                for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
                    ticks.push(Math.pow(10, e));
                }
                return { scale: 'log' as const, domain: ['auto', 'auto'] as ['auto', 'auto'], yTicks: ticks };
            }
        }
        return { scale: 'linear' as const, domain: yDomain(allVals), yTicks: undefined };
    }, [data, ghostData]);

    const chartData = useMemo(() => {
        if (granularity === 'monthly') {
            const currentPts = data as FinancialChartPoint[];
            const ghostPts = ghostData ?? [];
            const currentByMonthIdx = new Map(currentPts.map((p) => [p.monthIdx, p]));
            const ghostByMonthIdx = new Map(ghostPts.map((p) => [p.monthIdx, p]));
            const allIdxs = new Set([...currentByMonthIdx.keys(), ...ghostByMonthIdx.keys()]);
            return Array.from(allIdxs)
                .sort((a, b) => {
                    const aIsCurrent = currentByMonthIdx.has(a);
                    const bIsCurrent = currentByMonthIdx.has(b);
                    if (aIsCurrent === bIsCurrent) {
                        return a - b;
                    }
                    return aIsCurrent ? -1 : 1;
                })
                .map((monthIdx) => {
                    const curr = currentByMonthIdx.get(monthIdx);
                    const ghost = ghostByMonthIdx.get(monthIdx);
                    const year = curr ? tickToDate(curr.bucket).year : ghost ? tickToDate(ghost.bucket).year : 0;
                    const nullIfZeroLog = (v: number | null | undefined): number | null => {
                        if (v === null || v === undefined) {
                            return null;
                        }
                        return scale === 'log' && v <= 0 ? null : v;
                    };
                    return {
                        monthIdx,
                        year,
                        revenue: nullIfZeroLog(curr ? curr.avgMonthlyNetIncome : null),
                        wages: nullIfZeroLog(curr?.avgWages ?? null),
                        purchases: nullIfZeroLog(curr?.sumPurchases ?? null),
                        claimPayments: nullIfZeroLog(curr?.sumClaimPayments ?? null),
                        ghostRevenue: nullIfZeroLog(ghost ? ghost.avgMonthlyNetIncome : null),
                        ghostWages: nullIfZeroLog(ghost?.avgWages ?? null),
                        ghostPurchases: nullIfZeroLog(ghost?.sumPurchases ?? null),
                        ghostClaimPayments: nullIfZeroLog(ghost?.sumClaimPayments ?? null),
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
                revenue: scale === 'log' && p.avgMonthlyNetIncome <= 0 ? null : p.avgMonthlyNetIncome,
                wages: scale === 'log' && p.avgWages <= 0 ? null : p.avgWages,
                purchases: scale === 'log' && p.sumPurchases <= 0 ? null : p.sumPurchases,
                claimPayments: scale === 'log' && p.sumClaimPayments <= 0 ? null : p.sumClaimPayments,
                ghostRevenue: null,
                ghostWages: null,
                ghostPurchases: null,
                ghostClaimPayments: null,
            };
        });
    }, [data, ghostData, granularity, scale]);

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
                <p className='text-xs font-semibold text-muted-foreground mb-2'>Expenses &amp; Revenue</p>
                <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer width='100%' height='100%'>
                        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                            <defs>
                                <linearGradient id='gradRevenue' x1='0' x2='0' y1='0' y2='1'>
                                    <stop offset='5%' stopColor='#10b981' stopOpacity={0.45} />
                                    <stop offset='95%' stopColor='#10b981' stopOpacity={0.08} />
                                </linearGradient>
                                <linearGradient id='gradWages' x1='0' x2='0' y1='0' y2='1'>
                                    <stop offset='5%' stopColor='#ef4444' stopOpacity={0.5} />
                                    <stop offset='95%' stopColor='#ef4444' stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id='gradPurchases' x1='0' x2='0' y1='0' y2='1'>
                                    <stop offset='5%' stopColor='#f59e0b' stopOpacity={0.5} />
                                    <stop offset='95%' stopColor='#f59e0b' stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id='gradClaims' x1='0' x2='0' y1='0' y2='1'>
                                    <stop offset='5%' stopColor='#8b5cf6' stopOpacity={0.5} />
                                    <stop offset='95%' stopColor='#8b5cf6' stopOpacity={0.1} />
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
                                scale={scale}
                                domain={domain}
                                allowDataOverflow
                                ticks={yTicks}
                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                axisLine={false}
                                tickLine={false}
                                width={56}
                                tickFormatter={(v) => formatNumbers(v as number)}
                            />
                            <Tooltip content={<FinancialTooltip labelFormatter={tooltipLabelFormatter} />} />
                            <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                            <Area
                                type='monotone'
                                dataKey='wages'
                                stroke='#ef4444'
                                strokeWidth={1.5}
                                fill='url(#gradWages)'
                                dot={false}
                                activeDot={{ r: 3 }}
                                connectNulls={false}
                            />
                            <Area
                                type='monotone'
                                dataKey='purchases'
                                stroke='#f59e0b'
                                strokeWidth={1.5}
                                fill='url(#gradPurchases)'
                                dot={false}
                                activeDot={{ r: 3 }}
                                connectNulls={false}
                            />
                            <Area
                                type='monotone'
                                dataKey='claimPayments'
                                stroke='#8b5cf6'
                                strokeWidth={1.5}
                                fill='url(#gradClaims)'
                                dot={false}
                                activeDot={{ r: 3 }}
                                connectNulls={false}
                            />
                            <Area
                                type='monotone'
                                dataKey='revenue'
                                stroke='#10b981'
                                strokeWidth={2}
                                fill='url(#gradRevenue)'
                                dot={false}
                                activeDot={{ r: 3, fill: '#10b981', stroke: '#1e293b', strokeWidth: 2 }}
                                connectNulls={false}
                            />
                            <Area
                                type='monotone'
                                dataKey='ghostWages'
                                stroke='#ef4444'
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
                                type='monotone'
                                dataKey='ghostPurchases'
                                stroke='#f59e0b'
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
                                type='monotone'
                                dataKey='ghostClaimPayments'
                                stroke='#8b5cf6'
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
                                type='monotone'
                                dataKey='ghostRevenue'
                                stroke='#10b981'
                                strokeWidth={1.5}
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
