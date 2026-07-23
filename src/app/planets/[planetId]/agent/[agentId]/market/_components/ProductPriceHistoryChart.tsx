'use client';

import { GranularityHeader, useGranularity } from '@/components/client/GranularityButtonGroup';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { START_YEAR, TICKS_PER_YEAR } from '@/simulation/constants';
import React, { useMemo, useState } from 'react';
import { computeMonthlyData, computeMonthlyGhostData } from './monthlyChartLogic';
import type { ChartPoint, LiveData, RawPoint } from './monthlyChartLogic';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useIsSmallScreen } from '@/hooks/useMobile';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type RescaleMode = 'absolute' | 'relative';

function rescalePoints(points: ChartPoint[]): ChartPoint[] {
    return points.map((p) => {
        const factor = p.priceFloor > 0 ? p.priceFloor : 1;
        return {
            ...p,
            avgPrice: p.avgPrice / factor,
            minPrice: p.minPrice / factor,
            maxPrice: p.maxPrice / factor,
            priceFloor: p.priceFloor > 0 ? 1 : p.priceFloor,
        };
    });
}

type Props = {
    planetId: string;
    productName: string;

    live?: LiveData;
};

function yDomainFor(points: ChartPoint[]): [number, number] {
    if (points.length === 0) {
        return [0, 1];
    }
    const mins = points.map((d) => Math.min(d.minPrice, d.priceFloor));
    const maxs = points.map((d) => d.maxPrice);
    const lo = Math.min(...mins);
    const hi = Math.max(...maxs);
    const mid = (lo + hi) / 2;
    const minSpread = Math.abs(mid) * 0.02 + 0.01;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < minSpread) {
        const v = Number.isFinite(mid) ? mid : 0;
        return [v - minSpread / 2, v + minSpread / 2];
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
        const e = Math.floor(Math.log10(minP));
        const lower = Math.pow(10, e);
        const upper = Math.pow(10, e + 1);
        return lower === upper ? [lower] : [lower, upper];
    }
    const result: number[] = [];
    for (let e = Math.floor(Math.log10(minP)); e <= Math.ceil(Math.log10(maxP)); e++) {
        result.push(Math.pow(10, e));
    }
    return result;
}

function logDomainFor(ticks: number[]): [number, number] {
    const min = Math.min(...ticks);
    const max = Math.max(...ticks);
    return [min, max];
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

const tooltipValueFormatter = (
    value: number,
    _name: string,
    rescaleMode: RescaleMode,
    planetId: string,
): [string, string] => {
    const labels: Record<string, string> = {
        avgPrice: 'Avg price',
        minPrice: 'Min price',
        maxPrice: 'Max price',
        priceFloor: 'Estimated Cost',
    };
    if (rescaleMode === 'relative') {
        const labelMap: Record<string, string> = {
            avgPrice: 'Rescaled price',
            minPrice: 'Rescaled Min price',
            maxPrice: 'Rescaled Max price',
            priceFloor: 'Resc.est. cost (1)',
        };
        const label = labelMap[_name] ?? _name;
        return [`${value.toFixed(2)}×`, label];
    }
    return [formatNumberWithUnit(value, 'currency', planetId), labels[_name] ?? _name];
};

type MergedPoint = {
    monthIdx?: number;
    year: number;
    tick: number;
    avgPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    priceFloor: number | null;
    ghostAvgPrice: number | null;
    ghostMinPrice: number | null;
    ghostMaxPrice: number | null;
    ghostPriceFloor: number | null;
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
    verticalGridValues,
    rescaleMode,
    planetId,
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
    verticalGridValues?: number[];
    rescaleMode: RescaleMode;
    planetId: string;
}) {
    const smallScreen = useIsSmallScreen();
    const mergedData = useMemo((): MergedPoint[] => {
        if (!ghostData || ghostData.length === 0) {
            return data.map((p) => ({
                ...p,
                ghostAvgPrice: null,
                ghostMinPrice: null,
                ghostMaxPrice: null,
                ghostPriceFloor: null,
            }));
        }
        const ghostByMonth = new Map(ghostData.filter((p) => p.monthIdx !== undefined).map((p) => [p.monthIdx!, p]));
        const currentByMonth = new Map(data.filter((p) => p.monthIdx !== undefined).map((p) => [p.monthIdx!, p]));
        const allIdxs = new Set([...currentByMonth.keys(), ...ghostByMonth.keys()]);
        return Array.from(allIdxs)
            .sort((a, b) => {
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
                    priceFloor: curr?.priceFloor ?? null,
                    ghostAvgPrice: ghost?.avgPrice ?? null,
                    ghostMinPrice: ghost?.minPrice ?? null,
                    ghostMaxPrice: ghost?.maxPrice ?? null,
                    ghostPriceFloor: ghost?.priceFloor ?? null,
                };
            });
    }, [data, ghostData]);

    const hasGhost = ghostData && ghostData.length > 0;

    const yTickFormatter = useMemo(() => {
        if (rescaleMode === 'relative') {
            return (v: number) => `${v.toFixed(1)}×`;
        }
        return (v: number) => (typeof v === 'number' ? formatNumberWithUnit(v, 'currency', planetId) : String(v));
    }, [rescaleMode, planetId]);

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
                    verticalValues={verticalGridValues ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
                    stroke='#334155'
                    strokeOpacity={verticalGridValues ? 0.95 : 0.7}
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
                    tickFormatter={yTickFormatter}
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
                                    const [val, name] = tooltipValueFormatter(
                                        p.value as number,
                                        p.name as string,
                                        rescaleMode,
                                        planetId,
                                    );
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
                <Legend
                    verticalAlign='bottom'
                    content={({ payload }) => {
                        if (!payload || payload.length === 0) {
                            return null;
                        }
                        let priceLabel: string;
                        let minMaxLabel: string;
                        let costLabel: string;
                        if (smallScreen) {
                            if (rescaleMode === 'relative') {
                                priceLabel = 'Sca. price';
                                minMaxLabel = 'Sca. min/max';
                                costLabel = 'Sca. Cost';
                            } else {
                                priceLabel = 'Avg Price';
                                minMaxLabel = 'Min/max Price';
                                costLabel = 'Est. Cost';
                            }
                        } else {
                            if (rescaleMode === 'relative') {
                                priceLabel = 'Scaled price';
                                minMaxLabel = 'Scaled min/max';
                                costLabel = 'Scaled Cost';
                            } else {
                                priceLabel = 'Average Price';
                                minMaxLabel = 'Min/max Price';
                                costLabel = 'Estimated Cost';
                            }
                        }
                        const entries = [
                            {
                                label: priceLabel,
                                stroke: '#f59e0b',
                                strokeWidth: 2,
                                strokeDasharray: undefined,
                            },
                            {
                                label: minMaxLabel,
                                stroke: '#38bdf8',
                                strokeWidth: 1.5,
                                strokeDasharray: '4 3',
                            },
                            {
                                label: costLabel,
                                stroke: '#ef444496',
                                strokeWidth: 2,
                                strokeDasharray: undefined,
                            },
                        ];
                        return (
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    gap: 16,
                                    padding: 0,
                                    flexWrap: 'wrap',
                                }}
                            >
                                {entries.map((e) => (
                                    <div
                                        key={e.label}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 5,
                                            fontSize: 11,
                                            color: '#94a3b8',
                                        }}
                                    >
                                        <svg width={16} height={10} viewBox='0 0 16 10'>
                                            <line
                                                x1={0}
                                                y1={5}
                                                x2={16}
                                                y2={5}
                                                stroke={e.stroke}
                                                strokeWidth={e.strokeWidth}
                                                strokeDasharray={e.strokeDasharray}
                                            />
                                        </svg>
                                        <span>{e.label}</span>
                                    </div>
                                ))}
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
                    activeDot={false}
                    isAnimationActive={false}
                    name='maxPrice'
                />
                <Area
                    type='monotone'
                    dataKey='minPrice'
                    stroke='#38bdf8'
                    strokeWidth={1}
                    strokeDasharray='3 3'
                    fill='var(--background, #0f172a)'
                    activeDot={false}
                    isAnimationActive={false}
                    name='minPrice'
                />
                <Area
                    type='monotone'
                    dataKey='priceFloor'
                    stroke='#ef444496'
                    strokeWidth={2}
                    fill='#ef444421'
                    activeDot={{ r: 2, fill: '#ef444496', stroke: '#1e293b', strokeWidth: 2 }}
                    isAnimationActive={false}
                    name='priceFloor'
                    connectNulls={false}
                />
                <Area
                    type='monotone'
                    dataKey='avgPrice'
                    stroke='#f59e0b'
                    strokeWidth={2}
                    fill='none'
                    dot={{ r: 2.5, fill: '#f59e0b' }}
                    activeDot={{ r: 3, fill: '#f59e0b', stroke: '#1e293b', strokeWidth: 2 }}
                    isAnimationActive={false}
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
                        dot={{ r: 2, fill: '#f59e0b', fillOpacity: 0.4, stroke: 'none' }}
                        activeDot={false}
                        isAnimationActive={false}
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
                        isAnimationActive={false}
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
                        activeDot={false}
                        isAnimationActive={false}
                        name='ghostMinPrice'
                        connectNulls={false}
                    />
                )}
                {hasGhost && (
                    <Area
                        type='monotone'
                        dataKey='ghostPriceFloor'
                        stroke='#ef444496'
                        strokeWidth={2}
                        strokeOpacity={0.35}
                        strokeDasharray='5 5'
                        fill='none'
                        activeDot={false}
                        isAnimationActive={false}
                        name='ghostPriceFloor'
                        connectNulls={false}
                    />
                )}
            </AreaChart>
        </ResponsiveContainer>
    );
}

function MonthlyChart({
    monthlyPoints,
    live,
    productName,
    rescaleMode,
    planetId,
}: {
    monthlyPoints: RawPoint[];
    live?: LiveData;
    productName: string;
    rescaleMode: RescaleMode;
    planetId: string;
}) {
    const data = useMemo(
        (): ChartPoint[] => computeMonthlyData(monthlyPoints, live ?? { tick: 0, price: 0 }, productName),
        [monthlyPoints, live, productName],
    );

    const ghostData = useMemo(
        (): ChartPoint[] => (live ? computeMonthlyGhostData(monthlyPoints, live, data) : []),
        [monthlyPoints, live, data],
    );

    const scaleData = useMemo(() => (rescaleMode === 'relative' ? rescalePoints(data) : data), [data, rescaleMode]);
    const scaleGhostData = useMemo(
        () => (rescaleMode === 'relative' && ghostData.length > 0 ? rescalePoints(ghostData) : ghostData),
        [ghostData, rescaleMode],
    );

    const yDomain = useMemo(() => yDomainFor([...scaleData, ...scaleGhostData]), [scaleData, scaleGhostData]);
    const gradId = `grad_mon_${productName.replace(/\s+/g, '_')}`;

    const formatMonthTick = (monthIdx: number): string => MONTH_NAMES[(Math.ceil(monthIdx) + 11) % 12] ?? '';

    const monthTooltipLabel = (monthIdx: number): string => {
        if (!Number.isInteger(monthIdx)) {
            return `Live data`;
        }
        const pt = data.find((p) => p.monthIdx === monthIdx);
        const { year: yearInt } = pt ? tickToDate(pt.tick) : { year: 0 };
        const label = MONTH_NAMES[(monthIdx + 11) % 12] ?? '';
        return `End of ${label} ${yearInt}`;
    };

    return (
        <div style={{ width: '100%', height: 240 }}>
            <SimplePriceAreaChart
                data={scaleData}
                ghostData={scaleGhostData}
                gradId={gradId}
                xDataKey='monthIdx'
                xDomain={[0, 12]}
                xTicks={[0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]}
                xTickFormatter={formatMonthTick}
                tooltipLabelFormatter={monthTooltipLabel}
                scale='linear'
                yDomain={yDomain}
                yTicks={data.length === 0 ? [] : undefined}
                rescaleMode={rescaleMode}
                planetId={planetId}
            />
        </div>
    );
}

function YearlyChart({
    yearlyPoints,
    productName,
    rescaleMode,
    planetId,
}: {
    yearlyPoints: RawPoint[];
    productName: string;
    rescaleMode: RescaleMode;
    planetId: string;
}) {
    const data = useMemo((): ChartPoint[] => {
        return [...yearlyPoints]
            .sort((a, b) => a.bucket - b.bucket)
            .map((p) => ({
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR + START_YEAR + 1,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
                priceFloor: p.priceFloor,
            }));
    }, [yearlyPoints]);

    const scaleData = useMemo(() => (rescaleMode === 'relative' ? rescalePoints(data) : data), [data, rescaleMode]);

    const useLog = useMemo(() => usesLogScale(scaleData), [scaleData]);
    const yTicks = useMemo(() => (useLog ? logTicksFor(scaleData) : undefined), [scaleData, useLog]);
    const yDomain = useMemo(
        () => (useLog && yTicks ? logDomainFor(yTicks) : yDomainFor(scaleData)),
        [scaleData, useLog, yTicks],
    );
    const gradId = `grad_yr_${productName.replace(/\s+/g, '_')}`;

    const xMin = data.length > 0 ? data[0].year : 0;
    const xDomain: [number, number] = [xMin, xMin + 10];
    const xTicks = Array.from({ length: 10 }, (_, i) => xMin + i + 0.5);
    const verticalGridValues = Array.from({ length: 11 }, (_, i) => xMin + i);

    const formatYearTick = (year: number): string => `${Math.floor(year)}`;

    const yearTooltipLabel = (year: number): string => {
        return `Start of ${Math.floor(year)}`;
    };

    return (
        <div style={{ width: '100%', height: 240 }}>
            <SimplePriceAreaChart
                data={scaleData}
                gradId={gradId}
                xDataKey='year'
                xDomain={xDomain}
                xTicks={xTicks}
                xTickFormatter={formatYearTick}
                tooltipLabelFormatter={yearTooltipLabel}
                scale={useLog ? 'log' : 'linear'}
                yDomain={yDomain}
                yTicks={data.length === 0 ? [] : yTicks}
                verticalGridValues={verticalGridValues}
                rescaleMode={rescaleMode}
                planetId={planetId}
            />
        </div>
    );
}

function DecadesChart({
    decadePoints,
    productName,
    rescaleMode,
    planetId,
}: {
    decadePoints: RawPoint[];
    productName: string;
    rescaleMode: RescaleMode;
    planetId: string;
}) {
    const data = useMemo((): ChartPoint[] => {
        return [...decadePoints]
            .sort((a, b) => a.bucket - b.bucket)
            .map((p) => ({
                tick: p.bucket,
                year: p.bucket / TICKS_PER_YEAR + START_YEAR,
                avgPrice: p.avgPrice,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,
                priceFloor: p.priceFloor,
            }));
    }, [decadePoints]);

    const scaleData = useMemo(() => (rescaleMode === 'relative' ? rescalePoints(data) : data), [data, rescaleMode]);

    const useLog = useMemo(() => usesLogScale(scaleData), [scaleData]);
    const yTicks = useMemo(() => (useLog ? logTicksFor(scaleData) : undefined), [scaleData, useLog]);
    const yDomain = useMemo(
        () => (useLog && yTicks ? logDomainFor(yTicks) : yDomainFor(scaleData)),
        [scaleData, useLog, yTicks],
    );
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
        <div style={{ width: '100%', height: 240 }}>
            <SimplePriceAreaChart
                data={scaleData}
                gradId={gradId}
                xDataKey='year'
                xDomain={['dataMin', 'dataMax']}
                xTickFormatter={formatYearTick}
                tooltipLabelFormatter={yearTooltipLabel}
                scale={useLog ? 'log' : 'linear'}
                yDomain={yDomain}
                yTicks={data.length === 0 ? [] : yTicks}
                rescaleMode={rescaleMode}
                planetId={planetId}
            />
        </div>
    );
}

export default function ProductPriceHistoryChart({ planetId, productName, live }: Props): React.ReactElement {
    const trpc = useTRPC();
    const { granularity, setGranularity, currentTick } = useGranularity();
    const [rescaleMode, setRescaleMode] = useState<RescaleMode>('absolute');

    const smallScreen = useIsSmallScreen();

    const { data: monthly, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions(
            {
                planetId,
                productName,
                granularity: 'monthly',
                limit: 13,
            },
            { enabled: granularity === 'monthly' },
        ),
    );
    const { data: yearly, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions(
            {
                planetId,
                productName,
                granularity: 'yearly',
                limit: 11,
            },
            { enabled: granularity === 'yearly' },
        ),
    );
    const { data: decade, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getProductPriceHistory.queryOptions(
            { planetId, productName, granularity: 'decade' },
            { enabled: granularity === 'decade' },
        ),
    );

    const isLoading =
        (granularity === 'monthly' && (loadingMonthly || !monthly)) ||
        (granularity === 'yearly' && (loadingYearly || !yearly)) ||
        (granularity === 'decade' && (loadingDecade || !decade));

    const monthlyPoints = useMemo(
        () =>
            (monthly?.history ?? []).map((r) => ({
                bucket: r.bucket,
                avgPrice: r.avgPrice,
                minPrice: r.minPrice,
                maxPrice: r.maxPrice,
                priceFloor: r.priceFloor,
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
                priceFloor: r.priceFloor,
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
                priceFloor: r.priceFloor,
            })),
        [decade],
    );

    return (
        <div className={isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : undefined}>
            <GranularityHeader
                className='pb-2'
                title={
                    <span className='pb-2'>
                        <Tabs value={rescaleMode} onValueChange={(v) => setRescaleMode(v as RescaleMode)}>
                            <TabsList className='h-6 p-0'>
                                <TabsTrigger
                                    value='absolute'
                                    className='text-xs px-2 bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                                >
                                    Price
                                </TabsTrigger>
                                <TabsTrigger
                                    value='relative'
                                    className='text-xs px-2 bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                                >
                                    {smallScreen ? 'P/C' : 'Price/Cost'}
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </span>
                }
                granularity={granularity}
                onGranularityChange={setGranularity}
                currentTick={currentTick}
            />
            {granularity === 'monthly' && (
                <MonthlyChart
                    monthlyPoints={monthlyPoints}
                    live={monthlyPoints.length === 0 ? undefined : live}
                    productName={productName}
                    rescaleMode={rescaleMode}
                    planetId={planetId}
                />
            )}
            {granularity === 'yearly' && (
                <YearlyChart
                    yearlyPoints={yearlyPoints}
                    productName={productName}
                    rescaleMode={rescaleMode}
                    planetId={planetId}
                />
            )}
            {granularity === 'decade' && (
                <DecadesChart
                    decadePoints={decadePoints}
                    productName={productName}
                    rescaleMode={rescaleMode}
                    planetId={planetId}
                />
            )}
        </div>
    );
}
