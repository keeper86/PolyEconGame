'use client';

import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { useTour } from '@/components/tour/TourContext';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { Facility, ManagementFacility, ProductionFacility } from '@/simulation/planet/facility';
import { getFacilityType } from '@/simulation/planet/facility';
import { oilWellName } from '@/simulation/planet/productionFacilities';
import { useMutation } from '@tanstack/react-query';
import { HardHat } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConstructionCompactRow } from './ConstructionCompactRow';
import { FacilityCardShell } from './FacilityCardShell';
import { FacilityConstructionPanel } from './FacilityConstructionPanel';
import { FacilityHeader } from './FacilityHeader';
import { FacilityIORow } from './FacilityIORow';

function BuildForm({
    entry,
    agentId,
    planetId,
    constructionServicePrice,
    otherConstructionCosts,
    onBuilt,
    onCancel,
    isPending,
}: {
    entry: ProductionFacility | ManagementFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    otherConstructionCosts?: number;
    onBuilt: () => void;
    onCancel: () => void;
    /** True when there's a pending build action awaiting the next tick */
    isPending: boolean;
}): React.ReactElement {
    const trpc = useTRPC();
    const addPending = useAddPendingAction();
    const { isTourActive, markActionCompleted } = useTour();

    const { data: financials } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );

    const facilityType = useMemo(() => getFacilityType(entry), [entry]);
    const [previewScale, setPreviewScale] = useState(1);

    const buildMutation = useMutation(
        trpc.buildFacility.mutationOptions({
            onSuccess: (data) => {
                addPending({
                    type: 'build',
                    agentId,
                    planetId,
                    facilityKey: entry.name,
                    triggerTick: data.processedAtTick,
                });
                toast.success('Construction ordered. Changes take effect on the next tick.');
                if (isTourActive && isOilWell) {
                    markActionCompleted('build-oil-well');
                }
                onBuilt();
            },
            onError: (err) => {
                toast.error(err instanceof Error ? err.message : 'Build failed');
            },
        }),
    );

    // When isPending is true and mutation is not in flight, we're awaiting the tick
    const awaitingTick = isPending && !buildMutation.isPending;
    const sending = buildMutation.isPending;

    // Overlay message for pending states
    const overlayMessage = awaitingTick ? 'Awaiting next day…' : sending ? 'Sending build…' : null;
    const isOilWell = entry.name === oilWellName;
    return (
        <FacilityCardShell
            className='max-w-[600px]'
            contentClassName={'flex flex-col flex-1 gap-2'}
            icon={<FacilityOrShipIcon facilityOrShipName={entry.name} />}
            headerContent={
                <FacilityHeader
                    facility={entry}
                    badge={
                        <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-muted-foreground'>
                            new
                        </Badge>
                    }
                    planetId={planetId}
                    agentId={agentId}
                />
            }
        >
            <div className='flex-1 space-y-2 pb-3'>
                <FacilityIORow needs={entry.needs} produces={entry.produces} scale={previewScale} />
            </div>
            <div className='relative mt-auto space-y-2' data-tour={isOilWell ? 'build-oil-well' : undefined}>
                <Separator />
                <FacilityConstructionPanel
                    facilityType={facilityType}
                    fromScale={0}
                    constructionServicePrice={constructionServicePrice}
                    planetId={planetId}
                    otherConstructionCosts={otherConstructionCosts}
                    label='Build at scale'
                    confirmLabel='Build'
                    pendingLabel='Sending build…'
                    isPending={sending}
                    financials={financials}
                    onCancel={onCancel}
                    onConfirm={(targetScale) => {
                        buildMutation.mutate({ agentId, planetId, facilityKey: entry.name, targetScale });
                    }}
                    onScaleChange={setPreviewScale}
                />

                {/* Blocking overlay only over the action controls (build form or awaiting tick) */}
                {overlayMessage && (
                    <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-b-lg'>
                        <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                            <Spinner className='h-4 w-4' />
                            {overlayMessage}
                        </span>
                    </div>
                )}
            </div>
        </FacilityCardShell>
    );
}

function ConstructionDisplay({
    facility,
    agentId,
    planetId,
    hideCancel,
}: {
    facility: Facility;
    agentId: string;
    planetId: string;
    hideCancel?: boolean;
}): React.ReactElement {
    const cs = facility.construction!;
    const targetScale = cs.constructionTargetMaxScale;
    const pct =
        cs.totalConstructionServiceRequired > 0
            ? Math.min(100, (cs.progress / cs.totalConstructionServiceRequired) * 100)
            : 0;

    // Check for pending cancel for this facility
    const pendingCancelAction = usePendingActions(agentId, planetId).find(
        (a) => a.type === 'cancel' && a.facilityId === facility.id,
    );
    const isPending = pendingCancelAction !== undefined;

    return (
        <FacilityCardShell
            className='max-w-[600px]'
            contentClassName='flex flex-col flex-1 gap-2'
            icon={
                facility.type === 'ship_construction' ? (
                    <FacilityOrShipIcon
                        facilityOrShipName={'Shipyard'}
                        buildProgress={pct / 100}
                        suffix={String(facility.scale)}
                    />
                ) : (
                    <FacilityOrShipIcon facilityOrShipName={facility.name} buildProgress={pct / 100} />
                )
            }
            headerContent={
                <FacilityHeader
                    facility={facility}
                    titleClassName='text-amber-600 dark:text-amber-400'
                    badge={
                        <Badge
                            variant='secondary'
                            className='text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-1'
                        >
                            <HardHat className='h-3.5 w-3.5' />
                            Under Construction
                        </Badge>
                    }
                    planetId={planetId}
                    agentId={agentId}
                />
            }
        >
            <div className='flex-1 space-y-2 pb-3'>
                {'needs' in facility && 'produces' in facility ? (
                    <FacilityIORow
                        needs={(facility as ProductionFacility).needs}
                        produces={(facility as ProductionFacility).produces}
                        scale={targetScale}
                    />
                ) : null}
            </div>
            <div className='relative mt-auto space-y-2'>
                <Separator />
                <ConstructionCompactRow facility={facility} hideCancel={hideCancel} />

                {/* Blocking overlay only over the action controls */}
                {pendingCancelAction && (
                    <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-b-lg'>
                        <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                            <Spinner className='h-4 w-4' />
                            {isPending ? 'Cancellation pending…' : 'Awaiting next day…'}
                        </span>
                    </div>
                )}
            </div>
        </FacilityCardShell>
    );
}

export function BuildCard({
    entry,
    facility,
    agentId,
    planetId,
    constructionServicePrice,
    otherConstructionCosts,
    onBuilt,
    onCancel,
    isPending,
    hideCancel,
}: {
    /** Catalog entry for the build form (unowned facility being built). */
    entry?: ProductionFacility | ManagementFacility;
    /** Facility object for construction mode (owned facility being constructed). */
    facility?: Facility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    otherConstructionCosts?: number;
    onBuilt: () => void;
    onCancel: () => void;
    /** True when there's a pending build action awaiting the next tick (for BuildForm) */
    isPending?: boolean;
    /** Hides the cancel button in construction mode. */
    hideCancel?: boolean;
}): React.ReactElement | null {
    if (entry && !facility) {
        return (
            <BuildForm
                entry={entry}
                agentId={agentId}
                planetId={planetId}
                constructionServicePrice={constructionServicePrice}
                otherConstructionCosts={otherConstructionCosts}
                onBuilt={onBuilt}
                onCancel={onCancel}
                isPending={isPending ?? false}
            />
        );
    }

    if (facility) {
        return (
            <ConstructionDisplay facility={facility} agentId={agentId} planetId={planetId} hideCancel={hideCancel} />
        );
    }

    return null;
}

export type Mode = { type: 'idle' } | { type: 'selecting' };
