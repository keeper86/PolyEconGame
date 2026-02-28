'use client';

import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { WorkforceSummary } from './workforce-summary';
import { tenureYearColor } from './workforce-theme';

// ---------------------------------------------------------------------------
// Gradient legend bar
// ---------------------------------------------------------------------------

function GradientLegend({ total }: { total: number }): React.ReactElement {
    const stops = Array.from({ length: total }, (_, i) => tenureYearColor(i, total));
    const gradient = `linear-gradient(to right, ${stops.join(', ')})`;

    return (
        <div className='flex items-center gap-2 text-[10px] text-muted-foreground mb-1 px-1'>
            <span>0 y</span>
            <div className='flex-1 h-2 rounded' style={{ background: gradient }} />
            <span>{total - 1} y</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Age distribution stacked area chart – per tenure year
// ---------------------------------------------------------------------------

export function AgeDistributionChart({
    ageDistribution,
    tenureBandLabels,
}: {
    ageDistribution: WorkforceSummary['ageDistributionByYear'];
    tenureBandLabels: string[];
}): React.ReactElement {
    const hasData = ageDistribution.some((row) => tenureBandLabels.some((label) => (row[label] as number) > 0));
    if (!hasData) {
        return (
            <div className='flex items-center justify-center h-[180px] text-xs text-muted-foreground'>
                No age distribution data
            </div>
        );
    }

    const total = tenureBandLabels.length;

    return (
        <div style={{ width: '100%', height: 180 }}>
            <GradientLegend total={total} />
            <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={ageDistribution} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                    <XAxis dataKey='age' tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}`} />
                    <YAxis tick={false} axisLine={false} width={0} />
                    {tenureBandLabels.map((label, idx) => (
                        <Area
                            key={label}
                            type='monotone'
                            dataKey={label}
                            stackId='age'
                            stroke={tenureYearColor(idx, total)}
                            fill={tenureYearColor(idx, total)}
                            fillOpacity={0.65}
                            strokeWidth={0}
                            name={label}
                            isAnimationActive={false}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
