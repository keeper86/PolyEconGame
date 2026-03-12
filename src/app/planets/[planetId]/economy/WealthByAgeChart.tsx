'use client';

import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS, SKILL, mergeGaussianMoments } from '@/simulation/population/population';
import React from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { formatNumbers } from '@/lib/utils';

type SlimCategory = { total: number; wealthMean: number; wealthVariance: number };
type SlimCohort = { [occ: string]: { [edu: string]: { [skill: string]: SlimCategory } } };

type Props = {
    demography: SlimCohort[];
};

export default function WealthByAgeChart({ demography }: Props): React.ReactElement {
    if (!demography || demography.length === 0) {
        return <div className='text-xs text-muted-foreground'>No wealth data available</div>;
    }

    const chartData: { age: number; mean: number; upper: number; lower: number; band: [number, number] }[] = [];

    for (let age = 0; age < demography.length; age++) {
        const cohort = demography[age];
        if (!cohort || Object.keys(cohort).length === 0) {
            continue;
        }

        let accN = 0;
        let accMoments = { mean: 0, variance: 0 };

        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = cohort[occ]?.[edu]?.[skill];
                    if (cat && cat.total > 0) {
                        accMoments = mergeGaussianMoments(accN, accMoments, cat.total, {
                            mean: cat.wealthMean,
                            variance: cat.wealthVariance,
                        });
                        accN += cat.total;
                    }
                }
            }
        }

        if (accN === 0) {
            chartData.push({ age, mean: 0, upper: 0, lower: 0, band: [0, 0] });
            continue;
        }

        const sigma = Math.sqrt(Math.max(0, accMoments.variance));
        const upper = accMoments.mean + sigma;
        const lower = Math.max(0, accMoments.mean - sigma);
        chartData.push({ age, mean: accMoments.mean, upper, lower, band: [lower, upper] });
    }

    const hasData = chartData.some((d) => d.mean > 0);
    if (!hasData) {
        return <div className='text-xs text-muted-foreground'>No wealth data available</div>;
    }

    return (
        <div>
            <h4 className='text-sm font-medium mb-2'>Wealth by age (mean ± σ)</h4>
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
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumbers(v)} />
                        <Tooltip
                            formatter={(value: number | [number, number], name: string) => {
                                if (Array.isArray(value)) {
                                    return [`${formatNumbers(value[0])} – ${formatNumbers(value[1])}`, '±1σ range'];
                                }
                                return [formatNumbers(value), name];
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
