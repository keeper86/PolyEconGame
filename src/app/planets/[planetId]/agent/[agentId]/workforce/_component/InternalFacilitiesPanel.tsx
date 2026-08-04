'use client';

import { ConstructionCompactRow } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/ConstructionCompactRow';
import { ActiveFacilityCard } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/ActiveFacilityCard';
import { FacilityCardShell } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/FacilityCardShell';
import { FacilityConstructionPanel } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/FacilityConstructionPanel';
import { FacilityIORow } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/FacilityIORow';
import { WorkerBars } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/WorkerBars';
import { defaultHeight, FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { PRICE_FLOOR } from '@/simulation/constants';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import type { ManagementFacility } from '@/simulation/planet/facility';
import { getFacilityType } from '@/simulation/planet/facility';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { humanResourcesOfficeFacilityType } from '@/simulation/planet/specialFacilities';
import { useMutation } from '@tanstack/react-query';
import { HardHat } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

function InternalBuildCard({
    entry,
    agentId,
    planetId,
    constructionServicePrice,
    otherConstructionCosts,
    onBuilt,
    isPending,
}: {
    entry: ManagementFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    otherConstructionCosts?: number;
    onBuilt: () => void;
    isPending: boolean;
}): React.ReactElement {
    const trpc = useTRPC();
    const addPending = useAddPendingAction();
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
                onBuilt();
            },
            onError: (err) => {
                toast.error(err instanceof Error ? err.message : 'Build failed');
            },
        }),
    );
    const awaitingTick = isPending && !buildMutation.isPending;
    const sending = buildMutation.isPending;
    const overlayMessage = awaitingTick ? 'Awaiting next day…' : sending ? 'Sending build…' : null;

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
            <div className='flex-1 space-y-2 pb-3'>
                <FacilityIORow needs={entry.needs} produces={entry.produces} scale={previewScale} />
            </div>
            <div className='relative mt-auto space-y-2'>
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
                    onCancel={undefined}
                    onConfirm={(targetScale) => {
                        buildMutation.mutate({ agentId, planetId, facilityKey: entry.name, targetScale });
                    }}
                    onScaleChange={setPreviewScale}
                />
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

function InternalConstructionCard({
    facility,
    agentId,
    planetId,
}: {
    facility: ManagementFacility;
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
            icon={<FacilityOrShipIcon facilityOrShipName={facility.name} buildProgress={pct / 100} />}
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
            <div className='flex-1 space-y-2 pb-3'>
                <FacilityIORow needs={facility.needs} produces={facility.produces} scale={targetScale} />
            </div>
            <div className='relative mt-auto space-y-2'>
                <Separator />
                <ConstructionCompactRow facility={facility} hideCancel />
            </div>
        </FacilityCardShell>
    );
}

export default function InternalFacilitiesPanel({
    agentId,
    planetId,
    assets,
}: {
    agentId: string;
    planetId: string;
    assets: AgentPlanetAssets;
}): React.ReactElement {
    const trpc = useTRPC();
    const { data: constructionMarket } = useSimulationQuery(
        trpc.simulation.getPlanetMarket.queryOptions({ planetId, resourceName: constructionServiceResourceType.name }),
    );
    const constructionServicePrice =
        constructionMarket?.market?.clearingPrice ??
        initialMarketPrices[constructionServiceResourceType.name] ??
        PRICE_FLOOR;

    const otherConstructionCosts = useMemo(() => {
        return assets.productionFacilities
            .filter((f) => f.construction !== null)
            .reduce((sum, f) => {
                const remaining = f.construction!.totalConstructionServiceRequired - f.construction!.progress;
                return sum + Math.max(0, remaining) * constructionServicePrice;
            }, 0);
    }, [assets, constructionServicePrice]);

    const pendingActions = usePendingActions(agentId, planetId);
    const pendingBuildKeys = useMemo(() => {
        const keys = new Set<string>();
        for (const a of pendingActions) {
            if (a.type === 'build' && a.facilityKey) {
                keys.add(a.facilityKey);
            }
        }
        return keys;
    }, [pendingActions]);

    const template = useMemo(() => humanResourcesOfficeFacilityType(PLACEHOLDER_PLANET, PLACEHOLDER_ID), []);
    const hrDepartment = assets.humanResourcesDepartment;

    return (
        <Card>
            <CardContent className='space-y-2'>
                <h2 className='text-sm font-semibold'>Internal Facilities</h2>
                <div className='flex flex-row gap-3 flex-wrap'>
                    {hrDepartment !== null &&
                        (hrDepartment.construction !== null && hrDepartment.construction.type === 'new' ? (
                            <InternalConstructionCard
                                key={hrDepartment.id}
                                facility={hrDepartment}
                                agentId={agentId}
                                planetId={planetId}
                            />
                        ) : (
                            <ActiveFacilityCard
                                key={hrDepartment.id}
                                facility={hrDepartment}
                                agentId={agentId}
                                planetId={planetId}
                                constructionServicePrice={constructionServicePrice}
                                otherConstructionCosts={otherConstructionCosts}
                                onExpanded={() => {}}
                            />
                        ))}

                    {hrDepartment === null && (
                        <InternalBuildCard
                            key={template.name}
                            entry={template}
                            agentId={agentId}
                            planetId={planetId}
                            constructionServicePrice={constructionServicePrice}
                            otherConstructionCosts={otherConstructionCosts}
                            onBuilt={() => {}}
                            isPending={pendingBuildKeys.has(template.name)}
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
