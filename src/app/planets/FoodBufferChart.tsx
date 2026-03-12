'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumbers } from '@/lib/utils';
import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK } from '@/simulation/constants';
import { educationLevelKeys } from '@/simulation/population/education';
import type { Population, Skill } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';
import React, { useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Full buffer = target stock per person (tons). */
const FOOD_TARGET_PER_PERSON = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

const EDU_COLORS: Record<string, string> = {
    none: '#94a3b8',
    primary: '#60a5fa',
    secondary: '#34d399',
    tertiary: '#f59e0b',
};

const EDU_LABELS: Record<string, string> = {
    none: 'None',
    primary: 'Primary',
    secondary: 'Secondary',
    tertiary: 'Tertiary',
};

const OCC_COLORS: Record<string, string> = {
    unoccupied: '#60a5fa',
    employed: '#34d399',
    education: '#f97316',
    unableToWork: '#ef4444',
};

const OCC_LABELS: Record<string, string> = {
    unoccupied: 'Unoccupied',
    employed: 'Employed',
    education: 'Education',
    unableToWork: 'Unable to work',
};

const formatNumbersPct = (n: number): string => `${n.toFixed(0)}`;

/* ------------------------------------------------------------------ */
/*  Skill labels + colors                                              */
/* ------------------------------------------------------------------ */

const SKILL_LABELS: Record<Skill, string> = {
    novice: 'Novice',
    professional: 'Pro',
    expert: 'Expert',
};

/** Accent colors for the three skill levels (bg when active). */
const SKILL_COLORS: Record<Skill, string> = {
    novice: '#94a3b8', // slate-400
    professional: '#60a5fa', // blue-400
    expert: '#f59e0b', // amber-400
};

/* ------------------------------------------------------------------ */
/*  Skill filter — compact colored toggle buttons                     */
/* ------------------------------------------------------------------ */

function SkillFilter({ selected, onChange }: { selected: Set<Skill>; onChange: (s: Set<Skill>) => void }) {
    const allSelected = SKILL.every((s) => selected.has(s));
    const toggle = (skill: Skill) => {
        const next = new Set(selected);
        if (next.has(skill)) {
            next.delete(skill);
        } else {
            next.add(skill);
        }
        // Prevent deselecting the last active skill
        if (next.size > 0) {
            onChange(next);
        }
    };
    return (
        <div className='flex items-center gap-1'>
            <button
                className='h-6 px-1.5 rounded text-[10px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted/80'
                disabled={allSelected}
                onClick={() => onChange(new Set(SKILL))}
            >
                All
            </button>
            {SKILL.map((skill) => {
                const active = selected.has(skill);
                return (
                    <button
                        key={skill}
                        onClick={() => toggle(skill)}
                        className='h-6 px-1.5 rounded text-[10px] font-medium border transition-colors'
                        style={
                            active
                                ? { background: SKILL_COLORS[skill], borderColor: SKILL_COLORS[skill], color: '#fff' }
                                : {
                                      background: 'transparent',
                                      borderColor: 'transparent',
                                      color: 'var(--muted-foreground)',
                                  }
                        }
                    >
                        {SKILL_LABELS[skill]}
                    </button>
                );
            })}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  View modes                                                         */
/* ------------------------------------------------------------------ */

type GroupMode = 'education' | 'occupation';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
    population: Population;
};

type ChartRow = Record<string, number>;

/* ------------------------------------------------------------------ */
/*  Tooltip factory                                                    */
/* ------------------------------------------------------------------ */

function makeTooltip(keys: readonly string[], labels: Record<string, string>, colors: Record<string, string>) {
    return function TooltipContent({
        active,
        payload,
        label,
    }: {
        active?: boolean;
        payload?: { payload: ChartRow }[];
        label?: number;
    }) {
        if (!active || !payload || payload.length === 0) {
            return null;
        }
        const row = payload[0].payload;
        return (
            <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[160px]'>
                <div className='font-medium mb-1'>Age {label}</div>
                {keys.map((key) => {
                    const share = row[`${key}_popShare`] ?? 0;
                    if (share === 0) {
                        return null;
                    }
                    const ratio = row[`${key}_bufferRatio`] ?? 0;
                    const avgStock = row[`${key}_avgStock`] ?? 0;
                    const pop = row[`${key}_pop`] ?? 0;
                    return (
                        <div key={key} className='flex items-center gap-1 mt-0.5'>
                            <span
                                className='inline-block w-2 h-2 rounded-sm flex-shrink-0'
                                style={{ background: colors[key] }}
                            />
                            <span style={{ color: colors[key] }} className='font-medium'>
                                {labels[key]}
                            </span>
                            <span className='ml-auto pl-2 text-muted-foreground'>
                                {formatNumbersPct(ratio)} · {formatNumbers(avgStock)} t · {formatNumbers(pop)}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };
}

/* ------------------------------------------------------------------ */
/*  Legend                                                             */
/* ------------------------------------------------------------------ */

function ColorLegend({
    keys,
    labels,
    colors,
}: {
    keys: readonly string[];
    labels: Record<string, string>;
    colors: Record<string, string>;
}) {
    return (
        <div className='flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] mb-1'>
            {keys.map((key) => (
                <span key={key} className='flex items-center gap-1'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm' style={{ background: colors[key] }} />
                    {labels[key]}
                </span>
            ))}
        </div>
    );
}

// Custom bar shape that draws the filled rectangle and a single black line
// along the top edge. Return an empty <g/> for zero/negative height so the
// shape always returns an Element (satisfies Recharts typing).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TopEdgeRect(props: any) {
    const { x, y, width, height, fill, fillOpacity } = props;
    if (!width || !height || height <= 0) {
        return <g />;
    }
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={fillOpacity} />
            <line x1={x} x2={x + width} y1={y} y2={y} stroke='#000' strokeWidth={1} />
        </g>
    );
}

/**
 * FoodBufferChart — two view modes (education / occupation) × two style modes:
 *
 * - **Split**: each category → two sub-bars: filled (color, height ∝ popShare×bufferRatio)
 *   + empty (faded, height ∝ popShare×(1−bufferRatio)). Pure stacked bars, no custom shapes.
 * - **Overlay**: solid colored bar at full popShare height, then a semi-transparent white
 *   bar stacked on top for the "empty" portion — glass-half-full look.
 */
export default function FoodBufferChart({ population }: Props): React.ReactElement {
    const [group, setGroup] = useState<GroupMode>('occupation');
    const [activeSkills, setActiveSkills] = useState<Set<Skill>>(new Set(SKILL));

    /** Remember the last non-empty Y domain so the chart doesn't collapse. */
    const lastYDomainRef = useRef<[number, number]>([0, 1]);

    const demography = population.demography;

    /* -------------------------------------------------------------- */
    /*  Build chart data                                               */
    /* -------------------------------------------------------------- */

    const eduData: ChartRow[] = [];
    const occData: ChartRow[] = [];

    for (let age = 0; age < demography.length; age++) {
        const cohort = demography[age];
        if (!cohort) {
            continue;
        }

        let agePop = 0;
        const eduStock: Record<string, number> = {};
        const eduPop: Record<string, number> = {};
        for (const edu of educationLevelKeys) {
            eduStock[edu] = 0;
            eduPop[edu] = 0;
        }

        const occStock: Record<string, number> = {};
        const occPop: Record<string, number> = {};
        for (const occ of OCCUPATIONS) {
            occStock[occ] = 0;
            occPop[occ] = 0;
        }

        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    if (!activeSkills.has(skill)) {
                        continue;
                    }
                    const cat = cohort[occ][edu][skill];
                    if (cat.total > 0) {
                        agePop += cat.total;
                        eduStock[edu] += cat.foodStock;
                        eduPop[edu] += cat.total;
                        occStock[occ] += cat.foodStock;
                        occPop[occ] += cat.total;
                    }
                }
            }
        }

        if (agePop === 0) {
            continue;
        }

        // Education row
        const eduRow: ChartRow = { age };
        for (const edu of educationLevelKeys) {
            const share = eduPop[edu];
            const avgStock = eduPop[edu] > 0 ? eduStock[edu] / eduPop[edu] : 0;
            const ratio = avgStock / FOOD_TARGET_PER_PERSON;
            // Clamp ratio to [0,1] for stacked-bar geometry so that
            // filled + empty = share (the population share).  Without clamping,
            // ratio > 1 produces negative `empty` and filled > share, which
            // breaks the stacked bar layout.  The tooltip still shows the
            // unclamped ratio so overstocking is visible there.
            const clampedRatio = Math.min(1, Math.max(0, ratio));
            eduRow[`${edu}_popShare`] = share;
            eduRow[`${edu}_bufferRatio`] = ratio;
            eduRow[`${edu}_filled`] = share * clampedRatio;
            eduRow[`${edu}_empty`] = share * (1 - clampedRatio);
            eduRow[`${edu}_avgStock`] = avgStock;
            eduRow[`${edu}_pop`] = eduPop[edu];
        }
        eduData.push(eduRow);

        // Occupation row
        const occRow: ChartRow = { age };
        for (const occ of OCCUPATIONS) {
            const share = occPop[occ];
            const avgStock = occPop[occ] > 0 ? occStock[occ] / occPop[occ] : 0;
            const ratio = avgStock / FOOD_TARGET_PER_PERSON;
            const clampedRatio = Math.min(1, Math.max(0, ratio));
            occRow[`${occ}_popShare`] = share;
            occRow[`${occ}_bufferRatio`] = ratio;
            occRow[`${occ}_filled`] = share * clampedRatio;
            occRow[`${occ}_empty`] = share * (1 - clampedRatio);
            occRow[`${occ}_avgStock`] = avgStock;
            occRow[`${occ}_pop`] = occPop[occ];
        }
        occData.push(occRow);
    }

    const hasData = eduData.length > 0;

    /* -------------------------------------------------------------- */
    /*  Derived                                                        */
    /* -------------------------------------------------------------- */

    const keys = group === 'education' ? educationLevelKeys : OCCUPATIONS;
    const labels = group === 'education' ? EDU_LABELS : OCC_LABELS;
    const colors = group === 'education' ? EDU_COLORS : OCC_COLORS;
    const data = group === 'education' ? eduData : occData;
    const tooltip = makeTooltip(keys, labels, colors);

    // Compute the max Y from current data and persist it; fall back to last known value when empty.
    if (hasData) {
        let maxY = 0;
        for (const row of data) {
            for (const key of keys) {
                const filled = (row[`${key}_filled`] ?? 0) + (row[`${key}_empty`] ?? 0);
                if (filled > maxY) {
                    maxY = filled;
                }
            }
        }
        lastYDomainRef.current = [0, maxY > 0 ? maxY : 1];
    }
    const yDomain = lastYDomainRef.current;

    return (
        <Card>
            <CardHeader className='pb-2'>
                <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                    <CardTitle className='text-sm font-medium shrink-0'>Food buffers by age</CardTitle>
                    <div className='flex flex-wrap items-center gap-2'>
                        <Tabs value={group} onValueChange={(v) => setGroup(v as GroupMode)}>
                            <TabsList className='h-7'>
                                <TabsTrigger value='occupation' className='text-[10px] px-2 py-0.5'>
                                    By occupation
                                </TabsTrigger>
                                <TabsTrigger value='education' className='text-[10px] px-2 py-0.5'>
                                    By education
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <SkillFilter selected={activeSkills} onChange={setActiveSkills} />
                    </div>
                </div>
                <ColorLegend keys={keys} labels={labels} colors={colors} />
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width='100%' minHeight={220} minWidth={300} style={{ marginLeft: '-20px' }}>
                    <BarChart data={data} margin={{ top: 5, right: -100, bottom: 5, left: 0 }} barCategoryGap='5%'>
                        <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                        <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                        <YAxis width={40} tick={{ fontSize: 10 }} tickFormatter={formatNumbers} domain={yDomain} />
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <Tooltip content={tooltip as any} />

                        {keys.flatMap((key) => [
                            <Bar
                                key={`${key}_filled`}
                                dataKey={`${key}_filled`}
                                stackId='a'
                                fill={colors[key]}
                                fillOpacity={0.9}
                                name={labels[key]}
                                isAnimationActive={false}
                            />,
                            <Bar
                                key={`${key}_empty`}
                                dataKey={`${key}_empty`}
                                stackId='a'
                                fill={colors[key]}
                                fillOpacity={0.2}
                                shape={TopEdgeRect}
                                name={`${labels[key]} (empty)`}
                                legendType='none'
                                isAnimationActive={false}
                            />,
                        ])}
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
