'use client';

import React, { useMemo, useState } from 'react';
import type { ProductionFacility } from '../../../../../../../simulation/planet/facility';
import { formatNumbers } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FacilityIcon } from '@/components/client/FacilityIcon';
import { ProductIcon } from '@/components/client/ProductIcon';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { calculateCostsForConstruction, getFacilityType } from '@/simulation/planet/facility';
import { EfficiencyDetails, efficiencyColor, pctStr } from './EfficiencyDetails';
import { ScaleSelector } from './ScaleSelector';
import { Zap, Users } from 'lucide-react';

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

    const totalWorkers = Object.entries(facility.workerRequirement)
        .filter(([, v]) => v && v > 0)
        .reduce((sum, [, v]) => sum + (v ?? 0) * facility.scale, 0);

    const eff = facility.lastTickResults?.overallEfficiency ?? 0;

    return (
        <Card className='overflow-hidden flex flex-col'>
            <CardHeader className='p-3 pb-2'>
                <div className='flex items-start gap-3'>
                    <FacilityIcon facilityName={facility.name} />
                    <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2 flex-wrap'>
                            <h3 className='font-semibold text-sm leading-tight'>{facility.name}</h3>
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                Scale {facility.maxScale}
                            </Badge>
                            <Badge variant='secondary' className={`text-[10px] px-1.5 py-0 ${efficiencyColor(eff)}`}>
                                {pctStr(eff)} eff.
                            </Badge>
                        </div>
                        <div className='flex items-center gap-3 mt-1 text-xs text-muted-foreground'>
                            {totalWorkers > 0 && (
                                <span className='flex items-center gap-1'>
                                    <Users className='h-3 w-3' />
                                    {formatNumbers(totalWorkers)}
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
                                        {formatNumbers(quantity * facility.scale)}
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
                                        {formatNumbers(quantity * facility.scale)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {facility.lastTickResults && <EfficiencyDetails results={facility.lastTickResults} />}
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
