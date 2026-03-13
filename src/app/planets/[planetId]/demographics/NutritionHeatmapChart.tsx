'use client';

import React, { useRef, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

import { FOOD_BUFFER_TARGET_TICKS, FOOD_PER_PERSON_PER_TICK } from '@/simulation/constants';
import ChartCard from '../../components/ChartCard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { educationLevelKeys } from '@/simulation/population/education';
import type { Skill } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '../../components/CohortFilter';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumbers } from '@/lib/utils';

const FOOD_TARGET_PER_PERSON = FOOD_BUFFER_TARGET_TICKS * FOOD_PER_PERSON_PER_TICK;

// ─── Nutrition bands ──────────────────────────────────────────────────────────

const BANDS = [
    { key: 'fatalStarvation', label: 'Fatal', color: '#7f1d1d' }, // darkest red
    { key: 'severeStarvation', label: 'Severe', color: '#b91c1c' }, // strong red
    { key: 'seriousStarvation', label: 'Serious', color: '#ea580c' }, // orange
    { key: 'moderateStarvation', label: 'Moderate', color: '#f59e0b' }, // amber
    { key: 'lightStarvation', label: 'Light', color: '#eab308' }, // yellow
    { key: 'noStarvation', label: 'None', color: '#16a34a' }, // green
] as const;

function classifyBand(starvationLevel: number): number {
    if (starvationLevel > 0.9) {
        return 0;
    }
    if (starvationLevel > 0.75) {
        return 1;
    }
    if (starvationLevel > 0.5) {
        return 2;
    }
    if (starvationLevel > 0.25) {
        return 3;
    }
    if (starvationLevel > 0.05) {
        return 4;
    }
    return 5;
}

const formatPct = (n: number): string => `${(n * 100).toFixed(1)}%`;

// ─── Types ────────────────────────────────────────────────────────────────────

type FoodCategory = { total: number; foodStock: number; starvationLevel: number };
type FoodCohort = { [occ: string]: { [edu: string]: { [skill: string]: FoodCategory } } };
type GroupMode = 'occupation' | 'education';
type ChartRow = Record<string, number>;

// ─── SkillFilter ──────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<Skill, string> = { novice: 'Novice', professional: 'Pro', expert: 'Expert' };
const SKILL_COLORS: Record<Skill, string> = {
    novice: '#94a3b8',
    professional: '#60a5fa',
    expert: '#f59e0b',
};

function SkillFilter({ selected, onChange }: { selected: Set<Skill>; onChange: (s: Set<Skill>) => void }) {
    const allSelected = SKILL.every((s) => selected.has(s));
    const toggle = (skill: Skill) => {
        const next = new Set(selected);
        if (next.has(skill)) {
            next.delete(skill);
        } else {
            next.add(skill);
        }
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

// ─── TopEdgeRect — draws a segment with a dividing line at the top ─────────────
// Used for the last band of each occ/edu group to mark the compartment boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TopEdgeRect(props: any) {
    const { x, y, width, height, fill, fillOpacity } = props;
    if (!width || !height || height <= 0) {
        return <g />;
    }
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={fillOpacity} />
            <line x1={x} x2={x + width} y1={y} y2={y} stroke='rgba(0,0,0,0.35)' strokeWidth={1.5} />
        </g>
    );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function makeTooltip(
    groupKeys: readonly string[],
    groupLabels: Record<string, string>,
    groupColors: Record<string, string>,
) {
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
        const totalPop = groupKeys.reduce((s, k) => s + (row[`${k}_total`] ?? 0), 0);
        return (
            <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[210px]'>
                <div className='font-medium mb-1'>
                    Age {label} · {formatNumbers(totalPop)}
                </div>
                {groupKeys.map((gk) => {
                    const pop = row[`${gk}_total`] ?? 0;
                    if (pop === 0) {
                        return null;
                    }
                    const avgStarvation = row[`${gk}_avgStarvation`] ?? 0;
                    const avgBuffer = row[`${gk}_avgBuffer`] ?? 0;
                    return (
                        <div key={gk} className='mt-1'>
                            <div className='flex items-center gap-1 font-medium' style={{ color: groupColors[gk] }}>
                                <span
                                    className='inline-block w-2 h-2 rounded-sm flex-shrink-0'
                                    style={{ background: groupColors[gk] }}
                                />
                                {groupLabels[gk]} · {formatNumbers(pop)}
                            </div>
                            <div className='pl-3 text-muted-foreground'>
                                starvation {formatPct(avgStarvation)} · buffer {formatPct(avgBuffer)}
                            </div>
                            <div className='pl-3 flex flex-wrap gap-x-1'>
                                {BANDS.map((b) => {
                                    const cnt = row[`${gk}_${b.key}`] ?? 0;
                                    if (cnt <= 0) {
                                        return null;
                                    }
                                    return (
                                        <span key={b.key} style={{ color: b.color }}>
                                            {b.label.split(' ')[0]} {formatNumbers(cnt)}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };
}

// ─── Legends ─────────────────────────────────────────────────────────────────

function BandLegend() {
    return (
        <div className='flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground mt-1'>
            {BANDS.map((b) => (
                <span key={b.key} className='flex items-center gap-0.5'>
                    <span className='inline-block w-2.5 h-2.5 rounded-sm' style={{ backgroundColor: b.color }} />
                    {b.label}
                </span>
            ))}
        </div>
    );
}

function GroupLegend({
    keys,
    labels,
    colors,
}: {
    keys: readonly string[];
    labels: Record<string, string>;
    colors: Record<string, string>;
}) {
    return (
        <div className='flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] mt-0.5'>
            {keys.map((k) => (
                <span key={k} className='flex items-center gap-1'>
                    <span
                        className='inline-block w-2.5 h-2.5 rounded-sm border'
                        style={{ borderColor: colors[k], background: 'transparent' }}
                    />
                    {labels[k]}
                </span>
            ))}
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
    demography: FoodCohort[];
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NutritionHeatmapChart({ demography }: Props): React.ReactElement {
    const [group, setGroup] = useState<GroupMode>('occupation');
    const [activeSkills, setActiveSkills] = useState<Set<Skill>>(new Set(SKILL));
    const lastYDomainRef = useRef<[number, number]>([0, 1]);
    const isVerySmall = useIsSmallScreen();

    const groupKeys = group === 'occupation' ? OCCUPATIONS : educationLevelKeys;
    const groupLabels = group === 'occupation' ? OCC_LABELS : (EDU_LABELS as Record<string, string>);
    const groupColors =
        group === 'occupation' ? (OCC_COLORS as Record<string, string>) : (EDU_COLORS as Record<string, string>);

    // ── Build chart data ──────────────────────────────────────────────────────
    // For each age row we produce:
    //   ${groupKey}_${bandKey}  — population in that band within this group (stacked)
    //   ${groupKey}_${lastBand}_edge — same value but rendered with TopEdgeRect to mark the group boundary
    //   ${groupKey}_total, ${groupKey}_avgStarvation, ${groupKey}_avgBuffer  — for tooltip
    const data: ChartRow[] = [];

    for (let age = 0; age < demography.length; age++) {
        const cohort = demography[age];
        if (!cohort) {
            continue;
        }

        const row: ChartRow = { age };
        let ageTotalPop = 0;

        for (const gk of groupKeys) {
            const bandPops: number[] = new Array(BANDS.length).fill(0);
            let gPop = 0;
            let weightedStarvation = 0;
            let weightedBuffer = 0;

            const occs = group === 'occupation' ? [gk] : OCCUPATIONS;
            const edus = group === 'education' ? [gk] : educationLevelKeys;

            for (const occ of occs) {
                for (const edu of edus) {
                    for (const skill of SKILL) {
                        if (!activeSkills.has(skill as Skill)) {
                            continue;
                        }
                        const cat = cohort[occ]?.[edu]?.[skill];
                        if (!cat || cat.total <= 0) {
                            continue;
                        }
                        const bufferRatio =
                            FOOD_TARGET_PER_PERSON > 0 ? cat.foodStock / (FOOD_TARGET_PER_PERSON * cat.total) : 0;
                        const bandIdx = classifyBand(cat.starvationLevel);
                        bandPops[bandIdx] += cat.total;
                        gPop += cat.total;
                        weightedStarvation += cat.total * cat.starvationLevel;
                        weightedBuffer += cat.total * bufferRatio;
                    }
                }
            }

            row[`${gk}_total`] = gPop;
            row[`${gk}_avgStarvation`] = gPop > 0 ? weightedStarvation / gPop : 0;
            row[`${gk}_avgBuffer`] = gPop > 0 ? weightedBuffer / gPop : 0;
            ageTotalPop += gPop;

            // Emit plain band segments for all but the last non-zero band,
            // and a TopEdgeRect segment for the topmost band to mark the group boundary.
            let lastNonZeroIdx = -1;
            for (let bi = BANDS.length - 1; bi >= 0; bi--) {
                if (bandPops[bi] > 0) {
                    lastNonZeroIdx = bi;
                    break;
                }
            }

            for (let bi = 0; bi < BANDS.length; bi++) {
                const bk = BANDS[bi].key;
                if (bi === lastNonZeroIdx) {
                    // Top segment of this group → plain value used by TopEdgeRect bar
                    row[`${gk}_${bk}`] = 0;
                    row[`${gk}_${bk}_edge`] = bandPops[bi];
                } else {
                    row[`${gk}_${bk}`] = bandPops[bi];
                    row[`${gk}_${bk}_edge`] = 0;
                }
            }
        }

        if (ageTotalPop === 0) {
            continue;
        }
        data.push(row);
    }

    if (data.length === 0) {
        return <div className='text-xs text-muted-foreground'>No nutrition data available</div>;
    }

    // Y-axis domain
    let maxY = 0;
    for (const row of data) {
        let rowTotal = 0;
        for (const gk of groupKeys) {
            rowTotal += row[`${gk}_total`] ?? 0;
        }
        if (rowTotal > maxY) {
            maxY = rowTotal;
        }
    }
    if (maxY > 0) {
        lastYDomainRef.current = [0, maxY];
    }
    const yDomain = lastYDomainRef.current;

    // Summary stats (global)
    let totalPop = 0;
    let totalStarving = 0;
    let weightedStarvation = 0;
    let weightedBuffer = 0;
    for (const row of data) {
        for (const gk of groupKeys) {
            const pop = row[`${gk}_total`] ?? 0;
            totalPop += pop;
            weightedStarvation += pop * (row[`${gk}_avgStarvation`] ?? 0);
            weightedBuffer += pop * (row[`${gk}_avgBuffer`] ?? 0);
            totalStarving +=
                (row[`${gk}_severeStarvation`] ?? 0) +
                (row[`${gk}_severeStarvation_edge`] ?? 0) +
                (row[`${gk}_moderateStarvation`] ?? 0) +
                (row[`${gk}_moderateStarvation_edge`] ?? 0) +
                (row[`${gk}_lightStarvation`] ?? 0) +
                (row[`${gk}_lightStarvation_edge`] ?? 0);
        }
    }
    const globalAvgStarvation = totalPop > 0 ? weightedStarvation / totalPop : 0;
    const globalAvgBuffer = totalPop > 0 ? weightedBuffer / totalPop : 0;

    const tooltip = makeTooltip(groupKeys, groupLabels, groupColors);

    const tabs = (
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
    );

    return (
        <ChartCard
            title='Nutrition status'
            primaryControls={tabs}
            secondaryControls={<SkillFilter selected={activeSkills} onChange={setActiveSkills} />}
        >
            {/* Summary stats */}
            <div className='flex gap-3 text-[10px] text-muted-foreground mb-2 flex-wrap'>
                <span>
                    Starving:{' '}
                    <span
                        className={
                            totalStarving / totalPop > 0.05
                                ? 'text-red-500 font-semibold'
                                : totalStarving > 0
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                        }
                    >
                        {formatNumbers(totalStarving)} ({formatPct(totalPop > 0 ? totalStarving / totalPop : 0)})
                    </span>
                </span>
                <span>
                    Avg starvation:{' '}
                    <span
                        className={
                            globalAvgStarvation > 0.3
                                ? 'text-red-500 font-semibold'
                                : globalAvgStarvation > 0
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                        }
                    >
                        {formatPct(globalAvgStarvation)}
                    </span>
                </span>
                <span>
                    Avg buffer:{' '}
                    <span
                        className={
                            globalAvgBuffer < 0.3
                                ? 'text-red-500'
                                : globalAvgBuffer < 0.7
                                  ? 'text-amber-500'
                                  : 'text-green-600'
                        }
                    >
                        {formatPct(globalAvgBuffer)}
                    </span>
                </span>
            </div>

            <ResponsiveContainer width='100%' minHeight={200} minWidth={290}>
                <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap='5%'>
                    <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                    <XAxis dataKey='age' tick={{ fontSize: 10 }} />
                    <YAxis width={40} tick={{ fontSize: 10 }} tickFormatter={formatNumbers} domain={yDomain} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {isVerySmall ? null : <Tooltip content={tooltip as any} />}

                    {/* For each group, emit one Bar per band (plain) + one Bar per band (edge / top boundary) */}
                    {groupKeys.flatMap((gk) =>
                        BANDS.flatMap((b) => [
                            <Bar
                                key={`${gk}_${b.key}`}
                                dataKey={`${gk}_${b.key}`}
                                stackId='nutrition'
                                fill={b.color}
                                fillOpacity={0.88}
                                name={b.label}
                                legendType='none'
                                isAnimationActive={false}
                            />,
                            <Bar
                                key={`${gk}_${b.key}_edge`}
                                dataKey={`${gk}_${b.key}_edge`}
                                stackId='nutrition'
                                fill={b.color}
                                fillOpacity={0.88}
                                shape={TopEdgeRect}
                                name={`${b.label} (top)`}
                                legendType='none'
                                isAnimationActive={false}
                            />,
                        ]),
                    )}
                </BarChart>
            </ResponsiveContainer>

            <BandLegend />
            <GroupLegend keys={groupKeys} labels={groupLabels} colors={groupColors} />
        </ChartCard>
    );
}
