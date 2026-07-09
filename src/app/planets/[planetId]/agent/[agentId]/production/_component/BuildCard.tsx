'use client';

import { defaultHeight, FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAddActionOverlay } from '@/hooks/useActionOverlay';
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
}: {
    entry: ProductionFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    onBuilt: () => void;
    onCancel: () => void;
}): React.ReactElement {
    const trpc = useTRPC();
    const addOverlay = useAddActionOverlay();
    const currentTick = useSimulationTick();

    const { data: financials } = useSimulationQuery(
        trpc.simulation.getAgentFinancials.queryOptions({ agentId, planetId }),
    );

    const facilityType = useMemo(() => getFacilityType(entry), [entry]);
    const [previewScale, setPreviewScale] = useState(1);

    const buildMutation = useMutation(
        trpc.buildFacility.mutationOptions({
            onSuccess: (result) => {
                addOverlay({
                    type: 'facilityBuilt',
                    tickConfirmed: currentTick,
                    agentId,
                    planetId,
                    facilityKey: entry.name,
                    facilityId: result.facilityId,
                    targetScale: previewScale,
                });
                onBuilt();
            },
        }),
    );

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
            <div className='mt-auto space-y-2'>
                <Separator />
                <FacilityConstructionPanel
                    facilityType={facilityType}
                    fromScale={0}
                    constructionServicePrice={constructionServicePrice}
                    planetId={planetId}
                    label='Build at scale'
                    confirmLabel='Build'
                    pendingLabel='Building…'
                    isPending={buildMutation.isPending}
                    financials={financials}
                    onCancel={onCancel}
                    onConfirm={(targetScale) =>
                        buildMutation.mutate({ agentId, planetId, facilityKey: entry.name, targetScale })
                    }
                    onScaleChange={setPreviewScale}
                />
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
            <div className='mt-auto space-y-2'>
                <Separator />
                <ConstructionCompactRow facility={facility} />
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
            />
        );
    }

    if (facility) {
        return <ConstructionDisplay facility={facility} agentId={agentId} planetId={planetId} />;
    }

    return null;
}

export type Mode = { type: 'idle' } | { type: 'selecting' };
