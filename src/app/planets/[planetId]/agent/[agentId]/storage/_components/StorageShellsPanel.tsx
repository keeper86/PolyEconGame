'use client';

import { ActiveFacilityCard } from '@/app/planets/[planetId]/agent/[agentId]/production/_component/ActiveFacilityCard';
import { limitingEfficiency } from '@/app/planets/[planetId]/agent/[agentId]/_component/FacilityHeader';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { PRICE_FLOOR, SR_HOLDING_COST_PER_TON } from '@/simulation/constants';
import { initialMarketPrices } from '@/simulation/initialUniverse/initialMarketPrices';
import {
    storageFormKeys,
    STORAGE_SHELL_FORM_NAMES,
    usageOfShell,
    SHELL_STORAGE_SERVICE_QUANTITY,
    type StorageFacility,
} from '@/simulation/planet/facility';
import { computeOtherConstructionCosts } from '@/simulation/planet/facilityMaintenance';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { constructionServiceResourceType } from '@/simulation/planet/services';
import React, { useMemo } from 'react';
import { RiArrowRightBoxFill } from 'react-icons/ri';
import { StorageBalanceRow } from './StorageBalanceRow';
import { StorageBufferGauge } from './StorageBufferGauge';
import { StorageStarvationBar } from './StorageStarvationBar';
import { termFor } from '@/i18n/terms';
import { useLocale, useTranslations } from 'next-intl';

function ShellCapacitySection({ shell }: { shell: StorageFacility }): React.ReactElement {
    const locale = useLocale();
    const tr = useTranslations('Storage');
    const used = usageOfShell(shell);
    const capacity = { volume: shell.capacity.volume * shell.maxScale, mass: shell.capacity.mass * shell.maxScale };
    const volumePct = capacity.volume > 0 ? Math.min(1, used.volume / capacity.volume) : 0;
    const massPct = capacity.mass > 0 ? Math.min(1, used.mass / capacity.mass) : 0;

    const volumeTone =
        volumePct >= 0.9 ? '[&>div]:bg-red-500' : volumePct >= 0.7 ? '[&>div]:bg-amber-500' : '[&>div]:bg-primary';
    const massTone =
        massPct >= 0.9 ? '[&>div]:bg-red-500' : massPct >= 0.7 ? '[&>div]:bg-amber-500' : '[&>div]:bg-primary';

    const held = Object.entries(shell.currentInStorage);

    return (
        <div className='flex flex-col gap-2 py-2' data-tour='storage-capacity'>
            <div className='space-y-1'>
                <div className='flex flex-row items-center justify-between text-xs text-muted-foreground'>
                    <span>{tr('volumeUsed')}</span>
                    <span className='tabular-nums'>
                        {formatNumberWithUnit(used.volume, 'm3', undefined, locale)} /{' '}
                        {formatNumberWithUnit(capacity.volume, 'm3', undefined, locale)}
                    </span>
                </div>
                <Progress value={volumePct * 100} className={`h-2 ${volumeTone}`} />
            </div>
            <div className='space-y-1'>
                <div className='flex flex-row items-center justify-between text-xs text-muted-foreground'>
                    <span>{tr('massUsed')}</span>
                    <span className='tabular-nums'>
                        {formatNumberWithUnit(used.mass, 'tonnes', undefined, locale)} /{' '}
                        {formatNumberWithUnit(capacity.mass, 'tonnes', undefined, locale)}
                    </span>
                </div>
                <Progress value={massPct * 100} className={`h-2 ${massTone}`} />
            </div>
            {held.length > 0 && (
                <div className='flex flex-col gap-0.5 pt-1'>
                    <div className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60'>
                        {tr('heldResources')}
                    </div>
                    {held.map(([name, entry]) => (
                        <div key={name} className='flex flex-row items-center justify-between text-xs'>
                            <span>{termFor(locale, name)}</span>
                            <span className='tabular-nums text-muted-foreground'>
                                {formatNumberWithUnit(entry.quantity, 'units', undefined, locale)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ShellIoSection({
    shell,
    demand,
    planetId,
    agentId,
}: {
    shell: StorageFacility;
    demand: number;
    planetId: string;
    agentId: string;
}): React.ReactElement {
    const results = shell.lastTickResults;
    const needsCount = shell.needs.length || 1;
    const gridTemplateColumns = `${needsCount}fr 2rem 2fr`;
    const globalMin = limitingEfficiency(results);
    const eff = results.overallEfficiency;
    const buffer = shell.storageBuffer ?? 0;

    return (
        <>
            <div className='grid w-full items-center gap-x-2' style={{ gridTemplateColumns }}>
                <div className='flex flex-wrap gap-1.5 justify-center'>
                    {shell.needs.map(({ resource, quantity }) => {
                        const resEff = results.resourceEfficiency[resource.name] ?? 0;
                        return (
                            <ProductQuantity
                                key={resource.name}
                                resource={resource}
                                quantity={quantity * shell.scale * eff}
                                efficiency={resEff}
                                isLimiting={resEff <= globalMin && globalMin < 0.99}
                                planetId={planetId}
                                agentId={agentId}
                            />
                        );
                    })}
                </div>
                <RiArrowRightBoxFill
                    className={`shrink-0 h-8 w-8 ${shell.needs.length > 0 ? 'text-muted-foreground' : 'invisible'}`}
                />
                <div className='flex justify-center'>
                    <StorageBufferGauge buffer={buffer} demand={demand} facility={shell} servicePerScale='shell' />
                </div>
            </div>
            <StorageBalanceRow
                demand={demand}
                buffer={buffer}
                production={eff * SHELL_STORAGE_SERVICE_QUANTITY * shell.scale}
            >
                <StorageStarvationBar ss={shell.storageStarvation ?? 0} scope='shell' />
            </StorageBalanceRow>
        </>
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
    const locale = useLocale();
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
        <>
            {storageFormKeys().map((form) => {
                const shell = assets.storage.shells[form];
                const demand = usageOfShell(shell).mass * SR_HOLDING_COST_PER_TON;
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
                                {termFor(locale, STORAGE_SHELL_FORM_NAMES[form])}
                            </Badge>
                        }
                        dataTour={`storage-shell-${form}`}
                    >
                        <ShellCapacitySection shell={shell} />
                        <ShellIoSection shell={shell} demand={demand} planetId={planetId} agentId={agentId} />
                    </ActiveFacilityCard>
                );
            })}
        </>
    );
}
