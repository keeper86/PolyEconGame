'use client';

import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { Population, Cohort, FoodMarket } from '@/simulation/planet';
import { educationLevelKeys, OCCUPATIONS } from '@/simulation/planet';
import type { EducationLevelType, Occupation } from '@/simulation/planet';
import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK } from '@/simulation/constants';
import CohortFilter, { type CohortFilterState } from './CohortFilter';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Food buffer target per person (tons). */
const FOOD_TARGET_PER_PERSON = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

/* ------------------------------------------------------------------ */
/*  Food-security severity bands                                       */
/* ------------------------------------------------------------------ */

/**
 * Each band classifies a cohort-class cell by its food buffer ratio.
 * Bands are ordered from worst (bottom of stacked bar) to best (top),
 * so severe starvation is always visually anchored at y=0.
 */
const BANDS = [
    { key: 'severeStarvation', label: 'Severe starvation', color: '#991b1b', min: 0, max: 0.1 },
    { key: 'moderateStarvation', label: 'Moderate starvation', color: '#dc2626', min: 0.1, max: 0.3 },
    { key: 'lightStarvation', label: 'Light starvation', color: '#f97316', min: 0.3, max: 0.5 },
    { key: 'foodInsecure', label: 'Food insecure', color: '#eab308', min: 0.5, max: 0.8 },
    { key: 'adequate', label: 'Adequate', color: '#86efac', min: 0.8, max: 1.0 },
    { key: 'fullBuffer', label: 'Full buffer', color: '#16a34a', min: 1.0, max: Infinity },
] as const;

type BandKey = (typeof BANDS)[number]['key'];

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
    return n.toFixed(0);
};

const fmtPct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** Classify a buffer ratio into the matching band index. */
function bandIndex(ratio: number): number {
    for (let i = 0; i < BANDS.length; i++) {
        if (ratio < BANDS[i].max) {
            return i;
        }
    }
    return BANDS.length - 1;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    population: Population;
    foodMarket?: FoodMarket;
};

/* ------------------------------------------------------------------ */
/*  Data row                                                           */
/* ------------------------------------------------------------------ */

type ChartRow = {
    age: number;
    /** Total population for this age (filtered). */
    pop: number;
    /** Population count in each severity band. */
    severeStarvation: number;
    moderateStarvation: number;
    lightStarvation: number;
    foodInsecure: number;
    adequate: number;
    fullBuffer: number;
    /** Weighted-average buffer ratio (for tooltip). */
    avgBufferRatio: number;
    /** Fraction of population in acute starvation (buffer < 1 tick). */
    acuteStarvationFrac: number;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * NutritionHeatmapChart — visualises food security by age using stacked bars
 * where each segment represents a severity band.
 *
 * Instead of colouring bars by an averaged ratio (which hides starvation in
 * individual edu×occ cells), this chart counts how many people fall into each
 * food-security band:
 *
 *   - Severe starvation (ratio < 10 %)  — deep red
 *   - Moderate starvation (10–30 %)     — red
 *   - Light starvation (30–50 %)        — orange
 *   - Food insecure (50–80 %)           — yellow
 *   - Adequate (80–100 %)               — light green
 *   - Full buffer (≥ 100 %)             — deep green
 *
 * This way, even if most people have full buffers, a small starving cohort
 * is clearly visible as a red band at the bottom of the bar.
 */
export default function NutritionHeatmapChart({ population, foodMarket }: Props): React.ReactElement {
    const [filter, setFilter] = useState<CohortFilterState>({ edu: null, occ: null });

    const demography = population.demography;
    const buffers = foodMarket?.householdFoodBuffers;

    const chartData = useMemo<ChartRow[]>(() => {
        if (!buffers || buffers.length === 0) {
            return [];
        }

        const rows: ChartRow[] = [];
        const edus: readonly EducationLevelType[] = filter.edu ? [filter.edu] : educationLevelKeys;
        const occs: readonly Occupation[] = filter.occ ? [filter.occ] : ([...OCCUPATIONS] as Occupation[]);

        for (let age = 0; age < Math.min(demography.length, buffers.length); age++) {
            const cohort: Cohort | undefined = demography[age];
            const fbCohort = buffers[age];
            if (!cohort || !fbCohort) {
                continue;
            }

            const bandPops: number[] = new Array(BANDS.length).fill(0);
            let totalPop = 0;
            let weightedRatio = 0;
            let acutePop = 0;

            for (const edu of edus) {
                for (const occ of occs) {
                    const pop = Number(cohort[edu]?.[occ] ?? 0);
                    if (pop <= 0) {
                        continue;
                    }

                    const fb = fbCohort[edu]?.[occ];
                    const stock = fb ? fb.foodStock : 0;
                    const ratio = FOOD_TARGET_PER_PERSON > 0 ? stock / FOOD_TARGET_PER_PERSON : 0;

                    totalPop += pop;
                    weightedRatio += pop * ratio;
                    bandPops[bandIndex(ratio)] += pop;

                    if (stock < FOOD_PER_PERSON_PER_TICK) {
                        acutePop += pop;
                    }
                }
            }

            rows.push({
                age,
                pop: totalPop,
                severeStarvation: bandPops[0],
                moderateStarvation: bandPops[1],
                lightStarvation: bandPops[2],
                foodInsecure: bandPops[3],
                adequate: bandPops[4],
                fullBuffer: bandPops[5],
                avgBufferRatio: totalPop > 0 ? weightedRatio / totalPop : 0,
                acuteStarvationFrac: totalPop > 0 ? acutePop / totalPop : 0,
            });
        }
        return rows;
    }, [demography, buffers, filter.edu, filter.occ]);

    if (!buffers || buffers.length === 0 || chartData.length === 0) {
        return <div className='text-xs text-muted-foreground'>No food buffer data available</div>;
    }

    const hasData = chartData.some((d) => d.pop > 0);
    if (!hasData) {
        return <div className='text-xs text-muted-foreground'>No food buffer data available</div>;
    }

    // Global summary stats
    const totalPop = chartData.reduce((s, d) => s + d.pop, 0);
    const totalAcute = chartData.reduce((s, d) => s + d.acuteStarvationFrac * d.pop, 0);
    const globalAcuteFrac = totalPop > 0 ? totalAcute / totalPop : 0;
    const globalAvgRatio = totalPop > 0 ? chartData.reduce((s, d) => s + d.avgBufferRatio * d.pop, 0) / totalPop : 0;

    // Global band totals for the header breakdown
    const globalBands = BANDS.map((b) => chartData.reduce((s, d) => s + (d[b.key as BandKey] as number), 0));
    const globalStarvingPop = globalBands[0] + globalBands[1] + globalBands[2]; // severe + moderate + light

    return (
        <div>
            <div className='flex items-start justify-between gap-4 mb-2'>
                <div>
                    <h4 className='text-sm font-medium'>Food security by age</h4>
                    <div className='flex gap-3 text-[10px] text-muted-foreground mt-0.5 flex-wrap'>
                        <span>
                            Starving:{' '}
                            <span
                                className={
                                    globalStarvingPop / totalPop > 0.05
                                        ? 'text-red-500 font-semibold'
                                        : globalStarvingPop > 0
                                          ? 'text-amber-500'
                                          : 'text-green-600'
                                }
                            >
                                {fmt(globalStarvingPop)} ({fmtPct(totalPop > 0 ? globalStarvingPop / totalPop : 0)})
                            </span>
                        </span>
                        <span>
                            Acute (≤1 tick):{' '}
                            <span
                                className={
                                    globalAcuteFrac > 0.05
                                        ? 'text-red-500 font-semibold'
                                        : globalAcuteFrac > 0
                                          ? 'text-amber-500'
                                          : 'text-green-600'
                                }
                            >
                                {fmtPct(globalAcuteFrac)}
                            </span>
                        </span>
                        <span>
                            Avg buffer:{' '}
                            <span
                                className={
                                    globalAvgRatio < 0.3
                                        ? 'text-red-500'
                                        : globalAvgRatio < 0.7
                                          ? 'text-amber-500'
                                          : 'text-green-600'
                                }
                            >
                                {fmtPct(globalAvgRatio)}
                            </span>
                        </span>
                    </div>
                </div>

                {/* Colour legend — matches band colours */}
                <div className='flex items-center gap-0.5 text-[9px] text-muted-foreground shrink-0 flex-wrap justify-end'>
                    {BANDS.map((b) => (
                        <div key={b.key} className='flex items-center gap-0.5'>
                            <div className='w-2.5 h-2.5 rounded-sm' style={{ backgroundColor: b.color }} />
                            <span className='whitespace-nowrap'>{b.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Filter badges */}
            <div className='mb-2'>
                <CohortFilter value={filter} onChange={setFilter} compact />
            </div>

            <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={chartData} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                        <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                        <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                        <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => fmt(v)}
                            label={{
                                value: 'Population',
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
                                const row = payload[0]?.payload as ChartRow | undefined;
                                if (!row) {
                                    return null;
                                }
                                return (
                                    <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[200px]'>
                                        <div className='font-medium mb-1'>Age {label}</div>
                                        <div className='mb-1'>Total: {fmt(row.pop)}</div>
                                        {BANDS.map((b) => {
                                            const count = row[b.key as BandKey] as number;
                                            if (count <= 0) {
                                                return null;
                                            }
                                            const pct = row.pop > 0 ? count / row.pop : 0;
                                            return (
                                                <div key={b.key} className='flex items-center gap-1'>
                                                    <div
                                                        className='w-2 h-2 rounded-sm shrink-0'
                                                        style={{ backgroundColor: b.color }}
                                                    />
                                                    <span>
                                                        {b.label}: {fmt(count)} ({fmtPct(pct)})
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        <div className='mt-1 pt-1 border-t border-border'>
                                            Avg buffer: {fmtPct(row.avgBufferRatio)}
                                        </div>
                                        {row.acuteStarvationFrac > 0 && (
                                            <div>
                                                Acute starvation:{' '}
                                                <span
                                                    className={
                                                        row.acuteStarvationFrac > 0.05
                                                            ? 'text-red-500 font-semibold'
                                                            : ''
                                                    }
                                                >
                                                    {fmtPct(row.acuteStarvationFrac)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            }}
                        />
                        <Legend verticalAlign='top' height={36} />

                        {/* Stacked bars — worst (severe starvation) at bottom, best (full buffer) on top */}
                        {BANDS.map((b) => (
                            <Bar
                                key={b.key}
                                dataKey={b.key}
                                name={b.label}
                                stackId='nutrition'
                                fill={b.color}
                                fillOpacity={0.9}
                                isAnimationActive={false}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
