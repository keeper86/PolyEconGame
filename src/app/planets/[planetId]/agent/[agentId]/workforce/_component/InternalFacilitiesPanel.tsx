'use client';

import { FacilityCardShell } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/FacilityCardShell';
import {
    FacilityIORow,
    FacilityProductionIORow,
} from '@/app/planets/[planetId]/agent/[agentId]/production/_component/FacilityIORow';
import { WorkerBars } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/WorkerBars';
import { ConstructionCompactRow } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/ConstructionCompactRow';
import { FacilityConstructionPanel } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/FacilityConstructionPanel';
import { defaultHeight, FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { PRICE_FLOOR } from '@/simulation/constants';
import type { ManagementFacility } from '@/simulation/planet/facility';
import { getFacilityType } from '@/simulation/planet/facility';
import { facilitiesByLevel } from '@/simulation/planet/productionFacilities';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import { useMutation } from '@tanstack/react-query';
import { HardHat } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

function InternalBuildCard({
    entry,
    agentId,
    planetId,
    constructionServicePrice,
    otherConstructionCosts,
    onBuilt,
    onCancel,
    isPending,
}: {
    entry: ManagementFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    otherConstructionCosts?: number;
    onBuilt: () => void;
    onCancel: () => void;
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
                    onCancel={onCancel}
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

function InternalConstructionCard({ facility }: { facility: ManagementFacility }): React.ReactElement {
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

function InternalActiveCard({ facility }: { facility: ManagementFacility }): React.ReactElement {
    const results = facility.lastTickResults;
    const eff = results?.overallEfficiency ?? 0;
    const globalMin = results
        ? Math.min(
              ...Object.values(results.resourceEfficiency),
              ...Object.values(results.workerEfficiency).filter((v): v is number => v !== undefined),
          )
        : 0;

    return (
        <FacilityCardShell
            contentClassName='flex flex-col flex-1 gap-2'
            icon={<FacilityOrShipIcon facilityOrShipName={facility.name} />}
            headerContent={
                <span className='flex flex-col space-between gap-2' style={{ minHeight: `${defaultHeight}px` }}>
                    <div className='flex items-center gap-1 flex-col mb-1'>
                        <h3 className='font-semibold leading-tight '>{facility.name}</h3>
                        <span className='flex flex-col items-center gap-1'>
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                Scale {facility.scale}
                            </Badge>
                        </span>
                    </div>
                    <span className='flex flex-col text-muted-foreground text-xs gap-2'>
                        Worker efficiency
                        <WorkerBars
                            workerRequirement={facility.workerRequirement}
                            scale={facility.scale}
                            workerEfficiency={results?.workerEfficiency ?? {}}
                            globalMin={globalMin}
                        />
                    </span>
                </span>
            }
        >
            <div className='flex-1 space-y-2 pb-3'>
                <FacilityProductionIORow
                    needs={facility.needs}
                    produces={facility.produces}
                    scale={facility.scale}
                    resourceEfficiency={results?.resourceEfficiency ?? {}}
                    overallEfficiency={eff}
                    limitingEfficiency={globalMin}
                />
            </div>
            <div className='mt-auto space-y-2'>
                <Separator />
                <div className='py-1 flex flex-row items-center justify-center gap-3 text-[14px] text-muted-foreground bg-muted/80 w-full'>
                    <div className='flex flex-col items-center'>
                        inputs{' '}
                        <span className='tabular-nums text-red-600 dark:text-red-400'>
                            {formatNumberWithUnit(results?.inputCosts ?? 0, 'currency')}
                        </span>
                    </div>
                    <span className='shrink-0'>−</span>
                    <div className='flex flex-col items-center'>
                        wages{' '}
                        <span className='tabular-nums text-red-600 dark:text-red-400'>
                            {formatNumberWithUnit(results?.wageCosts ?? 0, 'currency')}
                        </span>
                    </div>
                    <span className='shrink-0'>=</span>
                    <div className='flex flex-col items-center text-foreground'>
                        net/day{' '}
                        <span
                            className={`tabular-nums text-md ${
                                (results?.costBalance ?? 0) >= 0
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-red-600 dark:text-red-400'
                            }`}
                        >
                            {formatNumberWithUnit(results?.costBalance ?? 0, 'currency')}
                        </span>
                    </div>
                </div>
                <Separator />
            </div>
        </FacilityCardShell>
    );
}

export default function InternalFacilitiesPanel({
    managementFacilities,
    agentId,
    planetId,
}: {
    managementFacilities: ManagementFacility[];
    agentId: string;
    planetId: string;
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
        return managementFacilities
            .filter((f) => f.construction !== null)
            .reduce((sum, f) => {
                const remaining = f.construction!.totalConstructionServiceRequired - f.construction!.progress;
                return sum + Math.max(0, remaining) * constructionServicePrice;
            }, 0);
    }, [managementFacilities, constructionServicePrice]);

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

    const ownedByName = useMemo(() => {
        const m = new Map<string, ManagementFacility>();
        for (const f of managementFacilities) {
            m.set(f.name, f);
        }
        return m;
    }, [managementFacilities]);

    const internalEntries = facilitiesByLevel.internal;
    const unbuiltEntries = internalEntries.filter(
        (e) => !ownedByName.has(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name),
    );

    return (
        <Card>
            <CardContent className='space-y-2'>
                <h2 className='text-sm font-semibold'>Internal Facilities</h2>
                <div className='flex flex-row gap-3 flex-wrap'>
                    {managementFacilities.map((f) =>
                        f.construction !== null && f.construction.type === 'new' ? (
                            <InternalConstructionCard key={f.id} facility={f} />
                        ) : (
                            <InternalActiveCard key={f.id} facility={f} />
                        ),
                    )}
                    {unbuiltEntries.map((entry) => {
                        const template = entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID) as ManagementFacility;
                        return (
                            <InternalBuildCard
                                key={template.name}
                                entry={template}
                                agentId={agentId}
                                planetId={planetId}
                                constructionServicePrice={constructionServicePrice}
                                otherConstructionCosts={otherConstructionCosts}
                                onBuilt={() => {}}
                                onCancel={() => {}}
                                isPending={pendingBuildKeys.has(template.name)}
                            />
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
