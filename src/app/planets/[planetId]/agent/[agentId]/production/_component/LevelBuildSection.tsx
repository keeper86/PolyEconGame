'use client';

import React, { useMemo, useState } from 'react';
import type { FacilityCatalogEntry } from '@/simulation/planet/productionFacilities';
import { formatNumbers } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FacilityCardShell } from './FacilityCardShell';
import { Separator } from '@/components/ui/separator';
import { FacilityIcon } from '@/components/client/FacilityIcon';
import { FacilityIORow } from './FacilityIORow';
import { ScaleSelector } from './ScaleSelector';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { calculateCostsForConstruction, getFacilityType } from '@/simulation/planet/facility';
import { PlusCircle, Zap, Users } from 'lucide-react';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

type Mode = { type: 'idle' } | { type: 'selecting' } | { type: 'ready'; entry: FacilityCatalogEntry };

function MiniCard({ entry, onChoose }: { entry: FacilityCatalogEntry; onChoose: () => void }): React.ReactElement {
    const facility = useMemo(() => entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID), [entry]);
    const totalWorkers = Object.values(facility.workerRequirement).reduce((s, v) => s + (v ?? 0), 0);

    return (
        <FacilityCardShell
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityIcon facilityName={facility.name} />}
            headerContent={
                <>
                    <h3 className='font-semibold text-sm leading-tight'>{facility.name}</h3>
                    <div className='flex items-center gap-3 mt-1 text-xs text-muted-foreground'>
                        {totalWorkers > 0 && (
                            <span className='flex items-center gap-1'>
                                <Users className='h-3 w-3' />
                                {formatNumbers(totalWorkers)} / scale
                            </span>
                        )}
                        {facility.powerConsumptionPerTick !== 0 && (
                            <span className='flex items-center gap-1'>
                                <Zap className='h-3 w-3' />
                                {facility.powerConsumptionPerTick > 0
                                    ? `${facility.powerConsumptionPerTick} MW`
                                    : 'produces power'}
                            </span>
                        )}
                    </div>
                </>
            }
        >
            <div className='flex-1'>
                <FacilityIORow needs={facility.needs} produces={facility.produces} scale={1} />
            </div>
            <div className='mt-auto space-y-2'>
                <Separator />
                <Button size='sm' variant='outline' className='w-full text-xs' onClick={onChoose}>
                    Choose
                </Button>
            </div>
        </FacilityCardShell>
    );
}

function BuildCard({
    entry,
    agentId,
    planetId,
    constructionServicePrice,
    onBuilt,
    onCancel,
}: {
    entry: FacilityCatalogEntry;
    agentId: string;
    planetId: string;
    constructionServicePrice: number | undefined;
    onBuilt: () => void;
    onCancel: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const facility = useMemo(() => entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID), [entry]);
    const facilityType = useMemo(() => getFacilityType(facility), [facility]);
    const [targetScale, setTargetScale] = useState(1);

    const buildCost = useMemo(
        () => calculateCostsForConstruction(facilityType, 0, targetScale),
        [facilityType, targetScale],
    );
    const estimatedCredits =
        constructionServicePrice && constructionServicePrice > 0 ? buildCost * constructionServicePrice : null;

    const totalWorkers = Object.values(facility.workerRequirement).reduce((s, v) => s + (v ?? 0), 0);

    const buildMutation = useMutation(
        trpc.buildFacility.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
                });
                onBuilt();
            },
        }),
    );

    return (
        <FacilityCardShell
            className='max-w-[600px]'
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityIcon facilityName={facility.name} />}
            headerContent={
                <>
                    <h3 className='font-semibold text-sm leading-tight'>{facility.name}</h3>
                    <div className='flex items-center gap-3 mt-1 text-xs text-muted-foreground'>
                        {totalWorkers > 0 && (
                            <span className='flex items-center gap-1'>
                                <Users className='h-3 w-3' />
                                {formatNumbers(totalWorkers)} / scale
                            </span>
                        )}
                        {facility.powerConsumptionPerTick !== 0 && (
                            <span className='flex items-center gap-1'>
                                <Zap className='h-3 w-3' />
                                {facility.powerConsumptionPerTick > 0
                                    ? `${facility.powerConsumptionPerTick} MW`
                                    : 'produces power'}
                            </span>
                        )}
                    </div>
                </>
            }
        >
            <div className='flex-1'>
                <FacilityIORow needs={facility.needs} produces={facility.produces} scale={targetScale} />
            </div>
            <div className='mt-auto space-y-2'>
                <Separator />
                <div className='flex items-center justify-between'>
                    <p className='text-xs font-medium'>Target scale</p>
                </div>
                <ScaleSelector value={targetScale} min={1} onChange={setTargetScale} />
                <p className='text-xs text-muted-foreground'>
                    Construction cost:{' '}
                    <span className='tabular-nums font-medium text-foreground'>{formatNumbers(buildCost)}</span>{' '}
                    construction services
                    {estimatedCredits !== null && (
                        <>
                            {' '}
                            <span className='text-muted-foreground'>≈</span>{' '}
                            <span className='tabular-nums font-medium text-foreground'>
                                {formatNumbers(estimatedCredits)}
                            </span>{' '}
                            credits
                        </>
                    )}
                </p>
                <div className='flex gap-2'>
                    <Button
                        size='sm'
                        variant='outline'
                        className='flex-1 text-xs'
                        disabled={buildMutation.isPending}
                        onClick={() =>
                            buildMutation.mutate({ agentId, planetId, facilityKey: facility.name, targetScale })
                        }
                    >
                        {buildMutation.isPending ? 'Building…' : 'Build'}
                    </Button>
                    <Button
                        size='sm'
                        variant='ghost'
                        className='flex-1 text-xs'
                        disabled={buildMutation.isPending}
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        </FacilityCardShell>
    );
}

export function LevelBuildSection({
    entries,
    agentId,
    planetId,
    constructionServicePrice,
    onBuilt,
}: {
    entries: FacilityCatalogEntry[];
    agentId: string;
    planetId: string;
    constructionServicePrice: number | undefined;
    onBuilt: () => void;
}): React.ReactElement {
    const [mode, setMode] = useState<Mode>({ type: 'idle' });

    if (mode.type === 'idle') {
        return (
            <Card
                className='min-w-[300px] flex items-center justify-center cursor-pointer border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors'
                style={{ minHeight: '160px' }}
                onClick={() => setMode({ type: 'selecting' })}
            >
                <CardContent className='flex flex-col items-center gap-2 p-6'>
                    <PlusCircle className='h-8 w-8' />
                    <span className='text-xs font-medium'>Build facility</span>
                </CardContent>
            </Card>
        );
    }

    if (mode.type === 'selecting') {
        return (
            <>
                {entries.map((entry) => {
                    const name = entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name;
                    return <MiniCard key={name} entry={entry} onChoose={() => setMode({ type: 'ready', entry })} />;
                })}
                <div className='self-start mt-1'>
                    <Button variant='ghost' size='sm' className='text-xs' onClick={() => setMode({ type: 'idle' })}>
                        Cancel
                    </Button>
                </div>
            </>
        );
    }

    return (
        <BuildCard
            entry={mode.entry}
            agentId={agentId}
            planetId={planetId}
            constructionServicePrice={constructionServicePrice}
            onBuilt={() => {
                setMode({ type: 'idle' });
                onBuilt();
            }}
            onCancel={() => setMode({ type: 'idle' })}
        />
    );
}
