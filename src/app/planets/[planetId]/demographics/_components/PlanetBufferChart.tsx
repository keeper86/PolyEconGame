'use client';

import { Card, CardContent } from '@/components/ui/card';
import { GranularityButtonGroup } from '@/components/client/GranularityButtonGroup';
import { tickToDate } from '@/components/client/TickDisplay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { TICKS_PER_MONTH, START_YEAR } from '@/simulation/constants';
import { SERVICE_DEFINITIONS } from '@/simulation/market/serviceDefinitions';
import React, { useMemo, useState } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Legend,
} from 'recharts';

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

function yDomainFor(points: ChartPoint[]): [number, number] {
    if (points.length === 0) {
        return [0, 100];
    }
    let maxVal = 0;
    for (const p of points) {
        for (const key of BUFFER_KEYS) {
            const v = p[key];
            if (v > maxVal) {
                maxVal = v;
            }
        }
    }
    const padded = Math.max(100, maxVal * 1.1);
    return [0, padded];
}

function computeMonthlyData(allPts: RawPoint[]): ChartPoint[] {
    const pts = [...allPts].sort((a, b) => a.bucket - b.bucket);
    if (pts.length === 0) {
        return [];
    }

    const latestYear = tickToDate(pts[pts.length - 1].bucket).year;

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
            const prev: ChartPoint = { tick: lastBefore.bucket, year: lastBefore.bucket / TICKS_PER_MONTH, monthIdx: 0 };
            for (const key of BUFFER_KEYS) {
                const dbKey = `avg${key.charAt(0).toUpperCase() + key.slice(1)}Buffer` as keyof RawPoint;
                prev[key] = toPercent(lastBefore[dbKey] as number, key);
            }
            result.unshift(prev);
        }
    }

    return result;
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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

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

function BufferAreaChart({ data, xKey, xDomain, xTicks, xFormatter, tickFormatter }: {
    data: ChartPoint[];
    xKey: string;
    xDomain?: [number, number];
    xTicks?: number[];
    xFormatter: (v: number) => string;
    tickFormatter?: (v: number) => string;
}) {
    const yDomain = useMemo(() => yDomainFor(data), [data]);

    return (
        <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={data} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} horizontal={false} stroke='#334155' />
                    <XAxis
                        dataKey={xKey}
                        type='number'
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        domain={xDomain ?? ['dataMin', 'dataMax']}
                        ticks={xTicks}
                        tickFormatter={xFormatter}
                        minTickGap={0}
                    />
                    <YAxis
                        type='number'
                        domain={yDomain}
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
                                    <div style={{ color: '#94a3b8', marginBottom: 4 }}>{monthLabel}</div>
                                    {payload.map((p) => (
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
                    <Legend
                        wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                        iconType='line'
                        iconSize={12}
                    />
                    {BUFFER_KEYS.map((key) => (
                        <Area
                            key={key}
                            type='monotone'
                            dataKey={key}
                            name={key}
                            stroke={BUFFER_COLORS[key]}
                            strokeWidth={1.5}
                            fill='none'
                            dot={false}
                            activeDot={{ r: 2 }}
                            isAnimationActive={false}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

type Props = {
    planetId: string;
    currentTick: number;
};

export default function PlanetBufferChart({ planetId, currentTick }: Props): React.ReactElement {
    const trpc = useTRPC();
    const [granularity, setGranularity] = useState<'monthly' | 'yearly' | 'decade'>('monthly');

    const { data: monthly, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getPlanetBufferHistory.queryOptions(
            { planetId, granularity: 'monthly', limit: 13 },
            { enabled: granularity === 'monthly' },
        ),
    );
    const { data: yearly, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getPlanetBufferHistory.queryOptions(
            { planetId, granularity: 'yearly', limit: 11 },
            { enabled: granularity === 'yearly' },
        ),
    );
    const { data: decade, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getPlanetBufferHistory.queryOptions(
            { planetId, granularity: 'decade' },
            { enabled: granularity === 'decade' },
        ),
    );

    const isLoading =
        (granularity === 'monthly' && (loadingMonthly || !monthly)) ||
        (granularity === 'yearly' && (loadingYearly || !yearly)) ||
        (granularity === 'decade' && (loadingDecade || !decade));

    const monthlyPoints = useMemo(() => (monthly?.history ?? []), [monthly]);
    const yearlyPoints = useMemo(() => (yearly?.history ?? []), [yearly]);
    const decadePoints = useMemo(() => (decade?.history ?? []), [decade]);

    const monthlyChartData = useMemo(() => computeMonthlyData(monthlyPoints), [monthlyPoints]);
    const yearlyChartData = useMemo(() => computeYearlyData(yearlyPoints), [yearlyPoints]);
    const decadeChartData = useMemo(() => computeDecadeData(decadePoints), [decadePoints]);

    const xFormatter = (v: number): string => {
        if (granularity === 'monthly') {
            const mi = Math.round(v) - 1;
            return MONTH_NAMES[((mi % 12) + 12) % 12] ?? '';
        }
        return `${Math.round(v)}`;
    };

    const yearTicks = useMemo(() => {
        if (yearlyChartData.length === 0) return undefined;
        const xMin = yearlyChartData[0].year;
        return Array.from({ length: 10 }, (_, i) => xMin + i + 0.5);
    }, [yearlyChartData]);

    const yearXDomain = useMemo((): [number, number] | undefined => {
        if (yearlyChartData.length === 0) return undefined;
        const xMin = yearlyChartData[0].year;
        return [xMin, xMin + 10];
    }, [yearlyChartData]);

    const monthTicks = useMemo(
        () => [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5],
        [],
    );
    const monthXDomain: [number, number] = [0, 12];

    return (
        <Card className='mt-3'>
            <CardContent className='px-3 pt-3 pb-2'>
                <div className={isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : undefined}>
                    <div className='flex gap-1 mb-1'>
                        Service Buffers:
                        <GranularityButtonGroup
                            granularity={granularity}
                            onChange={setGranularity}
                            currentTick={currentTick}
                        />
                    </div>
                    {granularity === 'monthly' &&
                        (monthlyChartData.length > 0 ? (
                            <BufferAreaChart
                                data={monthlyChartData}
                                xKey='monthIdx'
                                xDomain={monthXDomain}
                                xTicks={monthTicks}
                                xFormatter={xFormatter}
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
                            />
                        ) : (
                            <EmptyChart />
                        ))}
                    {granularity === 'decade' &&
                        (decadeChartData.length > 0 ? (
                            <BufferAreaChart data={decadeChartData} xKey='year' xFormatter={xFormatter} />
                        ) : (
                            <EmptyChart />
                        ))}
                </div>
            </CardContent>
        </Card>
    );
}