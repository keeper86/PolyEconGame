'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { Card, CardContent } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { TICKS_PER_YEAR } from '@/simulation/constants';
import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Granularity = 'monthly' | 'yearly' | 'decade';

type FinancialPoint = {
    bucket: number;
    avgNetBalance: number;
    avgMonthlyNetIncome: number;
    avgWages: number;
    sumPurchases: number;
    sumClaimPayments: number;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHLY_X_TICKS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5];
const MONTHLY_GRID_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function GranularityButton({
    active,
    disabled,
    onClick,
    children,
}: {
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={[
                'px-2 py-0.5 rounded text-[11px] transition-colors',
                active
                    ? 'bg-slate-600 text-slate-100'
                    : disabled
                      ? 'text-slate-600 cursor-not-allowed'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

function bucketDecadeLabel(bucket: number): string {
    const { year } = tickToDate(bucket);
    return `${year}s`;
}

function yDomain(vals: number[]): [number, number] | ['auto', 'auto'] {
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
    return [lo - pad, hi + pad];
}

function ExpensesRevenueChart({ data, granularity }: { data: FinancialPoint[]; granularity: Granularity }) {
    const chartData = useMemo(
        () =>
            data.map((p) => {
                const { year, monthIndex } = tickToDate(p.bucket);
                return {
                    xVal: granularity === 'monthly' ? monthIndex + 1 : granularity === 'yearly' ? year : year,
                    year,
                    monthIndex,
                    label: granularity === 'decade' ? bucketDecadeLabel(p.bucket) : undefined,
                    revenue: p.avgMonthlyNetIncome + p.avgWages + p.sumPurchases + p.sumClaimPayments,
                    wages: p.avgWages,
                    purchases: p.sumPurchases,
                    claimPayments: p.sumClaimPayments,
                };
            }),
        [data, granularity],
    );

    const domain = useMemo(
        () =>
            yDomain(
                data.flatMap((p) => [
                    p.avgMonthlyNetIncome,
                    p.avgWages,
                    p.sumPurchases,
                    p.sumClaimPayments,
                    p.avgMonthlyNetIncome + p.avgWages + p.sumPurchases + p.sumClaimPayments,
                ]),
            ),
        [data],
    );

    const xAxisProps = useMemo(() => {
        if (granularity === 'monthly') {
            return {
                type: 'number' as const,
                domain: [0, 12] as [number, number],
                ticks: MONTHLY_X_TICKS,
                tickFormatter: (v: number) => MONTH_NAMES[(Math.ceil(v) % 12)] ?? '',
                gridVertical: true,
                gridValues: MONTHLY_GRID_VALUES,
            };
        }
        if (granularity === 'yearly') {
            const xMin = chartData.length > 0 ? chartData[0].xVal : 0;
            return {
                type: 'number' as const,
                domain: [xMin, xMin + 10] as [number, number],
                ticks: Array.from({ length: 10 }, (_, i) => xMin + i + 0.5),
                tickFormatter: (v: number) => String(Math.floor(v)),
                gridVertical: true,
                gridValues: Array.from({ length: 11 }, (_, i) => xMin + i),
            };
        }
        return { type: 'category' as const, domain: undefined, ticks: undefined, tickFormatter: undefined, gridVertical: false, gridValues: undefined };
    }, [granularity, chartData]);

    const tooltipLabelFormatter = useMemo(() => {
        if (granularity === 'monthly') {
            const byMonthIdx = new Map(chartData.map((p) => [p.xVal, `${MONTH_NAMES[p.monthIndex]} ${p.year}`]));
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
                                dataKey={granularity === 'decade' ? 'label' : 'xVal'}
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
                                tickFormatter={(v) => formatNumbers(v as number)}
                            />
                            <Tooltip
                                contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 12 }}
                                labelStyle={{ color: '#94a3b8' }}
                                itemStyle={{ color: '#e2e8f0' }}
                                formatter={(v) => formatNumbers(v as number)}
                                labelFormatter={tooltipLabelFormatter}
                            />
                            <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                            <Area
                                type='monotone'
                                dataKey='wages'
                                stackId='expenses'
                                stroke='#ef4444'
                                strokeWidth={1.5}
                                fill='url(#gradWages)'
                                dot={false}
                                activeDot={{ r: 3 }}
                            />
                            <Area
                                type='monotone'
                                dataKey='purchases'
                                stackId='expenses'
                                stroke='#f59e0b'
                                strokeWidth={1.5}
                                fill='url(#gradPurchases)'
                                dot={false}
                                activeDot={{ r: 3 }}
                            />
                            <Area
                                type='monotone'
                                dataKey='claimPayments'
                                stackId='expenses'
                                stroke='#8b5cf6'
                                strokeWidth={1.5}
                                fill='url(#gradClaims)'
                                dot={false}
                                activeDot={{ r: 3 }}
                            />
                            <Area
                                type='monotone'
                                dataKey='revenue'
                                stroke='#10b981'
                                strokeWidth={2}
                                fill='url(#gradRevenue)'
                                dot={false}
                                activeDot={{ r: 3, fill: '#10b981', stroke: '#1e293b', strokeWidth: 2 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

function BalanceFlowChart({ data, granularity }: { data: FinancialPoint[]; granularity: Granularity }) {
    const chartData = useMemo(
        () =>
            data.map((p) => {
                const { year, monthIndex } = tickToDate(p.bucket);
                return {
                    xVal: granularity === 'monthly' ? monthIndex + 1 : year,
                    year,
                    monthIndex,
                    label: granularity === 'decade' ? bucketDecadeLabel(p.bucket) : undefined,
                    netBalance: p.avgNetBalance,
                    netIncome: p.avgMonthlyNetIncome,
                };
            }),
        [data, granularity],
    );

    const domainBalance = useMemo(() => yDomain(data.map((p) => p.avgNetBalance)), [data]);
    const domainIncome = useMemo(() => yDomain(data.map((p) => p.avgMonthlyNetIncome)), [data]);

    const xAxisProps = useMemo(() => {
        if (granularity === 'monthly') {
            return {
                type: 'number' as const,
                domain: [0, 12] as [number, number],
                ticks: MONTHLY_X_TICKS,
                tickFormatter: (v: number) => MONTH_NAMES[(Math.ceil(v) % 12)] ?? '',
                gridVertical: true,
                gridValues: MONTHLY_GRID_VALUES,
            };
        }
        if (granularity === 'yearly') {
            const xMin = chartData.length > 0 ? chartData[0].xVal : 0;
            return {
                type: 'number' as const,
                domain: [xMin, xMin + 10] as [number, number],
                ticks: Array.from({ length: 10 }, (_, i) => xMin + i + 0.5),
                tickFormatter: (v: number) => String(Math.floor(v)),
                gridVertical: true,
                gridValues: Array.from({ length: 11 }, (_, i) => xMin + i),
            };
        }
        return { type: 'category' as const, domain: undefined, ticks: undefined, tickFormatter: undefined, gridVertical: false, gridValues: undefined };
    }, [granularity, chartData]);

    const tooltipLabelFormatter = useMemo(() => {
        if (granularity === 'monthly') {
            const byMonthIdx = new Map(chartData.map((p) => [p.xVal, `${MONTH_NAMES[p.monthIndex]} ${p.year}`]));
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
                        <AreaChart data={chartData} margin={{ top: 0, right: 56, left: -10, bottom: 0 }}>
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
                                dataKey={granularity === 'decade' ? 'label' : 'xVal'}
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
                            <Tooltip
                                contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 12 }}
                                labelStyle={{ color: '#94a3b8' }}
                                itemStyle={{ color: '#e2e8f0' }}
                                formatter={(v) => formatNumbers(v as number)}
                                labelFormatter={tooltipLabelFormatter}
                            />
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
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

export default function AgentFinancialCharts({ agentId }: { agentId: string }) {
    const trpc = useTRPC();
    const [granularity, setGranularity] = useState<Granularity>('monthly');

    const { data: monthlyData, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getAgentFinancialHistory.queryOptions(
            { agentId, granularity: 'monthly', limit: 13 },
            { enabled: granularity === 'monthly' },
        ),
    );
    const { data: yearlyData, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getAgentFinancialHistory.queryOptions(
            { agentId, granularity: 'yearly', limit: 11 },
            { enabled: granularity === 'yearly' },
        ),
    );
    const { data: decadeData, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getAgentFinancialHistory.queryOptions(
            { agentId, granularity: 'decade', limit: 100 },
            { enabled: granularity === 'decade' },
        ),
    );
    const currentTickData = useSimulationQuery(trpc.simulation.getCurrentTick.queryOptions());

    const currentTick = currentTickData?.data?.tick ?? 0;
    const foundedTick = monthlyData?.foundedTick ?? yearlyData?.foundedTick ?? decadeData?.foundedTick ?? 0;
    const ticksElapsed = currentTick - foundedTick;
    const showYearly = ticksElapsed >= 2 * TICKS_PER_YEAR;
    const showDecade = ticksElapsed >= 11 * TICKS_PER_YEAR;

    const isLoading =
        (granularity === 'monthly' && loadingMonthly) ||
        (granularity === 'yearly' && loadingYearly) ||
        (granularity === 'decade' && loadingDecade);

    const activeData: FinancialPoint[] =
        granularity === 'monthly'
            ? (monthlyData?.history ?? [])
            : granularity === 'yearly'
              ? (yearlyData?.history ?? [])
              : (decadeData?.history ?? []);

    function selectGranularity(g: Granularity) {
        if (g === 'yearly' && !showYearly) {
            return;
        }
        if (g === 'decade' && !showDecade) {
            return;
        }
        setGranularity(g);
    }

    return (
        <div className='space-y-4'>
            <div className='flex gap-1 items-center'>
                <span className='text-xs text-muted-foreground mr-1'>Granularity:</span>
                <GranularityButton active={granularity === 'monthly'} onClick={() => selectGranularity('monthly')}>
                    Monthly
                </GranularityButton>
                <GranularityButton
                    active={granularity === 'yearly'}
                    disabled={!showYearly}
                    onClick={() => selectGranularity('yearly')}
                >
                    Yearly
                </GranularityButton>
                <GranularityButton
                    active={granularity === 'decade'}
                    disabled={!showDecade}
                    onClick={() => selectGranularity('decade')}
                >
                    Decade
                </GranularityButton>
            </div>
            <div
                className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : ''}`}
            >
                <ExpensesRevenueChart data={activeData} granularity={granularity} />
                <BalanceFlowChart data={activeData} granularity={granularity} />
            </div>
        </div>
    );
}
