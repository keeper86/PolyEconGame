'use client';

import React, { useMemo, useState } from 'react';
import type { FacilityCatalogEntry } from '@/simulation/planet/productionFacilities';
import { formatNumbers } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FacilityIcon } from '@/components/client/FacilityIcon';
import { ProductIcon } from '@/components/client/ProductIcon';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { calculateCostsForConstruction, getFacilityType } from '@/simulation/planet/facility';
import { ScaleSelector } from './ScaleSelector';
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
        <Card className='overflow-hidden opacity-80 hover:opacity-100 transition-opacity flex flex-col'>
            <CardHeader className='p-3 pb-2'>
                <div className='flex items-start gap-3'>
                    <FacilityIcon facilityName={facility.name} />
                    <div className='flex-1 min-w-0'>
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
                    </div>
                </div>
            </CardHeader>
            <CardContent className='px-3 pb-3 flex flex-col flex-1 gap-2'>
                <div className='space-y-2 flex-1'>
                    {facility.needs.length > 0 && (
                        <div>
                            <p className='text-xs text-muted-foreground font-medium mb-1'>Needs</p>
                            <div className='flex flex-wrap gap-1.5'>
                                {facility.needs.map(({ resource, quantity }) => (
                                    <span
                                        key={resource.name}
                                        className='inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs'
                                    >
                                        <ProductIcon productName={resource.name} />
                                        {formatNumbers(quantity)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {facility.produces.length > 0 && (
                        <div>
                            <p className='text-xs text-muted-foreground font-medium mb-1'>Produces</p>
                            <div className='flex flex-wrap gap-1.5'>
                                {facility.produces.map(({ resource, quantity }) => (
                                    <span
                                        key={resource.name}
                                        className='inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary'
                                    >
                                        <ProductIcon productName={resource.name} />
                                        {formatNumbers(quantity)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
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
                        onClick={() =>
                            buildMutation.mutate({ agentId, planetId, facilityKey: facility.name, targetScale })
                        }
                    >
                        {buildMutation.isPending ? 'Building…' : 'Build'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
