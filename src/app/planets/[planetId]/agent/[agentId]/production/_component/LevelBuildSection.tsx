'use client';

import React, { useMemo, useState } from 'react';
import type { FacilityCatalogEntry } from '@/simulation/planet/productionFacilities';
import { formatNumberWithUnit } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { FacilityCardShell } from './FacilityCardShell';
import { Separator } from '@/components/ui/separator';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { FacilityIORow } from './FacilityIORow';
import { FacilityConstructionPanel } from './FacilityConstructionPanel';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getFacilityType } from '@/simulation/planet/facility';
import { PlusCircle, Zap, Users } from 'lucide-react';

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
            className='max-w-[600px]'
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityOrShipIcon facilityOrShipName={facility.name} />}
            headerContent={
                <>
                    <h3 className='font-semibold text-sm leading-tight'>{facility.name}</h3>
                    <div className='flex items-center gap-3 mt-1 text-xs text-muted-foreground'>
                        {totalWorkers > 0 && (
                            <span className='flex items-center gap-1'>
                                <Users className='h-3 w-3' />
                                {formatNumberWithUnit(totalWorkers, 'persons')} / scale
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
