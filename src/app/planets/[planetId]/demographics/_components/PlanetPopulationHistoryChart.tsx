'use client';

import { GranularityHeader, useGranularity } from '@/components/client/GranularityButtonGroup';
import { tickToDate } from '@/components/client/TickDisplay';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import {
    HISTORY_BUCKET_LIMIT,
    decadeStart,
    decadeWindowAxis,
    formatDecadeLabel,
    formatMonthLabel,
    formatYearLabel,
    monthAxis,
    yearStart,
    yearWindowAxis,
} from '@/lib/historyChartAxis';
import { useTRPC } from '@/lib/trpc';
import type { Locale } from '@/i18n/config';
import { formatNumberWithUnit } from '@/lib/utils';
import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PlanetBufferChart from './PlanetBufferChart';
import {
    computeDecadePopulation,
    computeMonthlyPopulation,
    computeMonthlyPopulationGhost,
    computeYearlyPopulation,
} from './populationChartLogic';
import { useLocale, useTranslations } from 'next-intl';

type BufferRawPoint = {
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

type PopulationRawPoint = {
    bucket: number;
    avgPopulation: number;
};

type LiveData = {
    tick: number;
    population: number;
    groceryBuffer: number;
    healthcareBuffer: number;
    logisticsBuffer: number;
    educationBuffer: number;
    retailBuffer: number;
    constructionBuffer: number;
};

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

function populationTooltipContent(
    label: string,
    value: number | undefined | null,
    locale: Locale,
    populationLabel: string,
): React.ReactElement | null {
    if (value == null) {
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
            <div style={{ color: '#94a3b8', marginBottom: 4 }}>{label}</div>
            <div style={{ color: '#e2e8f0' }}>
                {populationLabel} {formatNumberWithUnit(value, 'persons', undefined, locale)}
            </div>
        </div>
    );
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

type MonthlyChartRow = {
    tick: number;
    monthIndex: number;
    monthIdx: number;
    value: number | null;
    isLive: boolean;
    ghostValue: number | null;
};

function MonthlyChart({ monthlyPoints, live }: { monthlyPoints: PopulationRawPoint[]; live?: LiveData }) {
    const locale = useLocale();
    const tr = useTranslations('Demographics');
    const data = useMemo(
        () =>
            computeMonthlyPopulation(
                monthlyPoints,
                live ?? {
                    tick: 0,
                    population: 0,
                    groceryBuffer: 0,
                    healthcareBuffer: 0,
                    logisticsBuffer: 0,
                    educationBuffer: 0,
                    retailBuffer: 0,
                    constructionBuffer: 0,
                },
            ),
        [monthlyPoints, live],
    );
    const ghostData = useMemo(
        () => (live && live.tick > 0 ? computeMonthlyPopulationGhost(monthlyPoints, live) : []),
        [monthlyPoints, live],
    );

    const mergedData = useMemo((): MonthlyChartRow[] => {
        const ghostByMonth = new Map(ghostData.map((p) => [p.monthIdx, p]));
        const result: MonthlyChartRow[] = data.map((p) => ({
            ...p,
            ghostValue: ghostByMonth.get(p.monthIdx)?.value ?? null,
        }));

        for (const g of ghostData) {
            if (!data.some((d) => d.monthIdx === g.monthIdx)) {
                result.push({ ...g, value: null, isLive: false, ghostValue: g.value });
            }
        }
        return result.sort((a, b) => a.monthIdx - b.monthIdx);
    }, [data, ghostData]);

    const yDomain = useMemo(() => yDomainFor(data), [data]);

    const monthlyX = monthAxis(locale);
    const monthTooltipLabel = (monthIdx: number): string => {
        const pt = data.find((p) => p.monthIdx === monthIdx);
        if (!pt) {
            return '';
        }
        if (pt.isLive) {
            return tr('live');
        }
        return formatMonthLabel(locale, pt.monthIndex, tickToDate(pt.tick).year);
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
                        verticalValues={monthlyX.gridValues}
                        stroke='#334155'
                        strokeOpacity={0.7}
                    />
                    <XAxis
                        dataKey='monthIdx'
                        type='number'
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        domain={monthlyX.domain}
                        ticks={monthlyX.ticks}
                        tickFormatter={monthlyX.tickFormatter}
                        allowDataOverflow
                        minTickGap={0}
                    />
                    <YAxis
                        type='number'
                        domain={yDomain}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons', undefined, locale)}
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
                                            {tr('populationLabel')}{' '}
                                            {formatNumberWithUnit(p.value as number, 'persons', undefined, locale)}
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
                        dot={{ r: 2, fill: '#4f46e5', fillOpacity: 0.4, stroke: 'none' }}
                        activeDot={false}
                        isAnimationActive={false}
                        name='ghostValue'
                        connectNulls={false}
                    />
                    <Area
                        type='monotone'
                        dataKey='value'
                        stroke='#4f46e5'
                        strokeWidth={2}
                        fill='url(#popGradMon)'
                        dot={{ r: 2.5, fill: '#4f46e5' }}
                        activeDot={{ r: 3, fill: '#4f46e5', stroke: '#1e293b', strokeWidth: 2 }}
                        isAnimationActive={false}
                        name='value'
                        connectNulls={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function YearlyChart({ yearlyPoints, live }: { yearlyPoints: PopulationRawPoint[]; live?: LiveData }) {
    const locale = useLocale();
    const tr = useTranslations('Demographics');
    const data = useMemo(() => computeYearlyPopulation(yearlyPoints, live), [yearlyPoints, live]);

    const yDomain = useMemo(() => yDomainFor(data), [data]);
    const xAxis = yearWindowAxis(
        data.length > 0 ? yearStart(data[0].tick) : undefined,
        data.length > 0 ? data[data.length - 1].xPos : undefined,
    );
    const labelFor = (xPos: number): string =>
        formatYearLabel(locale, data.find((d) => d.xPos === xPos)?.labelYear ?? xPos);

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
                        verticalValues={xAxis.gridValues}
                        stroke='#334155'
                        strokeOpacity={0.95}
                    />
                    <XAxis
                        dataKey='xPos'
                        type='number'
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        domain={xAxis.domain}
                        ticks={xAxis.ticks}
                        tickFormatter={xAxis.tickFormatter}
                        minTickGap={0}
                    />
                    <YAxis
                        type='number'
                        domain={yDomain}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons', undefined, locale)}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) {
                                return null;
                            }
                            const p = payload.find((e) => e.dataKey === 'value');
                            return populationTooltipContent(
                                labelFor(label as number),
                                p?.value as number | undefined,
                                locale,
                                tr('populationLabel'),
                            );
                        }}
                    />
                    <Area
                        type='monotone'
                        dataKey='value'
                        stroke='#4f46e5'
                        strokeWidth={2}
                        fill='url(#popGradYr)'
                        dot={{ r: 2.5, fill: '#4f46e5' }}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                        name='value'
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function DecadesChart({ decadePoints, live }: { decadePoints: PopulationRawPoint[]; live?: LiveData }) {
    const locale = useLocale();
    const tr = useTranslations('Demographics');
    const data = useMemo(() => computeDecadePopulation(decadePoints, live), [decadePoints, live]);

    const yDomain = useMemo(() => yDomainFor(data), [data]);
    const xAxis = decadeWindowAxis(
        data.length > 0 ? decadeStart(data[0].tick) : undefined,
        data.length > 0 ? data[data.length - 1].xPos : undefined,
    );
    const labelFor = (xPos: number): string =>
        formatDecadeLabel(locale, data.find((d) => d.xPos === xPos)?.labelYear ?? xPos);

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
                    <CartesianGrid
                        vertical={true}
                        horizontal={false}
                        verticalValues={xAxis.gridValues}
                        stroke='#334155'
                        strokeOpacity={0.95}
                    />
                    <XAxis
                        dataKey='xPos'
                        type='number'
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        tickLine={false}
                        domain={xAxis.domain}
                        ticks={xAxis.ticks}
                        tickFormatter={xAxis.tickFormatter}
                        minTickGap={0}
                    />
                    <YAxis
                        type='number'
                        domain={yDomain}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons', undefined, locale)}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) {
                                return null;
                            }
                            const p = payload.find((e) => e.dataKey === 'value');
                            return populationTooltipContent(
                                labelFor(label as number),
                                p?.value as number | undefined,
                                locale,
                                tr('populationLabel'),
                            );
                        }}
                    />
                    <Area
                        type='monotone'
                        dataKey='value'
                        stroke='#4f46e5'
                        strokeWidth={2}
                        fill='url(#popGradDec)'
                        dot={{ r: 2.5, fill: '#4f46e5' }}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                        name='value'
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

type Props = {
    planetId: string;
    live: LiveData;
};

export default function PlanetPopulationHistoryChart({ planetId, live }: Props): React.ReactElement {
    const locale = useLocale();
    const tr = useTranslations('Demographics');
    const trpc = useTRPC();
    const { granularity, setGranularity, currentTick } = useGranularity();

    // Query buffer history (includes population) once instead of separate population queries
    const { data: monthly, isLoading: loadingMonthly } = useSimulationQuery(
        trpc.simulation.getPlanetBufferHistory.queryOptions(
            { planetId, granularity: 'monthly', limit: HISTORY_BUCKET_LIMIT.monthly },
            { enabled: granularity === 'monthly' },
        ),
    );
    const { data: yearly, isLoading: loadingYearly } = useSimulationQuery(
        trpc.simulation.getPlanetBufferHistory.queryOptions(
            { planetId, granularity: 'yearly', limit: HISTORY_BUCKET_LIMIT.yearly },
            { enabled: granularity === 'yearly' },
        ),
    );
    const { data: decade, isLoading: loadingDecade } = useSimulationQuery(
        trpc.simulation.getPlanetBufferHistory.queryOptions(
            { planetId, granularity: 'decade', limit: HISTORY_BUCKET_LIMIT.decade },
            { enabled: granularity === 'decade' },
        ),
    );

    const isLoading =
        (granularity === 'monthly' && (loadingMonthly || !monthly)) ||
        (granularity === 'yearly' && (loadingYearly || !yearly)) ||
        (granularity === 'decade' && (loadingDecade || !decade));

    // Extract population-only points for the population charts
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

    // Full buffer data for the child chart
    const bufferMonthlyPoints = useMemo(() => (monthly?.history ?? []) as BufferRawPoint[], [monthly]);
    const bufferYearlyPoints = useMemo(() => (yearly?.history ?? []) as BufferRawPoint[], [yearly]);
    const bufferDecadePoints = useMemo(() => (decade?.history ?? []) as BufferRawPoint[], [decade]);

    return (
        <Card>
            <CardContent className='px-4 pt-2 pb-4'>
                <div className={isLoading ? 'opacity-40 animate-pulse pointer-events-none select-none' : undefined}>
                    <GranularityHeader
                        title={tr('populationTitle', {
                            value: formatNumberWithUnit(live?.population, 'persons', undefined, locale),
                        })}
                        granularity={granularity}
                        onGranularityChange={setGranularity}
                        currentTick={currentTick}
                        className='my-1 mb-3'
                        titleClassName='text-md text-slate-400'
                    />
                    {granularity === 'monthly' && <MonthlyChart monthlyPoints={monthlyPoints} live={live} />}
                    {granularity === 'yearly' &&
                        (yearlyPoints.length > 0 ? (
                            <YearlyChart yearlyPoints={yearlyPoints} live={live} />
                        ) : (
                            <EmptyChart />
                        ))}
                    {granularity === 'decade' &&
                        (decadePoints.length > 0 ? (
                            <DecadesChart decadePoints={decadePoints} live={live} />
                        ) : (
                            <EmptyChart />
                        ))}

                    <Separator />

                    <div className='my-3'>
                        <span className='text-md text-slate-400'>{tr('serviceBuffers')}</span>
                    </div>
                    <PlanetBufferChart
                        monthlyPoints={bufferMonthlyPoints}
                        yearlyPoints={bufferYearlyPoints}
                        decadePoints={bufferDecadePoints}
                        currentTick={currentTick}
                        granularity={granularity}
                        isLoading={isLoading}
                        live={live}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
