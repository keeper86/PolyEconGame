'use client';

import { ActiveFacilityCard } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/ActiveFacilityCard';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PRICE_FLOOR } from '@/simulation/constants';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import {
    storageFormKeys,
    STORAGE_SHELL_FORM_NAMES,
    usageOfShell,
    type StorageShell,
} from '@/simulation/planet/facility';
import { computeOtherConstructionCosts } from '@/simulation/planet/facilityMaintenance';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import React, { useMemo } from 'react';

function ShellCapacitySection({ shell }: { shell: StorageShell }): React.ReactElement {
    const used = usageOfShell(shell);
    const capacity = { volume: shell.capacity.volume * shell.scale, mass: shell.capacity.mass * shell.scale };
    const volumePct = capacity.volume > 0 ? Math.min(1, used.volume / capacity.volume) : 0;
    const massPct = capacity.mass > 0 ? Math.min(1, used.mass / capacity.mass) : 0;

    const volumeTone =
        volumePct >= 0.9 ? '[&>div]:bg-red-500' : volumePct >= 0.7 ? '[&>div]:bg-amber-500' : '[&>div]:bg-primary';
    const massTone =
        massPct >= 0.9 ? '[&>div]:bg-red-500' : massPct >= 0.7 ? '[&>div]:bg-amber-500' : '[&>div]:bg-primary';

    const held = Object.entries(shell.currentInStorage);

    return (
        <div className='flex flex-col gap-2 py-2'>
            <div className='space-y-1'>
                <div className='flex flex-row items-center justify-between text-xs text-muted-foreground'>
                    <span>Volume used</span>
                    <span className='tabular-nums'>
                        {formatNumberWithUnit(used.volume, 'm3')} / {formatNumberWithUnit(capacity.volume, 'm3')}
                    </span>
                </div>
                <Progress value={volumePct * 100} className={`h-2 ${volumeTone}`} />
            </div>
            <div className='space-y-1'>
                <div className='flex flex-row items-center justify-between text-xs text-muted-foreground'>
                    <span>Mass used</span>
                    <span className='tabular-nums'>
                        {formatNumberWithUnit(used.mass, 'tonnes')} / {formatNumberWithUnit(capacity.mass, 'tonnes')}
                    </span>
                </div>
                <Progress value={massPct * 100} className={`h-2 ${massTone}`} />
            </div>
            {held.length > 0 && (
                <div className='flex flex-col gap-0.5 pt-1'>
                    <div className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60'>
                        Held resources
                    </div>
                    {held.map(([name, entry]) => (
                        <div key={name} className='flex flex-row items-center justify-between text-xs'>
                            <span>{name}</span>
                            <span className='tabular-nums text-muted-foreground'>
                                {formatNumberWithUnit(entry.quantity, 'units')}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function StorageShellsPanel({
    assets,
    agentId,
    planetId,
}: {
    assets: AgentPlanetAssets;
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
    const otherConstructionCosts = useMemo(
        () => computeOtherConstructionCosts(assets, constructionServicePrice),
        [assets, constructionServicePrice],
    );

    return (
        <div className='space-y-3'>
            {storageFormKeys().map((form) => {
                const shell = assets.storage.shells[form];
                return (
                    <ActiveFacilityCard
                        key={shell.id}
                        facility={shell}
                        agentId={agentId}
                        planetId={planetId}
                        constructionServicePrice={constructionServicePrice}
                        otherConstructionCosts={otherConstructionCosts}
                        headerBadge={
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                                {STORAGE_SHELL_FORM_NAMES[form]}
                            </Badge>
                        }
                        dataTour={`storage-shell-${form}`}
                    >
                        <ShellCapacitySection shell={shell} />
                    </ActiveFacilityCard>
                );
            })}
        </div>
    );
}
