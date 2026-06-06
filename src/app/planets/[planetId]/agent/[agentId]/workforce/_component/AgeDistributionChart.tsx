'use client';

import React, { useMemo } from 'react';
import type { TooltipProps } from 'recharts';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import type { WorkforceSummary } from './workforceSummary';
import { CHART_COLORS, DEPARTURE_COLORS, EDU_COLORS, eduLabel } from './workforceTheme';
import { educationLevelKeys } from '@/simulation/population/education';
import { formatNumberWithUnit } from '@/lib/utils';
import { useIsSmallScreen } from '@/hooks/useMobile';

// ---------------------------------------------------------------------------
// View mode (owned by parent)
// ---------------------------------------------------------------------------

export type ViewMode = 'status' | 'education';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChartRow = Record<string, number>;

// ---------------------------------------------------------------------------
// mergePairs — halves the number of bars by merging adjacent age pairs
// ---------------------------------------------------------------------------

function mergePairs(rows: ChartRow[]): ChartRow[] {
    const result: ChartRow[] = [];
    for (let i = 0; i < rows.length; i += 2) {
        const a = rows[i];
        const b = rows[i + 1];
        if (!b) {
            result.push(a);
            continue;
        }
        const merged: ChartRow = { age: a.age };
        for (const key of Object.keys(a)) {
            if (key === 'age') {
                continue;
            }
            merged[key] = (a[key] ?? 0) + (b[key] ?? 0);
        }
        result.push(merged);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Empty placeholder
// ---------------------------------------------------------------------------

function EmptyChart({ height = 180 }: { height?: number }) {
    return (
        <div
            className='w-full rounded border border-dashed border-muted flex items-center justify-center text-xs text-muted-foreground'
            style={{ height }}
        >
            No age data
        </div>
    );
}

type PayloadEntry = NonNullable<TooltipProps<number, string>['payload']>[number];

// ---------------------------------------------------------------------------
// Status-tooltip
// ---------------------------------------------------------------------------

function StatusTooltip({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }
    const row = payload[0]?.payload as ChartRow;
    const total = (row?.Active ?? 0) + (row?.Quitting ?? 0) + (row?.Fired ?? 0) + (row?.Retired ?? 0);
    const totalLeaving = (row?.Quitting ?? 0) + (row?.Fired ?? 0) + (row?.Retired ?? 0);
    return (
        <div className='rounded-lg border bg-card p-2 text-xs shadow-md'>
            <div className='font-medium mb-1'>Age {label}</div>
            {payload.map((entry: PayloadEntry) => (
                <div key={entry.dataKey} style={{ color: entry.color }}>
                    {entry.name}: {formatNumberWithUnit(entry.value as number, 'persons')}
                </div>
            ))}
            {totalLeaving > 0 && (
                <div className='mt-1 border-t pt-1 text-muted-foreground'>
                    Total leaving: {formatNumberWithUnit(totalLeaving, 'persons')}
                </div>
            )}
            <div className='mt-1 border-t pt-1 text-muted-foreground'>
                Total: {formatNumberWithUnit(total, 'persons')}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Education-tooltip
// ---------------------------------------------------------------------------

function EduTooltip({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }
    const total = payload.reduce((sum: number, entry: PayloadEntry) => sum + ((entry.value as number) ?? 0), 0);
    return (
        <div className='rounded-lg border bg-card p-2 text-xs shadow-md'>
            <div className='font-medium mb-1'>Age {label}</div>
            {payload.map((entry: PayloadEntry) => (
                <div key={entry.dataKey} style={{ color: entry.color }}>
                    {entry.name}: {formatNumberWithUnit(entry.value as number, 'persons')}
                </div>
            ))}
            <div className='mt-1 border-t pt-1 text-muted-foreground'>
                Total: {formatNumberWithUnit(total, 'persons')}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Age distribution stacked bar chart — by status or by education
// ---------------------------------------------------------------------------

export function AgeDistributionChart({
    ageChartByStatus,
    ageChartByEdu,
    view,
}: {
    ageChartByStatus: WorkforceSummary['ageChartByStatus'];
    ageChartByEdu: WorkforceSummary['ageChartByEdu'];
    view: ViewMode;
}): React.ReactElement {
    const isVerySmall = useIsSmallScreen();

    // ---- Status view data (active / quitting / fired / retired) ----
    const statusData = useMemo(() => {
        const raw: ChartRow[] = ageChartByStatus.map((d) => ({
            age: d.age,
            Active: d.active,
            Quitting: d.quitting,
            Fired: d.fired,
            Retired: d.retired,
        }));
        return isVerySmall ? mergePairs(raw) : raw;
    }, [ageChartByStatus, isVerySmall]);

    // ---- Education view data (per-edu totals including departing) ----
    const eduData = useMemo(() => {
        const raw: ChartRow[] = ageChartByEdu.map((d) => {
            const row: ChartRow = { age: d.age };
            for (const edu of educationLevelKeys) {
                row[eduLabel(edu)] = d.byEdu[edu] ?? 0;
            }
            return row;
        });
        return isVerySmall ? mergePairs(raw) : raw;
    }, [ageChartByEdu, isVerySmall]);

    // ---- Tooltips ----
    const statusTooltip = useMemo(() => StatusTooltip, []);
    const eduTooltip = useMemo(() => EduTooltip, []);

    if (ageChartByStatus.length === 0) {
        return <EmptyChart />;
    }

    return (
        <div>
            <ResponsiveContainer width='100%' minHeight={180} minWidth={290}>
                {view === 'status' ? (
                    <BarChart data={statusData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap='5%'>
                        <XAxis dataKey='age' tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <YAxis
                            width={40}
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons')}
                        />
                        {isVerySmall ? null : <Tooltip content={statusTooltip} />}
                        <Legend verticalAlign='top' height={18} wrapperStyle={{ fontSize: 10 }} />
                        <Bar
                            dataKey='Active'
                            stackId='a'
                            fill={CHART_COLORS.active}
                            isAnimationActive={false}
                            radius={[0, 0, 0, 0]}
                        />
                        <Bar
                            dataKey='Quitting'
                            stackId='a'
                            fill={DEPARTURE_COLORS.quitting}
                            isAnimationActive={false}
                            radius={[0, 0, 0, 0]}
                        />
                        <Bar
                            dataKey='Fired'
                            stackId='a'
                            fill={DEPARTURE_COLORS.fired}
                            isAnimationActive={false}
                            radius={[0, 0, 0, 0]}
                        />
                        <Bar
                            dataKey='Retired'
                            stackId='a'
                            fill={DEPARTURE_COLORS.retired}
                            isAnimationActive={false}
                            radius={[2, 2, 0, 0]}
                        />
                    </BarChart>
                ) : (
                    <BarChart data={eduData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap='5%'>
                        <XAxis dataKey='age' tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <YAxis
                            width={40}
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => formatNumberWithUnit(v as number, 'persons')}
                        />
                        {isVerySmall ? null : <Tooltip content={eduTooltip} />}
                        <Legend verticalAlign='top' height={18} wrapperStyle={{ fontSize: 10 }} />
                        {educationLevelKeys.map((edu, idx) => (
                            <Bar
                                key={edu}
                                dataKey={eduLabel(edu)}
                                stackId='a'
                                fill={EDU_COLORS[edu].chart}
                                isAnimationActive={false}
                                radius={idx === educationLevelKeys.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                            />
                        ))}
                    </BarChart>
                )}
            </ResponsiveContainer>
        </div>
    );
}
