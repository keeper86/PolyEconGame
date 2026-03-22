'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import type { Skill } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';
import { educationLevelKeys } from '@/simulation/population/education';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from '../../_components/CohortFilter';
import type { GroupMode } from './demographicsTypes';
import { GV_POP, GV_WEALTH } from './demographicsTypes';
import FoodBufferChart from './FoodBufferChart';
import NutritionHeatmapChart from './NutritionHeatmapChart';
import PlanetDemography from './PlanetDemography';
import PlanetPopulationHistoryChart from './PlanetPopulationHistoryChart';
import WealthDistributionChart from './WealthDistributionChart';

// ─── Skill selector constants ────────────────────────────────────────────────

const SKILL_LABELS: Record<Skill, string> = { novice: 'Novice', professional: 'Pro', expert: 'Expert' };
const SKILL_COLORS: Record<Skill, string> = {
    novice: '#94a3b8',
    professional: '#60a5fa',
    expert: '#f59e0b',
};

export default function PlanetDemographicsPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const isSmallScreen = useIsSmallScreen();

    // ── Controls ─────────────────────────────────────────────────────────────
    const [group, setGroup] = useState<GroupMode>('occupation');
    const [activeSkills, setActiveSkills] = useState<Set<Skill>>(new Set(SKILL));

    const toggleSkill = (skill: Skill) => {
        setActiveSkills((prev) => {
            const next = new Set(prev);
            if (next.has(skill)) {
                if (next.size > 1) {
                    next.delete(skill);
                }
            } else {
                next.add(skill);
            }
            return next;
        });
    };

    const { data } = useSimulationQuery(
        trpc.simulation.getPlanetDemographicsFull.queryOptions({
            planetId,
            groupMode: group,
            activeSkills: [...activeSkills],
        }),
    );

    if (!data) {
        return <div className='text-sm text-muted-foreground'>Loading demographics…</div>;
    }
    if (data.data === null) {
        return <div className='text-sm text-muted-foreground'>Planet not found.</div>;
    }

    const { rows } = data.data;

    // Per-group wealth: summed across all ages from groupValues
    // groupValues[i] = [pop, foodStock, weightedStarvation, weightedWealth]
    const groupKeys = group === 'occupation' ? OCCUPATIONS : educationLevelKeys;
    const groupColors: Record<string, string> = group === 'occupation' ? OCC_COLORS : EDU_COLORS;
    const groupLabels: Record<string, string> = group === 'occupation' ? OCC_LABELS : EDU_LABELS;

    // Group-aware population counts and mean age — derived from groupValues so
    // they reflect the active groupMode (occupation or education) and skill filter.
    const groupPop = [0, 0, 0, 0];
    const groupAgeWeightedSum = [0, 0, 0, 0];
    const wealthWeightedSum = [0, 0, 0, 0];
    for (const row of rows) {
        for (let i = 0; i < 4; i++) {
            const gv = row.groupValues[i];
            groupPop[i] += gv[GV_POP];

            groupAgeWeightedSum[i] += row.age * gv[GV_POP];

            wealthWeightedSum[i] += gv[GV_WEALTH];
        }
    }
    const populationTotal = groupPop.reduce((s, v) => s + v, 0);
    const groupMeanAge = groupPop.map((pop, i) => (pop > 0 ? groupAgeWeightedSum[i] / pop : 0));
    const totalWealth = wealthWeightedSum.reduce((s, v) => s + v, 0);
    const wealthMean = groupPop.map((pop, i) => (pop > 0 ? wealthWeightedSum[i] / pop : 0));
    const wealthShare = wealthWeightedSum.map((w) => (totalWealth > 0 ? (w / totalWealth) * 100 : 0));

    // ── Shared controls ──────────────────────────────────────────────────────
    const allSkillsSelected = SKILL.every((s) => activeSkills.has(s));

    const groupTabs = (
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

    const skillFilter = (
        <div className='flex items-center gap-1'>
            <button
                className='h-6 px-1.5 rounded text-[10px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted/80'
                disabled={allSkillsSelected}
                onClick={() => setActiveSkills(new Set(SKILL))}
            >
                All
            </button>
            {SKILL.map((skill) => {
                const active = activeSkills.has(skill);
                return (
                    <button
                        key={skill}
                        onClick={() => toggleSkill(skill)}
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

    // ── Occupation summary cards ─────────────────────────────────────────────
    const occupationCards = isSmallScreen ? (
        <div className='flex gap-1 mb-2'>
            {groupKeys.map((key, i) => (
                <div
                    key={key}
                    className='flex-1 px-1.5 py-1 border rounded text-xs'
                    style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                >
                    <div className='text-muted-foreground text-[9px] leading-tight truncate'>{groupLabels[key]}</div>
                    <div className='font-semibold text-[11px] leading-tight'>{formatNumbers(groupPop[i])}</div>
                    <div className='text-[9px] text-muted-foreground leading-tight'>
                        {populationTotal > 0 ? ((groupPop[i] / populationTotal) * 100).toFixed(1) + '%' : '0%'}
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <div className='flex gap-2 mb-3'>
            {groupKeys.map((key, i) => (
                <Card
                    key={key}
                    className='flex-1 overflow-hidden'
                    style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                >
                    <CardContent className='px-3 py-2.5 space-y-0.5'>
                        <p className='text-[11px] text-muted-foreground font-medium'>{groupLabels[key]}</p>
                        <p className='text-lg font-semibold leading-tight'>{formatNumbers(groupPop[i])}</p>
                        <p className='text-xs text-muted-foreground'>
                            {populationTotal > 0 ? ((groupPop[i] / populationTotal) * 100).toFixed(1) + '%' : '0%'}
                        </p>
                        <p className='text-[11px] text-muted-foreground pt-1'>
                            Ø age <span className='font-medium text-foreground'>{groupMeanAge[i].toFixed(1)}</span>
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );

    // ── Wealth summary cards ─────────────────────────────────────────────
    const wealthCards = isSmallScreen ? (
        <div className='flex gap-1 mb-2'>
            {groupKeys.map((key, i) => (
                <div
                    key={key}
                    className='flex-1 px-1.5 py-1 border rounded text-xs'
                    style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                >
                    <div className='text-muted-foreground text-[9px] leading-tight truncate'>{groupLabels[key]}</div>
                    <div className='font-semibold text-[11px] leading-tight'>{formatNumbers(wealthMean[i])}</div>
                    <div className='text-[9px] text-muted-foreground leading-tight'>
                        {wealthShare[i].toFixed(1)}% of wealth
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <div className='flex gap-2 mb-3'>
            {groupKeys.map((key, i) => (
                <Card
                    key={key}
                    className='flex-1 overflow-hidden'
                    style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                >
                    <CardContent className='px-3 py-2.5 space-y-0.5'>
                        <p className='text-[11px] text-muted-foreground font-medium'>{groupLabels[key]}</p>
                        <p className='text-lg font-semibold leading-tight'>{formatNumbers(wealthMean[i])}</p>
                        <p className='text-xs text-muted-foreground'>Ø wealth / person</p>
                        <p className='text-[11px] text-muted-foreground pt-1'>
                            Wealth share{' '}
                            <span className='font-medium text-foreground'>{wealthShare[i].toFixed(1)}%</span>
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );

    return (
        <>
            <span className='flex justify-between mb-2'>
                <h4 className='text-sm font-semibold '>Population History</h4>
                <span className='text-sm text-muted-foreground'>{`Total population: ${formatNumbers(populationTotal)}`}</span>
            </span>

            <PlanetPopulationHistoryChart planetId={planetId} />

            <div className='my-3 border-t' />

            <h4 className='text-sm font-semibold mb-2'>Detailed Demographics</h4>

            {/* ── Hoisted controls (shared across all sections) ──────────── */}
            <div className='flex flex-wrap items-center gap-2 mb-3'>
                {groupTabs}
                {skillFilter}
            </div>

            {/* ── Population ─────────────────────────────────────────── */}

            <div className='my-3 border-t' />
            <h4 className='text-sm font-semibold mb-2' id='population'>
                Overview
            </h4>
            {occupationCards}
            <PlanetDemography rows={rows} group={group} />

            <div className='my-3 border-t' />

            <span className='flex justify-between mb-2'>
                <h4 className='text-sm font-semibold' id='wealth'>
                    Wealth distribution
                </h4>
                <span className='text-xs text-muted-foreground'>{`Total (per capita): ${formatNumbers(totalWealth)} (${formatNumbers(totalWealth / populationTotal)})`}</span>
            </span>
            {wealthCards}
            <WealthDistributionChart rows={rows} groupMode={group} />

            <div className='my-3 border-t' />

            <NutritionHeatmapChart rows={rows} groupMode={group} />
            <FoodBufferChart rows={rows} groupMode={group} />
        </>
    );
}
