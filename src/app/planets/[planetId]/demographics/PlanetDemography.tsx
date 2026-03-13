'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import ChartCard from '../../components/ChartCard';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '../../components/CohortFilter';
import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import { formatNumbers } from '@/lib/utils';
import type { GroupMode } from './demographicsTypes';

type DemographyRow = {
    age: number;
    total: number;
    edu: [number, number, number, number];
    occ: [number, number, number, number];
};

type Props = {
    rows: DemographyRow[];
    group: GroupMode;
};

function safeNumber(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export default function PlanetDemography({ rows, group }: Props): React.ReactElement {
    if (!rows || rows.length === 0) {
        return <div className='text-sm text-muted-foreground'>No demography data</div>;
    }

    const overallTotal = rows.reduce((s, r) => s + r.total, 0);
    if (overallTotal === 0) {
        return <div className='text-sm text-muted-foreground'>No demography data</div>;
    }

    const chartData = rows.map((r) => {
        const base = { age: r.age };
        const eduEntries = Object.fromEntries(educationLevelKeys.map((edu, i) => [edu, safeNumber(r.edu[i])]));
        const occEntries = Object.fromEntries(OCCUPATIONS.map((occ, i) => [occ, safeNumber(r.occ[i])]));
        return { ...base, ...eduEntries, ...occEntries };
    });

    const keys = group === 'education' ? educationLevelKeys : OCCUPATIONS;
    const colors = group === 'education' ? EDU_COLORS : OCC_COLORS;
    const labels = group === 'education' ? EDU_LABELS : OCC_LABELS;

    return (
        <ChartCard title='Population'>
            {/* Chart */}
            <ResponsiveContainer width='100%' height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                    <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                    <YAxis width={40} tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumbers(v)} />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) {
                                return null;
                            }
                            return (
                                <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[140px]'>
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
                    {keys.map((key) => (
                        <Bar
                            key={key}
                            dataKey={key}
                            stackId='a'
                            fill={colors[key as keyof typeof colors]}
                            name={labels[key as keyof typeof labels]}
                            isAnimationActive={false}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
            {/* Color legend */}
            <div className='flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] mt-1'>
                {keys.map((key) => (
                    <span key={key} className='flex items-center gap-1'>
                        <span
                            className='inline-block w-2.5 h-2.5 rounded-sm'
                            style={{ background: colors[key as keyof typeof colors] }}
                        />
                        {labels[key as keyof typeof labels]}
                    </span>
                ))}
            </div>
        </ChartCard>
    );
}
