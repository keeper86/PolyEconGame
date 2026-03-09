'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
} from 'recharts';
import { CHILD_MAX_AGE, ELDERLY_MIN_AGE } from '@/simulation/constants';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from './CohortFilter';
import { educationLevelKeys } from '@/simulation/population/education';
import type { Skill } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';
import type { SkillTransferMatrix } from '@/simulation/population/population';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SKILL_LABELS: Record<Skill, string> = {
    novice: 'Nov',
    professional: 'Pro',
    expert: 'Exp',
};

const SKILL_COLORS: Record<Skill, string> = {
    novice: '#94a3b8', // slate-400
    professional: '#8b5cf6', // violet-500
    expert: '#f59e0b', // amber-500
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number): string => {
    if (Math.abs(n) >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(n) >= 1_000) {
        return `${(n / 1_000).toFixed(1)}k`;
    }
    return n.toFixed(1);
};

/* ------------------------------------------------------------------ */
/*  View modes                                                         */
/* ------------------------------------------------------------------ */

type ViewMode = 'occupation' | 'education';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    title: string;
    matrix: SkillTransferMatrix | undefined;
    yMin?: number;
    yMax?: number;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * TransferChart — reusable stacked diverging bar chart for any
 * skill-aware transfer matrix.
 *
 * Features:
 * - Stacked by occupation or education level.
 * - Skill toggle buttons (novice / pro / expert) with multi-select.
 *   Default = all selected (total mode).
 * - Y-axis always autoscales to "total mode" domain so toggling
 *   skills doesn't re-scale the chart — easier to compare.
 */
export default function TransferChart({ title, matrix, yMin, yMax }: Props): React.ReactElement {
    const [viewMode, setViewMode] = useState<ViewMode>('occupation');
    const [selectedSkills, setSelectedSkills] = useState<Set<Skill>>(new Set(SKILL));

    // Refs that hold the last non-empty chart data and domain so we can
    // keep rendering a stable empty frame instead of collapsing to text.
    const lastOccData = useRef<Record<string, number | string>[]>([]);
    const lastEduData = useRef<Record<string, number | string>[]>([]);
    const lastYDomain = useRef<[number, number]>([-1, 1]);

    const toggleSkill = (skill: Skill) => {
        setSelectedSkills((prev) => {
            const next = new Set(prev);
            if (next.has(skill)) {
                // Don't allow deselecting all — keep at least one
                if (next.size > 1) {
                    next.delete(skill);
                }
            } else {
                next.add(skill);
            }
            return next;
        });
    };

    const allSkillsSelected = selectedSkills.size === SKILL.length;

    /**
     * Compute chart data for both view modes, and for both the full
     * (all-skills) domain (for Y-axis) and the filtered (selected skills) view.
     */
    const { occData, eduData, totalOccData, totalEduData, totalReceived, totalGiven } = useMemo(() => {
        if (!matrix || matrix.length === 0) {
            return {
                occData: lastOccData.current,
                eduData: lastEduData.current,
                totalOccData: lastOccData.current,
                totalEduData: lastEduData.current,
                totalReceived: 0,
                totalGiven: 0,
            };
        }

        const occRows: Record<string, number | string>[] = [];
        const eduRows: Record<string, number | string>[] = [];
        const totalOccRows: Record<string, number | string>[] = [];
        const totalEduRows: Record<string, number | string>[] = [];
        let received = 0;
        let given = 0;

        for (let age = 0; age < matrix.length; age++) {
            // --- Filtered data (selected skills only) ---
            const occRow: Record<string, number | string> = { age };
            let ageTotal = 0;
            for (const occ of OCCUPATIONS) {
                let sum = 0;
                for (const edu of educationLevelKeys) {
                    for (const skill of SKILL) {
                        if (selectedSkills.has(skill)) {
                            sum += matrix[age][edu][occ][skill];
                        }
                    }
                }
                occRow[OCC_LABELS[occ]] = sum;
                ageTotal += sum;
            }
            occRow._total = ageTotal;
            occRows.push(occRow);

            const eduRow: Record<string, number | string> = { age };
            let eduAgeTotal = 0;
            for (const edu of educationLevelKeys) {
                let sum = 0;
                for (const occ of OCCUPATIONS) {
                    for (const skill of SKILL) {
                        if (selectedSkills.has(skill)) {
                            sum += matrix[age][edu][occ][skill];
                        }
                    }
                }
                eduRow[EDU_LABELS[edu]] = sum;
                eduAgeTotal += sum;
            }
            eduRow._total = eduAgeTotal;
            eduRows.push(eduRow);

            // --- Total data (all skills — for Y-axis domain) ---
            const totalOccRow: Record<string, number | string> = { age };
            let totalAgeTotal = 0;
            for (const occ of OCCUPATIONS) {
                let sum = 0;
                for (const edu of educationLevelKeys) {
                    for (const skill of SKILL) {
                        sum += matrix[age][edu][occ][skill];
                    }
                }
                totalOccRow[OCC_LABELS[occ]] = sum;
                totalAgeTotal += sum;
            }
            totalOccRow._total = totalAgeTotal;
            totalOccRows.push(totalOccRow);

            const totalEduRow: Record<string, number | string> = { age };
            let totalEduAgeTotal = 0;
            for (const edu of educationLevelKeys) {
                let sum = 0;
                for (const occ of OCCUPATIONS) {
                    for (const skill of SKILL) {
                        sum += matrix[age][edu][occ][skill];
                    }
                }
                totalEduRow[EDU_LABELS[edu]] = sum;
                totalEduAgeTotal += sum;
            }
            totalEduRow._total = totalEduAgeTotal;
            totalEduRows.push(totalEduRow);

            // Summary stats (always use total / all skills)
            if (totalAgeTotal > 0) {
                received += totalAgeTotal;
            } else {
                given += -totalAgeTotal;
            }
        }

        return {
            occData: occRows,
            eduData: eduRows,
            totalOccData: totalOccRows,
            totalEduData: totalEduRows,
            totalReceived: received,
            totalGiven: given,
        };
    }, [matrix, selectedSkills]);

    // Persist the last non-empty data into refs so when matrix goes empty
    // we can keep showing the last-seen chart frame without a layout shift.
    useEffect(() => {
        if (occData.length > 0) {
            lastOccData.current = occData;
        }
        if (eduData.length > 0) {
            lastEduData.current = eduData;
        }
    }, [occData, eduData]);

    /** Compute fixed Y-axis domain from total (all-skills) data, and persist it. If yMin/yMax props are provided use them. */
    const yDomain = useMemo<[number, number]>(() => {
        // If explicit bounds were provided by the parent, use them directly.
        if (typeof yMin === 'number' && typeof yMax === 'number') {
            const domain: [number, number] = [yMin, yMax];
            lastYDomain.current = domain;
            return domain;
        }

        const totalData = viewMode === 'occupation' ? totalOccData : totalEduData;
        if (totalData.length === 0) {
            return lastYDomain.current;
        }
        let min = 0;
        let max = 0;
        for (const row of totalData) {
            const v = Number(row._total ?? 0);
            if (v < min) {
                min = v;
            }
            if (v > max) {
                max = v;
            }
        }
        // Add 10% padding
        const pad = Math.max(Math.abs(min), Math.abs(max)) * 0.1 || 1;
        const domain: [number, number] = [min - pad, max + pad];
        lastYDomain.current = domain;
        return domain;
    }, [totalOccData, totalEduData, viewMode, yMin, yMax]);

    const hasData = totalReceived > 0 || totalGiven > 0;
    const chartData = viewMode === 'occupation' ? occData : eduData;

    return (
        <div>
            <div className='flex items-start justify-between gap-4 mb-2'>
                <div>
                    <h4 className='text-sm font-medium'>{title}</h4>
                    <div
                        className={`flex gap-3 text-[10px] mt-0.5 ${hasData ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
                    >
                        {hasData ? (
                            <>
                                <span>
                                    Received: <span className='text-blue-500 font-medium'>{fmt(totalReceived)}</span>
                                </span>
                                <span>
                                    Given: <span className='text-green-600 font-medium'>{fmt(totalGiven)}</span>
                                </span>
                                <span className='text-muted-foreground/60'>
                                    (Δ = {fmt(totalReceived - totalGiven)})
                                </span>
                            </>
                        ) : (
                            <span>No active transfers this tick</span>
                        )}
                    </div>
                </div>
                {/* Age boundary legend */}
                <div className='flex items-center gap-2 text-[10px] text-muted-foreground shrink-0 flex-wrap'>
                    <span>Children: 0–{CHILD_MAX_AGE}</span>
                    <span>Elderly: {ELDERLY_MIN_AGE}+</span>
                </div>
            </div>

            {/* Controls row: view mode tabs + skill toggles */}
            <div className='flex items-center gap-2 mb-2'>
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                    <TabsList className='h-7'>
                        <TabsTrigger value='occupation' className='text-[10px] px-2 py-0.5'>
                            By occupation
                        </TabsTrigger>
                        <TabsTrigger value='education' className='text-[10px] px-2 py-0.5'>
                            By education
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {/* Skill toggles — pushed to the right */}
                <div className='ml-auto flex items-center gap-1'>
                    {SKILL.map((skill) => {
                        const active = selectedSkills.has(skill);
                        return (
                            <button
                                key={skill}
                                type='button'
                                onClick={() => toggleSkill(skill)}
                                className={cn(
                                    'h-5 px-1.5 rounded text-[9px] font-medium border transition-colors',
                                    active
                                        ? 'border-transparent text-white'
                                        : 'border-border text-muted-foreground bg-transparent opacity-50 hover:opacity-75',
                                )}
                                style={active ? { backgroundColor: SKILL_COLORS[skill] } : undefined}
                                title={`${active ? 'Hide' : 'Show'} ${skill} skill level`}
                            >
                                {SKILL_LABELS[skill]}
                            </button>
                        );
                    })}
                    {!allSkillsSelected && (
                        <button
                            type='button'
                            onClick={() => setSelectedSkills(new Set(SKILL))}
                            className='h-5 px-1.5 rounded text-[9px] font-medium border border-border text-muted-foreground hover:text-foreground transition-colors'
                            title='Show all skill levels'
                        >
                            All
                        </button>
                    )}
                </div>
            </div>

            <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={chartData} margin={{ top: 6, right: 12, left: 12, bottom: 6 }} stackOffset='sign'>
                        <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                        <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                        <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => fmt(v as number)}
                            domain={yDomain}
                            label={{
                                value: 'Net wealth transfer',
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
                                const row = payload[0]?.payload as Record<string, number | string> | undefined;
                                if (!row) {
                                    return null;
                                }
                                const ageTotal = Number(row._total ?? 0);
                                return (
                                    <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[180px]'>
                                        <div className='font-medium mb-1'>Age {label}</div>
                                        {payload.map((entry) => {
                                            const val = Number(entry.value ?? 0);
                                            if (Math.abs(val) < 1e-6) {
                                                return null;
                                            }
                                            return (
                                                <div key={entry.dataKey as string} style={{ color: entry.color }}>
                                                    {entry.name}: {val > 0 ? '+' : ''}
                                                    {fmt(val)}
                                                </div>
                                            );
                                        })}
                                        <div className='mt-1 pt-1 border-t text-muted-foreground'>
                                            Total: {ageTotal > 0 ? '+' : ''}
                                            {fmt(ageTotal)}
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        <Legend verticalAlign='top' height={20} wrapperStyle={{ fontSize: 10 }} />

                        {/* Zero reference line */}
                        <ReferenceLine y={0} stroke='#64748b' strokeWidth={1} />

                        {/* Stacked diverging bars */}
                        {viewMode === 'occupation'
                            ? OCCUPATIONS.map((occ) => (
                                  <Bar
                                      key={occ}
                                      dataKey={OCC_LABELS[occ]}
                                      stackId='a'
                                      fill={OCC_COLORS[occ]}
                                      isAnimationActive={false}
                                  />
                              ))
                            : educationLevelKeys.map((edu) => (
                                  <Bar
                                      key={edu}
                                      dataKey={EDU_LABELS[edu]}
                                      stackId='a'
                                      fill={EDU_COLORS[edu]}
                                      isAnimationActive={false}
                                  />
                              ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
