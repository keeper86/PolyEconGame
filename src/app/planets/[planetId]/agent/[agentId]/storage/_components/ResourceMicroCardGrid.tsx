'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumberWithUnit } from '@/lib/utils';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { RESOURCES_BY_NAME, RESOURCE_LEVEL_LABELS } from '@/simulation/planet/resourceCatalog';
import { useMemo, useState } from 'react';
import { type MicroCardEntry, ResourceMicroCard } from './ResourceMicroCard';
import { computeResourceFlowData, elapsedTicksThisMonth } from './resourceFlowNormalizer';

const LEVEL_ORDER: string[] = ['raw', 'refined', 'manufactured', 'services'];

function aggregateProduction(assets: AgentPlanetAssets): Record<string, number> {
    const result: Record<string, number> = {};
    for (const fac of assets.productionFacilities) {
        for (const [name, qty] of Object.entries(fac.lastTickResults.lastProduced)) {
            result[name] = (result[name] ?? 0) + qty;
        }
    }
    return result;
}

function aggregateConsumption(assets: AgentPlanetAssets): Record<string, number> {
    const result: Record<string, number> = {};
    for (const fac of assets.productionFacilities) {
        for (const [name, qty] of Object.entries(fac.lastTickResults.lastConsumed)) {
            result[name] = (result[name] ?? 0) + qty;
        }
    }
    for (const fac of assets.managementFacilities) {
        for (const [name, qty] of Object.entries(fac.lastTickResults.lastConsumed)) {
            result[name] = (result[name] ?? 0) + qty;
        }
    }
    return result;
}

function aggregateBoughtPerTick(assets: AgentPlanetAssets): Record<string, number> {
    const result: Record<string, number> = {};
    if (!assets.market?.buy) {
        return result;
    }
    for (const [name, state] of Object.entries(assets.market.buy)) {
        if (state.lastBought && state.lastBought > 0) {
            result[name] = state.lastBought;
        }
    }
    return result;
}

function aggregateSoldPerTick(assets: AgentPlanetAssets): Record<string, number> {
    const result: Record<string, number> = {};
    if (!assets.market?.sell) {
        return result;
    }
    for (const [name, state] of Object.entries(assets.market.sell)) {
        if (state.lastSold && state.lastSold > 0) {
            result[name] = state.lastSold;
        }
    }
    return result;
}

function buildMicroCardEntries(assets: AgentPlanetAssets, tick: number): MicroCardEntry[] {
    const storage = assets.storageFacility;
    const prodPerTick = aggregateProduction(assets);
    const consPerTick = aggregateConsumption(assets);
    const boughtPerTick = aggregateBoughtPerTick(assets);
    const soldPerTick = aggregateSoldPerTick(assets);
    const deprPerTick = assets.lastDepreciatedPerTick ?? {};
    const monthAcc = assets.monthAcc;
    const lastMonthAcc = assets.lastMonthAcc;
    const elapsed = elapsedTicksThisMonth(tick);

    const allNames = new Set<string>();

    for (const name of Object.keys(storage.currentInStorage)) {
        allNames.add(name);
    }
    for (const name of Object.keys(prodPerTick)) {
        allNames.add(name);
    }
    for (const name of Object.keys(consPerTick)) {
        allNames.add(name);
    }
    for (const name of Object.keys(deprPerTick)) {
        allNames.add(name);
    }
    for (const name of Object.keys(boughtPerTick)) {
        allNames.add(name);
    }
    for (const name of Object.keys(soldPerTick)) {
        allNames.add(name);
    }

    for (const acc of [monthAcc, lastMonthAcc]) {
        for (const name of Object.keys(acc.producedResources)) {
            allNames.add(name);
        }
        for (const name of Object.keys(acc.consumedResources)) {
            allNames.add(name);
        }
        for (const name of Object.keys(acc.boughtResources)) {
            allNames.add(name);
        }
        for (const name of Object.keys(acc.soldResources)) {
            allNames.add(name);
        }
        for (const name of Object.keys(acc.depreciatedServices)) {
            allNames.add(name);
        }
    }

    const entries: MicroCardEntry[] = [];

    for (const name of allNames) {
        const resource = RESOURCES_BY_NAME.get(name);
        if (!resource) {
            continue;
        }

        const stock = storage.currentInStorage[name]?.quantity ?? 0;

        const toQty = (acc: Record<string, { quantity: number; value: number }>): number => {
            return acc[name]?.quantity ?? 0;
        };

        const perTick = {
            prod: prodPerTick[name] ?? 0,
            cons: consPerTick[name] ?? 0,
            depr: deprPerTick[name] ?? 0,
            bought: boughtPerTick[name] ?? 0,
            sold: soldPerTick[name] ?? 0,
        };

        const current = {
            produced: toQty(monthAcc.producedResources),
            consumed: toQty(monthAcc.consumedResources),
            depreciated: toQty(monthAcc.depreciatedServices),
            bought: toQty(monthAcc.boughtResources),
            sold: toQty(monthAcc.soldResources),
        };

        const last = {
            produced: toQty(lastMonthAcc.producedResources),
            consumed: toQty(lastMonthAcc.consumedResources),
            depreciated: toQty(lastMonthAcc.depreciatedServices),
            bought: toQty(lastMonthAcc.boughtResources),
            sold: toQty(lastMonthAcc.soldResources),
        };

        const flowData = computeResourceFlowData(perTick, current, last, elapsed);

        const hasActivity =
            stock > 0 ||
            perTick.prod > 0 ||
            perTick.cons > 0 ||
            perTick.depr > 0 ||
            perTick.bought > 0 ||
            perTick.sold > 0 ||
            current.produced > 0 ||
            last.produced > 0 ||
            current.consumed > 0 ||
            last.consumed > 0 ||
            current.bought > 0 ||
            last.bought > 0 ||
            current.sold > 0 ||
            last.sold > 0 ||
            current.depreciated > 0 ||
            last.depreciated > 0;

        if (!hasActivity) {
            continue;
        }

        entries.push({
            name,
            level: resource.level,
            stock,
            flowData,
            tick,
        });
    }

    entries.sort((a, b) => b.stock - a.stock);
    return entries;
}

function groupEntriesByLevel(entries: MicroCardEntry[]): Map<string, MicroCardEntry[]> {
    const groups = new Map<string, MicroCardEntry[]>();
    for (const entry of entries) {
        const existing = groups.get(entry.level) ?? [];
        existing.push(entry);
        groups.set(entry.level, existing);
    }
    return groups;
}

type Props = {
    assets: AgentPlanetAssets;
    planetId: string;
    agentId: string;
    tick: number;
};

export function ResourceMicroCardGrid({ assets, planetId, agentId, tick }: Props): React.ReactElement {
    const storage = assets.storageFacility;
    const usedVol = storage.current.volume;
    const capVol = storage.capacity.volume * storage.scale;
    const usedMass = storage.current.mass;
    const capMass = storage.capacity.mass * storage.scale;
    const volPercent = capVol > 0 ? (usedVol / capVol) * 100 : 0;
    const massPercent = capMass > 0 ? (usedMass / capMass) * 100 : 0;

    const volColorClass = volPercent > 90 ? 'bg-red-500' : volPercent > 70 ? 'bg-amber-500' : 'bg-green-500';
    const massColorClass = massPercent > 90 ? 'bg-red-500' : massPercent > 70 ? 'bg-amber-500' : 'bg-green-500';

    const entries = useMemo(() => buildMicroCardEntries(assets, tick), [assets, tick]);

    const resourceGroups = useMemo(() => {
        const groups = groupEntriesByLevel(entries);
        const levelGroups = LEVEL_ORDER.map((level) => ({
            level,
            label: RESOURCE_LEVEL_LABELS[level as keyof typeof RESOURCE_LEVEL_LABELS] ?? level,
            resources: groups.get(level) ?? [],
        }));
        if (entries.length > 0) {
            return [{ level: 'all', label: 'All', resources: entries }, ...levelGroups];
        }
        return levelGroups;
    }, [entries]);

    const [activeTab, setActiveTab] = useState<string>('all');

    const displayEntries =
        activeTab === 'all' ? entries : (resourceGroups.find((g) => g.level === activeTab)?.resources ?? []);

    return (
        <div className='space-y-3' data-tour='storage-overview'>
            {/* Capacity bars — reused from existing StoragePanel */}
            <div className='flex items-center gap-3 text-[10px]' data-tour='storage-capacity'>
                <div className='flex items-center gap-1 flex-1'>
                    <span className='text-muted-foreground shrink-0'>Volume:</span>
                    <span
                        className={`shrink-0 font-medium ${volPercent > 90 ? 'text-red-500' : volPercent > 70 ? 'text-amber-500' : ''}`}
                    >
                        {Math.round(volPercent)}%
                    </span>
                    <div className='flex-1 h-1.5 bg-muted rounded-full overflow-hidden'>
                        <div
                            className={`h-full rounded-full transition-all ${volColorClass}`}
                            style={{ width: `${Math.min(volPercent, 100)}%` }}
                        />
                    </div>
                    <span className='text-muted-foreground shrink-0'>
                        {formatNumberWithUnit(Math.round(usedVol), 'm3')} /{' '}
                        {formatNumberWithUnit(Math.round(capVol), 'm3')}
                    </span>
                </div>
                <div className='flex items-center gap-1 flex-1'>
                    <span className='text-muted-foreground shrink-0'>Mass:</span>
                    <span
                        className={`shrink-0 font-medium ${massPercent > 90 ? 'text-red-500' : massPercent > 70 ? 'text-amber-500' : ''}`}
                    >
                        {Math.round(massPercent)}%
                    </span>
                    <div className='flex-1 h-1.5 bg-muted rounded-full overflow-hidden'>
                        <div
                            className={`h-full rounded-full transition-all ${massColorClass}`}
                            style={{ width: `${Math.min(massPercent, 100)}%` }}
                        />
                    </div>
                    <span className='text-muted-foreground shrink-0'>
                        {formatNumberWithUnit(Math.round(usedMass), 'tonnes')} /{' '}
                        {formatNumberWithUnit(Math.round(capMass), 'tonnes')}
                    </span>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className='space-y-3'>
                <TabsList className='w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border pb-2'>
                    {resourceGroups.map(({ level, label, resources }) => (
                        <TabsTrigger
                            key={level}
                            value={level}
                            disabled={resources.length === 0}
                            className='bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed'
                        >
                            {label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {resourceGroups.map(({ level }) => (
                    <TabsContent key={level} value={level} className='mt-0'>
                        {displayEntries.length === 0 ? (
                            <p className='text-sm text-muted-foreground py-4 text-center'>-empty-</p>
                        ) : (
                            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5'>
                                {displayEntries.map((entry) => (
                                    <ResourceMicroCard key={entry.name} entry={entry} />
                                ))}
                            </div>
                        )}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
