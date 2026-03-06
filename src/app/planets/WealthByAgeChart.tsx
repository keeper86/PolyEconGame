'use client';

import React from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { Population, Cohort } from '@/simulation/planet';
import { educationLevelKeys, OCCUPATIONS } from '@/simulation/planet';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number): string =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : n.toFixed(1);

type Props = {
    population: Population;
};

/**
 * WealthByAgeChart — shows mean financial wealth and ±1σ band per age cohort.
 *
 * Uses the `wealthDemography` parallel array on `population` to aggregate
 * mean and variance across all education × occupation cells at each age,
 * using the population-weighted pooled mean/variance formula.
 */
export default function WealthByAgeChart({ population }: Props): React.ReactElement {
    const demography = population.demography;
    const wealthDem = population.wealthDemography;

    if (!wealthDem || wealthDem.length === 0) {
        return <div className='text-xs text-muted-foreground'>No wealth data available</div>;
    }

    const chartData: {
        age: number;
        mean: number;
        upper: number;
        lower: number;
        band: [number, number];
    }[] = [];

    for (let age = 0; age < Math.min(demography.length, wealthDem.length); age++) {
        const cohort: Cohort | undefined = demography[age];
        const wCohort = wealthDem[age];
        if (!cohort || !wCohort) {
            continue;
        }

        // Population-weighted pooled mean and variance across edu × occ
        let totalPop = 0;
        let weightedMean = 0;

        // First pass: compute pooled mean
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                const pop = Number(cohort[edu]?.[occ] ?? 0);
                const wm = wCohort[edu]?.[occ];
                if (pop > 0 && wm) {
                    weightedMean += pop * wm.mean;
                    totalPop += pop;
                }
            }
        }

        if (totalPop === 0) {
            chartData.push({ age, mean: 0, upper: 0, lower: 0, band: [0, 0] });
            continue;
        }

        const pooledMean = weightedMean / totalPop;

        // Second pass: pooled variance using parallel-axis theorem
        let pooledVariance = 0;
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                const pop = Number(cohort[edu]?.[occ] ?? 0);
                const wm = wCohort[edu]?.[occ];
                if (pop > 0 && wm) {
                    const diff = wm.mean - pooledMean;
                    pooledVariance += pop * (wm.variance + diff * diff);
                }
            }
        }
        pooledVariance /= totalPop;

        const sigma = Math.sqrt(Math.max(0, pooledVariance));
        const upper = pooledMean + sigma;
        const lower = Math.max(0, pooledMean - sigma);

        chartData.push({
            age,
            mean: pooledMean,
            upper,
            lower,
            band: [lower, upper],
        });
    }

    const hasData = chartData.some((d) => d.mean > 0);
    if (!hasData) {
        return <div className='text-xs text-muted-foreground'>No wealth data available</div>;
    }

    return (
        <div>
            <h4 className='text-sm font-medium mb-2'>Wealth distribution by age</h4>
            <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <ComposedChart data={chartData} margin={{ top: 6, right: 12, left: 12, bottom: 6 }}>
                        <defs>
                            <linearGradient id='wealthBand' x1='0' y1='0' x2='0' y2='1'>
                                <stop offset='5%' stopColor='#8b5cf6' stopOpacity={0.3} />
                                <stop offset='95%' stopColor='#8b5cf6' stopOpacity={0.05} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                        <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                        <Tooltip
                            formatter={(value: number | [number, number], name: string) => {
                                if (Array.isArray(value)) {
                                    return [`${fmt(value[0])} – ${fmt(value[1])}`, '±1σ range'];
                                }
                                return [fmt(value), name];
                            }}
                        />
                        <Legend verticalAlign='top' height={24} />
                        <Area
                            type='monotone'
                            dataKey='band'
                            stroke='none'
                            fill='url(#wealthBand)'
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
                </ResponsiveContainer>
            </div>
        </div>
    );
}
