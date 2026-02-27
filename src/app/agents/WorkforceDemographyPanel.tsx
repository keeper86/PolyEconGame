'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { EducationLevelType, WorkforceDemography } from '../../simulation/planet';
import { educationLevelKeys, educationLevels } from '../../simulation/planet';
import { experienceMultiplier, MAX_TENURE_YEARS, NOTICE_PERIOD_MONTHS } from '../../simulation/workforce';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable label for an education level key. */
const eduLabel = (edu: EducationLevelType): string => educationLevels[edu].name;

/** Format large numbers with locale-aware separators. */
const fmt = (n: number): string => n.toLocaleString();

/** Sum a Record<EducationLevelType, number> across all education levels. */
const sumByEdu = (rec: Record<EducationLevelType, number>): number =>
    educationLevelKeys.reduce((sum, edu) => sum + (rec[edu] ?? 0), 0);

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

type WorkforceSummary = {
    /** Total active workers per education level (summed across all tenure years). */
    activeByEdu: Record<EducationLevelType, number>;
    /** Total departing workers per education level (all pipeline slots, all tenure years). */
    departingByEdu: Record<EducationLevelType, number>;
    /** Total active workers. */
    totalActive: number;
    /** Total departing workers. */
    totalDeparting: number;
    /** Weighted average experience multiplier across all active workers. */
    avgExperienceMultiplier: number;
    /** Per-tenure-year chart data: { year, active, departing, expMult }. */
    tenureChart: { year: number; active: number; departing: number; expMult: number }[];
};

function computeSummary(workforce: WorkforceDemography): WorkforceSummary {
    const activeByEdu = {} as Record<EducationLevelType, number>;
    const departingByEdu = {} as Record<EducationLevelType, number>;
    for (const edu of educationLevelKeys) {
        activeByEdu[edu] = 0;
        departingByEdu[edu] = 0;
    }

    let totalActive = 0;
    let totalDeparting = 0;
    let weightedExp = 0;

    const tenureChart: WorkforceSummary['tenureChart'] = [];

    for (let year = 0; year <= MAX_TENURE_YEARS; year++) {
        const cohort = workforce[year];
        if (!cohort) {
            continue;
        }

        let yearActive = 0;
        let yearDeparting = 0;

        for (const edu of educationLevelKeys) {
            const act = cohort.active[edu] ?? 0;
            activeByEdu[edu] += act;
            yearActive += act;

            const dep = (cohort.departing[edu] ?? []).reduce((s, v) => s + v, 0);
            departingByEdu[edu] += dep;
            yearDeparting += dep;
        }

        totalActive += yearActive;
        totalDeparting += yearDeparting;
        weightedExp += yearActive * experienceMultiplier(year);

        // Only include non-empty tenure years in the chart to keep it compact.
        if (yearActive > 0 || yearDeparting > 0) {
            tenureChart.push({
                year,
                active: yearActive,
                departing: yearDeparting,
                expMult: experienceMultiplier(year),
            });
        }
    }

    const avgExperienceMultiplier = totalActive > 0 ? weightedExp / totalActive : 1.0;

    return { activeByEdu, departingByEdu, totalActive, totalDeparting, avgExperienceMultiplier, tenureChart };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const COLORS: Record<string, string> = {
    active: '#60a5fa',
    departing: '#f97316',
    none: '#94a3b8',
    primary: '#60a5fa',
    secondary: '#34d399',
    tertiary: '#f59e0b',
    quaternary: '#8b5cf6',
};

function HeadcountTable({
    allocatedWorkers,
    activeByEdu,
    departingByEdu,
}: {
    allocatedWorkers: Record<EducationLevelType, number>;
    activeByEdu: Record<EducationLevelType, number>;
    departingByEdu: Record<EducationLevelType, number>;
}): React.ReactElement {
    return (
        <table className='w-full text-xs border-collapse'>
            <thead>
                <tr className='border-b text-left'>
                    <th className='py-1 pr-2 font-medium'>Education</th>
                    <th className='py-1 pr-2 font-medium text-right'>Target</th>
                    <th className='py-1 pr-2 font-medium text-right'>Active</th>
                    <th className='py-1 pr-2 font-medium text-right'>Departing</th>
                    <th className='py-1 font-medium text-right'>Δ</th>
                </tr>
            </thead>
            <tbody>
                {educationLevelKeys.map((edu) => {
                    const target = allocatedWorkers[edu] ?? 0;
                    const active = activeByEdu[edu];
                    const departing = departingByEdu[edu];
                    const delta = active - target;
                    return (
                        <tr key={edu} className='border-b border-dashed'>
                            <td className='py-1 pr-2'>{eduLabel(edu)}</td>
                            <td className='py-1 pr-2 text-right tabular-nums'>{fmt(target)}</td>
                            <td className='py-1 pr-2 text-right tabular-nums'>{fmt(active)}</td>
                            <td className='py-1 pr-2 text-right tabular-nums text-orange-500'>{fmt(departing)}</td>
                            <td
                                className={`py-1 text-right tabular-nums font-medium ${
                                    delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-muted-foreground'
                                }`}
                            >
                                {delta > 0 ? '+' : ''}
                                {fmt(delta)}
                            </td>
                        </tr>
                    );
                })}
                {/* Totals row */}
                <tr className='font-medium'>
                    <td className='py-1 pr-2'>Total</td>
                    <td className='py-1 pr-2 text-right tabular-nums'>{fmt(sumByEdu(allocatedWorkers))}</td>
                    <td className='py-1 pr-2 text-right tabular-nums'>{fmt(sumByEdu(activeByEdu))}</td>
                    <td className='py-1 pr-2 text-right tabular-nums text-orange-500'>
                        {fmt(sumByEdu(departingByEdu))}
                    </td>
                    <td
                        className={`py-1 text-right tabular-nums ${
                            sumByEdu(activeByEdu) - sumByEdu(allocatedWorkers) >= 0 ? 'text-green-600' : 'text-red-500'
                        }`}
                    >
                        {sumByEdu(activeByEdu) - sumByEdu(allocatedWorkers) > 0 ? '+' : ''}
                        {fmt(sumByEdu(activeByEdu) - sumByEdu(allocatedWorkers))}
                    </td>
                </tr>
            </tbody>
        </table>
    );
}

function TenureDistributionChart({
    tenureChart,
}: {
    tenureChart: WorkforceSummary['tenureChart'];
}): React.ReactElement {
    if (tenureChart.length === 0) {
        return <div className='text-xs text-muted-foreground'>No tenure data</div>;
    }

    const chartData = tenureChart.map((d) => ({
        year: `${d.year}y`,
        Active: d.active,
        Departing: d.departing,
    }));

    return (
        <div>
            <h5 className='text-xs font-medium mb-1'>Tenure distribution</h5>
            <div style={{ width: '100%', height: 140 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                        <XAxis dataKey='year' tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} />
                        <Tooltip />
                        <Legend verticalAlign='top' height={18} wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey='Active' stackId='a' fill={COLORS.active} />
                        <Bar dataKey='Departing' stackId='a' fill={COLORS.departing} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function DepartingPipelineTable({ workforce }: { workforce: WorkforceDemography }): React.ReactElement {
    // Aggregate departing pipeline across all tenure years, per edu per month-slot.
    const pipeline: Record<EducationLevelType, number[]> = {} as Record<EducationLevelType, number[]>;
    for (const edu of educationLevelKeys) {
        pipeline[edu] = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
    }
    for (const cohort of workforce) {
        for (const edu of educationLevelKeys) {
            const dep = cohort.departing[edu];
            if (!dep) {
                continue;
            }
            for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                pipeline[edu][m] += dep[m] ?? 0;
            }
        }
    }

    const anyDeparting = educationLevelKeys.some((edu) => pipeline[edu].some((v) => v > 0));
    if (!anyDeparting) {
        return <div className='text-xs text-muted-foreground'>No workers currently in notice period</div>;
    }

    return (
        <div>
            <h5 className='text-xs font-medium mb-1'>Departing pipeline (by months remaining)</h5>
            <table className='w-full text-xs border-collapse'>
                <thead>
                    <tr className='border-b text-left'>
                        <th className='py-1 pr-2 font-medium'>Education</th>
                        {Array.from({ length: NOTICE_PERIOD_MONTHS }, (_, m) => (
                            <th key={m} className='py-1 pr-2 font-medium text-right'>
                                {m + 1}mo
                            </th>
                        ))}
                        <th className='py-1 font-medium text-right'>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {educationLevelKeys.map((edu) => {
                        const total = pipeline[edu].reduce((s, v) => s + v, 0);
                        if (total === 0) {
                            return null;
                        }
                        return (
                            <tr key={edu} className='border-b border-dashed'>
                                <td className='py-1 pr-2'>{eduLabel(edu)}</td>
                                {pipeline[edu].map((v, m) => (
                                    <td key={m} className='py-1 pr-2 text-right tabular-nums text-orange-500'>
                                        {fmt(v)}
                                    </td>
                                ))}
                                <td className='py-1 text-right tabular-nums font-medium text-orange-500'>
                                    {fmt(total)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type WorkforceDemographyPanelProps = {
    allocatedWorkers: Record<EducationLevelType, number>;
    workforceDemography?: WorkforceDemography;
};

export default function WorkforceDemographyPanel({
    allocatedWorkers,
    workforceDemography,
}: WorkforceDemographyPanelProps): React.ReactElement {
    if (!workforceDemography || workforceDemography.length === 0) {
        // Fallback: show only the target allocation when no demography exists yet.
        return (
            <div className='mt-3 space-y-2'>
                <h4 className='text-sm font-semibold'>Workforce</h4>
                <div className='text-xs'>
                    <span className='text-muted-foreground'>No workforce demography data yet. Target workers: </span>
                    {educationLevelKeys.map((edu) => (
                        <span key={edu} className='inline-block mr-3'>
                            {eduLabel(edu)}: {fmt(allocatedWorkers[edu] ?? 0)}
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    const summary = computeSummary(workforceDemography);

    return (
        <div className='mt-3 space-y-3'>
            <h4 className='text-sm font-semibold'>Workforce demography</h4>

            {/* KPI row */}
            <div className='flex flex-wrap gap-4 text-xs'>
                <div>
                    <span className='text-muted-foreground'>Active: </span>
                    <span className='font-medium'>{fmt(summary.totalActive)}</span>
                </div>
                <div>
                    <span className='text-muted-foreground'>Departing: </span>
                    <span className='font-medium text-orange-500'>{fmt(summary.totalDeparting)}</span>
                </div>
                <div>
                    <span className='text-muted-foreground'>Avg experience: </span>
                    <span className='font-medium'>×{summary.avgExperienceMultiplier.toFixed(2)}</span>
                </div>
            </div>

            {/* Target vs actual table */}
            <HeadcountTable
                allocatedWorkers={allocatedWorkers}
                activeByEdu={summary.activeByEdu}
                departingByEdu={summary.departingByEdu}
            />

            {/* Tenure distribution chart */}
            <TenureDistributionChart tenureChart={summary.tenureChart} />

            {/* Departing pipeline detail */}
            <DepartingPipelineTable workforce={workforceDemography} />
        </div>
    );
}
