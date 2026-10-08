'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { liveYearX } from '@/lib/chartTime';
import {
    DECADE_WINDOW,
    PREVIOUS_DECEMBER_END_IDX,
    YEAR_WINDOW,
    decadeCentre,
    decadeStart,
    decadeWindowAxis,
    formatDecadeLabel,
    formatMonthLabel,
    formatYearLabel,
    ghostMonthEndVisible,
    isLiveMonthEndPoint,
    monthAxis,
    monthEnd,
    yearCentre,
    yearStart,
    yearWindowAxis,
} from '@/lib/historyChartAxis';
import { TICKS_PER_MONTH } from '@/simulation/constants';
import { useLocale, useTranslations } from 'next-intl';
import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';

const BUFFER_LABEL_KEYS = {
    grocery: 'buffers.grocery',
    healthcare: 'buffers.healthcare',
    logistics: 'buffers.logistics',
    education: 'buffers.education',
    retail: 'buffers.retail',
    construction: 'buffers.construction',
} as const;

const BUFFER_COLORS: Record<string, string> = {
    grocery: '#22c55e',
    healthcare: '#ef4444',
    logistics: '#f59e0b',
    education: '#a855f7',
    retail: '#06b6d4',
    construction: '#f97316',
};

const BUFFER_KEYS = ['grocery', 'healthcare', 'logistics', 'education', 'retail', 'construction'] as const;

type RawPoint = {
    bucket: number;
    avgPopulation: number;
    avgGroceryBuffer: number;
    avgHealthcareBuffer: number;
    avgLogisticsBuffer: number;
    avgEducationBuffer: number;
    avgRetailBuffer: number;
    avgConstructionBuffer: number;
};

type LiveBufferData = {
    tick: number;
    groceryBuffer: number;
    healthcareBuffer: number;
    logisticsBuffer: number;
    educationBuffer: number;
    retailBuffer: number;
    constructionBuffer: number;
};

type ChartPoint = {
    tick: number;
    year: number;
    monthIdx?: number;
} & Record<string, number>;

type Granularity = 'monthly' | 'yearly' | 'decade';

function toPercent(bufferValue: number): number {
    return Math.min(100, bufferValue * 100);
}

function computeMonthlyData(allPts: RawPoint[], currentTick: number, live: LiveBufferData): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    if (pts.length === 0 && currentTick === 0) {
        return [];
    }

    const latestYear = tickToDate(currentTick).year;

    const result: ChartPoint[] = pts
        .filter((p) => tickToDate(p.bucket).year === latestYear)
        .map((p) => {
            const point: ChartPoint = {
                tick: p.bucket,
                year: latestYear,
                monthIdx: monthEnd(p.bucket),
            };
            for (const key of BUFFER_KEYS) {
                const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
                point[key] = toPercent(p[dbKey] as number);
            }
            return point;
        });

    const prevDecPoint = pts.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });
    if (prevDecPoint) {
        const prev: ChartPoint = {
            tick: prevDecPoint.bucket,
            year: latestYear - 1,
            monthIdx: PREVIOUS_DECEMBER_END_IDX,
        };
        for (const key of BUFFER_KEYS) {
            const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
            prev[key] = toPercent(prevDecPoint[dbKey] as number);
        }
        result.unshift(prev);
    } else {
        const lastBefore = [...pts].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBefore) {
            const prev: ChartPoint = {
                tick: lastBefore.bucket,
                year: latestYear - 1,
                monthIdx: PREVIOUS_DECEMBER_END_IDX,
            };
            for (const key of BUFFER_KEYS) {
                const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
                prev[key] = toPercent(lastBefore[dbKey] as number);
            }
            result.unshift(prev);
        }
    }

    // Insert live data point with fractional month index
    if (live.tick > 0) {
        const { year: liveYear, monthIndex: liveMi, day: liveDay } = tickToDate(live.tick);
        if (liveYear === latestYear) {
            const dayFraction = Math.max(liveDay - 1, 0.001) / TICKS_PER_MONTH;
            const fractionalMonthIdx = liveMi + dayFraction;

            const livePoint: ChartPoint = {
                tick: live.tick,
                year: liveYear,
                monthIdx: fractionalMonthIdx,
            };
            for (const key of BUFFER_KEYS) {
                livePoint[key] = toPercent(live[`${key}Buffer` as keyof LiveBufferData] as number);
            }
            result.push(livePoint);
        }
    }

    return result;
}

function computeBufferGhostData(allPts: RawPoint[], currentTick: number): ChartPoint[] {
    if (allPts.length === 0 && currentTick === 0) {
        return [];
    }

    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    const { year: latestYear, monthIndex, day } = tickToDate(currentTick);
    const livePosition = monthIndex + Math.max(day - 1, 0.001) / TICKS_PER_MONTH;

    return pts
        .filter((p) => tickToDate(p.bucket).year === latestYear - 1 && ghostMonthEndVisible(p.bucket, livePosition))
        .map((p) => {
            const point: ChartPoint = {
                tick: p.bucket,
                year: latestYear - 1,
                monthIdx: monthEnd(p.bucket),
            };
            for (const key of BUFFER_KEYS) {
                const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
                point[key] = toPercent(p[dbKey] as number);
            }
            return point;
        });
}

function computeYearlyData(allPts: RawPoint[]): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket).slice(-YEAR_WINDOW);
    return pts.map((p) => {
        const point: ChartPoint = {
            tick: p.bucket,
            year: yearCentre(p.bucket),
        };
        for (const key of BUFFER_KEYS) {
            const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
            point[key] = toPercent(p[dbKey] as number);
        }
        return point;
    });
}

function computeDecadeData(allPts: RawPoint[]): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket).slice(-DECADE_WINDOW);
    return pts.map((p) => {
        const point: ChartPoint = {
            tick: p.bucket,
            year: decadeCentre(p.bucket),
        };
        for (const key of BUFFER_KEYS) {
            const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
            point[key] = toPercent(p[dbKey] as number);
        }
        return point;
    });
}

function EmptyChart() {
    const t = useTranslations('Demographics');
    return (
        <div
            className='w-full rounded border border-dashed border-muted flex items-center justify-center text-xs text-muted-foreground'
            style={{ height: 240 }}
        >
            {t('noData')}
        </div>
    );
}

function mergeMonthlyChartData(data: ChartPoint[], ghostData?: ChartPoint[]): ChartPoint[] {
    if (!ghostData || ghostData.length === 0) {
        return data;
    }
    const currentByMonthIdx = new Map(data.map((p) => [p.monthIdx as number, p]));
    const ghostByMonthIdx = new Map(ghostData.map((p) => [p.monthIdx as number, p]));
    const allIdxs = Array.from(new Set([...currentByMonthIdx.keys(), ...ghostByMonthIdx.keys()]));
    return allIdxs
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
            const point: Record<string, number | null> = {
                tick: (curr ?? ghost)?.tick ?? 0,
                year: (curr ?? ghost)?.year ?? 0,
                monthIdx,
            };
            for (const key of BUFFER_KEYS) {
                point[key] = (curr?.[key] as number | null | undefined) ?? null;
            }
            for (const key of BUFFER_KEYS) {
                const ghostKey = `ghost${key.charAt(0).toUpperCase() + key.slice(1)}`;
                point[ghostKey] = (ghost?.[key] as number | null | undefined) ?? null;
            }
            return point as unknown as ChartPoint;
        });
}

function BufferAreaChart({
    data,
    ghostData,
    granularity,
    xKey,
    xDomain,
    xTicks,
    xFormatter,
    gridVertical,
    gridValues,
    tickFormatter,
    xAllowDataOverflow,
}: {
    data: ChartPoint[];
    ghostData?: ChartPoint[];
    granularity: Granularity;
    xKey: string;
    xDomain?: [number, number];
    xTicks?: number[];
    xFormatter: (v: number) => string;
    gridVertical: boolean;
    gridValues?: number[];
    tickFormatter?: (v: number) => string;
    xAllowDataOverflow?: boolean;
}) {
    const chartData = useMemo(() => mergeMonthlyChartData(data, ghostData), [data, ghostData]);
    const tr = useTranslations('Demographics');
    const locale = useLocale();

    return (
        <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <defs>
                        {BUFFER_KEYS.map((key) => (
                            <linearGradient key={key} id={`grad${key}`} x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='5%' stopColor={BUFFER_COLORS[key]} stopOpacity={0.1} />
                                <stop offset='95%' stopColor={BUFFER_COLORS[key]} stopOpacity={0.0} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid
                        vertical={gridVertical}
                        horizontal={false}
                        verticalValues={gridValues}
                        stroke='#334155'
                        strokeOpacity={gridVertical ? 0.7 : 1}
                    />
                    <XAxis
                        dataKey={xKey}
                        type='number'
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        domain={xDomain ?? ['dataMin', 'dataMax']}
                        ticks={xTicks}
                        tickFormatter={xFormatter}
                        allowDataOverflow={xAllowDataOverflow}
                        minTickGap={xTicks ? 0 : 36}
                    />
                    <YAxis
                        type='number'
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                        tickFormatter={tickFormatter ?? ((v) => `${Math.round(v as number)}%`)}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) {
                                return null;
                            }
                            const visible = payload.filter((entry) => !String(entry.dataKey).startsWith('ghost'));
                            if (visible.length === 0) {
                                return null;
                            }
                            const point = payload[0]?.payload as ChartPoint | undefined;
                            const pointLabel =
                                granularity === 'monthly'
                                    ? formatMonthLabel(
                                          locale,
                                          point ? tickToDate(point.tick).monthIndex : Math.floor(label as number),
                                          point ? tickToDate(point.tick).year : 0,
                                      )
                                    : granularity === 'yearly'
                                      ? formatYearLabel(locale, label as number)
                                      : formatDecadeLabel(locale, label as number);
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
                                    <div style={{ color: '#94a3b8', marginBottom: 4 }}>{pointLabel}</div>
                                    {visible.map((p) => {
                                        const labelKey = BUFFER_LABEL_KEYS[p.name as keyof typeof BUFFER_LABEL_KEYS];
                                        return (
                                            <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
                                                {labelKey ? tr(labelKey) : String(p.name)}:{' '}
                                                <span style={{ color: '#e2e8f0' }}>
                                                    {typeof p.value === 'number' ? p.value.toFixed(1) : '0'}%
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8', paddingTop: 4 }} />
                    {BUFFER_KEYS.map((key) => {
                        const color = BUFFER_COLORS[key];
                        return (
                            <Area
                                key={key}
                                type='monotone'
                                dataKey={key}
                                name={key}
                                stroke={color}
                                strokeWidth={1.5}
                                fill={`url(#grad${key})`}
                                dot={(props: { cx: number; cy: number; payload: ChartPoint }) => {
                                    const { cx, cy, payload } = props;
                                    const monthIdx = payload?.monthIdx;
                                    const tick = payload?.tick;
                                    const dotKey = monthIdx ?? tick;
                                    const value = payload?.[key];
                                    if (monthIdx === PREVIOUS_DECEMBER_END_IDX) {
                                        return <circle key={`${key}_${dotKey}_anchor`} r={0} visibility='hidden' />;
                                    }
                                    if (value == null || typeof value !== 'number') {
                                        return <circle key={`${key}_${dotKey}_null`} r={0} visibility='hidden' />;
                                    }
                                    if (cx != null && !isNaN(cx) && isLiveMonthEndPoint(monthIdx)) {
                                        return (
                                            <circle
                                                key={`${key}_${dotKey}_live`}
                                                cx={cx}
                                                cy={cy}
                                                r={3.5}
                                                fill={color}
                                            />
                                        );
                                    }
                                    if (cx != null && !isNaN(cx)) {
                                        return <circle key={`${key}_${dotKey}`} cx={cx} cy={cy} r={2.5} fill={color} />;
                                    }
                                    return <circle key={`${key}_${dotKey}_hidden`} r={0} visibility='hidden' />;
                                }}
                                activeDot={{ r: 3 }}
                                isAnimationActive={false}
                                connectNulls={false}
                            />
                        );
                    })}
                    {ghostData &&
                        ghostData.length > 0 &&
                        BUFFER_KEYS.map((key) => {
                            const ghostKey = `ghost${key.charAt(0).toUpperCase() + key.slice(1)}`;
                            return (
                                <Area
                                    key={ghostKey}
                                    type='monotone'
                                    dataKey={ghostKey}
                                    stroke={BUFFER_COLORS[key]}
                                    strokeWidth={1}
                                    strokeOpacity={0.5}
                                    strokeDasharray='4 2'
                                    fill='none'
                                    dot={(props: { cx: number; cy: number; payload: ChartPoint }) => {
                                        const { cx, cy, payload } = props;
                                        const ghostKey = `ghost${key.charAt(0).toUpperCase() + key.slice(1)}`;
                                        const monthIdx = payload?.monthIdx;
                                        const value = payload?.[ghostKey];
                                        if (value == null || typeof value !== 'number') {
                                            return (
                                                <circle
                                                    key={`${ghostKey}_${monthIdx}_null`}
                                                    r={0}
                                                    visibility='hidden'
                                                />
                                            );
                                        }
                                        if (cx != null && !isNaN(cx)) {
                                            return (
                                                <circle
                                                    key={`${ghostKey}_${monthIdx}`}
                                                    cx={cx}
                                                    cy={cy}
                                                    r={2}
                                                    fill={BUFFER_COLORS[key]}
                                                    fillOpacity={0.4}
                                                    stroke='none'
                                                />
                                            );
                                        }
                                        return (
                                            <circle key={`${ghostKey}_${monthIdx}_invis`} r={0} visibility='hidden' />
                                        );
                                    }}
                                    activeDot={false}
                                    legendType='none'
                                    isAnimationActive={false}
                                    connectNulls={false}
                                />
                            );
                        })}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

type Props = {
    monthlyPoints: RawPoint[];
    yearlyPoints: RawPoint[];
    decadePoints: RawPoint[];
    currentTick: number;
    granularity: Granularity;
    isLoading?: boolean;
    live: LiveBufferData;
};

export default function PlanetBufferChart({
    monthlyPoints,
    yearlyPoints,
    decadePoints,
    currentTick,
    granularity,
    isLoading: externalLoading,
    live,
}: Props): React.ReactElement {
    const isLoading = externalLoading ?? false;
    const locale = useLocale();

    const monthlyChartData = useMemo(
        () => computeMonthlyData(monthlyPoints, currentTick, live),
        [monthlyPoints, currentTick, live],
    );
    const ghostData = useMemo(() => computeBufferGhostData(monthlyPoints, currentTick), [monthlyPoints, currentTick]);
    const liveRow = useMemo((): ChartPoint | null => {
        if (!live || live.tick <= 0) {
            return null;
        }
        const point: ChartPoint = { tick: live.tick, year: liveYearX(live.tick) };
        for (const key of BUFFER_KEYS) {
            point[key] = toPercent(live[`${key}Buffer` as keyof LiveBufferData] as number);
        }
        return point;
    }, [live]);
    const yearlyChartData = useMemo(() => {
        const rows = computeYearlyData(yearlyPoints);
        return liveRow ? [...rows, liveRow] : rows;
    }, [yearlyPoints, liveRow]);
    const decadeChartData = useMemo(() => {
        const rows = computeDecadeData(decadePoints);
        return liveRow ? [...rows, liveRow] : rows;
    }, [decadePoints, liveRow]);

    const monthlyX = monthAxis(locale);
    const yearlyX =
        yearlyChartData.length > 0
            ? yearWindowAxis(yearStart(yearlyChartData[0].tick), yearlyChartData[yearlyChartData.length - 1].year)
            : yearWindowAxis(undefined, undefined);
    const decadeX =
        decadeChartData.length > 0
            ? decadeWindowAxis(decadeStart(decadeChartData[0].tick), decadeChartData[decadeChartData.length - 1].year)
            : decadeWindowAxis(undefined, undefined);

    return (
        <div className={isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : undefined}>
            {granularity === 'monthly' &&
                (monthlyChartData.length > 0 ? (
                    <BufferAreaChart
                        data={monthlyChartData}
                        ghostData={ghostData}
                        granularity={granularity}
                        xKey='monthIdx'
                        xDomain={monthlyX.domain}
                        xTicks={monthlyX.ticks}
                        xFormatter={monthlyX.tickFormatter}
                        gridVertical={true}
                        gridValues={monthlyX.gridValues}
                        xAllowDataOverflow
                    />
                ) : (
                    <EmptyChart />
                ))}
            {granularity === 'yearly' &&
                (yearlyChartData.length > 0 ? (
                    <BufferAreaChart
                        data={yearlyChartData}
                        granularity={granularity}
                        xKey='year'
                        xDomain={yearlyX.domain}
                        xTicks={yearlyX.ticks}
                        xFormatter={yearlyX.tickFormatter}
                        gridVertical={true}
                        gridValues={yearlyX.gridValues}
                    />
                ) : (
                    <EmptyChart />
                ))}
            {granularity === 'decade' &&
                (decadeChartData.length > 0 ? (
                    <BufferAreaChart
                        data={decadeChartData}
                        granularity={granularity}
                        xKey='year'
                        xDomain={decadeX.domain}
                        xTicks={decadeX.ticks}
                        xFormatter={decadeX.tickFormatter}
                        gridVertical={true}
                        gridValues={decadeX.gridValues}
                    />
                ) : (
                    <EmptyChart />
                ))}
        </div>
    );
}
