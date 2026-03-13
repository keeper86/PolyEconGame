'use client';

import React, { useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import ChartCard from '@/app/planets/components/ChartCard';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '@/app/planets/components/CohortFilter';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { formatNumbers } from '@/lib/utils';
import { educationLevelKeys } from '@/simulation/population/education';
import type { Skill } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';

// ─── Types ───────────────────────────────────────────────────────────────────

type UnifiedCategory = { total: number; wealthMean: number };
type UnifiedCohort = { [occ: string]: { [edu: string]: { [skill: string]: UnifiedCategory } } };

type GroupMode = 'occupation' | 'education';
type ChartRow = Record<string, number>;

// ─── SkillFilter (same pattern as FoodBufferChart) ────────────────────────────

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

// ─── Tooltip factory ─────────────────────────────────────────────────────────

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
            <div className='rounded-lg border bg-card p-2 text-xs shadow-md min-w-[180px]'>
                <div className='font-medium mb-1'>Age {label}</div>
                {keys.map((key) => {
                    const pop = row[`${key}_pop`] ?? 0;
                    if (pop === 0) {
                        return null;
                    }
                    const mean = row[`${key}_mean`] ?? 0;
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
                                {formatNumbers(mean)} · {formatNumbers(pop)}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };
}

// ─── ColorLegend ─────────────────────────────────────────────────────────────

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

// ─── mergePairs (condense adjacent age rows on very small screens) ─────────────

function mergePairs(rows: ChartRow[], rowKeys: readonly string[]): ChartRow[] {
    const result: ChartRow[] = [];
    for (let i = 0; i < rows.length; i += 2) {
        const a = rows[i];
        const b = rows[i + 1];
        if (!b) {
            result.push(a);
            continue;
        }
        const merged: ChartRow = { age: a.age };
        for (const key of rowKeys) {
            const aPop = a[`${key}_pop`] ?? 0;
            const bPop = b[`${key}_pop`] ?? 0;
            const totalPop = aPop + bPop;
            const aMean = a[`${key}_mean`] ?? 0;
            const bMean = b[`${key}_mean`] ?? 0;
            const mean = totalPop > 0 ? (aMean * aPop + bMean * bPop) / totalPop : 0;
            merged[`${key}_pop`] = totalPop;
            merged[`${key}_mean`] = mean;
            merged[`${key}_bar`] = totalPop > 0 ? mean : 0;
        }
        result.push(merged);
    }
    return result;
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Props = {
    demography: UnifiedCohort[];
};

export default function WealthDistributionChart({ demography }: Props): React.ReactElement {
    const [group, setGroup] = useState<GroupMode>('occupation');
    const [activeSkills, setActiveSkills] = useState<Set<Skill>>(new Set(SKILL));
    const lastYDomainRef = useRef<[number, number]>([0, 1]);

    const isVerySmall = useIsSmallScreen();

    const eduData: ChartRow[] = [];
    const occData: ChartRow[] = [];

    for (let age = 0; age < demography.length; age++) {
        const cohort = demography[age];
        if (!cohort) {
            continue;
        }

        // ── by education ──────────────────────────────────────────────────
        const eduRow: ChartRow = { age };
        for (const edu of educationLevelKeys) {
            let totalPop = 0;
            let weightedWealth = 0;
            for (const occ of OCCUPATIONS) {
                for (const skill of SKILL) {
                    if (!activeSkills.has(skill)) {
                        continue;
                    }
                    const cat = cohort[occ]?.[edu]?.[skill];
                    if (cat && cat.total > 0) {
                        totalPop += cat.total;
                        weightedWealth += cat.wealthMean * cat.total;
                    }
                }
            }
            const mean = totalPop > 0 ? weightedWealth : 0;
            eduRow[`${edu}_pop`] = totalPop;
            eduRow[`${edu}_mean`] = mean;
            eduRow[`${edu}_bar`] = totalPop > 0 ? mean : 0;
        }
        eduData.push(eduRow);

        // ── by occupation ─────────────────────────────────────────────────
        const occRow: ChartRow = { age };
        for (const occ of OCCUPATIONS) {
            let totalPop = 0;
            let weightedWealth = 0;
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    if (!activeSkills.has(skill)) {
                        continue;
                    }
                    const cat = cohort[occ]?.[edu]?.[skill];
                    if (cat && cat.total > 0) {
                        totalPop += cat.total;
                        weightedWealth += cat.wealthMean * cat.total;
                    }
                }
            }
            const mean = totalPop > 0 ? weightedWealth : 0;
            occRow[`${occ}_pop`] = totalPop;
            occRow[`${occ}_mean`] = mean;
            occRow[`${occ}_bar`] = totalPop > 0 ? mean : 0;
        }
        occData.push(occRow);
    }

    const keys: readonly string[] = group === 'education' ? educationLevelKeys : OCCUPATIONS;
    const labels: Record<string, string> = group === 'education' ? EDU_LABELS : OCC_LABELS;
    const colors: Record<string, string> = group === 'education' ? EDU_COLORS : OCC_COLORS;
    const rawData = group === 'education' ? eduData : occData;
    const data = isVerySmall ? mergePairs(rawData, keys) : rawData;

    const hasData = data.some((row) => keys.some((k) => (row[`${k}_bar`] ?? 0) > 0));
    if (!hasData) {
        return <div className='text-xs text-muted-foreground'>No wealth data available</div>;
    }

    // Population-weighted global mean wealth
    let totalPop = 0;
    let totalWealth = 0;
    for (const row of data) {
        for (const key of keys) {
            const pop = row[`${key}_pop`] ?? 0;
            const mean = row[`${key}_mean`] ?? 0;
            totalPop += pop;
            totalWealth += mean * pop;
        }
    }
    const globalMean = totalPop > 0 ? totalWealth / totalPop : 0;

    // Y-axis domain
    let maxY = 0;
    for (const row of data) {
        for (const key of keys) {
            const v = row[`${key}_bar`] ?? 0;
            if (v > maxY) {
                maxY = v;
            }
        }
    }
    if (hasData) {
        lastYDomainRef.current = [0, maxY > 0 ? maxY : 1];
    }
    const yDomain = lastYDomainRef.current;

    const tooltip = makeTooltip(keys, labels, colors);

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
            title='Wealth'
            primaryControls={tabs}
            secondaryControls={<SkillFilter selected={activeSkills} onChange={setActiveSkills} />}
        >
            {/* Summary stats */}
            <div className='flex gap-3 text-[10px] text-muted-foreground mb-2'>
                <span>
                    Global mean: <span className='font-medium'>{formatNumbers(globalMean)}</span>
                </span>
            </div>

            <ResponsiveContainer width='100%' minHeight={180} minWidth={290}>
                <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap='5%'>
                    <CartesianGrid strokeDasharray='3 3' stroke='#f3f4f6' />
                    <XAxis dataKey='age' tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <YAxis
                        width={48}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => formatNumbers(v)}
                        domain={yDomain}
                    />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {isVerySmall ? null : <Tooltip content={tooltip as any} />}
                    {keys.map((key) => (
                        <Bar
                            key={key}
                            dataKey={`${key}_bar`}
                            stackId='a'
                            fill={colors[key]}
                            fillOpacity={0.85}
                            name={labels[key]}
                            isAnimationActive={false}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
            <ColorLegend keys={keys} labels={labels} colors={colors} />
        </ChartCard>
    );
}
