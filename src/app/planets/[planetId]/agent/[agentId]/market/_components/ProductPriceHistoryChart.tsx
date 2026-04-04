'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { TICKS_PER_YEAR } from '@/simulation/constants';
import React, { useMemo, useState } from 'react';
import { computeMonthlyData, computeMonthlyGhostData } from './monthlyChartLogic';
import type { ChartPoint, LiveData, RawPoint } from './monthlyChartLogic';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type Props = {
    planetId: string;
    productName: string;
    /** Live price stats from the already-fetched market data (current tick). */
    live?: LiveData;
};

type Granularity = 'monthly' | 'yearly' | 'decades';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function yDomainFor(points: ChartPoint[]): [number, number] {
    if (points.length === 0) {
        return [0, 1];
    }
    const mins = points.map((d) => d.minPrice);
    const maxs = points.map((d) => d.maxPrice);
    const lo = Math.min(...mins);
    const hi = Math.max(...maxs);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
        const v = Number.isFinite(lo) ? lo : 0;
        return [v * 0.95 - 0.0001, v * 1.05 + 0.0001];
    }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
}

function logTicksFor(points: ChartPoint[]): number[] | undefined {
    const prices = points.map((d) => d.avgPrice).filter((v) => v > 0);
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
}

function usesLogScale(points: ChartPoint[]): boolean {
    const prices = points.map((d) => d.avgPrice).filter((v) => v > 0);
    if (prices.length < 2) {
        return false;
    }
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    return lo > 0 && hi / lo >= 10;
}

const tooltipFormatter = (value: number, name: string): [string, string] => {
    const labels: Record<string, string> = { avgPrice: 'Avg price', minPrice: 'Min price', maxPrice: 'Max price' };
    return [formatNumbers(value), labels[name] ?? name];
};

// ─── SimplePriceAreaChart ─────────────────────────────────────────────────────

type MergedPoint = {
    monthIdx?: number;
    year: number;
    tick: number;
    avgPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    ghostAvgPrice: number | null;
    ghostMinPrice: number | null;
    ghostMaxPrice: number | null;
};

function SimplePriceAreaChart({
    data,
    ghostData,
    gradId,
    xDataKey = 'year',
    xDomain,
    xTicks,
    xTickFormatter,
    tooltipLabelFormatter,
    scale,
    yDomain,
    yTicks,
}: {
    data: ChartPoint[];
    ghostData?: ChartPoint[];
    gradId: string;
    xDataKey?: 'year' | 'monthIdx';
    xDomain?: [number | string, number | string];
    xTicks?: number[];
    xTickFormatter: (v: number) => string;
    tooltipLabelFormatter: (v: number) => string;
    scale: 'log' | 'linear';
    yDomain: [number, number] | ['auto', 'auto'];
    yTicks?: number[];
}) {
    const mergedData = useMemo((): MergedPoint[] => {
        if (!ghostData || ghostData.length === 0) {
            return data.map((p) => ({ ...p, ghostAvgPrice: null, ghostMinPrice: null, ghostMaxPrice: null }));
        }
        const ghostByMonth = new Map(ghostData.filter((p) => p.monthIdx !== undefined).map((p) => [p.monthIdx!, p]));
        const currentByMonth = new Map(data.filter((p) => p.monthIdx !== undefined).map((p) => [p.monthIdx!, p]));
        const allIdxs = new Set([...currentByMonth.keys(), ...ghostByMonth.keys()]);
        return Array.from(allIdxs)
            .sort((a, b) => {
                // Current-data entries (including the live fractional point) sort first so that
                // ghost-only entries are never interleaved between current entries.
                const aIsCurrent = currentByMonth.has(a);
                const bIsCurrent = currentByMonth.has(b);
                if (aIsCurrent === bIsCurrent) {
                    return a - b;
                }
                return aIsCurrent ? -1 : 1;
            })
            .map((monthIdx) => {
                const curr = currentByMonth.get(monthIdx);
                const ghost = ghostByMonth.get(monthIdx);
                return {
                    monthIdx,
                    tick: curr?.tick ?? ghost?.tick ?? 0,
                    year: curr?.year ?? ghost?.year ?? 0,
                    avgPrice: curr?.avgPrice ?? null,
                    minPrice: curr?.minPrice ?? null,
                    maxPrice: curr?.maxPrice ?? null,
                    ghostAvgPrice: ghost?.avgPrice ?? null,
                    ghostMinPrice: ghost?.minPrice ?? null,
                    ghostMaxPrice: ghost?.maxPrice ?? null,
                };
            });
    }, [data, ghostData]);

    const hasGhost = ghostData && ghostData.length > 0;

    return (
        <ResponsiveContainer width='100%' height='100%'>
            <AreaChart data={mergedData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <defs>
                    <linearGradient id={gradId} x1='0' x2='0' y1='0' y2='1'>
                        <stop offset='5%' stopColor='#38bdf8' stopOpacity={0.45} />
                        <stop offset='95%' stopColor='#38bdf8' stopOpacity={0.08} />
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
                    dataKey={xDataKey}
                    type='number'
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={false}
                    domain={xDomain ?? ['dataMin', 'dataMax']}
                    ticks={xTicks}
                    tickFormatter={xTickFormatter}
                    minTickGap={xTicks ? 0 : 36}
                />
                <YAxis
                    type='number'
                    scale={scale}
                    domain={yDomain}
                    allowDataOverflow
                    ticks={yTicks}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={(v) => (typeof v === 'number' ? formatNumbers(v) : String(v))}
                />
                <Tooltip
                    content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) {
                            return null;
                        }
                        const filtered = payload.filter((p) => !String(p.name).startsWith('ghost'));
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
                                    {tooltipLabelFormatter(label as number)}
                                </div>
                                {filtered.map((p) => {
                                    const [val, name] = tooltipFormatter(p.value as number, p.name as string);
                                    return (
                                        <div key={p.name} style={{ color: '#e2e8f0' }}>
                                            {name}: {val}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    }}
                />
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
                <Area
                    type='monotone'
                    dataKey='avgPrice'
                    stroke='#f59e0b'
                    strokeWidth={2}
                    fill='none'
                    dot={false}
                    activeDot={{ r: 3, fill: '#f59e0b', stroke: '#1e293b', strokeWidth: 2 }}
                    name='avgPrice'
                    connectNulls={false}
                />
                {hasGhost && (
                    <Area
                        type='monotone'
                        dataKey='ghostAvgPrice'
                        stroke='#f59e0b'
                        strokeWidth={2}
                        strokeOpacity={0.35}
                        fill='none'
                        dot={false}
                        activeDot={false}
                        name='ghostAvgPrice'
                        connectNulls={false}
                    />
                )}
                {hasGhost && (
                    <Area
                        type='monotone'
                        dataKey='ghostMaxPrice'
                        stroke='#38bdf8'
                        strokeWidth={1}
                        strokeOpacity={0.3}
                        strokeDasharray='3 3'
                        fill='none'
                        dot={false}
                        activeDot={false}
                        name='ghostMaxPrice'
                        connectNulls={false}
                    />
                )}
                {hasGhost && (
                    <Area
                        type='monotone'
                        dataKey='ghostMinPrice'
                        stroke='#38bdf8'
                        strokeWidth={1}
                        strokeOpacity={0.3}
                        strokeDasharray='3 3'
                        fill='none'
                        dot={false}
                        activeDot={false}
                        name='ghostMinPrice'
                        connectNulls={false}
                    />
                )}
            </AreaChart>
        </ResponsiveContainer>
    );
}

// ─── MonthlyChart ─────────────────────────────────────────────────────────────

function MonthlyChart({
    monthlyPoints,
    live,
    productName,
}: {
    monthlyPoints: RawPoint[];
    live?: LiveData;
    productName: string;
}) {
    const data = useMemo(
        (): ChartPoint[] => computeMonthlyData(monthlyPoints, live ?? { tick: 0, price: 0 }, productName),
        [monthlyPoints, live, productName],
    );

    const ghostData = useMemo(
        (): ChartPoint[] => (live ? computeMonthlyGhostData(monthlyPoints, live, data) : []),
        [monthlyPoints, live, data],
    );

    const yDomain = useMemo(() => yDomainFor([...data, ...ghostData]), [data, ghostData]);
    const gradId = `grad_mon_${productName.replace(/\s+/g, '_')}`;

    // monthIdx 0 = previous December anchor; 1–12 = Jan–Dec of current year.
    // Ticks are placed at 0.5, 1.5, … (midpoints of each month interval).
    const formatMonthTick = (monthIdx: number): string => MONTH_NAMES[(Math.ceil(monthIdx) + 11) % 12] ?? '';

    const monthTooltipLabel = (monthIdx: number): string => {
        const pt = data.find((p) => p.monthIdx === monthIdx);
        const { year: yearInt } = pt ? tickToDate(pt.tick) : { year: 0 };
        const label = MONTH_NAMES[(monthIdx + 11) % 12] ?? '';
        return `${label} Y${yearInt}`;
    };

    return (
        <div style={{ width: '100%', height: 240 }}>
            <SimplePriceAreaChart
                data={data}
                ghostData={ghostData}
                gradId={gradId}
                xDataKey='monthIdx'
                xDomain={[0, 12]}
                xTicks={[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]}
                xTickFormatter={formatMonthTick}
                tooltipLabelFormatter={monthTooltipLabel}
                scale='linear'
                yDomain={yDomain}
            />
        </div>
    );
}

// ─── YearlyChart ──────────────────────────────────────────────────────────────

function YearlyChart({
    yearlyPoints,
    live,
    productName,
}: {
    yearlyPoints: RawPoint[];
    live?: LiveData;
    productName: string;
}) {
    const data = useMemo((): ChartPoint[] => {
        return [...yearlyPoints]
            .sort((a, b) => a.bucket - b.bucket)
            .map((p) => ({
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR + 1,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
            }));
    }, [yearlyPoints]);

    const useLog = useMemo(() => usesLogScale(data), [data]);
    const yDomain = useMemo(() => (useLog ? (['auto', 'auto'] as ['auto', 'auto']) : yDomainFor(data)), [data, useLog]);
    const yTicks = useMemo(() => (useLog ? logTicksFor(data) : undefined), [data, useLog]);
    const gradId = `grad_yr_${productName.replace(/\s+/g, '_')}`;

    // Use relative year (tick / TICKS_PER_YEAR) to match the data's `year` field.
    const currentYear = live ? live.tick / TICKS_PER_YEAR : data.length > 0 ? data[data.length - 1].year : 0;
    const xDomain: [number, number] = [Math.max(0, currentYear - 10), currentYear - 1];

    const formatYearTick = (year: number): string => {
        if (typeof year !== 'number') {
            return String(year);
        }
        return Number.isInteger(year) ? `Y${year}` : `Y${year.toFixed(0)}`;
    };

    const yearTooltipLabel = (year: number): string => {
        if (typeof year !== 'number') {
            return String(year);
        }
        return `Y${year.toFixed(1)}`;
    };

    return (
        <div style={{ width: '100%', height: 200 }}>
            <SimplePriceAreaChart
                data={data}
                gradId={gradId}
                xDataKey='year'
                xDomain={xDomain}
                xTickFormatter={formatYearTick}
                tooltipLabelFormatter={yearTooltipLabel}
                scale={useLog ? 'log' : 'linear'}
                yDomain={yDomain}
                yTicks={yTicks}
            />
        </div>
    );
}

// ─── DecadesChart ─────────────────────────────────────────────────────────────

function DecadesChart({ decadePoints, productName }: { decadePoints: RawPoint[]; productName: string }) {
    const data = useMemo((): ChartPoint[] => {
        return [...decadePoints]
            .sort((a, b) => a.bucket - b.bucket)
            .map((p) => ({
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
            }));
    }, [decadePoints]);

    const useLog = useMemo(() => usesLogScale(data), [data]);
    const yDomain = useMemo(() => (useLog ? (['auto', 'auto'] as ['auto', 'auto']) : yDomainFor(data)), [data, useLog]);
    const yTicks = useMemo(() => (useLog ? logTicksFor(data) : undefined), [data, useLog]);
    const gradId = `grad_dec_${productName.replace(/\s+/g, '_')}`;

    const formatYearTick = (year: number): string => {
        if (typeof year !== 'number') {
            return String(year);
        }
        return `Y${Math.round(year)}`;
    };

    const yearTooltipLabel = (year: number): string => {
        if (typeof year !== 'number') {
            return String(year);
        }
        return `Y${year.toFixed(0)}`;
    };

    return (
        <div style={{ width: '100%', height: 200 }}>
            <SimplePriceAreaChart
                data={data}
                gradId={gradId}
                xDataKey='year'
                xDomain={['dataMin', 'dataMax']}
                xTickFormatter={formatYearTick}
                tooltipLabelFormatter={yearTooltipLabel}
                scale={useLog ? 'log' : 'linear'}
                yDomain={yDomain}
                yTicks={yTicks}
            />
        </div>
    );
}

// ─── Toggle Button ────────────────────────────────────────────────────────────

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

// ─── Parent Component ─────────────────────────────────────────────────────────

export default function ProductPriceHistoryChart({ planetId, productName, live }: Props): React.ReactElement {
    const trpc = useTRPC();
    const [granularity, setGranularity] = useState<Granularity>('monthly');

    const { data: monthly, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({
            planetId,
            productName,
            granularity: 'monthly',
            limit: 24,
        }),
    );
    const { data: yearly, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({
            planetId,
            productName,
            granularity: 'yearly',
            limit: 11,
        }),
    );
    const { data: decade, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions({ planetId, productName, granularity: 'decade' }),
    );

    const isLoading = loadingMonthly || loadingYearly || loadingDecade;

    const monthlyPoints = useMemo(
        () =>
            (monthly?.history ?? []).map((r) => ({
                bucket: r.bucket,
                avgPrice: r.avgPrice,
                minPrice: r.minPrice,
                maxPrice: r.maxPrice,
            })),
        [monthly],
    );
    const yearlyPoints = useMemo(
        () =>
            (yearly?.history ?? []).map((r) => ({
                bucket: r.bucket,
                avgPrice: r.avgPrice,
                minPrice: r.minPrice,
                maxPrice: r.maxPrice,
            })),
        [yearly],
    );
    const decadePoints = useMemo(
        () =>
            (decade?.history ?? []).map((r) => ({
                bucket: r.bucket,
                avgPrice: r.avgPrice,
                minPrice: r.minPrice,
                maxPrice: r.maxPrice,
            })),
        [decade],
    );

    const currentTick = live?.tick ?? 0;
    const yearsElapsed = currentTick / TICKS_PER_YEAR;
    const showYearly = yearsElapsed >= 2;
    const showDecades = yearsElapsed >= 10;

    if (isLoading) {
        return <div className='text-xs text-muted-foreground'>Loading price history…</div>;
    }

    return (
        <div className='space-y-1'>
            <div className='flex gap-1'>
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
            {granularity === 'monthly' && (
                <MonthlyChart monthlyPoints={monthlyPoints} live={live} productName={productName} />
            )}
            {granularity === 'yearly' && showYearly && (
                <YearlyChart yearlyPoints={yearlyPoints} live={live} productName={productName} />
            )}
            {granularity === 'decades' && showDecades && (
                <DecadesChart decadePoints={decadePoints} productName={productName} />
            )}
        </div>
    );
}
