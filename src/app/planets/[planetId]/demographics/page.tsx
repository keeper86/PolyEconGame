'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsSmallScreen } from '@/hooks/useMobile';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { educationLevelKeys } from '@/simulation/population/education';
import { OCCUPATIONS } from '@/simulation/population/population';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { EDU_COLORS, EDU_LABELS, OCC_COLORS, OCC_LABELS } from './_components/CohortFilter';
import type { GroupMode } from './_components/demographicsTypes';
import { GV_POP, GV_WEALTH } from './_components/demographicsTypes';
import ServiceSection from './_components/ServiceSection';

import { Page } from '@/components/client/Page';
import { ProductIcon } from '@/components/client/ProductIcon';
import { useHashAccordion } from '@/hooks/useHashAccordion';
import { getCurrencyResourceName } from '@/simulation/market/currencyResources';
import PlanetDemography from './_components/PlanetDemography';
import PlanetPopulationHistoryChart from './_components/PlanetPopulationHistoryChart';
import TransferChart from './_components/TransferChart';
import WealthDistributionChart from './_components/WealthDistributionChart';

export default function PlanetDemographicsPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const isSmallScreen = useIsSmallScreen();

    const [group, setGroup] = useState<GroupMode>('occupation');

    const { openItem: accordionItem, onValueChange: handleAccordionChange } = useHashAccordion();

    const { data } = useSimulationQuery(
        trpc.simulation.getPlanetDemographicsFull.queryOptions({
            planetId,
            groupMode: group,
            activeSkills: ['novice', 'professional', 'expert'],
        }),
    );

    const planetName = data?.data?.planetName ?? planetId;

    if (!data) {
        return <div className='text-sm text-muted-foreground'>Loading demographics…</div>;
    }
    if (data.data === null) {
        return <div className='text-sm text-muted-foreground'>Planet not found.</div>;
    }

    const { rows } = data.data;

    const groupKeys = group === 'occupation' ? OCCUPATIONS : educationLevelKeys;
    const groupColors: Record<string, string> = group === 'occupation' ? OCC_COLORS : EDU_COLORS;
    const groupLabels: Record<string, string> = group === 'occupation' ? OCC_LABELS : EDU_LABELS;

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

    const transferMatrix = data.data.lastTransferMatrix ?? [];
    const transferTotals = [0, 0, 0, 0];
    if (group === 'occupation') {
        for (const cohort of transferMatrix) {
            for (let i = 0; i < OCCUPATIONS.length; i++) {
                const occ = OCCUPATIONS[i];
                for (const edu of educationLevelKeys) {
                    transferTotals[i] += cohort?.[edu]?.[occ] ?? 0;
                }
            }
        }
    } else {
        for (const cohort of transferMatrix) {
            for (let i = 0; i < educationLevelKeys.length; i++) {
                const edu = educationLevelKeys[i];
                for (const occ of OCCUPATIONS) {
                    transferTotals[i] += cohort?.[edu]?.[occ] ?? 0;
                }
            }
        }
    }
    const totalAbsoluteTransfer = transferTotals.reduce((s, v) => s + Math.abs(v), 0);

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

    const occupationCards = isSmallScreen ? (
        <div className='flex gap-1 mb-2'>
            {groupKeys.map((key, i) => (
                <div
                    key={key}
                    className='flex-1 px-1.5 py-1 border rounded text-xs'
                    style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                >
                    <div className='text-muted-foreground text-[9px] leading-tight truncate'>{groupLabels[key]}</div>
                    <div className='font-semibold text-[11px] leading-tight'>
                        {formatNumberWithUnit(groupPop[i], 'persons')}
                    </div>
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
                        <p className='text-lg font-semibold leading-tight'>
                            {formatNumberWithUnit(groupPop[i], 'persons')}
                        </p>
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

    const wealthCards = isSmallScreen ? (
        <div className='flex gap-1 mb-2'>
            {groupKeys.map((key, i) => (
                <div
                    key={key}
                    className='flex-1 px-1.5 py-1 border rounded text-xs'
                    style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                >
                    <div className='text-muted-foreground text-[9px] leading-tight truncate'>{groupLabels[key]}</div>
                    <div className='font-semibold text-[11px] leading-tight'>
                        {formatNumberWithUnit(wealthMean[i], 'currency', planetId)}
                    </div>
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
                        <p className='text-lg font-semibold leading-tight'>
                            {formatNumberWithUnit(wealthMean[i], 'currency', planetId)}
                        </p>
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

    const transferCards = isSmallScreen ? (
        <div className='flex gap-1 mb-2'>
            {groupKeys.map((key, i) => {
                const t = transferTotals[i];
                const sign = t > 0 ? '+' : '';
                const valueColor = t > 0 ? 'text-green-600' : t < 0 ? 'text-red-500' : 'text-muted-foreground';
                return (
                    <div
                        key={key}
                        className='flex-1 px-1.5 py-1 border rounded text-xs'
                        style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                    >
                        <div className='text-muted-foreground text-[9px] leading-tight truncate'>
                            {groupLabels[key]}
                        </div>
                        <div className={`font-semibold text-[11px] leading-tight tabular-nums ${valueColor}`}>
                            {sign}
                            {formatNumberWithUnit(t, 'currency', planetId)}
                        </div>
                        <div className='text-[9px] text-muted-foreground leading-tight'>
                            {totalAbsoluteTransfer > 0
                                ? ((Math.abs(t) / totalAbsoluteTransfer) * 100).toFixed(1)
                                : '0.0'}
                            % of movement
                        </div>
                    </div>
                );
            })}
        </div>
    ) : (
        <div className='flex gap-2 mb-3'>
            {groupKeys.map((key, i) => {
                const t = transferTotals[i];
                const sign = t > 0 ? '+' : '';
                const valueColor = t > 0 ? 'text-green-600' : t < 0 ? 'text-red-500' : 'text-muted-foreground';
                const label = t > 0 ? 'net wealth gain' : t < 0 ? 'net wealth loss' : 'no net transfer';
                return (
                    <Card
                        key={key}
                        className='flex-1 overflow-hidden'
                        style={{ borderLeftColor: groupColors[key], borderLeftWidth: 3 }}
                    >
                        <CardContent className='px-3 py-2.5 space-y-0.5'>
                            <p className='text-[11px] text-muted-foreground font-medium'>{groupLabels[key]}</p>
                            <p className={`text-lg font-semibold leading-tight tabular-nums ${valueColor}`}>
                                {sign}
                                {formatNumberWithUnit(t, 'currency', planetId)}
                            </p>
                            <p className='text-xs text-muted-foreground'>{label}</p>
                            <p className='text-[11px] text-muted-foreground pt-1'>
                                Share of movement{' '}
                                <span className='font-medium text-foreground'>
                                    {totalAbsoluteTransfer > 0
                                        ? ((Math.abs(t) / totalAbsoluteTransfer) * 100).toFixed(1)
                                        : '0.0'}
                                    %
                                </span>
                            </p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );

    return (
        <Page title={planetName}>
            <PlanetPopulationHistoryChart planetId={planetId} live={{ tick: data.tick, population: populationTotal }} />

            <div className='flex justify-between gap-1 my-3 pt-3 items-center'>
                <span className='text-md text-slate-400'>Detailed Demographics</span>
                {groupTabs}
            </div>

            <Accordion type='single' collapsible value={accordionItem} onValueChange={handleAccordionChange}>
                <AccordionItem value='overview' id='overview'>
                    <AccordionTrigger>
                        <span className='font-semibold flex items-center gap-3'>
                            <ProductIcon productName='demography_overview' size={36} />
                            Overview
                        </span>
                    </AccordionTrigger>
                    <AccordionContent>
                        {occupationCards}
                        <PlanetDemography rows={rows} group={group} />
                    </AccordionContent>
                </AccordionItem>

                <AccordionItem value='wealth' id='wealth'>
                    <AccordionTrigger>
                        <span className='font-semibold flex items-center gap-3'>
                            <ProductIcon productName={getCurrencyResourceName(planetId)} size={36} />
                            Wealth distribution
                        </span>
                    </AccordionTrigger>
                    <AccordionContent>
                        {wealthCards}
                        <WealthDistributionChart rows={rows} groupMode={group} />
                        <p className='py-4 text-sm font-medium'>Population Wealth Transfers</p>
                        {transferCards}
                        <TransferChart matrix={data.data.lastTransferMatrix} viewMode={group} />
                    </AccordionContent>
                </AccordionItem>

                {(
                    [
                        'grocery',
                        'healthcare',
                        'logistics',
                        'retail',
                        'construction',
                        'maintenance',
                        'education',
                    ] as const
                ).map((key) => (
                    <ServiceSection
                        key={key}
                        serviceKey={key}
                        rows={rows}
                        groupMode={group}
                        groupKeys={groupKeys}
                        groupColors={groupColors}
                        groupLabels={groupLabels}
                    />
                ))}
            </Accordion>
        </Page>
    );
}
