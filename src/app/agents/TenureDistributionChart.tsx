'use client';

import React, { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import type { WorkforceSummary } from './workforce-summary';
import { educationLevelKeys } from '../../simulation/planet';
import { fmt, CHART_COLORS, EDU_COLORS, eduLabel } from './workforce-theme';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';

// ---------------------------------------------------------------------------
// Colours for the departure-reason breakdown
// ---------------------------------------------------------------------------

const DEPARTURE_COLORS = {
    quitting: '#facc15', // yellow-400
    fired: '#ef4444', // red-500
    retiring: '#a78bfa', // violet-400
} as const;

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------

type ViewMode = 'status' | 'education';

// ---------------------------------------------------------------------------
// Tenure distribution stacked bar chart
// ---------------------------------------------------------------------------

export function TenureDistributionChart({
    tenureChart,
    tenureChartByEdu,
}: {
    tenureChart: WorkforceSummary['tenureChart'];
    tenureChartByEdu: WorkforceSummary['tenureChartByEdu'];
}): React.ReactElement {
    const [view, setView] = useState<ViewMode>('status');

    if (tenureChart.length === 0) {
        return (
            <div className='flex items-center justify-center h-[180px] text-xs text-muted-foreground'>
                No tenure data
            </div>
        );
    }

    // ---- Status view data (active / quitting / fired / retiring) ----
    const statusData = tenureChart.map((d) => {
        const quitting = Math.max(0, d.departing - d.fired);
        return {
            year: `${d.year}y`,
            Active: d.active,
            Quitting: quitting,
            Fired: d.fired,
            Retiring: d.retiring,
            meanAge: d.meanAge,
            variance: d.variance,
        };
    });

    // ---- Education view data (per-edu active + departing) ----
    const eduData = tenureChartByEdu.map((d) => {
        const row: Record<string, number | string> = { year: `${d.year}y` };
        for (const edu of educationLevelKeys) {
            row[eduLabel(edu)] = (d.activeByEdu[edu] ?? 0) + (d.departingByEdu[edu] ?? 0);
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

            <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    {view === 'status' ? (
                        <BarChart data={statusData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='year' tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 9 }} />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload || payload.length === 0) {
                                        return null;
                                    }
                                    const data = payload[0]?.payload as (typeof statusData)[number] | undefined;
                                    const totalLeaving =
                                        (data?.Quitting ?? 0) + (data?.Fired ?? 0) + (data?.Retiring ?? 0);
                                    return (
                                        <div className='rounded-lg border bg-card p-2 text-xs shadow-md'>
                                            <div className='font-medium mb-1'>Tenure {label}</div>
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
                                            {data?.meanAge != null && (
                                                <div className='mt-1 border-t pt-1 text-muted-foreground'>
                                                    <div>Mean age: {data.meanAge.toFixed(1)}</div>
                                                    <div>
                                                        Std dev: ±
                                                        {data.variance != null
                                                            ? Math.sqrt(data.variance).toFixed(1)
                                                            : '—'}
                                                    </div>
                                                </div>
                                            )}
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
                            <Bar dataKey='Fired' stackId='a' fill={DEPARTURE_COLORS.fired} radius={[0, 0, 0, 0]} />
                            <Bar
                                dataKey='Retiring'
                                stackId='a'
                                fill={DEPARTURE_COLORS.retiring}
                                radius={[2, 2, 0, 0]}
                            />
                        </BarChart>
                    ) : (
                        <BarChart data={eduData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                            <XAxis dataKey='year' tick={{ fontSize: 9 }} />
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
                                            <div className='font-medium mb-1'>Tenure {label}</div>
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
