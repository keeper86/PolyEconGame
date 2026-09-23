'use client';

import { FacilityOrShipIcon, defaultHeight } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';
import { HardHat, PlusCircle } from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { FacilityCardShell } from '../../production/_component/FacilityCardShell';
import { FacilityConstructionPanel } from '../../production/_component/FacilityConstructionPanel';
import { selectPendingShipyardBuilds } from './shipyardHelpers';

function PendingShipyardCard({ name }: { name: string }): React.ReactElement {
    return (
        <FacilityCardShell
            className='max-w-[600px]'
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityOrShipIcon facilityOrShipName='Shipyard' buildProgress={0} />}
            headerContent={
                <span className='flex flex-col gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                    <div className='flex items-center gap-1 flex-col mb-auto'>
                        <h3 className='font-semibold leading-tight text-amber-600 dark:text-amber-400'>{name}</h3>
                        <Badge
                            variant='secondary'
                            className='text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-1'
                        >
                            <HardHat className='h-3.5 w-3.5' />
                            Under Construction
                        </Badge>
                    </div>
                </span>
            }
        >
            <div className='relative mt-auto space-y-2'>
                <Separator />
                <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-b-lg'>
                    <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                        <Spinner className='h-4 w-4' />
                        Awaiting next day…
                    </span>
                </div>
            </div>
        </FacilityCardShell>
    );
}

function ShipyardBuildForm({
    agentId,
    planetId,
    constructionServicePrice,
    onCancel,
}: {
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    onCancel: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const addPending = useAddPendingAction();
    const [shipyardName, setShipyardName] = useState('');

    const { data: financials } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );

    const buildMutation = useMutation(
        trpc.buildShipConstructionFacility.mutationOptions({
            onSuccess: (data) => {
                addPending({
                    type: 'shipBuild',
                    agentId,
                    planetId,
                    facilityId: data.facilityId,
                    facilityName: shipyardName.trim(),
                    triggerTick: data.processedAtTick,
                });
                toast.success('Shipyard construction ordered. Changes take effect on the next day.');
                onCancel();
            },
            onError: (err) => {
                toast.error(err instanceof Error ? err.message : 'Shipyard build failed');
            },
        }),
    );

    return (
        <FacilityCardShell
            className='max-w-[600px]'
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityOrShipIcon facilityOrShipName='Shipyard' />}
            headerContent={
                <span className='flex flex-col gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                    <div className='flex flex-col gap-1 mb-auto'>
                        <h3 className='font-semibold leading-tight'>New Shipyard</h3>
                        <div className='flex flex-col gap-1'>
                            <Label className='text-xs text-muted-foreground'>Shipyard name</Label>
                            <Input
                                className='h-8 text-xs'
                                placeholder='Enter a unique name, e.g. "Shipyard Alpha"'
                                value={shipyardName}
                                maxLength={50}
                                onChange={(e) => setShipyardName(e.target.value)}
                            />
                        </div>
                    </div>
                </span>
            }
        >
            <div className='relative mt-auto space-y-2'>
                <Separator />
                <FacilityConstructionPanel
                    facilityType='ship_construction'
                    fromScale={0}
                    constructionServicePrice={constructionServicePrice}
                    planetId={planetId}
                    label='Build at scale'
                    confirmLabel='Build'
                    pendingLabel='Sending build…'
                    isPending={buildMutation.isPending}
                    financials={financials}
                    onCancel={onCancel}
                    onConfirm={(targetScale) => {
                        if (!shipyardName.trim()) {
                            toast.error('Please enter a shipyard name');
                            return;
                        }
                        buildMutation.mutate({
                            agentId,
                            planetId,
                            facilityName: shipyardName.trim(),
                            targetScale,
                        });
                    }}
                />
                {buildMutation.isPending && (
                    <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-b-lg'>
                        <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                            <Spinner className='h-4 w-4' />
                            Sending build…
                        </span>
                    </div>
                )}
            </div>
        </FacilityCardShell>
    );
}

export function ShipyardBuildSection({
    agentId,
    planetId,
    constructionServicePrice,
}: {
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
}): React.ReactElement {
    const pendingActions = usePendingActions(agentId, planetId);
    const pendingBuilds = selectPendingShipyardBuilds(pendingActions);
    const [configuring, setConfiguring] = useState(false);

    const pendingCards = pendingBuilds.map((build, index) => (
        <PendingShipyardCard key={build.facilityId ?? `${build.name}-${index}`} name={build.name} />
    ));

    if (configuring) {
        return (
            <>
                {pendingCards}
                <ShipyardBuildForm
                    agentId={agentId}
                    planetId={planetId}
                    constructionServicePrice={constructionServicePrice}
                    onCancel={() => setConfiguring(false)}
                />
            </>
        );
    }

    return (
        <>
            {pendingCards}
            <Card
                className='min-w-[300px] flex items-center justify-center cursor-pointer border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors'
                style={{ minHeight: '160px' }}
                onClick={() => setConfiguring(true)}
            >
                <CardContent className='flex flex-col items-center gap-2 p-6'>
                    <PlusCircle className='h-8 w-8' />
                    <span className='text-xs font-medium'>Build shipyard</span>
                </CardContent>
            </Card>
        </>
    );
}
