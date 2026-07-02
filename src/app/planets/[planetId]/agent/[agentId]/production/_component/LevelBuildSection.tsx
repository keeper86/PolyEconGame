'use client';

import { defaultHeight, FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useTRPC } from '@/lib/trpc';
import { getFacilityType } from '@/simulation/planet/facility';
import type { FacilityCatalogEntry } from '@/simulation/planet/productionFacilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useAddActionOverlay } from '@/hooks/useActionOverlay';
import { useSimulationTick } from '@/hooks/useSimulationQuery';
import { FacilityCardShell } from './FacilityCardShell';
import { FacilityConstructionPanel } from './FacilityConstructionPanel';
import { FacilityIORow } from './FacilityIORow';
import { WorkerBars } from './WorkerBars';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

export type Mode = { type: 'idle' } | { type: 'selecting' };

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
    const [previewScale, setPreviewScale] = useState(1);
    const addOverlay = useAddActionOverlay();
    const currentTick = useSimulationTick();

    const buildMutation = useMutation(
        trpc.buildFacility.mutationOptions({
            onSuccess: (result) => {
                // Push optimistic overlay so the UI shows the facility immediately.
                // Do NOT invalidate the query here — the overlay *is* the data until the
                // next snapshot broadcast triggers a natural invalidation via the tick poller.
                // Skipping the invalidation avoids a "flash of stale content" render cycle
                // where the old query data renders before the overlay context propagates.
                addOverlay({
                    type: 'facilityBuilt',
                    tickConfirmed: currentTick,
                    agentId,
                    planetId,
                    facilityKey: facility.name,
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
            icon={<FacilityOrShipIcon facilityOrShipName={facility.name} />}
            headerContent={
                <span className='flex flex-col space-between gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                    <div className='flex items-center gap-1 flex-col mb-1'>
                        <h3 className='font-semibold leading-tight '>{facility.name}</h3>
                        <span className='flex flex-col items-center gap-1'>
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0 text-muted-foreground'>
                                new
                            </Badge>
                        </span>
                    </div>
                    <span className='flex flex-col text-muted-foreground text-xs gap-1'>
                        Worker Requirement
                        <WorkerBars
                            workerRequirement={facility.workerRequirement}
                            scale={facility.scale}
                            neutral={true}
                            workerEfficiency={{}}
                            globalMin={0}
                        />
                    </span>
                </span>
            }
        >
            <div className='flex-1'>
                <FacilityIORow needs={facility.needs} produces={facility.produces} scale={previewScale} />
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
                    onCancel={onCancel}
                    onConfirm={(targetScale) =>
                        buildMutation.mutate({ agentId, planetId, facilityKey: facility.name, targetScale })
                    }
                    onScaleChange={setPreviewScale}
                />
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
    mode,
    onModeChange,
}: {
    entries: FacilityCatalogEntry[];
    agentId: string;
    planetId: string;
    constructionServicePrice: number | undefined;
    onBuilt: () => void;
    mode: Mode;
    onModeChange: (mode: Mode) => void;
}): React.ReactElement {
    if (mode.type === 'idle') {
        return (
            <Card
                className='min-w-[300px] flex items-center justify-center cursor-pointer border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors'
                style={{ minHeight: '160px' }}
                onClick={() => onModeChange({ type: 'selecting' })}
            >
                <CardContent className='flex flex-col items-center gap-2 p-6'>
                    <PlusCircle className='h-8 w-8' />
                    <span className='text-xs font-medium'>Build facility</span>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            {entries.map((entry) => {
                const name = entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name;
                return (
                    <BuildCard
                        key={name}
                        entry={entry}
                        agentId={agentId}
                        planetId={planetId}
                        constructionServicePrice={constructionServicePrice}
                        onBuilt={() => {
                            onModeChange({ type: 'idle' });
                            onBuilt();
                        }}
                        onCancel={() => onModeChange({ type: 'idle' })}
                    />
                );
            })}
        </>
    );
}
