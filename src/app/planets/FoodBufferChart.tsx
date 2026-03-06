'use client';

import React, { useState } from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    BarChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import type { Population, FoodMarket, Cohort } from '@/simulation/planet';
import { educationLevelKeys, OCCUPATIONS } from '@/simulation/planet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EDU_COLORS: Record<string, string> = {
    none: '#94a3b8',
    primary: '#60a5fa',
    secondary: '#34d399',
    tertiary: '#f59e0b',
    quaternary: '#8b5cf6',
};

const EDU_LABELS: Record<string, string> = {
    none: 'None',
    primary: 'Primary',
    secondary: 'Secondary',
    tertiary: 'Tertiary',
    quaternary: 'Quaternary',
};

const OCC_COLORS: Record<string, string> = {
    unoccupied: '#60a5fa',
    company: '#34d399',
    government: '#f59e0b',
    education: '#f97316',
    unableToWork: '#ef4444',
};

const OCC_LABELS: Record<string, string> = {
    unoccupied: 'Unoccupied',
    company: 'Company',
    government: 'Government',
    education: 'Education',
    unableToWork: 'Unable to work',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number): string => {
    if (n >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(1)}M`;
    }
    if (n >= 1_000) {
        return `${(n / 1_000).toFixed(1)}k`;
    }
    return n.toFixed(2);
};

/* ------------------------------------------------------------------ */
/*  View mode                                                          */
/* ------------------------------------------------------------------ */

type ViewMode = 'aggregate' | 'education' | 'occupation';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    population: Population;
    foodMarket?: FoodMarket;
};

/**
 * FoodBufferChart — shows food stock per age cohort, with three view modes:
 *
 * - **Aggregate**: single bar per age (avg food stock per person) + population line
 * - **Education**: stacked bars per education level (avg food stock per person)
 * - **Occupation**: stacked bars per occupation (avg food stock per person)
 *
 * The household food buffers are stored in `foodMarket.householdFoodBuffers`
 * which is a parallel array to `population.demography`.
 * Each cell stores `foodStock` (tons per person in that edu×occ cell).
 */
export default function FoodBufferChart({ population, foodMarket }: Props): React.ReactElement {
    const [view, setView] = useState<ViewMode>('aggregate');

    const demography = population.demography;
    const buffers = foodMarket?.householdFoodBuffers;

    if (!buffers || buffers.length === 0) {
        return <div className='text-xs text-muted-foreground'>No food buffer data available</div>;
    }

    /* -------------------------------------------------------------- */
    /*  Build chart data for all three views                          */
    /* -------------------------------------------------------------- */

    // Aggregate data
    const aggregateData: {
        age: number;
        avgFoodStockPerPerson: number;
        agePop: number;
    }[] = [];

    // Education breakdown data
    const eduData: Record<string, number | string>[] = [];

    // Occupation breakdown data
    const occData: Record<string, number | string>[] = [];

    for (let age = 0; age < Math.min(demography.length, buffers.length); age++) {
        const cohort: Cohort | undefined = demography[age];
        const fbCohort = buffers[age];
        if (!cohort || !fbCohort) {
            continue;
        }

        let totalStock = 0;
        let agePop = 0;

        // Per-education aggregation (summing across all occupations)
        const eduStock: Record<string, number> = {};
        const eduPop: Record<string, number> = {};
        for (const edu of educationLevelKeys) {
            eduStock[edu] = 0;
            eduPop[edu] = 0;
        }

        // Per-occupation aggregation (summing across all education levels)
        const occStock: Record<string, number> = {};
        const occPop: Record<string, number> = {};
        for (const occ of OCCUPATIONS) {
            occStock[occ] = 0;
            occPop[occ] = 0;
        }

        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                const pop = Number(cohort[edu]?.[occ] ?? 0);
                const fb = fbCohort[edu]?.[occ];
                const stock = fb ? fb.foodStock : 0;
                if (pop > 0) {
                    totalStock += stock * pop;
                    agePop += pop;
                    eduStock[edu] += stock * pop;
                    eduPop[edu] += pop;
                    occStock[occ] += stock * pop;
                    occPop[occ] += pop;
                }
            }
        }

        // Aggregate row
        aggregateData.push({
            age,
            avgFoodStockPerPerson: agePop > 0 ? totalStock / agePop : 0,
            agePop,
        });

        // Education row: average food stock per person within each edu level
        const eduRow: Record<string, number | string> = { age };
        for (const edu of educationLevelKeys) {
            eduRow[EDU_LABELS[edu]] = eduPop[edu] > 0 ? eduStock[edu] / eduPop[edu] : 0;
        }
        eduRow._agePop = agePop;
        eduData.push(eduRow);

        // Occupation row: average food stock per person within each occ
        const occRow: Record<string, number | string> = { age };
        for (const occ of OCCUPATIONS) {
            occRow[OCC_LABELS[occ]] = occPop[occ] > 0 ? occStock[occ] / occPop[occ] : 0;
        }
        occRow._agePop = agePop;
        occData.push(occRow);
    }

    const hasData = aggregateData.some((d) => d.avgFoodStockPerPerson > 0 || d.agePop > 0);
    if (!hasData) {
        return <div className='text-xs text-muted-foreground'>No food buffer data available</div>;
    }

    const starvationLevel = population.starvationLevel;

    return (
        <div>
            <h4 className='text-sm font-medium mb-2'>
                Food buffers by age
                <span className='ml-2 text-xs text-muted-foreground'>
                    Starvation level:{' '}
                    <span
                        className={
                            starvationLevel > 0.1
                                ? 'text-red-500 font-semibold'
                                : starvationLevel > 0
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                        }
                    >
                        {(starvationLevel * 100).toFixed(2)}%
                    </span>
                </span>
            </h4>

            {/* View mode toggle */}
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                <TabsList className='h-7 mb-2'>
                    <TabsTrigger value='aggregate' className='text-[10px] px-2 py-0.5'>
                        Aggregate
                    </TabsTrigger>
                    <TabsTrigger value='education' className='text-[10px] px-2 py-0.5'>
                        By education
                    </TabsTrigger>
                    <TabsTrigger value='occupation' className='text-[10px] px-2 py-0.5'>
                        By occupation
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    {view === 'aggregate' ? (
                        /* ---- Aggregate view ---- */
                        <ComposedChart data={aggregateData} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                            <YAxis
                                yAxisId='food'
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => fmt(v)}
                                label={{
                                    value: 'Food (t/person)',
                                    angle: -90,
                                    position: 'insideLeft',
                                    style: { fontSize: 9 },
                                }}
                            />
                            <YAxis
                                yAxisId='pop'
                                orientation='right'
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => fmt(v)}
                                label={{
                                    value: 'Population',
                                    angle: 90,
                                    position: 'insideRight',
                                    style: { fontSize: 9 },
                                }}
                            />
                            <Tooltip formatter={(value: number, name: string) => [fmt(value), name]} />
                            <Legend verticalAlign='top' height={24} />
                            <Bar
                                yAxisId='food'
                                dataKey='avgFoodStockPerPerson'
                                fill='#34d399'
                                fillOpacity={0.7}
                                name='Avg food stock/person'
                                isAnimationActive={false}
                            />
                            <Line
                                yAxisId='pop'
                                type='monotone'
                                dataKey='agePop'
                                stroke='#60a5fa'
                                strokeWidth={1.5}
                                dot={false}
                                name='Population'
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    ) : view === 'education' ? (
                        /* ---- Education breakdown view ---- */
                        <BarChart data={eduData} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                            <YAxis
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => fmt(v)}
                                label={{
                                    value: 'Food (t/person)',
                                    angle: -90,
                                    position: 'insideLeft',
                                    style: { fontSize: 9 },
                                }}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload || payload.length === 0) {
                                        return null;
                                    }
                                    return (
                                        <div className='rounded-lg border bg-card p-2 text-xs shadow-md'>
                                            <div className='font-medium mb-1'>Age {label}</div>
                                            {payload.map((entry) => (
                                                <div key={entry.dataKey as string} style={{ color: entry.color }}>
                                                    {entry.name}: {fmt(entry.value as number)} t/person
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }}
                            />
                            <Legend verticalAlign='top' height={18} wrapperStyle={{ fontSize: 10 }} />
                            {educationLevelKeys.map((edu, idx) => (
                                <Bar
                                    key={edu}
                                    dataKey={EDU_LABELS[edu]}
                                    stackId='a'
                                    fill={EDU_COLORS[edu]}
                                    radius={idx === educationLevelKeys.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                                    isAnimationActive={false}
                                />
                            ))}
                        </BarChart>
                    ) : (
                        /* ---- Occupation breakdown view ---- */
                        <BarChart data={occData} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                            <YAxis
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => fmt(v)}
                                label={{
                                    value: 'Food (t/person)',
                                    angle: -90,
                                    position: 'insideLeft',
                                    style: { fontSize: 9 },
                                }}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload || payload.length === 0) {
                                        return null;
                                    }
                                    return (
                                        <div className='rounded-lg border bg-card p-2 text-xs shadow-md'>
                                            <div className='font-medium mb-1'>Age {label}</div>
                                            {payload.map((entry) => (
                                                <div key={entry.dataKey as string} style={{ color: entry.color }}>
                                                    {entry.name}: {fmt(entry.value as number)} t/person
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }}
                            />
                            <Legend verticalAlign='top' height={18} wrapperStyle={{ fontSize: 10 }} />
                            {OCCUPATIONS.map((occ, idx) => (
                                <Bar
                                    key={occ}
                                    dataKey={OCC_LABELS[occ]}
                                    stackId='a'
                                    fill={OCC_COLORS[occ]}
                                    radius={idx === OCCUPATIONS.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                                    isAnimationActive={false}
                                />
                            ))}
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}
