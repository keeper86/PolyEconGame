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
    sumConsumptionValue: number;
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
    { title: 'Consumption Value', color: '#8b5cf6', gradId: 'gradCons', dataKey: 'sumConsumptionValue' },
    { title: 'Wages', color: '#ef4444', gradId: 'gradWages', dataKey: 'avgWages' },
    { title: 'Total Workers', color: '#06b6d4', gradId: 'gradWorkers', dataKey: 'avgTotalWorkers' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// ── Monthly chart helpers ─────────────────────────────────────────────────────

type MonthlyMergedPoint = {
    monthIdx: number;
    value: number | null;
    ghostValue: number | null;
};

function buildMonthlyMerged(
    pts: HistoryPoint[],
    currentTick: number,
    dataKey: keyof HistoryPoint,
): MonthlyMergedPoint[] {
    const sorted = [...pts].sort((a, b) => a.bucket - b.bucket);
    if (sorted.length === 0) {
        return [];
    }

    const { year: currentYear, monthIndex: currentMonthIdx } = tickToDate(
        currentTick > 0 ? currentTick : sorted[sorted.length - 1].bucket,
    );
    const fractionalThreshold =
        currentMonthIdx + Math.max(tickToDate(currentTick > 0 ? currentTick : 0).day - 1, 0.001) / TICKS_PER_MONTH;

    // Current year points (monthIdx 1‥12)
    const currentPts = sorted
        .filter((p) => tickToDate(p.bucket).year === currentYear)
        .map((p) => {
            const { monthIndex } = tickToDate(p.bucket);
            return { monthIdx: monthIndex + 1, value: p[dataKey] as number };
        });

    // Anchor at monthIdx=0 (previous December or nearest predecessor)
    const prevDec = sorted.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === currentYear - 1 && monthIndex === 11;
    });
    const anchorSrc = prevDec ?? [...sorted].reverse().find((p) => tickToDate(p.bucket).year < currentYear);
    const anchor: MonthlyMergedPoint | null = anchorSrc
        ? { monthIdx: 0, value: anchorSrc[dataKey] as number, ghostValue: null }
        : null;

    // Ghost: previous year points for months not yet reached
    const ghostPts = sorted
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            return year === currentYear - 1 && monthIndex + 1 > fractionalThreshold;
        })
        .map((p) => {
            const { monthIndex } = tickToDate(p.bucket);
            return { monthIdx: monthIndex + 1, ghostValue: p[dataKey] as number };
        });

    // Merge into a single array keyed by monthIdx
    const byIdx = new Map<number, MonthlyMergedPoint>();
    if (anchor) {
        byIdx.set(0, anchor);
    }
    for (const cp of currentPts) {
        byIdx.set(cp.monthIdx, { monthIdx: cp.monthIdx, value: cp.value, ghostValue: null });
    }
    for (const gp of ghostPts) {
        const existing = byIdx.get(gp.monthIdx);
        if (existing) {
            existing.ghostValue = gp.ghostValue;
        } else {
            byIdx.set(gp.monthIdx, { monthIdx: gp.monthIdx, value: null, ghostValue: gp.ghostValue });
        }
    }

    return Array.from(byIdx.values()).sort((a, b) => a.monthIdx - b.monthIdx);
}

function yDomainForMerged(points: MonthlyMergedPoint[]): [number, number] | ['auto', 'auto'] {
    const vals: number[] = [];
    for (const p of points) {
        if (p.value !== null && Number.isFinite(p.value)) {
            vals.push(p.value);
        }
        if (p.ghostValue !== null && Number.isFinite(p.ghostValue)) {
            vals.push(p.ghostValue);
        }
    }
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

function yDomainForBuckets(pts: { value: number }[]): [number, number] | ['auto', 'auto'] {
    const vals = pts.map((d) => d.value).filter((v) => Number.isFinite(v));
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

function MonthlyMetricChart({
    mergedData,
    config,
    currentTick,
    history,
}: {
    mergedData: MonthlyMergedPoint[];
    config: ChartConfig;
    currentTick: number;
    history: HistoryPoint[];
}) {
    const yDomain = useMemo(() => yDomainForMerged(mergedData), [mergedData]);

    const { year: currentYear } = tickToDate(
        currentTick > 0 ? currentTick : (history[history.length - 1]?.bucket ?? 0),
    );
    const monthTooltipLabel = (monthIdx: number): string => {
        if (!Number.isInteger(monthIdx) || monthIdx === 0) {
            return `${MONTH_NAMES[11]} ${currentYear - 1}`;
        }
        return `End of ${MONTH_NAMES[(monthIdx + 11) % 12]} ${currentYear}`;
    };

    const xTicks = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5];
    const formatMonthTick = (monthIdx: number): string => MONTH_NAMES[(Math.ceil(monthIdx) + 11) % 12] ?? '';

    return (
        <Card>
            <CardContent className='px-3 pt-3 pb-2'>
                <p className='text-xs font-semibold text-muted-foreground mb-2'>{config.title}</p>

                <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer width='100%' height='100%'>
                        <AreaChart data={mergedData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                            <defs>
                                <linearGradient id={config.gradId} x1='0' x2='0' y1='0' y2='1'>
                                    <stop offset='5%' stopColor={config.color} stopOpacity={0.45} />
                                    <stop offset='95%' stopColor={config.color} stopOpacity={0.08} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                vertical={true}
                                horizontal={false}
                                verticalValues={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
                                stroke='#334155'
                                strokeOpacity={0.7}
                            />
                            <XAxis
                                dataKey='monthIdx'
                                type='number'
                                domain={[0, 12]}
                                ticks={xTicks}
                                tickFormatter={formatMonthTick}
                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                axisLine={{ stroke: '#334155' }}
                                tickLine={false}
                                minTickGap={0}
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
                                content={({ active, payload, label }) => {
                                    if (!active || !payload || payload.length === 0) {
                                        return null;
                                    }
                                    const current = payload.find((p) => p.name === 'value');
                                    const ghost = payload.find((p) => p.name === 'ghostValue');
                                    const hasCurrentVal = current && current.value !== null;
                                    const hasGhostVal = ghost && ghost.value !== null;
                                    if (!hasCurrentVal && !hasGhostVal) {
                                        return null;
                                    }
                                    return (
                                        <div
                                            style={{
                                                background: '#1e293b',
                                                border: '1px solid #334155',
                                                borderRadius: '6px',
                                                fontSize: 12,
                                                padding: '6px 10px',
                                            }}
                                        >
                                            <div style={{ color: '#94a3b8', marginBottom: 4 }}>
                                                {monthTooltipLabel(label as number)}
                                            </div>
                                            {hasCurrentVal && (
                                                <div style={{ color: '#e2e8f0' }}>
                                                    {config.title}: {formatNumbers(current.value as number)}
                                                </div>
                                            )}
                                            {hasGhostVal && (
                                                <div style={{ color: '#64748b' }}>
                                                    Last year: {formatNumbers(ghost.value as number)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }}
                            />
                            <Area
                                type='monotone'
                                dataKey='value'
                                stroke={config.color}
                                strokeWidth={2}
                                fill={`url(#${config.gradId})`}
                                dot={false}
                                activeDot={{ r: 3, fill: config.color, stroke: '#1e293b', strokeWidth: 2 }}
                                connectNulls={false}
                                name='value'
                            />
                            <Area
                                type='monotone'
                                dataKey='ghostValue'
                                stroke={config.color}
                                strokeWidth={2}
                                strokeOpacity={0.35}
                                fill='none'
                                dot={false}
                                activeDot={false}
                                connectNulls={false}
                                name='ghostValue'
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Yearly / Decade MetricChart ───────────────────────────────────────────────

function NonMonthlyMetricChart({
    data,
    config,
    granularity,
}: {
    data: HistoryPoint[];
    config: ChartConfig;
    granularity: 'yearly' | 'decade';
}) {
    const chartData = useMemo(
        () =>
            [...data]
                .sort((a, b) => a.bucket - b.bucket)
                .map((p) => ({
                    year: p.bucket / TICKS_PER_YEAR + START_YEAR + (granularity === 'yearly' ? 1 : 0),
                    value: p[config.dataKey] as number,
                })),
        [data, config.dataKey, granularity],
    );
    const firstYear = chartData[0]?.year ?? START_YEAR;

    const yDomain = useMemo(() => yDomainForBuckets(chartData), [chartData]);
    const xdomain = useMemo(() => [firstYear, firstYear + 11], [firstYear]);

    const formatYearTick = (year: number): string => `${Math.floor(year)}`;
    const tooltipLabel = (year: number): string =>
        granularity === 'yearly' ? `Year ${Math.floor(year)}` : `Y${Math.round(year)}`;

    return (
        <Card>
            <CardContent className='px-3 pt-3 pb-2'>
                <p className='text-xs font-semibold text-muted-foreground mb-2'>{config.title}</p>
                <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer width='100%' height='100%'>
                        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                            <defs>
                                <linearGradient id={config.gradId} x1='0' x2='0' y1='0' y2='1'>
                                    <stop offset='5%' stopColor={config.color} stopOpacity={0.45} />
                                    <stop offset='95%' stopColor={config.color} stopOpacity={0.08} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} horizontal={false} stroke='#334155' />
                            <XAxis
                                dataKey='year'
                                type='number'
                                domain={xdomain}
                                tickFormatter={formatYearTick}
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
                                labelFormatter={(v) => tooltipLabel(v as number)}
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
            </CardContent>
        </Card>
    );
}

// ── Granularity button ────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentHistoryPage() {
    const { agentId, detail, myAgentId, isOwnAgent } = useAgentPlanetDetail();
    const trpc = useTRPC();
    const [granularity, setGranularity] = useState<Granularity>('monthly');

    const { data: monthlyData, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getAgentHistory.queryOptions(
            { agentId, granularity: 'monthly', limit: 26 },
            { enabled: granularity === 'monthly' },
        ),
    );
    const { data: yearlyData, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getAgentHistory.queryOptions(
            { agentId, granularity: 'yearly', limit: 100 },
            { enabled: granularity === 'yearly' },
        ),
    );
    const { data: decadeData, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getAgentHistory.queryOptions(
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

    const monthlyHistory = useMemo(() => monthlyData?.history ?? [], [monthlyData]);

    // Pre-compute merged monthly data for each metric once
    const mergedByMetric = useMemo(
        () =>
            CHARTS.reduce(
                (acc, cfg) => {
                    acc[cfg.dataKey] = buildMonthlyMerged(monthlyHistory, currentTick, cfg.dataKey);
                    return acc;
                },
                {} as Record<keyof HistoryPoint, MonthlyMergedPoint[]>,
            ),
        [monthlyHistory, currentTick],
    );

    const activeHistory =
        granularity === 'yearly'
            ? (yearlyData?.history ?? [])
            : granularity === 'decade'
              ? (decadeData?.history ?? [])
              : [];

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
                    {CHARTS.map((cfg) =>
                        granularity === 'monthly' ? (
                            <MonthlyMetricChart
                                key={cfg.dataKey}
                                mergedData={mergedByMetric[cfg.dataKey] ?? []}
                                config={cfg}
                                currentTick={currentTick}
                                history={monthlyHistory}
                            />
                        ) : (
                            <NonMonthlyMetricChart
                                key={cfg.dataKey}
                                data={activeHistory}
                                config={cfg}
                                granularity={granularity}
                            />
                        ),
                    )}
                </div>
            </div>
        </AgentAccessGuard>
    );
}
