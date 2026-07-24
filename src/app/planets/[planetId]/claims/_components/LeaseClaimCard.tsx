'use client';

import { useTour } from '@/components/tour/TourContext';
import { Card, CardContent } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import type { ClaimResourceSummary } from '@/server/controller/planet';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ClaimCardHeader } from './ClaimCardHeader';
import { ClaimSizeForm } from './ClaimSizeForm';
import { resourceNameToSlug } from '@/app/planets/[planetId]/agent/[agentId]/market/_components/marketHelpers';
import { oilReservoirResourceType } from '@/simulation/planet/landBoundResources';

export function LeaseClaimCard({
    summary,
    agentId,
    planetId,
}: {
    summary: ClaimResourceSummary;
    agentId: string;
    planetId: string;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [tierIndex, setTierIndex] = useState(0);
    const [leased, setLeased] = useState(false);
    const { isTourActive, markActionCompleted } = useTour();

    const { data: financials } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );

    const isOil = summary.resourceName === oilReservoirResourceType.name;

    const leaseMutation = useMutation(
        trpc.leaseClaim.mutationOptions({
            onSuccess: () => {
                setLeased(true);
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getPlanetClaims.queryKey({ planetId }),
                });
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentClaims.queryKey({ agentId, planetId }),
                });
                // Mark the oil lease as completed for the tour blocking step
                if (isTourActive && isOil) {
                    markActionCompleted('lease-oil');
                }
            },
        }),
    );

    return (
        <Card
            id={resourceNameToSlug(summary.resourceName)}
            className='flex flex-col'
            data-tour={isOil ? 'claims-oil' : 'claims-lease'}
        >
            <ClaimCardHeader resourceName={summary.resourceName} renewable={summary.renewable} />
            <CardContent className='flex flex-col gap-3 flex-1'>
                <p className='text-xs text-muted-foreground'>
                    Available: {formatNumberWithUnit(summary.availableCapacity, 'units')} of{' '}
                    {formatNumberWithUnit(summary.totalCapacity, 'units')}
                </p>
                <div className='space-y-3'>
                    <ClaimSizeForm
                        summary={summary}
                        planetId={planetId}
                        financials={financials}
                        tierIndex={tierIndex}
                        onTierChange={setTierIndex}
                        isPending={leaseMutation.isPending}
                        isSubmitted={leased}
                        onSubmit={(quantity) =>
                            leaseMutation.mutate({ agentId, planetId, resourceName: summary.resourceName, quantity })
                        }
                        submitLabel='Lease'
                        errorMessage={leaseMutation.error?.message}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
