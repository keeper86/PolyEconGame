'use client';

import {
    getResourceByName,
    resourceNameToSlug,
} from '@/app/planets/[planetId]/agent/[agentId]/market/_components/marketHelpers';
import { ProductQuantity } from '@/components/client/ProductQuantity';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumberWithUnit } from '@/lib/utils';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { RESOURCES_BY_NAME, RESOURCE_LEVEL_LABELS } from '@/simulation/planet/resourceCatalog';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { StorageColumnConfig } from './storageColumns';
import { STORAGE_LABEL_COLUMN_WIDTH, getStorageHeaderColumnClasses, getStorageVisibleColumns } from './storageColumns';
import { getLandboundRessourceByName } from '@/simulation/planet/landBoundResources';

const COLUMN_AREA_OVERHEAD = 96 + STORAGE_LABEL_COLUMN_WIDTH;

const LEVEL_ORDER: string[] = ['raw', 'refined', 'manufactured', 'services'];

const STORAGE_LEVEL_LABELS: Record<string, string> = {
    ...RESOURCE_LEVEL_LABELS,
    all: 'All',
};

type StorageResourceEntry = {
    name: string;
    level: string;
    stock: number;
    prodPerTick: number;
    producedMonth: number;
    producedMonthLast: number;
    consPerTick: number;
    consumedMonth: number;
    consumedMonthLast: number;
    deprPerTick: number;
    depreciationMonth: number;
    depreciationMonthLast: number;
    boughtPerTick: number;
    boughtMonth: number;
    boughtMonthLast: number;
    soldPerTick: number;
    soldMonth: number;
    soldMonthLast: number;
};

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
            if (getResourceByName(name)) {
                result[name] = (result[name] ?? 0) + qty;
            }
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

function buildStorageEntries(assets: AgentPlanetAssets): StorageResourceEntry[] {
    const storage = assets.storageFacility;
    const prodPerTick = aggregateProduction(assets);
    const consPerTick = aggregateConsumption(assets);
    const boughtPerTick = aggregateBoughtPerTick(assets);
    const soldPerTick = aggregateSoldPerTick(assets);
    const deprPerTick = assets.lastDepreciatedPerTick ?? {};
    const monthAcc = assets.monthAcc;
    const lastMonthAcc = assets.lastMonthAcc;

    const allNames = new Set<string>();

    // Resources in storage
    for (const name of Object.keys(storage.currentInStorage)) {
        allNames.add(name);
    }

    // Resources with production or consumption per tick
    for (const name of Object.keys(prodPerTick)) {
        allNames.add(name);
    }
    for (const name of Object.keys(consPerTick)) {
        allNames.add(name);
    }

    // Resources with depreciation per tick
    for (const name of Object.keys(deprPerTick)) {
        allNames.add(name);
    }

    // Resources with bought/sold per tick
    for (const name of Object.keys(boughtPerTick)) {
        allNames.add(name);
    }
    for (const name of Object.keys(soldPerTick)) {
        allNames.add(name);
    }

    // Resources with monthly activity
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

    const entries: StorageResourceEntry[] = [];

    for (const name of allNames) {
        const resource = RESOURCES_BY_NAME.get(name);
        const pTick = prodPerTick[name] ?? 0;
        const cTick = consPerTick[name] ?? 0;
        const dTick = deprPerTick[name] ?? 0;
        const bTick = boughtPerTick[name] ?? 0;
        const sTick = soldPerTick[name] ?? 0;
        const stock = storage.currentInStorage[name]?.quantity ?? 0;
        const currentProduced = monthAcc.producedResources[name] ?? { quantity: 0, value: 0 };
        const lastProduced = lastMonthAcc.producedResources[name] ?? { quantity: 0, value: 0 };
        const currentConsumed = monthAcc.consumedResources[name] ?? { quantity: 0, value: 0 };
        const lastConsumed = lastMonthAcc.consumedResources[name] ?? { quantity: 0, value: 0 };
        const currentBought = monthAcc.boughtResources[name] ?? { quantity: 0, value: 0 };
        const lastBought = lastMonthAcc.boughtResources[name] ?? { quantity: 0, value: 0 };
        const currentSold = monthAcc.soldResources[name] ?? { quantity: 0, value: 0 };
        const lastSold = lastMonthAcc.soldResources[name] ?? { quantity: 0, value: 0 };
        const currentDepr = monthAcc.depreciatedServices[name] ?? { quantity: 0, value: 0 };
        const lastDepr = lastMonthAcc.depreciatedServices[name] ?? { quantity: 0, value: 0 };

        const hasActivity =
            stock > 0 ||
            pTick > 0 ||
            cTick > 0 ||
            dTick > 0 ||
            bTick > 0 ||
            sTick > 0 ||
            currentProduced.quantity > 0 ||
            lastProduced.quantity > 0 ||
            currentConsumed.quantity > 0 ||
            lastConsumed.quantity > 0 ||
            currentBought.quantity > 0 ||
            lastBought.quantity > 0 ||
            currentSold.quantity > 0 ||
            lastSold.quantity > 0 ||
            currentDepr.quantity > 0 ||
            lastDepr.quantity > 0;

        if (!hasActivity) {
            continue;
        }

        entries.push({
            name,
            level: resource?.level ?? 'raw',
            stock,
            prodPerTick: pTick,
            producedMonth: currentProduced.quantity,
            producedMonthLast: lastProduced.quantity,
            consPerTick: cTick,
            consumedMonth: currentConsumed.quantity,
            consumedMonthLast: lastConsumed.quantity,
            deprPerTick: dTick,
            depreciationMonth: currentDepr.quantity,
            depreciationMonthLast: lastDepr.quantity,
            boughtPerTick: bTick,
            boughtMonth: currentBought.quantity,
            boughtMonthLast: lastBought.quantity,
            soldPerTick: sTick,
            soldMonth: currentSold.quantity,
            soldMonthLast: lastSold.quantity,
        });
    }

    entries.sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0));
    return entries;
}

function groupEntriesByLevel(entries: StorageResourceEntry[]): Map<string, StorageResourceEntry[]> {
    const groups = new Map<string, StorageResourceEntry[]>();
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
};

/**
 * Displays a triple-line value: per-tick bold, this month normal, last month muted.
 */
function TripleValue({
    perTick,
    thisMonth,
    lastMonth,
}: {
    perTick: number;
    thisMonth: number;
    lastMonth: number;
}): React.ReactElement {
    return (
        <span className='flex flex-col items-end text-[11px] leading-tight'>
            <span className='font-semibold tabular-nums'>{formatNumberWithUnit(perTick, 'units')}</span>
            <span className='tabular-nums text-muted-foreground'>{formatNumberWithUnit(thisMonth, 'units')}</span>
            <span className='text-[10px] text-muted-foreground/50 tabular-nums'>
                {formatNumberWithUnit(lastMonth, 'units')}
            </span>
        </span>
    );
}

function StockBadge({ stock }: { stock: number }): React.ReactElement {
    if (stock === 0) {
        return <></>;
    }
    return (
        <span className='text-[10px] text-muted-foreground/60 tabular-nums'>
            {formatNumberWithUnit(stock, 'units')}
        </span>
    );
}

export function StoragePanel({ assets, planetId, agentId }: Props): React.ReactElement {
    const cardRef = useRef<HTMLDivElement>(null);
    const [visibleColumns, setVisibleColumns] = useState<StorageColumnConfig[]>([]);

    // Responsive column drop
    useEffect(() => {
        if (!cardRef.current) {
            return;
        }
        const updateVisibleColumns = () => {
            if (cardRef.current) {
                const columnSpace = Math.max(0, cardRef.current.clientWidth - COLUMN_AREA_OVERHEAD);
                setVisibleColumns(getStorageVisibleColumns(columnSpace));
            }
        };
        updateVisibleColumns();
        const observer = new ResizeObserver(updateVisibleColumns);
        observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, []);

    const [sortConfig, setSortConfig] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({
        column: 'stock',
        direction: 'desc',
    });

    const storage = assets.storageFacility;
    const usedVol = storage.current.volume;
    const capVol = storage.capacity.volume * storage.scale;
    const usedMass = storage.current.mass;
    const capMass = storage.capacity.mass * storage.scale;
    const volPercent = capVol > 0 ? (usedVol / capVol) * 100 : 0;
    const massPercent = capMass > 0 ? (usedMass / capMass) * 100 : 0;

    const volColorClass = volPercent > 90 ? 'bg-red-500' : volPercent > 70 ? 'bg-amber-500' : 'bg-green-500';
    const massColorClass = massPercent > 90 ? 'bg-red-500' : massPercent > 70 ? 'bg-amber-500' : 'bg-green-500';

    const entries = useMemo(() => buildStorageEntries(assets), [assets]);

    const resourceGroups = useMemo(() => {
        const groups = groupEntriesByLevel(entries);
        const levelGroups = LEVEL_ORDER.map((level) => ({
            level,
            label: STORAGE_LEVEL_LABELS[level] ?? level,
            resources: groups.get(level) ?? [],
        }));
        if (entries.length > 0) {
            return [{ level: 'all', label: 'All', resources: entries }, ...levelGroups];
        }
        return levelGroups;
    }, [entries]);

    const [activeTab, setActiveTab] = useState<string>('all');

    const sortedEntries = useMemo(() => {
        const currentEntries =
            activeTab === 'all' ? entries : (resourceGroups.find((g) => g.level === activeTab)?.resources ?? []);

        const column = sortConfig.column;
        if (column === null) {
            return currentEntries;
        }
        return [...currentEntries].sort((a, b) => {
            let aVal: number;
            let bVal: number;
            switch (column) {
                case 'name':
                    return sortConfig.direction === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
                case 'stock':
                    aVal = a.stock;
                    bVal = b.stock;
                    break;
                case 'prod':
                    aVal = a.prodPerTick;
                    bVal = b.prodPerTick;
                    break;
                case 'cons':
                    aVal = a.consPerTick;
                    bVal = b.consPerTick;
                    break;
                case 'depr':
                    aVal = a.deprPerTick;
                    bVal = b.deprPerTick;
                    break;
                case 'bought':
                    aVal = a.boughtPerTick;
                    bVal = b.boughtPerTick;
                    break;
                case 'sold':
                    aVal = a.soldPerTick;
                    bVal = b.soldPerTick;
                    break;
                default:
                    aVal = 0;
                    bVal = 0;
            }
            const cmp = aVal - bVal;
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });
    }, [activeTab, entries, resourceGroups, sortConfig]);

    const handleColumnSort = (columnId: string) => {
        setSortConfig((prev) => {
            if (prev.column === columnId) {
                if (prev.direction === 'desc') {
                    return { column: columnId, direction: 'asc' };
                }
                return { column: null, direction: 'asc' };
            }
            return { column: columnId, direction: 'desc' };
        });
    };

    const renderSortIcon = (columnId: string) => {
        if (sortConfig.column === columnId) {
            return sortConfig.direction === 'asc' ? (
                <ChevronUp className='w-2.5 h-2.5 shrink-0' />
            ) : (
                <ChevronDown className='w-2.5 h-2.5 shrink-0' />
            );
        }
        return <ChevronsUpDown className='w-2.5 h-2.5 shrink-0 opacity-30' />;
    };

    const getMarketHref = (resourceName: string): string => {
        return `/planets/${planetId}/agent/${agentId}/market#${resourceNameToSlug(resourceName)}`;
    };

    return (
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
            <Card ref={cardRef}>
                <CardContent className='p-3'>
                    {/* Capacity bars */}
                    <div className='flex items-center gap-3 mb-3 text-[10px]'>
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

                    {/* Column headers */}
                    <div className='flex items-center px-1 pb-1.5 mb-0.5 border-b'>
                        <div className='flex flex-1 items-center gap-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none'>
                            <div className='w-6 shrink-0' />
                            <button
                                onClick={() => handleColumnSort('name')}
                                className='flex flex-1 min-w-0 items-center gap-0.5 cursor-pointer hover:text-muted-foreground truncate'
                            >
                                <span className='truncate'>Resource</span>
                                {renderSortIcon('name')}
                            </button>
                            <button
                                onClick={() => handleColumnSort('stock')}
                                className='w-[52px] flex items-center justify-end gap-0.5 cursor-pointer hover:text-muted-foreground shrink-0'
                                title='Current inventory quantity'
                            >
                                <span className='truncate'>Stock</span>
                                {renderSortIcon('stock')}
                            </button>
                            {visibleColumns.map((column) => (
                                <button
                                    key={column.id}
                                    onClick={() => handleColumnSort(column.id)}
                                    className={`${getStorageHeaderColumnClasses(column.id)} flex items-center justify-end gap-0.5 cursor-pointer hover:text-muted-foreground`}
                                    title={column.title}
                                >
                                    <span className='truncate'>{column.label}</span>
                                    {renderSortIcon(column.id)}
                                </button>
                            ))}
                        </div>
                        <div className='w-4 shrink-0' />
                    </div>

                    {/* Resource rows */}
                    {resourceGroups.map(({ level }) => (
                        <TabsContent key={level} value={level} className='mt-0'>
                            {sortedEntries.length === 0 ? (
                                <p className='text-sm text-muted-foreground py-4 text-center'>-empty-</p>
                            ) : (
                                <LayoutGroup>
                                    <div className='w-full'>
                                        {sortedEntries.map((entry) => (
                                            <motion.div
                                                key={entry.name}
                                                layout
                                                className='flex items-center px-1 py-1.5 border-b border-border/20 last:border-b-0 hover:bg-muted/30 transition-colors'
                                            >
                                                <ProductQuantity
                                                    quantity={0}
                                                    resource={
                                                        getResourceByName(entry.name) ??
                                                        getLandboundRessourceByName(entry.name)!
                                                    }
                                                    neutral={true}
                                                    isLimiting={false}
                                                    agentId={agentId}
                                                    planetId={planetId}
                                                    quantityLabel={entry.name}
                                                    efficiency={1}
                                                />
                                                <div className='flex flex-1 min-w-0 items-center gap-2'>
                                                    <Link
                                                        href={getMarketHref(entry.name) as never}
                                                        className='text-xs font-medium truncate flex-1 text-muted-foreground hover:text-foreground transition-colors min-w-0'
                                                    >
                                                        <span className='truncate block'>{entry.name}</span>
                                                    </Link>
                                                    <div className='w-[52px] shrink-0 flex justify-end'>
                                                        <StockBadge stock={entry.stock} />
                                                    </div>
                                                    {visibleColumns.map((column) => {
                                                        switch (column.id) {
                                                            case 'prod':
                                                                return (
                                                                    <div
                                                                        key={column.id}
                                                                        className={`${getStorageHeaderColumnClasses(column.id)}`}
                                                                    >
                                                                        <TripleValue
                                                                            perTick={entry.prodPerTick}
                                                                            thisMonth={entry.producedMonth}
                                                                            lastMonth={entry.producedMonthLast}
                                                                        />
                                                                    </div>
                                                                );
                                                            case 'cons':
                                                                return (
                                                                    <div
                                                                        key={column.id}
                                                                        className={`${getStorageHeaderColumnClasses(column.id)}`}
                                                                    >
                                                                        <TripleValue
                                                                            perTick={entry.consPerTick}
                                                                            thisMonth={entry.consumedMonth}
                                                                            lastMonth={entry.consumedMonthLast}
                                                                        />
                                                                    </div>
                                                                );
                                                            case 'depr':
                                                                return (
                                                                    <div
                                                                        key={column.id}
                                                                        className={`${getStorageHeaderColumnClasses(column.id)}`}
                                                                    >
                                                                        <TripleValue
                                                                            perTick={entry.deprPerTick}
                                                                            thisMonth={entry.depreciationMonth}
                                                                            lastMonth={entry.depreciationMonthLast}
                                                                        />
                                                                    </div>
                                                                );
                                                            case 'bought':
                                                                return (
                                                                    <div
                                                                        key={column.id}
                                                                        className={`${getStorageHeaderColumnClasses(column.id)}`}
                                                                    >
                                                                        <TripleValue
                                                                            perTick={entry.boughtPerTick}
                                                                            thisMonth={entry.boughtMonth}
                                                                            lastMonth={entry.boughtMonthLast}
                                                                        />
                                                                    </div>
                                                                );
                                                            case 'sold':
                                                                return (
                                                                    <div
                                                                        key={column.id}
                                                                        className={`${getStorageHeaderColumnClasses(column.id)}`}
                                                                    >
                                                                        <TripleValue
                                                                            perTick={entry.soldPerTick}
                                                                            thisMonth={entry.soldMonth}
                                                                            lastMonth={entry.soldMonthLast}
                                                                        />
                                                                    </div>
                                                                );
                                                            default:
                                                                return (
                                                                    <div
                                                                        key={column.id}
                                                                        className={`${getStorageHeaderColumnClasses(column.id)}`}
                                                                    />
                                                                );
                                                        }
                                                    })}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </LayoutGroup>
                            )}
                        </TabsContent>
                    ))}
                </CardContent>
            </Card>
        </Tabs>
    );
}
