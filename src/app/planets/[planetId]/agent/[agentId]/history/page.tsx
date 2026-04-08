'use client';

import { AgentAccessGuard } from '@/app/planets/[planetId]/agent/_component/AgentAccessGuard';
import { useAgentPlanetDetail } from '@/app/planets/[planetId]/agent/_component/useAgentPlanetDetail';
import { Card, CardContent } from '@/components/ui/card';
import { tickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { START_YEAR, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Granularity = 'monthly' | 'yearly' | 'decade';

type HistoryPoint = {
    bucket: number;
    avgNetBalance: number;
    avgMonthlyNetIncome: number;
    avgTotalWorkers: number;
    avgWages: number;
    sumProductionValue: number;
};

type ChartConfig = {
    title: string;
    color: string;
    gradId: string;
    dataKey: keyof HistoryPoint;
};

const CHARTS: ChartConfig[] = [
    { title: 'Net Balance', color: '#4f46e5', gradId: 'gradBalance', dataKey: 'avgNetBalance' },
    { title: 'Monthly Net Income', color: '#10b981', gradId: 'gradIncome', dataKey: 'avgMonthlyNetIncome' },
    { title: 'Production Value', color: '#f59e0b', gradId: 'gradProd', dataKey: 'sumProductionValue' },
    { title: 'Wages', color: '#ef4444', gradId: 'gradWages', dataKey: 'avgWages' },
    { title: 'Total Workers', color: '#06b6d4', gradId: 'gradWorkers', dataKey: 'avgTotalWorkers' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function yDomainFor(points: { value: number }[]): [number, number] | ['auto', 'auto'] {
    if (points.length === 0) {
        return ['auto', 'auto'];
    }
    const vals = points.map((d) => d.value).filter((v) => Number.isFinite(v));
    if (vals.length === 0) {
        return ['auto', 'auto'];
    }
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (lo === hi) {
        return [lo * 0.9 - 0.001, hi * 1.1 + 0.001];
    }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
}

function tooltipLabel(bucket: number, granularity: Granularity): string {
    if (granularity === 'monthly') {
        const { year, monthIndex } = tickToDate(bucket);
        return `${MONTH_NAMES[monthIndex]} ${year}`;
    }
    if (granularity === 'yearly') {
        return `Year ${Math.floor(bucket / TICKS_PER_YEAR) + START_YEAR + 1}`;
    }
    return `Year ${Math.floor(bucket / TICKS_PER_YEAR) + START_YEAR}`;
}

function xTickFormatter(bucket: number, granularity: Granularity): string {
    if (granularity === 'monthly') {
        const { monthIndex } = tickToDate(bucket);
        return MONTH_NAMES[monthIndex];
    }
    if (granularity === 'yearly') {
        return `${Math.floor(bucket / TICKS_PER_YEAR) + START_YEAR + 1}`;
    }
    return `${Math.floor(bucket / TICKS_PER_YEAR) + START_YEAR}`;
}

function EmptyChart() {
    return (
        <div
            className='w-full rounded border border-dashed border-muted flex items-center justify-center text-xs text-muted-foreground'
            style={{ height: 200 }}
        >
            No data
        </div>
    );
}

function MetricChart({
    data,
    config,
    granularity,
    foundedTick,
}: {
    data: HistoryPoint[];
    config: ChartConfig;
    granularity: Granularity;
    foundedTick: number;
}) {
    const chartData = useMemo(
        () => data.map((p) => ({ bucket: p.bucket, value: p[config.dataKey] as number })),
        [data, config.dataKey],
    );

    const yDomain = useMemo(() => yDomainFor(chartData), [chartData]);

    const { xDomain, xTicks, verticalGridValues } = useMemo(() => {
        if (granularity === 'monthly') {
            const { year } = tickToDate(Math.max(foundedTick, 0));
            const startBucket = year * TICKS_PER_YEAR;
            const ticks = Array.from({ length: 12 }, (_, i) => startBucket + i * TICKS_PER_MONTH);
            return {
                xDomain: [startBucket, startBucket + 11 * TICKS_PER_MONTH] as [number, number],
                xTicks: ticks,
                verticalGridValues: ticks,
            };
        }
        return {
            xDomain: undefined as [number, number] | undefined,
            xTicks: undefined as number[] | undefined,
            verticalGridValues: undefined as number[] | undefined,
        };
    }, [granularity, foundedTick]);

    return (
        <Card>
            <CardContent className='px-3 pt-3 pb-2'>
                <p className='text-xs font-semibold text-muted-foreground mb-2'>{config.title}</p>
                {chartData.length === 0 ? (
                    <EmptyChart />
                ) : (
                    <div style={{ width: '100%', height: 200 }}>
                        <ResponsiveContainer width='100%' height='100%'>
                            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id={config.gradId} x1='0' x2='0' y1='0' y2='1'>
                                        <stop offset='5%' stopColor={config.color} stopOpacity={0.45} />
                                        <stop offset='95%' stopColor={config.color} stopOpacity={0.08} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid
                                    vertical={verticalGridValues !== undefined}
                                    horizontal={false}
                                    verticalValues={verticalGridValues}
                                    stroke='#334155'
                                />
                                <XAxis
                                    dataKey='bucket'
                                    type='number'
                                    domain={xDomain ?? ['dataMin', 'dataMax']}
                                    ticks={xTicks ?? chartData.map((p) => p.bucket)}
                                    tickFormatter={(v) => xTickFormatter(v as number, granularity)}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={{ stroke: '#334155' }}
                                    tickLine={false}
                                    minTickGap={30}
                                />
                                <YAxis
                                    type='number'
                                    domain={yDomain}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={56}
                                    tickFormatter={(v) => formatNumbers(v as number)}
                                />
                                <Tooltip
                                    labelFormatter={(v) => tooltipLabel(v as number, granularity)}
                                    formatter={(v) => [formatNumbers(v as number), config.title]}
                                />
                                <Area
                                    type='monotone'
                                    dataKey='value'
                                    stroke={config.color}
                                    strokeWidth={2}
                                    fill={`url(#${config.gradId})`}
                                    dot={false}
                                    activeDot={{ r: 3, fill: config.color, stroke: '#1e293b', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

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
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
                active
                    ? 'bg-primary text-primary-foreground'
                    : disabled
                      ? 'opacity-30 cursor-not-allowed text-muted-foreground'
                      : 'text-muted-foreground hover:text-foreground'
            }`}
        >
            {children}
        </button>
    );
}

export default function AgentHistoryPage() {
    const { agentId, detail, myAgentId, isOwnAgent } = useAgentPlanetDetail();
    const trpc = useTRPC();
    const [granularity, setGranularity] = useState<Granularity>('monthly');

    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getAgentHistory.queryOptions({ agentId, granularity, limit: 100 }),
    );
    const currentTickData = useSimulationQuery(trpc.simulation.getCurrentTick.queryOptions());

    const history = data?.history ?? [];
    const foundedTick = data?.foundedTick ?? 0;
    const ticksElapsed = (currentTickData?.data?.tick ?? 0) - foundedTick;
    const showYearly = ticksElapsed >= 2 * TICKS_PER_YEAR;
    const showDecade = ticksElapsed >= 11 * TICKS_PER_YEAR;

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
        <AgentAccessGuard
            agentId={agentId}
            agentName={detail?.agentName ?? 'Agent'}
            isLoading={myAgentId.isLoading}
            isOwnAgent={isOwnAgent}
        >
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
                    {CHARTS.map((cfg) => (
                        <MetricChart
                            key={cfg.dataKey}
                            data={history}
                            config={cfg}
                            granularity={granularity}
                            foundedTick={foundedTick}
                        />
                    ))}
                </div>
            </div>
        </AgentAccessGuard>
    );
}
