'use client';

import { ActiveFacilityCard } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/ActiveFacilityCard';
import { ConstructionCompactRow } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/ConstructionCompactRow';
import { FacilityCardShell } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/FacilityCardShell';
import { FacilityConstructionPanel } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/FacilityConstructionPanel';
import {
    FacilityHeader,
    limitingEfficiency,
} from '@/app/planets/[planetId]/agent/[agentId]/production/_component/FacilityHeader';
import { FacilityOrShipIcon } from '@/components/client/FacilityOrShipIcon';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAddPendingAction, usePendingActions } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { PRICE_FLOOR } from '@/simulation/constants';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import type { ManagementFacility, StorageDepartment } from '@/simulation/planet/facility';
import { getFacilityType } from '@/simulation/planet/facility';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { storageDepartmentFacilityType, PRODUCED_STORAGE_QUANTITY } from '@/simulation/planet/specialFacilities';
import { useMutation } from '@tanstack/react-query';
import { HardHat } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import { toast } from 'sonner';
import { StorageBalanceRow, StorageBuildRow } from './StorageBalanceRow';
import { StorageBufferGauge } from './StorageBufferGauge';

type StorageBufferStatus = 'optimal' | 'stable' | 'strained' | 'critical';

function storageBufferStatus(buffer: number, demand: number): StorageBufferStatus {
    const d = demand > 0 ? buffer / demand : Number.POSITIVE_INFINITY;
    if (d >= 2.5) {return 'optimal';}
    if (d >= 1.0) {return 'stable';}
    if (d >= 0.3) {return 'strained';}
    return 'critical';
}

const STORAGE_STATUS_CONFIG: Record<
    StorageBufferStatus,
    { label: string; badgeClassName: string; tooltip: () => string }
> = {
    optimal: {
        label: 'Optimal',
        badgeClassName: 'border-green-300 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400',
        tooltip: () => 'Logistics buffer is full. All throughput running at 100%.',
    },
    stable: {
        label: 'Stable',
        badgeClassName: 'border-blue-300 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400',
        tooltip: () => 'Logistics buffer healthy. All throughput running at 100%.',
    },
    strained: {
        label: 'Strained',
        badgeClassName: 'border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400',
        tooltip: () => 'Logistics deficit! Throughput may be reduced.',
    },
    critical: {
        label: 'Critical',
        badgeClassName: 'border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400',
        tooltip: () => 'Severe logistics failure! Throughput severely reduced.',
    },
};

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

function StorageBuildCard({
    entry,
    agentId,
    planetId,
    constructionServicePrice,
    otherConstructionCosts,
    onBuilt,
    isPending,
    storageDemand,
}: {
    entry: ManagementFacility;
    agentId: string;
    planetId: string;
    constructionServicePrice: number;
    otherConstructionCosts?: number;
    onBuilt: () => void;
    isPending: boolean;
    storageDemand: number;
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
                <div
                    className='grid w-full items-center gap-x-2 py-2'
                    style={{ gridTemplateColumns: `${entry.needs.length || 1}fr 2rem 2fr` }}
                >
                    <div className='flex flex-wrap gap-1.5 justify-center'>
                        {entry.needs.map(({ resource, quantity }) => (
                            <ProductQuantity
                                key={resource.name}
                                resource={resource}
                                quantity={quantity * previewScale}
                                efficiency={1}
                                isLimiting={false}
                                planetId={planetId}
                                agentId={agentId}
                                neutral={true}
                            />
                        ))}
                    </div>
                    <RiArrowRightBoxFill
                        className={`shrink-0 h-8 w-8 ${entry.needs.length > 0 ? 'text-muted-foreground' : 'invisible'}`}
                    />
                    <div className='flex justify-center'>
                        <StorageBufferGauge
                            buffer={0}
                            demand={storageDemand}
                            department={entry}
                            maxScaleOverride={previewScale}
                        />
                    </div>
                </div>
            </div>
            <StorageBuildRow scale={previewScale} />
            <div className='relative mt-auto space-y-2'>
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

function StorageConstructionCard({
    facility,
    agentId,
    planetId,
    storageDemand,
}: {
    facility: ManagementFacility;
    agentId: string;
    planetId: string;
    storageDemand: number;
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
                <div
                    className='grid w-full items-center gap-x-2 py-2'
                    style={{ gridTemplateColumns: `${facility.needs.length || 1}fr 2rem 2fr` }}
                >
                    <div className='flex flex-wrap gap-1.5 justify-center'>
                        {facility.needs.map(({ resource, quantity }) => (
                            <ProductQuantity
                                key={resource.name}
                                resource={resource}
                                quantity={quantity * targetScale}
                                efficiency={1}
                                isLimiting={false}
                                planetId={planetId}
                                agentId={agentId}
                                neutral={true}
                            />
                        ))}
                    </div>
                    <RiArrowRightBoxFill
                        className={`shrink-0 h-8 w-8 ${facility.needs.length > 0 ? 'text-muted-foreground' : 'invisible'}`}
                    />
                    <div className='flex justify-center'>
                        <StorageBufferGauge
                            buffer={0}
                            demand={storageDemand}
                            department={facility}
                            maxScaleOverride={targetScale}
                        />
                    </div>
                </div>
            </div>
            <div className='relative mt-auto space-y-2'>
                <Separator />
                <ConstructionCompactRow facility={facility} />
            </div>
        </FacilityCardShell>
    );
}

function computeStorageDemand(assets: AgentPlanetAssets): number {
    let total = 0;
    for (const f of assets.productionFacilities) {
        for (const n of f.needs) {
            total += n.quantity * n.resource.massPerQuantity * f.scale;
        }
    }
    if (assets.humanResourcesDepartment) {
        for (const n of assets.humanResourcesDepartment.needs) {
            total += n.quantity * n.resource.massPerQuantity * assets.humanResourcesDepartment.scale;
        }
    }
    const storageDept = assets.storageFacility.department;
    if (storageDept) {
        for (const n of storageDept.needs) {
            total += n.quantity * n.resource.massPerQuantity * storageDept.scale;
        }
    }
    return total;
}

export default function StorageDepartment({
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

    const template = useMemo(() => storageDepartmentFacilityType(PLACEHOLDER_PLANET, PLACEHOLDER_ID), []);
    const department = assets.storageFacility.department;

    const storageDemand = useMemo(() => computeStorageDemand(assets), [assets]);
    const status = useMemo(
        () => storageBufferStatus(department?.storageBuffer ?? 0, storageDemand),
        [department?.storageBuffer, storageDemand],
    );
    const statusConfig = STORAGE_STATUS_CONFIG[status];

    const statusBadge = (
        <Tooltip>
            <TooltipTrigger asChild>
                <Badge variant='outline' className={`text-[10px] px-2 py-0.5 ${statusConfig.badgeClassName}`}>
                    {statusConfig.label}
                </Badge>
            </TooltipTrigger>
            <TooltipContent>{statusConfig.tooltip()}</TooltipContent>
        </Tooltip>
    );

    if (department !== null) {
        if (department.construction !== null && department.construction.type === 'new') {
            return (
                <StorageConstructionCard
                    key={department.id}
                    facility={department}
                    agentId={agentId}
                    planetId={planetId}
                    storageDemand={storageDemand}
                />
            );
        } else {
            const results = department.lastTickResults;
            const needsCount = department.needs.length || 1;
            const gridTemplateColumns = `${needsCount}fr 2rem 2fr`;
            const globalMin = limitingEfficiency(results);
            const eff = results.overallEfficiency;
            const buffer = department.storageBuffer ?? 0;
            return (
                <ActiveFacilityCard
                    key={department.id}
                    facility={department}
                    agentId={agentId}
                    planetId={planetId}
                    constructionServicePrice={constructionServicePrice}
                    otherConstructionCosts={otherConstructionCosts}
                    hrProductivityMultiplier={assets.hrProductivityMultiplier}
                    headerBadge={statusBadge}
                >
                    <div className='grid w-full items-center gap-x-2 py-2' style={{ gridTemplateColumns }}>
                        <div className='flex flex-wrap gap-1.5 justify-center'>
                            {department.needs.map(({ resource, quantity }) => {
                                const resEff = results.resourceEfficiency[resource.name] ?? 0;
                                return (
                                    <ProductQuantity
                                        key={resource.name}
                                        resource={resource}
                                        quantity={quantity * department.scale * eff}
                                        efficiency={resEff}
                                        isLimiting={resEff <= globalMin && globalMin < 0.99}
                                        planetId={planetId}
                                        agentId={agentId}
                                    />
                                );
                            })}
                        </div>
                        <RiArrowRightBoxFill
                            className={`shrink-0 h-8 w-8 ${department.needs.length > 0 ? 'text-muted-foreground' : 'invisible'}`}
                        />
                        <div className='flex justify-center'>
                            <StorageBufferGauge buffer={buffer} demand={storageDemand} department={department} />
                        </div>
                    </div>

                    <StorageBalanceRow
                        demand={storageDemand}
                        buffer={buffer}
                        production={
                            (department.lastTickResults?.overallEfficiency ?? 0) *
                            PRODUCED_STORAGE_QUANTITY *
                            department.scale
                        }
                    />
                </ActiveFacilityCard>
            );
        }
    } else {
        return (
            <StorageBuildCard
                key={template.name}
                entry={template}
                agentId={agentId}
                planetId={planetId}
                constructionServicePrice={constructionServicePrice}
                otherConstructionCosts={otherConstructionCosts}
                onBuilt={() => {}}
                isPending={pendingBuildKeys.has(template.name)}
                storageDemand={storageDemand}
            />
        );
    }
}
