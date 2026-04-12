'use client';

import { FacilityIcon } from '@/components/client/FacilityIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { calculateCostsForConstruction, getFacilityType } from '@/simulation/planet/facility';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import type { ProductionFacility } from '../../../../../../../simulation/planet/facility';
import { FacilityProductionIORow } from './FacilityProductionIORow';
import { ScaleSelector } from './ScaleSelector';
import { WorkerBars } from './WorkerBars';

export function ActiveFacilityCard({
    facility,
    agentId,
    planetId,
    constructionServicePrice,
    onExpanded,
}: {
    facility: ProductionFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice?: number;
    onExpanded: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [targetScale, setTargetScale] = useState(facility.maxScale + 1);
    const [showExpand, setShowExpand] = useState(false);

    const expandMutation = useMutation(
        trpc.expandFacility.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey({ agentId, planetId }),
                });
                setShowExpand(false);
                onExpanded();
            },
        }),
    );

    const facilityType = useMemo(() => getFacilityType(facility), [facility]);
    const expandCost = useMemo(
        () => calculateCostsForConstruction(facilityType, facility.maxScale, targetScale),
        [facilityType, facility.maxScale, targetScale],
    );
    const estimatedCredits =
        constructionServicePrice && constructionServicePrice > 0 ? expandCost * constructionServicePrice : null;

    const results = facility.lastTickResults;
    const eff = results?.overallEfficiency ?? 0;

    const globalMin = results
        ? Math.min(
              ...Object.values(results.resourceEfficiency),
              ...Object.values(results.workerEfficiency).filter((v): v is number => v !== undefined),
          )
        : 1;

    return (
        <Card className='overflow-hidden flex flex-col min-w-[300px] sm:w-[500px]'>
            <CardHeader className='p-3 pb-2'>
                <div className='flex items-start gap-3 flex-wrap'>
                    <FacilityIcon facilityName={facility.name} />
                    <div className='flex-1 min-w-[150px]'>
                        <div className='flex items-center gap-1 flex-col mb-2'>
                            <h3 className='font-semibold leading-tight '>{facility.name}</h3>
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                Scale {facility.maxScale}
                            </Badge>
                        </div>

                        <WorkerBars
                            workerRequirement={facility.workerRequirement}
                            scale={facility.scale}
                            workerEfficiency={results?.workerEfficiency ?? {}}
                            globalMin={globalMin}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className='px-3 pb-3 flex flex-col flex-1 gap-2'>
                <div className='flex-1 space-y-2'>
                    <FacilityProductionIORow
                        needs={facility.needs}
                        produces={facility.produces}
                        scale={!showExpand ? facility.scale : targetScale}
                        resourceEfficiency={results?.resourceEfficiency ?? {}}
                        overallEfficiency={eff}
                        limitingEfficiency={globalMin}
                    />
                </div>

                <div className='mt-auto space-y-2'>
                    <Separator />

                    {showExpand ? (
                        <>
                            <p className='text-xs font-medium'>Expand to scale</p>
                            <ScaleSelector
                                value={targetScale}
                                min={facility.maxScale + 1}
                                onChange={(v) => setTargetScale(v)}
                            />
                            <p className='text-xs text-muted-foreground'>
                                Construction cost:{' '}
                                <span className='tabular-nums font-medium text-foreground'>
                                    {formatNumbers(expandCost)}
                                </span>{' '}
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
                                    onClick={() => setShowExpand(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size='sm'
                                    className='flex-1 text-xs'
                                    disabled={expandMutation.isPending}
                                    onClick={() =>
                                        expandMutation.mutate({
                                            agentId,
                                            planetId,
                                            facilityId: facility.id,
                                            targetScale,
                                        })
                                    }
                                >
                                    {expandMutation.isPending ? 'Expanding…' : 'Confirm Expand'}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <Button
                            variant='outline'
                            size='sm'
                            className='w-full text-xs gap-1'
                            onClick={() => {
                                setTargetScale(facility.maxScale + 1);
                                setShowExpand(true);
                            }}
                        >
                            Expand facility
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
