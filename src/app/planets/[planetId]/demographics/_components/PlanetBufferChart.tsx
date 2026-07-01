'use client';

import { tickToDate } from '@/components/client/TickDisplay';
import { TICKS_PER_MONTH, START_YEAR } from '@/simulation/constants';
import { SERVICE_DEFINITIONS } from '@/simulation/market/serviceDefinitions';
import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';

const BUFFER_LABELS: Record<string, string> = {
    grocery: 'Grocery',
    healthcare: 'Healthcare',
    logistics: 'Logistics',
    education: 'Education',
    retail: 'Retail',
    construction: 'Construction',
    maintenance: 'Maintenance',
    administration: 'Administration',
};

const BUFFER_COLORS: Record<string, string> = {
    grocery: '#22c55e',
    healthcare: '#ef4444',
    logistics: '#f59e0b',
    education: '#a855f7',
    retail: '#06b6d4',
    construction: '#f97316',
    maintenance: '#64748b',
    administration: '#3b82f6',
};

const BUFFER_KEYS = [
    'grocery',
    'healthcare',
    'logistics',
    'education',
    'retail',
    'construction',
    'maintenance',
    'administration',
] as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHLY_X_TICKS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5];
const MONTHLY_GRID_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type RawPoint = {
    bucket: number;
    avgPopulation: number;
    avgGroceryBuffer: number;
    avgHealthcareBuffer: number;
    avgLogisticsBuffer: number;
    avgEducationBuffer: number;
    avgRetailBuffer: number;
    avgConstructionBuffer: number;
    avgMaintenanceBuffer: number;
    avgAdministrationBuffer: number;
};

type ChartPoint = {
    tick: number;
    year: number;
    monthIdx?: number;
} & Record<string, number>;

function bufferTargetTicks(serviceKey: string): number {
    return SERVICE_DEFINITIONS[serviceKey as keyof typeof SERVICE_DEFINITIONS]?.bufferTargetTicks ?? TICKS_PER_MONTH;
}

function toPercent(bufferValue: number, serviceKey: string): number {
    const target = bufferTargetTicks(serviceKey);
    return Math.min(100, (bufferValue / target) * 100);
}

function computeMonthlyData(allPts: RawPoint[], currentTick: number): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    if (pts.length === 0 && currentTick === 0) {
        return [];
    }

    const latestYear = tickToDate(currentTick).year;

    const result: ChartPoint[] = pts
        .filter((p) => tickToDate(p.bucket).year === latestYear)
        .map((p) => {
            const { monthIndex } = tickToDate(p.bucket);
            const point: ChartPoint = {
                tick: p.bucket,
                year: latestYear,
                monthIdx: monthIndex + 1,
            };
            for (const key of BUFFER_KEYS) {
                const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
                point[key] = toPercent(p[dbKey] as number, key);
            }
            return point;
        });

    const prevDecPoint = pts.find((p) => {
        const { year, monthIndex } = tickToDate(p.bucket);
        return year === latestYear - 1 && monthIndex === 11;
    });
    if (prevDecPoint) {
        const prev: ChartPoint = { tick: prevDecPoint.bucket, year: latestYear - 1, monthIdx: 0 };
        for (const key of BUFFER_KEYS) {
            const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
            prev[key] = toPercent(prevDecPoint[dbKey] as number, key);
        }
        result.unshift(prev);
    } else {
        const lastBefore = [...pts].reverse().find((p) => tickToDate(p.bucket).year < latestYear);
        if (lastBefore) {
            const prev: ChartPoint = {
                tick: lastBefore.bucket,
                year: lastBefore.bucket / TICKS_PER_MONTH,
                monthIdx: 0,
            };
            for (const key of BUFFER_KEYS) {
                const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
                prev[key] = toPercent(lastBefore[dbKey] as number, key);
            }
            result.unshift(prev);
        }
    }

    return result;
}

function computeBufferGhostData(allPts: RawPoint[], currentTick: number): ChartPoint[] {
    if (allPts.length === 0 && currentTick === 0) {
        return [];
    }

    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    const { year: latestYear, monthIndex: currentMonthIndex } = tickToDate(currentTick);
    const currentMonthIdx = currentMonthIndex + 1;

    return pts
        .filter((p) => {
            const { year, monthIndex } = tickToDate(p.bucket);
            return year === latestYear - 1 && monthIndex + 1 >= currentMonthIdx;
        })
        .map((p) => {
            const { monthIndex } = tickToDate(p.bucket);
            const point: ChartPoint = {
                tick: p.bucket,
                year: latestYear - 1,
                monthIdx: monthIndex + 1,
            };
            for (const key of BUFFER_KEYS) {
                const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
                point[key] = toPercent(p[dbKey] as number, key);
            }
            return point;
        });
}

function computeYearlyData(allPts: RawPoint[]): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    return pts.map((p) => {
        const point: ChartPoint = {
            tick: p.bucket,
            year: p.bucket / TICKS_PER_MONTH / 12 + START_YEAR + 1,
        };
        for (const key of BUFFER_KEYS) {
            const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
            point[key] = toPercent(p[dbKey] as number, key);
        }
        return point;
    });
}

function computeDecadeData(allPts: RawPoint[]): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    return pts.map((p) => {
        const point: ChartPoint = {
            tick: p.bucket,
            year: p.bucket / TICKS_PER_MONTH / 12 + START_YEAR,
        };
        for (const key of BUFFER_KEYS) {
            const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
            point[key] = toPercent(p[dbKey] as number, key);
        }
        return point;
    });
}

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
    xKey,
    xDomain,
    xTicks,
    xFormatter,
    gridVertical,
    gridValues,
    tickFormatter,
}: {
    data: ChartPoint[];
    ghostData?: ChartPoint[];
    xKey: string;
    xDomain?: [number, number];
    xTicks?: number[];
    xFormatter: (v: number) => string;
    gridVertical: boolean;
    gridValues?: number[];
    tickFormatter?: (v: number) => string;
}) {
    const chartData = useMemo(() => mergeMonthlyChartData(data, ghostData), [data, ghostData]);

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
                            const monthLabel = xFormatter(label as number);
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
                                    <div style={{ color: '#94a3b8', marginBottom: 4 }}>End of {monthLabel}.</div>
                                    {visible.map((p) => (
                                        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
                                            {BUFFER_LABELS[String(p.name)] ?? p.name}:{' '}
                                            <span style={{ color: '#e2e8f0' }}>
                                                {typeof p.value === 'number' ? p.value.toFixed(1) : '0'}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            );
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8', paddingTop: 4 }} />
                    {BUFFER_KEYS.map((key) => (
                        <Area
                            key={key}
                            type='monotone'
                            dataKey={key}
                            name={key}
                            stroke={BUFFER_COLORS[key]}
                            strokeWidth={1.5}
                            fill={`url(#grad${key})`}
                            dot={{ r: 2.5, fill: BUFFER_COLORS[key] }}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                        />
                    ))}
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
                                    dot={{ r: 2, fill: BUFFER_COLORS[key], fillOpacity: 0.4, stroke: 'none' }}
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
    granularity: 'monthly' | 'yearly' | 'decade';
    isLoading?: boolean;
};

export default function PlanetBufferChart({
    monthlyPoints,
    yearlyPoints,
    decadePoints,
    currentTick,
    granularity,
    isLoading: externalLoading,
}: Props): React.ReactElement {
    const isLoading = externalLoading ?? false;

    const monthlyChartData = useMemo(
        () => computeMonthlyData(monthlyPoints, currentTick),
        [monthlyPoints, currentTick],
    );
    const ghostData = useMemo(() => computeBufferGhostData(monthlyPoints, currentTick), [monthlyPoints, currentTick]);
    const yearlyChartData = useMemo(() => computeYearlyData(yearlyPoints), [yearlyPoints]);
    const decadeChartData = useMemo(() => computeDecadeData(decadePoints), [decadePoints]);

    const xFormatter = (v: number): string => {
        if (granularity === 'monthly') {
            const mi = Math.round(v) - 1;
            return MONTH_NAMES[((mi % 12) + 12) % 12] ?? '';
        }
        return `${Math.round(v - 1)}`;
    };

    const yearTicks = useMemo(() => {
        if (yearlyChartData.length === 0) {
            return undefined;
        }
        const xMin = yearlyChartData[0].year;
        return Array.from({ length: 10 }, (_, i) => xMin + i + 0.5);
    }, [yearlyChartData]);

    const yearXDomain = useMemo((): [number, number] | undefined => {
        if (yearlyChartData.length === 0) {
            return undefined;
        }
        const xMin = yearlyChartData[0].year;
        return [xMin, xMin + 10];
    }, [yearlyChartData]);

    const yearGridValues = useMemo(() => {
        if (yearlyChartData.length === 0) {
            return undefined;
        }
        const xMin = yearlyChartData[0].year;
        return Array.from({ length: 11 }, (_, i) => xMin + i);
    }, [yearlyChartData]);

    return (
        <div className={isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : undefined}>
            {granularity === 'monthly' &&
                (monthlyChartData.length > 0 ? (
                    <BufferAreaChart
                        data={monthlyChartData}
                        ghostData={ghostData}
                        xKey='monthIdx'
                        xDomain={[0, 12]}
                        xTicks={MONTHLY_X_TICKS}
                        xFormatter={xFormatter}
                        gridVertical={true}
                        gridValues={MONTHLY_GRID_VALUES}
                    />
                ) : (
                    <EmptyChart />
                ))}
            {granularity === 'yearly' &&
                (yearlyChartData.length > 0 ? (
                    <BufferAreaChart
                        data={yearlyChartData}
                        xKey='year'
                        xDomain={yearXDomain}
                        xTicks={yearTicks}
                        xFormatter={xFormatter}
                        gridVertical={true}
                        gridValues={yearGridValues}
                    />
                ) : (
                    <EmptyChart />
                ))}
            {granularity === 'decade' &&
                (decadeChartData.length > 0 ? (
                    <BufferAreaChart data={decadeChartData} xKey='year' xFormatter={xFormatter} gridVertical={false} />
                ) : (
                    <EmptyChart />
                ))}
        </div>
    );
}
