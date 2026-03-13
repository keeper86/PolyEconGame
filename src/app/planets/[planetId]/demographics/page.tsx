'use client';

import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useParams } from 'next/navigation';
import PlanetDemography from './PlanetDemography';
import { formatNumbers } from '@/lib/utils';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';
import type { Skill } from '@/simulation/population/population';
import { OCC_COLORS, OCC_LABELS } from '../../components/CohortFilter';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import WealthDistributionChart from './WealthDistributionChart';
import DemographyFoodCharts from './DemographyFoodCharts';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GroupMode } from './demographicsTypes';

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

    // keepPreviousData (set in useSimulationQuery) keeps the last snapshot
    // visible while a new fetch is in-flight — no extra pending/committed
    // state needed.
    const { data } = useSimulationQuery(
        trpc.simulation.getPlanetDemographicsFull.queryOptions({
            planetId,
            groupMode: group,
            activeSkills: [...activeSkills],
        }),
    );

    // Open population section by default
    const [openSection, setOpenSection] = useState<string>('population');

    if (!data?.data) {
        return <div className='text-sm text-muted-foreground'>Loading demographics…</div>;
    }

    const { rows } = data.data;

    // Labor summary (age > 14) — always from committed data via `rows`
    const laborCounts = [0, 0, 0, 0];
    let laborTotal = 0;
    for (const row of rows) {
        if (row.age <= 14) {
            continue;
        }
        for (let i = 0; i < 4; i++) {
            laborCounts[i] += row.occ[i];
            laborTotal += row.occ[i];
        }
    }

    // Per-occupation mean age (working population, age > 14)
    const occMeanAge = OCCUPATIONS.map((_, i) => {
        let wSum = 0;
        let count = 0;
        for (const row of rows) {
            if (row.age <= 14) {
                continue;
            }
            wSum += row.age * row.occ[i];
            count += row.occ[i];
        }
        return count > 0 ? wSum / count : 0;
    });

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
            {OCCUPATIONS.map((occ, i) => (
                <div
                    key={occ}
                    className='flex-1 px-1.5 py-1 border rounded text-xs'
                    style={{ borderLeftColor: OCC_COLORS[occ], borderLeftWidth: 3 }}
                >
                    <div className='text-muted-foreground text-[9px] leading-tight truncate'>{OCC_LABELS[occ]}</div>
                    <div className='font-semibold text-[11px] leading-tight'>{formatNumbers(laborCounts[i])}</div>
                    <div className='text-[9px] text-muted-foreground leading-tight'>
                        {laborTotal > 0 ? ((laborCounts[i] / laborTotal) * 100).toFixed(1) + '%' : '0%'}
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <div className='flex gap-2 mb-3'>
            {OCCUPATIONS.map((occ, i) => (
                <Card
                    key={occ}
                    className='flex-1 overflow-hidden'
                    style={{ borderLeftColor: OCC_COLORS[occ], borderLeftWidth: 3 }}
                >
                    <CardContent className='px-3 py-2.5 space-y-0.5'>
                        <p className='text-[11px] text-muted-foreground font-medium'>{OCC_LABELS[occ]}</p>
                        <p className='text-lg font-semibold leading-tight'>{formatNumbers(laborCounts[i])}</p>
                        <p className='text-xs text-muted-foreground'>
                            {laborTotal > 0 ? ((laborCounts[i] / laborTotal) * 100).toFixed(1) + '%' : '0%'}
                        </p>
                        <p className='text-[11px] text-muted-foreground pt-1'>
                            Ø age <span className='font-medium text-foreground'>{occMeanAge[i].toFixed(1)}</span>
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );

    return (
        <>
            {/* ── Hoisted controls (shared across all sections) ──────────── */}
            <div className='flex flex-wrap items-center gap-2 mb-3'>
                {groupTabs}
                {skillFilter}
            </div>

            <Accordion
                type='single'
                collapsible={false}
                value={openSection}
                onValueChange={(v) => {
                    if (v) {
                        setOpenSection(v);
                    }
                }}
                className='w-full'
            >
                {/* ── Population ─────────────────────────────────────────── */}
                <AccordionItem value='population'>
                    <AccordionTrigger className='text-sm font-semibold py-2'>Population</AccordionTrigger>
                    <AccordionContent>
                        {occupationCards}
                        <PlanetDemography rows={rows} group={group} />
                    </AccordionContent>
                </AccordionItem>

                {/* ── Wealth ─────────────────────────────────────────────── */}
                <AccordionItem value='wealth'>
                    <AccordionTrigger className='text-sm font-semibold py-2'>Wealth</AccordionTrigger>
                    <AccordionContent>
                        {openSection === 'wealth' && <WealthDistributionChart rows={rows} groupMode={group} />}
                    </AccordionContent>
                </AccordionItem>

                {/* ── Food & Nutrition ───────────────────────────────────── */}
                <AccordionItem value='food' className='border-b-0'>
                    <AccordionTrigger className='text-sm font-semibold py-2'>Food &amp; Nutrition</AccordionTrigger>
                    <AccordionContent>
                        {openSection === 'food' && <DemographyFoodCharts rows={rows} groupMode={group} />}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </>
    );
}
