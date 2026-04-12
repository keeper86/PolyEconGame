'use client';

import React, { useMemo, useState } from 'react';
import type { FacilityCatalogEntry } from '@/simulation/planet/productionFacilities';
import { formatNumbers } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FacilityCardShell } from './FacilityCardShell';
import { Separator } from '@/components/ui/separator';
import { FacilityIcon } from '@/components/client/FacilityIcon';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { calculateCostsForConstruction, getFacilityType } from '@/simulation/planet/facility';
import { ScaleSelector } from './ScaleSelector';
import { FacilityIORow } from './FacilityIORow';
import { Zap, Users } from 'lucide-react';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

export function CatalogCard({
    entry,
    agentId,
    planetId,
    constructionServicePrice,
    onBuilt,
}: {
    entry: FacilityCatalogEntry;
    agentId: string;
    planetId: string;
    constructionServicePrice?: number;
    onBuilt: () => void;
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
            className='max-w-[600px] opacity-80 hover:opacity-100 transition-opacity'
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
                <Button
                    size='sm'
                    variant='outline'
                    className='w-full text-xs'
                    disabled={buildMutation.isPending}
                    onClick={() => buildMutation.mutate({ agentId, planetId, facilityKey: facility.name, targetScale })}
                >
                    {buildMutation.isPending ? 'Building…' : 'Build'}
                </Button>
            </div>
        </FacilityCardShell>
    );
}
