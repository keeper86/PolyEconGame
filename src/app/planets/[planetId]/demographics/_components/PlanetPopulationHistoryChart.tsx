'use client';

import { Card, CardContent } from '@/components/ui/card';
import { tickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { START_YEAR, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Granularity = 'monthly' | 'yearly' | 'decades';

type RawPoint = { bucket: number; avgPopulation: number };

type ChartPoint = {
    tick: number;
    year: number;
    monthIdx?: number;
    value: number;
    ghostValue?: number | null;
};

type LiveData = {
    tick: number;
    population: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function yDomainFor(points: { value: number }[]): [number, number] | ['auto', 'auto'] {
    if (points.length === 0) {
        return ['auto', 'auto'];
    }
    const vals = points.map((d) => d.value).filter((v) => v > 0);
    if (vals.length === 0) {
        return ['auto', 'auto'];
    }
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (lo === hi) {
        return [lo * 0.9, hi * 1.1 + 1];
    }
    const pad = (hi - lo) * 0.08;
    return [Math.max(0, lo - pad), hi + pad];
}

function computeMonthlyData(allPts: RawPoint[], live: LiveData): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    if (pts.length === 0 && live.tick === 0) {
        return [];
    }

    const latestYear =
        live.tick > 0 ? tickToDate(live.tick).year : pts.length > 0 ? tickToDate(pts[pts.length - 1].bucket).year : 0;

    const result: ChartPoint[] = pts
        .filter((p) => tickToDate(p.bucket).year === latestYear)
        .map((p) => {
            const { monthIndex } = tickToDate(p.bucket);
            return {
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                monthIdx: monthIndex + 1,
                value: p.avgPopulation,
            };
        });

    // Anchor at monthIdx=0 (previous December)
    const prevDecPoint = pts.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });
    if (prevDecPoint) {
        result.unshift({
            tick: prevDecPoint.bucket,
            year: prevDecPoint.bucket / TICKS_PER_YEAR,
            monthIdx: 0,
            value: prevDecPoint.avgPopulation,
        });
    } else {
        const lastBefore = [...pts].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBefore) {
            result.unshift({
                tick: lastBefore.bucket,
                year: lastBefore.bucket / TICKS_PER_YEAR,
                monthIdx: 0,
                value: lastBefore.avgPopulation,
            });
        }
    }

    // Live fractional point
    if (live.tick > 0) {
        const { year: liveYear, monthIndex: liveMi, day: liveDay } = tickToDate(live.tick);
        if (liveYear === latestYear) {
            const dayFraction = Math.max(liveDay - 1, 0.001) / TICKS_PER_MONTH;
            const fractionalMonthIdx = liveMi + dayFraction;
            result.push({
                tick: live.tick,
                year: live.tick / TICKS_PER_YEAR,
                monthIdx: fractionalMonthIdx,
                value: live.population,
            });
        }
    }

    return result;
}

function computeMonthlyGhostData(allPts: RawPoint[], live: LiveData): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    const { monthIndex: liveMi, day: liveDay, year: liveYear } = tickToDate(live.tick);
    const fractionalThreshold = liveMi + Math.max(liveDay - 1, 0.001) / TICKS_PER_MONTH;

    return pts
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            return year === liveYear - 1 && monthIndex + 1 > fractionalThreshold;
        })
        .map((p) => {
            const { monthIndex } = tickToDate(p.bucket);
            return {
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                monthIdx: monthIndex + 1,
                value: p.avgPopulation,
            };
        });
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// ─── EmptyChart ───────────────────────────────────────────────────────────────

function EmptyChart() {
    return (
        <div
            className='w-full rounded border border-dashed border-muted flex items-center justify-center text-xs text-muted-foreground'
            style={{ height: 240 }}
        >
            No data
        </div>
    );
}

// ─── GranularityButton ────────────────────────────────────────────────────────

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

// ─── MonthlyChart ─────────────────────────────────────────────────────────────

function MonthlyChart({ monthlyPoints, live }: { monthlyPoints: RawPoint[]; live?: LiveData }) {
    const data = useMemo(
        () => computeMonthlyData(monthlyPoints, live ?? { tick: 0, population: 0 }),
        [monthlyPoints, live],
    );
    const ghostData = useMemo(
        () => (live && live.tick > 0 ? computeMonthlyGhostData(monthlyPoints, live) : []),
        [monthlyPoints, live],
    );

    const mergedData = useMemo(() => {
        const ghostByMonth = new Map(ghostData.map((p) => [p.monthIdx!, p]));
        const result = data.map((p) => ({ ...p, ghostValue: ghostByMonth.get(p.monthIdx!)?.value ?? null }));
        // Append ghost-only points (months not yet reached in current year)
        for (const g of ghostData) {
            if (!data.some((d) => d.monthIdx === g.monthIdx)) {
                result.push({ ...g, value: null as unknown as number, ghostValue: g.value });
            }
        }
        return result.sort((a, b) => (a.monthIdx ?? 0) - (b.monthIdx ?? 0));
    }, [data, ghostData]);

    const yDomain = useMemo(() => yDomainFor(data), [data]);

    const formatMonthTick = (monthIdx: number): string => MONTH_NAMES[(Math.ceil(monthIdx) + 11) % 12] ?? '';
    const monthTooltipLabel = (monthIdx: number): string => {
        if (!Number.isInteger(monthIdx)) {
            return 'Live';
        }
        const pt = data.find((p) => p.monthIdx === monthIdx);
        const { year: yearInt } = pt ? tickToDate(pt.tick) : { year: 0 };
        const label = MONTH_NAMES[(monthIdx + 11) % 12] ?? '';
        return `End of ${label} ${yearInt + START_YEAR}`;
    };

    return (
        <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={mergedData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <defs>
                        <linearGradient id='popGradMon' x1='0' x2='0' y1='0' y2='1'>
                            <stop offset='5%' stopColor='#4f46e5' stopOpacity={0.45} />
                            <stop offset='95%' stopColor='#4f46e5' stopOpacity={0.08} />
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
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        domain={[0, 12]}
                        ticks={[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]}
                        tickFormatter={formatMonthTick}
                        minTickGap={0}
                    />
                    <YAxis
                        type='number'
                        domain={yDomain}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons')}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) {
                                return null;
                            }
                            const filtered = payload.filter(
                                (p) => !String(p.name).startsWith('ghost') && p.value != null,
                            );
                            if (filtered.length === 0) {
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
                                    {filtered.map((p) => (
                                        <div key={p.name} style={{ color: '#e2e8f0' }}>
                                            Population: {formatNumberWithUnit(p.value as number, 'persons')}
                                        </div>
                                    ))}
                                </div>
                            );
                        }}
                    />
                    <Area
                        type='monotone'
                        dataKey='ghostValue'
                        stroke='#4f46e5'
                        strokeWidth={1}
                        strokeOpacity={0.6}
                        strokeDasharray='3 3'
                        fill='none'
                        dot={false}
                        activeDot={false}
                        name='ghostValue'
                        connectNulls={false}
                    />
                    <Area
                        type='monotone'
                        dataKey='value'
                        stroke='#4f46e5'
                        strokeWidth={2}
                        fill='url(#popGradMon)'
                        dot={false}
                        activeDot={{ r: 3, fill: '#4f46e5', stroke: '#1e293b', strokeWidth: 2 }}
                        name='value'
                        connectNulls={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── YearlyChart ──────────────────────────────────────────────────────────────

function YearlyChart({ yearlyPoints }: { yearlyPoints: RawPoint[] }) {
    const data = useMemo(
        (): ChartPoint[] =>
            [...yearlyPoints]
                .sort((a, b) => a.bucket - b.bucket)
                .map((p) => ({
                    tick: p.bucket,
                    year: p.bucket / TICKS_PER_YEAR + START_YEAR + 1,
                    value: p.avgPopulation,
                })),
        [yearlyPoints],
    );

    const yDomain = useMemo(() => yDomainFor(data), [data]);
    const xMin = data.length > 0 ? data[0].year : 0;
    const xDomain: [number, number] = [xMin, xMin + 10];
    const xTicks = Array.from({ length: 10 }, (_, i) => xMin + i + 0.5);
    const verticalGridValues = Array.from({ length: 11 }, (_, i) => xMin + i);

    return (
        <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={data} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <defs>
                        <linearGradient id='popGradYr' x1='0' x2='0' y1='0' y2='1'>
                            <stop offset='5%' stopColor='#4f46e5' stopOpacity={0.45} />
                            <stop offset='95%' stopColor='#4f46e5' stopOpacity={0.08} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        vertical={true}
                        horizontal={false}
                        verticalValues={verticalGridValues}
                        stroke='#334155'
                        strokeOpacity={0.95}
                    />
                    <XAxis
                        dataKey='year'
                        type='number'
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        domain={xDomain}
                        ticks={xTicks}
                        tickFormatter={(v) => `${Math.floor(v)}`}
                        minTickGap={0}
                    />
                    <YAxis
                        type='number'
                        domain={yDomain}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons')}
                    />
                    <Tooltip
                        labelFormatter={(v) => `Year ${Math.floor(v as number)}`}
                        formatter={(v) => [formatNumberWithUnit(v as number, 'persons'), 'Avg population']}
                    />
                    <Area
                        type='monotone'
                        dataKey='value'
                        stroke='#4f46e5'
                        strokeWidth={2}
                        fill='url(#popGradYr)'
                        dot={false}
                        activeDot={{ r: 3 }}
                        name='value'
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── DecadesChart ─────────────────────────────────────────────────────────────

function DecadesChart({ decadePoints }: { decadePoints: RawPoint[] }) {
    const data = useMemo(
        (): ChartPoint[] =>
            [...decadePoints]
                .sort((a, b) => a.bucket - b.bucket)
                .map((p) => ({
                    tick: p.bucket,
                    year: p.bucket / TICKS_PER_YEAR + START_YEAR,
                    value: p.avgPopulation,
                })),
        [decadePoints],
    );

    const yDomain = useMemo(() => yDomainFor(data), [data]);

    return (
        <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={data} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <defs>
                        <linearGradient id='popGradDec' x1='0' x2='0' y1='0' y2='1'>
                            <stop offset='5%' stopColor='#4f46e5' stopOpacity={0.45} />
                            <stop offset='95%' stopColor='#4f46e5' stopOpacity={0.08} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} horizontal={false} stroke='#334155' />
                    <XAxis
                        dataKey='year'
                        type='number'
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(v) => `Y${Math.round(v as number)}`}
                    />
                    <YAxis
                        type='number'
                        domain={yDomain}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons')}
                    />
                    <Tooltip
                        labelFormatter={(v) => `Y${Math.round(v as number)}`}
                        formatter={(v) => [formatNumberWithUnit(v as number, 'persons'), 'Avg population']}
                    />
                    <Area
                        type='monotone'
                        dataKey='value'
                        stroke='#4f46e5'
                        strokeWidth={2}
                        fill='url(#popGradDec)'
                        dot={false}
                        activeDot={{ r: 3 }}
                        name='value'
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Props = {
    planetId: string;
    live?: LiveData;
};

export default function PlanetPopulationHistoryChart({ planetId, live }: Props): React.ReactElement {
    const trpc = useTRPC();
    const [granularity, setGranularity] = useState<Granularity>('monthly');

    const { data: monthly, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getPlanetPopulationHistory.queryOptions(
            { planetId, granularity: 'monthly', limit: 13 },
            { enabled: granularity === 'monthly' },
        ),
    );
    const { data: yearly, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getPlanetPopulationHistory.queryOptions(
            { planetId, granularity: 'yearly', limit: 11 },
            { enabled: granularity === 'yearly' },
        ),
    );
    const { data: decade, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getPlanetPopulationHistory.queryOptions(
            { planetId, granularity: 'decade' },
            { enabled: granularity === 'decades' },
        ),
    );

    const isLoading =
        (granularity === 'monthly' && (loadingMonthly || !monthly)) ||
        (granularity === 'yearly' && (loadingYearly || !yearly)) ||
        (granularity === 'decades' && (loadingDecade || !decade));

    const currentTick = live?.tick ?? 0;
    const yearsElapsed = currentTick / TICKS_PER_YEAR;
    const showYearly = yearsElapsed >= 2;
    const showDecades = yearsElapsed >= 10;

    const monthlyPoints = useMemo(
        () => (monthly?.history ?? []).map((r) => ({ bucket: r.bucket, avgPopulation: r.avgPopulation })),
        [monthly],
    );
    const yearlyPoints = useMemo(
        () => (yearly?.history ?? []).map((r) => ({ bucket: r.bucket, avgPopulation: r.avgPopulation })),
        [yearly],
    );
    const decadePoints = useMemo(
        () => (decade?.history ?? []).map((r) => ({ bucket: r.bucket, avgPopulation: r.avgPopulation })),
        [decade],
    );

    return (
        <Card>
            <CardContent className='px-3 pt-3 pb-2'>
                <div className={isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : undefined}>
                    <div className='flex gap-1 mb-1'>
                        Population:
                        <GranularityButton active={granularity === 'monthly'} onClick={() => setGranularity('monthly')}>
                            Monthly
                        </GranularityButton>
                        <GranularityButton
                            active={granularity === 'yearly'}
                            disabled={!showYearly}
                            onClick={() => setGranularity('yearly')}
                        >
                            Yearly
                        </GranularityButton>
                        <GranularityButton
                            active={granularity === 'decades'}
                            disabled={!showDecades}
                            onClick={() => setGranularity('decades')}
                        >
                            Decades
                        </GranularityButton>
                    </div>
                    {granularity === 'monthly' && <MonthlyChart monthlyPoints={monthlyPoints} live={live} />}
                    {granularity === 'yearly' &&
                        (showYearly || isLoading) &&
                        (yearlyPoints.length > 0 ? <YearlyChart yearlyPoints={yearlyPoints} /> : <EmptyChart />)}
                    {granularity === 'decades' &&
                        (showDecades || isLoading) &&
                        (decadePoints.length > 0 ? <DecadesChart decadePoints={decadePoints} /> : <EmptyChart />)}
                </div>
            </CardContent>
        </Card>
    );
}
