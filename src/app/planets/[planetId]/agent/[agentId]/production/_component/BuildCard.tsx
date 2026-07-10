'use client';

import { defaultHeight, FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction, usePendingActions, useRemovePendingByKey } from '@/hooks/useActionOverlay';
import { useSimulationQuery, useSimulationTick } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import type { Facility, ProductionFacility } from '@/simulation/planet/facility';
import { getFacilityType } from '@/simulation/planet/facility';
import { useMutation } from '@tanstack/react-query';
import { HardHat } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { FacilityCardShell } from './FacilityCardShell';
import { FacilityConstructionPanel } from './FacilityConstructionPanel';
import { FacilityIORow } from './FacilityIORow';
import { WorkerBars } from './WorkerBars';
import { ConstructionCompactRow } from './ConstructionCompactRow';

function BuildForm({
    entry,
    agentId,
    planetId,
    constructionServicePrice,
    onBuilt,
    onCancel,
    isPending,
}: {
    entry: ProductionFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    onBuilt: () => void;
    onCancel: () => void;
    /** True when there's a pending build action awaiting the next tick */
    isPending: boolean;
}): React.ReactElement {
    const trpc = useTRPC();
    const addPending = useAddPendingAction();
    const removePendingByKey = useRemovePendingByKey();
    const currentTick = useSimulationTick();

    const { data: financials } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );

    const facilityType = useMemo(() => getFacilityType(entry), [entry]);
    const [previewScale, setPreviewScale] = useState(1);

    const buildMutation = useMutation(
        trpc.buildFacility.mutationOptions({
            onSuccess: () => {
                onBuilt();
            },
            onError: () => {
                // Mutation failed — remove pending action so the UI shows no loading state
                removePendingByKey(agentId, planetId, entry.name);
            },
        }),
    );

    // When isPending is true and mutation is not in flight, we're awaiting the tick
    const awaitingTick = isPending && !buildMutation.isPending;
    const sending = buildMutation.isPending;

    // Overlay message for pending states
    const overlayMessage = awaitingTick
        ? 'Awaiting tick…'
        : sending
          ? 'Sending build…'
          : null;

    return (
        <FacilityCardShell
            className='max-w-[600px]'
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityOrShipIcon facilityOrShipName={entry.name} />}
            headerContent={
                <span className='flex flex-col space-between gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                    <div className='flex items-center gap-1 flex-col mb-1'>
                        <h3 className='font-semibold leading-tight '>{entry.name}</h3>
                        <span className='flex flex-col items-center gap-1'>
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-muted-foreground'>
                                new
                            </Badge>
                        </span>
                    </div>
                    <span className='flex flex-col text-muted-foreground text-xs gap-2'>
                        Worker Requirement
                        <WorkerBars
                            workerRequirement={entry.workerRequirement}
                            scale={entry.scale}
                            neutral={true}
                            workerEfficiency={{}}
                            globalMin={0}
                            planetId={planetId}
                            agentId={agentId}
                        />
                    </span>
                </span>
            }
        >
            <div className='flex-1'>
                <FacilityIORow needs={entry.needs} produces={entry.produces} scale={previewScale} />
            </div>
            <div className='relative mt-auto space-y-2'>
                <Separator />
                <FacilityConstructionPanel
                    facilityType={facilityType}
                    fromScale={0}
                    constructionServicePrice={constructionServicePrice}
                    planetId={planetId}
                    label='Build at scale'
                    confirmLabel='Build'
                    pendingLabel='Sending build…'
                    isPending={sending}
                    financials={financials}
                    onCancel={onCancel}
                    onConfirm={(targetScale) => {
                        addPending({
                            type: 'build',
                            agentId,
                            planetId,
                            facilityKey: entry.name,
                            triggerTick: currentTick,
                        });
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
}: {
    facility: Facility;
    agentId: string;
    planetId: string;
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
                <span className='flex flex-col space-between gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                    <div className='flex items-center gap-1 flex-col mb-1'>
                        <h3 className='font-semibold leading-tight text-amber-600 dark:text-amber-400'>
                            {facility.name}
                        </h3>
                        <span className='flex flex-col items-center gap-1'>
                            <Badge
                                variant='secondary'
                                className='text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] px-1.5 py-0 gap-1'
                            >
                                <HardHat className='h-3.5 w-3.5' />
                                Under Construction
                            </Badge>
                        </span>
                    </div>
                    <span className='flex flex-col text-muted-foreground text-xs gap-2'>
                        Worker Requirement
                        <WorkerBars
                            workerRequirement={facility.workerRequirement}
                            scale={targetScale}
                            neutral={true}
                            workerEfficiency={{}}
                            globalMin={0}
                            planetId={planetId}
                            agentId={agentId}
                        />
                    </span>
                </span>
            }
        >
            <div className='flex-1'>
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
                <ConstructionCompactRow facility={facility} />

                {/* Blocking overlay only over the action controls */}
                {pendingCancelAction && (
                    <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-b-lg'>
                        <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                            <Spinner className='h-4 w-4' />
                            Cancellation pending…
                        </span>
                    </div>
                )}
            </div>
        </FacilityCardShell>
    );
}

/**
 * BuildCard handles both the build form (when an unowned facility is being built)
 * and the construction progress display (when a new facility is being built).
 */
export function BuildCard({
    entry,
    facility,
    agentId,
    planetId,
    constructionServicePrice,
    onBuilt,
    onCancel,
    isPending,
}: {
    /** Catalog entry for the build form (unowned facility being built). */
    entry?: ProductionFacility;
    /** Facility object for construction mode (owned facility being constructed). */
    facility?: Facility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    onBuilt: () => void;
    onCancel: () => void;
    /** True when there's a pending build action awaiting the next tick (for BuildForm) */
    isPending?: boolean;
}): React.ReactElement | null {
    if (entry && !facility) {
        return (
            <BuildForm
                entry={entry}
                agentId={agentId}
                planetId={planetId}
                constructionServicePrice={constructionServicePrice}
                onBuilt={onBuilt}
                onCancel={onCancel}
                isPending={isPending ?? false}
            />
        );
    }

    if (facility) {
        return <ConstructionDisplay facility={facility} agentId={agentId} planetId={planetId} />;
    }

    return null;
}

export type Mode = { type: 'idle' } | { type: 'selecting' };