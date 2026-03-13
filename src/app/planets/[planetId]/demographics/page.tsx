'use client';

import { useTRPC } from '@/lib/trpc';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useParams } from 'next/navigation';
import PlanetDemography from './PlanetDemography';
import { formatNumbers } from '@/lib/utils';
import { OCCUPATIONS } from '@/simulation/population/population';
import { OCC_COLORS, OCC_LABELS } from '../../components/CohortFilter';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import NutritionHeatmapChart from './NutritionHeatmapChart';
import FoodBufferChart from './FoodBufferChart';
import WealthDistributionChart from './WealthDistributionChart';
import { useState } from 'react';

export default function PlanetDemographicsPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const isSmallScreen = useIsSmallScreen();

    // Single unified query replaces the three separate calls
    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getPlanetDemographicsFull.queryOptions({ planetId }),
    );

    // Open population section by default
    const [openSection, setOpenSection] = useState<string>('population');

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading demographics…</div>;
    }

    if (!data?.data) {
        return <div className='text-sm text-muted-foreground'>Planet not found.</div>;
    }

    const { rows, demography } = data.data;

    // Labor summary (age > 14)
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
            {/* ── Population ─────────────────────────────────────────────── */}
            <AccordionItem value='population'>
                <AccordionTrigger className='text-sm font-semibold py-2'>Population</AccordionTrigger>
                <AccordionContent>
                    {occupationCards}
                    <PlanetDemography rows={rows} />
                </AccordionContent>
            </AccordionItem>

            {/* ── Wealth ─────────────────────────────────────────────────── */}
            <AccordionItem value='wealth'>
                <AccordionTrigger className='text-sm font-semibold py-2'>Wealth</AccordionTrigger>
                <AccordionContent>
                    {openSection === 'wealth' && <WealthDistributionChart demography={demography} />}
                </AccordionContent>
            </AccordionItem>

            {/* ── Food & Nutrition ───────────────────────────────────────── */}
            <AccordionItem value='food' className='border-b-0'>
                <AccordionTrigger className='text-sm font-semibold py-2'>Food & Nutrition</AccordionTrigger>
                <AccordionContent>
                    {openSection === 'food' && (
                        <span className={'flex gap-2 flex-col'}>
                            <FoodBufferChart demography={demography} />
                            <NutritionHeatmapChart demography={demography} />
                        </span>
                    )}
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
