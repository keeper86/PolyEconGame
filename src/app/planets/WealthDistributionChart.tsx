'use client';

import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

import CohortFilter, { type CohortFilterState, EDU_COLORS, OCC_COLORS } from './CohortFilter';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import type { Population, Occupation } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL, mergeGaussianMoments } from '@/simulation/population/population';
import { formatNumbers } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  View mode                                                          */
/* ------------------------------------------------------------------ */

type ViewMode = 'aggregate' | 'byEducation' | 'byOccupation';

/* ------------------------------------------------------------------ */
/*  Data rows                                                          */
/* ------------------------------------------------------------------ */

interface AggregateRow {
    age: number;
    mean: number;
    upper: number;
    lower: number;
    band: [number, number];
    pop: number;
    /** Coefficient of variation (σ/μ) — useful inequality measure. */
    cv: number;
}

/** Row for multi-series (education or occupation) breakdown. */
interface BreakdownRow {
    age: number;
    [key: string]: number; // e.g. 'None': 123, 'Primary': 456
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    population: Population;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * WealthDistributionChart — enhanced wealth visualization.
 * Wealth is now embedded in each PopulationCategory as `.wealth` (GaussianMoments).
 */
export default function WealthDistributionChart({ population }: Props): React.ReactElement {
    const [filter, setFilter] = useState<CohortFilterState>({ edu: null, occ: null });
    const [view, setView] = useState<ViewMode>('aggregate');

    const demography = population.demography;

    // ---- Aggregate data (filtered) ----
    const aggregateData = useMemo<AggregateRow[]>(() => {
        if (!demography || demography.length === 0) {
            return [];
        }
        const edus: readonly EducationLevelType[] = filter.edu ? [filter.edu] : educationLevelKeys;
        const occs: readonly Occupation[] = filter.occ ? [filter.occ] : ([...OCCUPATIONS] as Occupation[]);
        const rows: AggregateRow[] = [];

        for (let age = 0; age < demography.length; age++) {
            const cohort = demography[age];
            if (!cohort) {
                continue;
            }

            let accN = 0;
            let accMoments = { mean: 0, variance: 0 };

            for (const occ of occs) {
                for (const edu of edus) {
                    for (const skill of SKILL) {
                        const cat = cohort[occ][edu][skill];
                        if (cat.total > 0) {
                            accMoments = mergeGaussianMoments(accN, accMoments, cat.total, cat.wealth);
                            accN += cat.total;
                        }
                    }
                }
            }

            if (accN === 0) {
                rows.push({ age, mean: 0, upper: 0, lower: 0, band: [0, 0], pop: 0, cv: 0 });
                continue;
            }

            const sigma = Math.sqrt(Math.max(0, accMoments.variance));
            const upper = accMoments.mean + sigma;
            const lower = Math.max(0, accMoments.mean - sigma);
            const cv = accMoments.mean > 0 ? sigma / accMoments.mean : 0;

            rows.push({
                age,
                mean: accMoments.mean,
                upper,
                lower,
                band: [lower, upper],
                pop: accN,
                cv,
            });
        }
        return rows;
    }, [demography, filter.edu, filter.occ]);

    // ---- Education breakdown data ----
    const eduBreakdown = useMemo<BreakdownRow[]>(() => {
        if (!demography || demography.length === 0 || view !== 'byEducation') {
            return [];
        }
        const occs: readonly Occupation[] = filter.occ ? [filter.occ] : ([...OCCUPATIONS] as Occupation[]);
        const rows: BreakdownRow[] = [];

        for (let age = 0; age < demography.length; age++) {
            const cohort = demography[age];
            if (!cohort) {
                continue;
            }

            const row: BreakdownRow = { age };
            for (const edu of educationLevelKeys) {
                let accN = 0;
                let accMoments = { mean: 0, variance: 0 };
                for (const occ of occs) {
                    for (const skill of SKILL) {
                        const cat = cohort[occ][edu][skill];
                        if (cat.total > 0) {
                            accMoments = mergeGaussianMoments(accN, accMoments, cat.total, cat.wealth);
                            accN += cat.total;
                        }
                    }
                }
                const label = edu.charAt(0).toUpperCase() + edu.slice(1);
                row[label] = accN > 0 ? accMoments.mean : 0;
            }
            rows.push(row);
        }
        return rows;
    }, [demography, filter.occ, view]);

    // ---- Occupation breakdown data ----
    const occBreakdown = useMemo<BreakdownRow[]>(() => {
        if (!demography || demography.length === 0 || view !== 'byOccupation') {
            return [];
        }
        const edus: readonly EducationLevelType[] = filter.edu ? [filter.edu] : educationLevelKeys;
        const rows: BreakdownRow[] = [];

        for (let age = 0; age < demography.length; age++) {
            const cohort = demography[age];
            if (!cohort) {
                continue;
            }

            const row: BreakdownRow = { age };
            const occLabels: Record<string, string> = {
                unoccupied: 'Unoccupied',
                employed: 'Employed',
                education: 'Education',
                unableToWork: 'Unable to work',
            };
            for (const occ of OCCUPATIONS) {
                let accN = 0;
                let accMoments = { mean: 0, variance: 0 };
                for (const edu of edus) {
                    for (const skill of SKILL) {
                        const cat = cohort[occ][edu][skill];
                        if (cat.total > 0) {
                            accMoments = mergeGaussianMoments(accN, accMoments, cat.total, cat.wealth);
                            accN += cat.total;
                        }
                    }
                }
                row[occLabels[occ]] = accN > 0 ? accMoments.mean : 0;
            }
            rows.push(row);
        }
        return rows;
    }, [demography, filter.edu, view]);

    if (!demography || demography.length === 0) {
        return <div className='text-xs text-muted-foreground'>No wealth data available</div>;
    }

    const hasData = aggregateData.some((d) => d.mean > 0);
    if (!hasData) {
        return <div className='text-xs text-muted-foreground'>No wealth data available</div>;
    }

    // Summary stats
    const totalPop = aggregateData.reduce((s, d) => s + d.pop, 0);
    const totalWealth = aggregateData.reduce((s, d) => s + d.mean * d.pop, 0);
    const globalMean = totalPop > 0 ? totalWealth / totalPop : 0;
    const avgCv = totalPop > 0 ? aggregateData.reduce((s, d) => s + d.cv * d.pop, 0) / totalPop : 0;

    return (
        <div>
            <div className='flex items-start justify-between gap-4 mb-2'>
                <div>
                    <h4 className='text-sm font-medium'>Wealth distribution by age</h4>
                    <div className='flex gap-3 text-[10px] text-muted-foreground mt-0.5'>
                        <span>
                            Total wealth: <span className='font-medium'>{formatNumbers(totalWealth)}</span>
                        </span>
                        <span>
                            Mean/person: <span className='font-medium'>{formatNumbers(globalMean)}</span>
                        </span>
                        <span>
                            Avg CV: <span className='font-medium'>{avgCv.toFixed(2)}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Filter + view toggle */}
            <div className='flex items-start justify-between gap-2 mb-2'>
                <CohortFilter value={filter} onChange={setFilter} compact />
                <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                    <TabsList className='h-7'>
                        <TabsTrigger value='aggregate' className='text-[10px] px-2 py-0.5'>
                            Mean ± σ
                        </TabsTrigger>
                        <TabsTrigger value='byEducation' className='text-[10px] px-2 py-0.5'>
                            By edu
                        </TabsTrigger>
                        <TabsTrigger value='byOccupation' className='text-[10px] px-2 py-0.5'>
                            By occ
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    {view === 'aggregate' ? (
                        <ComposedChart data={aggregateData} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                            <defs>
                                <linearGradient id='wealthBandGrad' x1='0' y1='0' x2='0' y2='1'>
                                    <stop offset='5%' stopColor='#8b5cf6' stopOpacity={0.3} />
                                    <stop offset='95%' stopColor='#8b5cf6' stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumbers(v)} />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload || payload.length === 0) {
                                        return null;
                                    }
                                    const row = payload[0]?.payload as AggregateRow | undefined;
                                    if (!row) {
                                        return null;
                                    }
                                    return (
                                        <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[160px]'>
                                            <div className='font-medium mb-1'>Age {label}</div>
                                            <div>Population: {formatNumbers(row.pop)}</div>
                                            <div>Mean wealth: {formatNumbers(row.mean)}</div>
                                            <div>
                                                ±1σ range: {formatNumbers(row.lower)} – {formatNumbers(row.upper)}
                                            </div>
                                            <div>CV (σ/μ): {row.cv.toFixed(2)}</div>
                                        </div>
                                    );
                                }}
                            />
                            <Legend verticalAlign='top' height={24} />
                            <Area
                                type='monotone'
                                dataKey='band'
                                stroke='none'
                                fill='url(#wealthBandGrad)'
                                fillOpacity={1}
                                name='±1σ range'
                                isAnimationActive={false}
                            />
                            <Line
                                type='monotone'
                                dataKey='mean'
                                stroke='#8b5cf6'
                                strokeWidth={2}
                                dot={false}
                                name='Mean wealth'
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    ) : view === 'byEducation' ? (
                        <ComposedChart data={eduBreakdown} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumbers(v)} />
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
                                                    {entry.name}: {formatNumbers(entry.value as number)}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }}
                            />
                            <Legend verticalAlign='top' height={20} wrapperStyle={{ fontSize: 10 }} />
                            {educationLevelKeys.map((edu) => {
                                const label = edu.charAt(0).toUpperCase() + edu.slice(1);
                                return (
                                    <Line
                                        key={edu}
                                        type='monotone'
                                        dataKey={label}
                                        stroke={EDU_COLORS[edu]}
                                        strokeWidth={1.5}
                                        dot={false}
                                        name={label}
                                        isAnimationActive={false}
                                    />
                                );
                            })}
                        </ComposedChart>
                    ) : (
                        <ComposedChart data={occBreakdown} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumbers(v)} />
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
                                                    {entry.name}: {formatNumbers(entry.value as number)}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }}
                            />
                            <Legend verticalAlign='top' height={20} wrapperStyle={{ fontSize: 10 }} />
                            {OCCUPATIONS.map((occ) => {
                                const occLabels: Record<string, string> = {
                                    unoccupied: 'Unoccupied',
                                    employed: 'Employed',
                                    education: 'Education',
                                    unableToWork: 'Unable to work',
                                };
                                return (
                                    <Line
                                        key={occ}
                                        type='monotone'
                                        dataKey={occLabels[occ]}
                                        stroke={OCC_COLORS[occ]}
                                        strokeWidth={1.5}
                                        dot={false}
                                        name={occLabels[occ]}
                                        isAnimationActive={false}
                                    />
                                );
                            })}
                        </ComposedChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}
