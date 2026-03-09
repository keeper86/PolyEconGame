'use client';

import React, { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import type { WorkforceSummary } from './workforce-summary';
import { fmt, CHART_COLORS, EDU_COLORS, eduLabel } from './workforce-theme';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { educationLevelKeys } from '@/simulation/population/education';

// ---------------------------------------------------------------------------
// Colours for the departure-reason breakdown
// ---------------------------------------------------------------------------

const DEPARTURE_COLORS = {
    quitting: '#facc15', // yellow-400
    fired: '#ef4444', // red-500
} as const;

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------

type ViewMode = 'status' | 'education';

// ---------------------------------------------------------------------------
// Age distribution stacked bar chart — by status or by education
// ---------------------------------------------------------------------------

export function AgeDistributionChart({
    ageChartByStatus,
    ageChartByEdu,
}: {
    ageChartByStatus: WorkforceSummary['ageChartByStatus'];
    ageChartByEdu: WorkforceSummary['ageChartByEdu'];
}): React.ReactElement {
    const [view, setView] = useState<ViewMode>('status');

    if (ageChartByStatus.length === 0) {
        return (
            <div className='flex items-center justify-center h-[180px] text-xs text-muted-foreground'>No age data</div>
        );
    }

    // ---- Status view data (active / quitting / fired) ----
    const statusData = ageChartByStatus.map((d) => ({
        age: d.age,
        Active: d.active,
        Quitting: d.quitting,
        Fired: d.fired,
    }));

    // ---- Education view data (per-edu totals including departing) ----
    const eduData = ageChartByEdu.map((d) => {
        const row: Record<string, number> = { age: d.age };
        for (const edu of educationLevelKeys) {
            row[eduLabel(edu)] = d.byEdu[edu] ?? 0;
        }
        return row;
    });

    return (
        <div>
            {/* Toggle */}
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                <TabsList className='h-7 mb-2'>
                    <TabsTrigger value='status' className='text-[10px] px-2 py-0.5'>
                        By status
                    </TabsTrigger>
                    <TabsTrigger value='education' className='text-[10px] px-2 py-0.5'>
                        By education
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    {view === 'status' ? (
                        <BarChart data={statusData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='age' tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 9 }} />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload || payload.length === 0) {
                                        return null;
                                    }
                                    const data = payload[0]?.payload as (typeof statusData)[number] | undefined;
                                    const total = (data?.Active ?? 0) + (data?.Quitting ?? 0) + (data?.Fired ?? 0);
                                    const totalLeaving = (data?.Quitting ?? 0) + (data?.Fired ?? 0);
                                    return (
                                        <div className='rounded-lg border bg-card p-2 text-xs shadow-md'>
                                            <div className='font-medium mb-1'>Age {label}</div>
                                            {payload.map((entry) => (
                                                <div key={entry.dataKey as string} style={{ color: entry.color }}>
                                                    {entry.name}: {fmt(entry.value as number)}
                                                </div>
                                            ))}
                                            {totalLeaving > 0 && (
                                                <div className='mt-1 border-t pt-1 text-muted-foreground'>
                                                    Total leaving: {fmt(totalLeaving)}
                                                </div>
                                            )}
                                            <div className='mt-1 border-t pt-1 text-muted-foreground'>
                                                Total: {fmt(total)}
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                            <Legend verticalAlign='top' height={18} wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey='Active' stackId='a' fill={CHART_COLORS.active} radius={[0, 0, 0, 0]} />
                            <Bar
                                dataKey='Quitting'
                                stackId='a'
                                fill={DEPARTURE_COLORS.quitting}
                                radius={[0, 0, 0, 0]}
                            />
                            <Bar dataKey='Fired' stackId='a' fill={DEPARTURE_COLORS.fired} radius={[2, 2, 0, 0]} />
                        </BarChart>
                    ) : (
                        <BarChart data={eduData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='age' tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 9 }} />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload || payload.length === 0) {
                                        return null;
                                    }
                                    const total = payload.reduce(
                                        (sum, entry) => sum + ((entry.value as number) ?? 0),
                                        0,
                                    );
                                    return (
                                        <div className='rounded-lg border bg-card p-2 text-xs shadow-md'>
                                            <div className='font-medium mb-1'>Age {label}</div>
                                            {payload.map((entry) => (
                                                <div key={entry.dataKey as string} style={{ color: entry.color }}>
                                                    {entry.name}: {fmt(entry.value as number)}
                                                </div>
                                            ))}
                                            <div className='mt-1 border-t pt-1 text-muted-foreground'>
                                                Total: {fmt(total)}
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                            <Legend verticalAlign='top' height={18} wrapperStyle={{ fontSize: 10 }} />
                            {educationLevelKeys.map((edu, idx) => (
                                <Bar
                                    key={edu}
                                    dataKey={eduLabel(edu)}
                                    stackId='a'
                                    fill={EDU_COLORS[edu].chart}
                                    radius={idx === educationLevelKeys.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                                />
                            ))}
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}
