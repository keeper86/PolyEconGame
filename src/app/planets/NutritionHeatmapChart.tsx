'use client';

import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK } from '@/simulation/constants';
import CohortFilter, { type CohortFilterState } from './CohortFilter';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import type { Population, Occupation } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Food buffer target per person (tons). */
const FOOD_TARGET_PER_PERSON = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

/* ------------------------------------------------------------------ */
/*  Nutrition-status bands                                             */
/* ------------------------------------------------------------------ */

/**
 * Each band classifies a cohort-class cell by a **two-tier** scheme:
 *
 *   1. **Starvation bands** — keyed on `starvationLevel` (S), the smoothed
 *      physiological malnutrition index (0 = healthy, 1 = fully starving).
 *      These represent accumulated bodily harm, not an instantaneous gap.
 *
 *   2. **Food-security bands** — keyed on the instantaneous food-buffer
 *      ratio (current stock / target stock).  These only apply when S = 0.
 *
 * Bands are ordered worst-first (bottom of stacked bar) so severe
 * starvation is always visually anchored at y = 0.
 */
const BANDS = [
    { key: 'severeStarvation', label: 'Severe starvation', color: '#991b1b' },
    { key: 'moderateStarvation', label: 'Moderate starvation', color: '#dc2626' },
    { key: 'lightStarvation', label: 'Light starvation', color: '#f97316' },
    { key: 'foodInsecure', label: 'Food insecure', color: '#eab308' },
    { key: 'adequate', label: 'Adequate', color: '#86efac' },
    { key: 'fullBuffer', label: 'Full buffer', color: '#16a34a' },
] as const;

type BandKey = (typeof BANDS)[number]['key'];

/**
 * Classify a population cell into one of the nutrition-status bands.
 *
 * Priority: starvation level (physiological harm) takes precedence.
 * Only when S = 0 does the instantaneous buffer ratio matter.
 *
 * @param starvationLevel  Smoothed malnutrition index S ∈ [0, 1].
 * @param bufferRatio      Instantaneous foodStock / target (≥ 0).
 * @returns  Index into `BANDS`.
 */
function classifyBand(starvationLevel: number, bufferRatio: number): number {
    // --- Starvation bands (physiological) ---
    if (starvationLevel > 0.9) {
        return 0; // severe starvation
    }
    if (starvationLevel > 0.5) {
        return 1; // moderate starvation
    }
    if (starvationLevel > 0.05) {
        return 2; // light starvation
    }
    // --- Food-security bands (buffer) — S = 0 ---
    if (bufferRatio < 0.1) {
        return 3; // food insecure
    }
    if (bufferRatio < 0.95) {
        return 4; // adequate
    }
    return 5; // full buffer
}

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

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    population: Population;
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
    /** Weighted-average food-buffer ratio (for tooltip). */
    avgBufferRatio: number;
    /** Weighted-average starvation level S ∈ [0, 1] (for tooltip). */
    avgStarvationLevel: number;
    /** Fraction of population in acute starvation (buffer < 1 tick). */
    acuteStarvationFrac: number;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * NutritionHeatmapChart — visualises nutrition status by age using stacked
 * bars where each segment represents a severity band.
 *
 * Classification uses a **two-tier** scheme:
 *
 *   1. Starvation bands — based on the physiological `starvationLevel` (S):
 *      - Severe starvation (S > 0.9) — deep red
 *      - Moderate starvation (S > 0.3) — red
 *      - Light starvation (S > 0) — orange
 *
 *   2. Food-security bands — based on instantaneous buffer ratio (S = 0):
 *      - Food insecure (buffer < 10 %) — yellow
 *      - Adequate (buffer < 100 %) — light green
 *      - Full buffer (buffer ≥ 100 %) — deep green
 *
 * This way, even if most people have full buffers, a small cohort with
 * accumulated physiological harm is clearly visible as a red band.
 */
export default function NutritionHeatmapChart({ population }: Props): React.ReactElement {
    const [filter, setFilter] = useState<CohortFilterState>({ edu: null, occ: null });

    const demography = population.demography;

    const chartData = useMemo<ChartRow[]>(() => {
        if (!demography || demography.length === 0) {
            return [];
        }

        const rows: ChartRow[] = [];
        const edus: readonly EducationLevelType[] = filter.edu ? [filter.edu] : educationLevelKeys;
        const occs: readonly Occupation[] = filter.occ ? [filter.occ] : ([...OCCUPATIONS] as Occupation[]);

        for (let age = 0; age < demography.length; age++) {
            const cohort = demography[age];
            if (!cohort) {
                continue;
            }

            const bandPops: number[] = new Array(BANDS.length).fill(0);
            let totalPop = 0;
            let weightedRatio = 0;
            let weightedStarvation = 0;
            let acutePop = 0;

            for (const occ of occs) {
                for (const edu of edus) {
                    for (const skill of SKILL) {
                        const cat = cohort[occ][edu][skill];
                        if (cat.total <= 0) {
                            continue;
                        }

                        const stock = cat.foodStock;
                        const bufferRatio =
                            FOOD_TARGET_PER_PERSON > 0 ? stock / (FOOD_TARGET_PER_PERSON * cat.total) : 0;

                        totalPop += cat.total;
                        weightedRatio += cat.total * bufferRatio;
                        weightedStarvation += cat.total * cat.starvationLevel;
                        bandPops[classifyBand(cat.starvationLevel, bufferRatio)] += cat.total;

                        if (stock < FOOD_PER_PERSON_PER_TICK * cat.total) {
                            acutePop += cat.total;
                        }
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
                avgStarvationLevel: totalPop > 0 ? weightedStarvation / totalPop : 0,
                acuteStarvationFrac: totalPop > 0 ? acutePop / totalPop : 0,
            });
        }
        return rows;
    }, [demography, filter.edu, filter.occ]);

    if (chartData.length === 0) {
        return <div className='text-xs text-muted-foreground'>No food buffer data available</div>;
    }

    const hasData = chartData.some((d) => d.pop > 0);
    if (!hasData) {
        return <div className='text-xs text-muted-foreground'>No food buffer data available</div>;
    }

    // Global summary stats
    const totalPop = chartData.reduce((s, d) => s + d.pop, 0);
    const globalAvgStarvation =
        totalPop > 0 ? chartData.reduce((s, d) => s + d.avgStarvationLevel * d.pop, 0) / totalPop : 0;
    const globalAvgRatio = totalPop > 0 ? chartData.reduce((s, d) => s + d.avgBufferRatio * d.pop, 0) / totalPop : 0;

    // Global band totals for the header breakdown
    const globalBands = BANDS.map((b) => chartData.reduce((s, d) => s + (d[b.key as BandKey] as number), 0));
    const globalStarvingPop = globalBands[0] + globalBands[1] + globalBands[2]; // severe + moderate + light

    return (
        <div>
            <div className='flex items-start justify-between gap-4 mb-2'>
                <div>
                    <h4 className='text-sm font-medium'>Nutrition status by age</h4>
                    <div className='flex gap-3 text-[10px] text-muted-foreground mt-0.5 flex-wrap'>
                        <span>
                            Starving (S&gt;0):{' '}
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
                            Avg starvation:{' '}
                            <span
                                className={
                                    globalAvgStarvation > 0.3
                                        ? 'text-red-500 font-semibold'
                                        : globalAvgStarvation > 0
                                          ? 'text-amber-500'
                                          : 'text-green-600'
                                }
                            >
                                {fmtPct(globalAvgStarvation)}
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
                                            Starvation level: {fmtPct(row.avgStarvationLevel)}
                                        </div>
                                        <div>Avg buffer: {fmtPct(row.avgBufferRatio)}</div>
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
