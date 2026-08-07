'use client';

import { ActiveFacilityCard } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/ActiveFacilityCard';
import { BuildCard } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/BuildCard';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { usePendingActions } from '@/hooks/useActionOverlay';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { PRICE_FLOOR } from '@/simulation/constants';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import type { StorageFacility } from '@/simulation/planet/facility';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import { storageDepartmentFacilityType } from '@/simulation/planet/specialFacilities';
import React, { useMemo } from 'react';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

function StorageCapacityCard({ storage }: { storage: StorageFacility }): React.ReactElement {
    const scale = storage.department?.scale ?? 0;
    const capVol = storage.capacity.volume * scale;
    const capMass = storage.capacity.mass * scale;
    const volPct = capVol > 0 ? Math.min(100, (storage.current.volume / capVol) * 100) : 0;
    const massPct = capMass > 0 ? Math.min(100, (storage.current.mass / capMass) * 100) : 0;

    const fillClass = (pct: number) =>
        pct > 90 ? '[&>div]:bg-red-500' : pct > 70 ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500';

    return (
        <Card className='overflow-hidden flex flex-col min-w-[300px] sm:min-w-[350px] max-w-[485px]'>
            <CardContent className='px-3 py-3 flex flex-col gap-1.5'>
                <h3 className='font-semibold leading-tight text-sm'>Storage Capacity</h3>
                <span className='flex items-center gap-2 text-[10px] text-muted-foreground'>
                    <span className='shrink-0 w-12'>Volume</span>
                    <Progress value={volPct} className={`h-1.5 flex-1 ${fillClass(volPct)}`} />
                    <span className='tabular-nums shrink-0'>
                        {Math.round(volPct)}% · {formatNumberWithUnit(Math.round(storage.current.volume), 'm3')} /{' '}
                        {formatNumberWithUnit(Math.round(capVol), 'm3')}
                    </span>
                </span>
                <span className='flex items-center gap-2 text-[10px] text-muted-foreground'>
                    <span className='shrink-0 w-12'>Mass</span>
                    <Progress value={massPct} className={`h-1.5 flex-1 ${fillClass(massPct)}`} />
                    <span className='tabular-nums shrink-0'>
                        {Math.round(massPct)}% · {formatNumberWithUnit(Math.round(storage.current.mass), 'tonnes')} /{' '}
                        {formatNumberWithUnit(Math.round(capMass), 'tonnes')}
                    </span>
                </span>
            </CardContent>
        </Card>
    );
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

    if (department !== null) {
        if (department.construction !== null && department.construction.type === 'new') {
            return (
                <BuildCard
                    key={department.id}
                    facility={department}
                    agentId={agentId}
                    planetId={planetId}
                    constructionServicePrice={constructionServicePrice}
                    onBuilt={() => {}}
                    onCancel={() => {}}
                    hideCancel
                />
            );
        }
        return (
            <span className='flex flex-col gap-2'>
                <ActiveFacilityCard
                    key={department.id}
                    facility={department}
                    agentId={agentId}
                    planetId={planetId}
                    constructionServicePrice={constructionServicePrice}
                    otherConstructionCosts={otherConstructionCosts}
                    onExpanded={() => {}}
                    hrProductivityMultiplier={assets.hrProductivityMultiplier}
                />
                <StorageCapacityCard storage={assets.storageFacility} />
            </span>
        );
    }
    return (
        <BuildCard
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
}
