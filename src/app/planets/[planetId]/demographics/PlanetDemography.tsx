'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useIsSmallScreen } from '@/hooks/useMobile';
import React from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumbers } from '@/lib/utils';
import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '../../_components/CohortFilter';
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

function EmptyChart({ height = 180 }: { height?: number }) {
    return (
        <div
            className='w-full rounded border border-dashed border-muted flex items-center justify-center text-xs text-muted-foreground'
            style={{ height }}
        >
            No data
        </div>
    );
}

export default function PlanetDemography({ rows, group }: Props): React.ReactElement {
    const isVerySmall = useIsSmallScreen();
    if (!rows || rows.length === 0) {
        return <EmptyChart />;
    }

    const overallTotal = rows.reduce((s, r) => s + r.total, 0);
    if (overallTotal === 0) {
        return <EmptyChart />;
    }

    const chartData = rows.map((r) => {
        const base = { age: r.age };
        const eduEntries = Object.fromEntries(educationLevelKeys.map((edu, i) => [edu, safeNumber(r.edu[i])]));
        const occEntries = Object.fromEntries(OCCUPATIONS.map((occ, i) => [occ, safeNumber(r.occ[i])]));
        return { ...base, ...eduEntries, ...occEntries };
    });

    // Merge adjacent age rows when on very small screens to reduce visual clutter.
    function mergePairs(rowsArr: Record<string, number>[], rowKeys: readonly string[]) {
        const result: Record<string, number>[] = [];
        for (let i = 0; i < rowsArr.length; i += 2) {
            const a = rowsArr[i];
            const b = rowsArr[i + 1];
            if (!b) {
                result.push(a);
                continue;
            }
            const merged: Record<string, number> = { age: a.age };
            for (const key of rowKeys) {
                merged[key] = (a[key] ?? 0) + (b[key] ?? 0);
            }
            result.push(merged);
        }
        return result;
    }

    const keys = group === 'education' ? educationLevelKeys : OCCUPATIONS;
    const finalChartData = isVerySmall ? mergePairs(chartData, keys) : chartData;
    const colors = group === 'education' ? EDU_COLORS : OCC_COLORS;
    const labels = group === 'education' ? EDU_LABELS : OCC_LABELS;

    return (
        <Card>
            <CardContent className='px-3 pt-3 pb-2'>
                <ResponsiveContainer width='100%' height={180}>
                    <BarChart data={finalChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
            </CardContent>
        </Card>
    );
}
