'use client';

import { Accordion } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigationGuard } from '@/hooks/useNavigationGuard';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { LayoutGroup, motion } from 'motion/react';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useHashAccordion } from '@/hooks/useHashAccordion';
import type { MarketOverviewRow } from '@/server/controller/planet';
import { CURRENCY_RESOURCE_PREFIX, getCurrencyResourceName } from '@/simulation/market/currencyResources';
import { RESOURCE_LEVEL_LABELS } from '@/simulation/planet/resourceCatalog';
import { getHeaderColumnClasses, LABEL_COLUMN_WIDTH } from './columnConfig';
import {
    buildInitialState,
    buildResourceList,
    getResourceByName,
    resourceNameToSlug,
    slugToResourceName,
} from './marketHelpers';
import type { LocalResourceState, Props } from './marketTypes';
import ResourceAccordionItem from './ResourceAccordionItem';
import { useVisibleColumns } from './useVisibleColumns';

const COLUMN_AREA_OVERHEAD = 96 + LABEL_COLUMN_WIDTH;

function groupResourcesByLevel(resources: { name: string }[]): Map<string, { name: string }[]> {
    const groups = new Map<string, { name: string }[]>();
    for (const resource of resources) {
        const level = resource.name.startsWith(CURRENCY_RESOURCE_PREFIX)
            ? 'currency'
            : (getResourceByName(resource.name)?.level ?? 'raw');
        const existing = groups.get(level) ?? [];
        existing.push(resource);
        groups.set(level, existing);
    }
    return groups;
}

const LEVEL_ORDER = ['raw', 'refined', 'manufactured', 'services', 'currency'] as const;

const MARKET_LEVEL_LABELS: Record<string, string> = {
    ...RESOURCE_LEVEL_LABELS,
    currency: 'Currency',
    all: 'All',
};

function getLevelForResource(resourceName: string): string {
    if (resourceName.startsWith(CURRENCY_RESOURCE_PREFIX)) {
        return 'currency';
    }
    return getResourceByName(resourceName)?.level ?? 'raw';
}

export default function MarketPanel({
    agentId,
    planetId,
    assets,
    allPlanetDeposits,
    showAll,
}: Props): React.ReactElement {
    const cardRef = useRef<HTMLDivElement>(null);
    const visibleColumns = useVisibleColumns(cardRef, COLUMN_AREA_OVERHEAD);

    const {
        openItem,
        onValueChange: handleOpenChange,
        hashItem,
    } = useHashAccordion({ toSlug: resourceNameToSlug, fromSlug: slugToResourceName });

    const trpc = useTRPC();

    const { data: overviewData } = useSimulationQuery(
        trpc.simulation.getPlanetMarketOverview.queryOptions({ planetId: planetId, average: false }),
    );

    const { data: planetNameData } = useSimulationQuery(trpc.simulation.getListOfPlanets.queryOptions());

    const availableCurrencies = useMemo(
        () =>
            (planetNameData?.planets ?? [])
                .filter((p) => p.planetId !== planetId)
                .map((p) => ({ name: getCurrencyResourceName(p.planetId) })),
        [planetNameData, planetId],
    );
    const overviewRows: Record<string, MarketOverviewRow> = useMemo(() => {
        const map: Record<string, MarketOverviewRow> = {};
        for (const row of overviewData?.rows ?? []) {
            map[row.resourceName] = row;
        }
        return map;
    }, [overviewData]);

    const market = assets.market;
    const buyBids = market?.buy ?? {};
    const sellOffers = market?.sell ?? {};

    const resources = useMemo(
        () => buildResourceList(assets, showAll, hashItem ? [hashItem] : [], availableCurrencies),
        [showAll, assets, hashItem, availableCurrencies],
    );

    const resourceGroups = useMemo(() => {
        const groups = groupResourcesByLevel(resources);

        const levelGroups = LEVEL_ORDER.map((level) => ({
            level,
            label: MARKET_LEVEL_LABELS[level] ?? level,
            resources: groups.get(level) ?? [],
        }));
        if (resources.length > 0) {
            return [{ level: 'all', label: 'All', resources }, ...levelGroups];
        }
        return levelGroups;
    }, [resources]);

    const [activeTab, setActiveTab] = useState<string>(() => {
        if (typeof window === 'undefined') {
            return resourceGroups[0]?.level ?? LEVEL_ORDER[0];
        }
        const hash = window.location.hash.slice(1);
        if (!hash) {
            return resourceGroups[0]?.level ?? LEVEL_ORDER[0];
        }
        if (hash === 'all') {
            return 'all';
        }
        if ((LEVEL_ORDER as readonly string[]).includes(hash)) {
            return hash;
        }
        const resourceName = slugToResourceName(hash);
        if (resourceName) {
            return getLevelForResource(resourceName);
        }
        return resourceGroups[0]?.level ?? LEVEL_ORDER[0];
    });

    useEffect(() => {
        const hash = window.location.hash.slice(1);
        if (!hash) {
            return;
        }
        if (hash === 'all') {
            setActiveTab('all');
            return;
        }
        if ((LEVEL_ORDER as readonly string[]).includes(hash)) {
            setActiveTab(hash);
            return;
        }
        const resourceName = slugToResourceName(hash);
        if (resourceName) {
            setActiveTab(getLevelForResource(resourceName));
        }
    }, []);

    const [localStates, setLocalStates] = useState<Record<string, LocalResourceState>>(() =>
        buildInitialState(resources, buyBids, sellOffers),
    );

    const hasAnyDirty = useMemo(
        () => Object.values(localStates).some((s) => Object.values(s.dirtyFields).some(Boolean)),
        [localStates],
    );

    useNavigationGuard(hasAnyDirty);

    useEffect(() => {
        setLocalStates((prev) => {
            const next = buildInitialState(resources, buyBids, sellOffers);
            for (const name of Object.keys(next)) {
                const p = prev[name];
                if (!p) {
                    continue;
                }

                next[name].targetBufferTicks = p.targetBufferTicks;

                if (p.dirtyFields.offerPrice) {
                    next[name].offerPrice = p.offerPrice;
                    next[name].dirtyFields.offerPrice = p.offerPrice !== next[name].savedOfferPrice;
                }
                if (p.dirtyFields.offerRetainment) {
                    next[name].offerRetainment = p.offerRetainment;
                    next[name].dirtyFields.offerRetainment = p.offerRetainment !== next[name].savedOfferRetainment;
                }
                if (p.dirtyFields.bidPrice) {
                    next[name].bidPrice = p.bidPrice;
                    next[name].dirtyFields.bidPrice = p.bidPrice !== next[name].savedBidPrice;
                }
                if (p.dirtyFields.bidStorageTarget) {
                    next[name].bidStorageTarget = p.bidStorageTarget;
                    next[name].dirtyFields.bidStorageTarget = p.bidStorageTarget !== next[name].savedBidStorageTarget;
                }
            }
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(buyBids), JSON.stringify(sellOffers), JSON.stringify(resources.map((r) => r.name))]);

    const handleLocalChange = (name: string, patch: Partial<import('./marketTypes').LocalResourceState>) => {
        setLocalStates((prev) => {
            const current = prev[name] ?? buildInitialState([{ name }], buyBids, sellOffers)[name];

            const updated = { ...current, ...patch };

            // When a saved* field is included in the patch, use the new saved value for comparison.
            // Otherwise fall back to the old saved value.
            const newSavedOfferPrice = 'savedOfferPrice' in patch ? patch.savedOfferPrice : current.savedOfferPrice;
            const newSavedOfferRetainment =
                'savedOfferRetainment' in patch ? patch.savedOfferRetainment : current.savedOfferRetainment;
            const newSavedBidPrice = 'savedBidPrice' in patch ? patch.savedBidPrice : current.savedBidPrice;
            const newSavedBidStorageTarget =
                'savedBidStorageTarget' in patch ? patch.savedBidStorageTarget : current.savedBidStorageTarget;

            const dirtyFields = { ...current.dirtyFields };

            if ('offerPrice' in patch) {
                dirtyFields.offerPrice = patch.offerPrice !== newSavedOfferPrice;
            }
            if ('offerRetainment' in patch) {
                dirtyFields.offerRetainment = patch.offerRetainment !== newSavedOfferRetainment;
            }

            if ('bidPrice' in patch) {
                dirtyFields.bidPrice = patch.bidPrice !== newSavedBidPrice;
            }
            if ('bidStorageTarget' in patch) {
                dirtyFields.bidStorageTarget = patch.bidStorageTarget !== newSavedBidStorageTarget;
            }

            return {
                ...prev,
                [name]: { ...updated, dirtyFields },
            };
        });
    };

    const [sortConfig, setSortConfig] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({
        column: null,
        direction: 'desc',
    });

    const getSortValue = (resourceName: string, column: string): number | string => {
        switch (column) {
            case 'currentStorage':
                return resourceName.startsWith(CURRENCY_RESOURCE_PREFIX)
                    ? (allPlanetDeposits?.[resourceName.slice(CURRENCY_RESOURCE_PREFIX.length)] ?? 0)
                    : (assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0);
            case 'clearingPrice':
                return overviewRows[resourceName]?.clearingPrice ?? 0;
            case 'totalProduction':
                return overviewRows[resourceName]?.totalProduction ?? 0;
            case 'totalConsumption':
                return overviewRows[resourceName]?.totalConsumption ?? 0;
            case 'totalSupply':
                return overviewRows[resourceName]?.totalSupply ?? 0;
            case 'totalDemand':
                return overviewRows[resourceName]?.totalDemand ?? 0;
            case 'totalSold':
                return overviewRows[resourceName]?.totalSold ?? 0;
            case 'priceCostRatio':
                return overviewRows[resourceName]?.priceCostRatio ?? 0;
            case 'name':
                return resourceName;
            default:
                return 0;
        }
    };

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

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        handleOpenChange(undefined);
        window.history.replaceState(null, '', `#${value}`);
    };

    return (
        <Tabs value={activeTab} onValueChange={handleTabChange} className='space-y-3'>
            <TabsList className='w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border pb-2'>
                {resourceGroups.map(({ level, label, resources: levelResources }) => (
                    <TabsTrigger
                        key={level}
                        value={level}
                        disabled={levelResources.length === 0}
                        className='bg-muted/50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed'
                    >
                        {label}
                    </TabsTrigger>
                ))}
            </TabsList>
            <Card ref={cardRef}>
                <CardContent className='p-3'>
                    {resourceGroups.map(({ level, resources: levelResources }) => (
                        <TabsContent key={level} value={level} className='mt-0'>
                            {levelResources.length === 0 ? (
                                <p className='text-sm text-muted-foreground py-4 text-center'>-empty-</p>
                            ) : (
                                <>
                                    <div className='flex items-center px-1 pb-1.5 mb-0.5 border-b'>
                                        <div className='flex flex-1 items-center gap-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none'>
                                            <div className='w-6 shrink-0' />
                                            <button
                                                onClick={() => handleColumnSort('name')}
                                                className='flex flex-1 min-w-0 items-center gap-0.5 cursor-pointer hover:text-muted-foreground truncate'
                                            >
                                                <span className='truncate'>Resource</span>
                                                {sortConfig.column === 'name' ? (
                                                    sortConfig.direction === 'asc' ? (
                                                        <ChevronUp className='w-2.5 h-2.5 shrink-0' />
                                                    ) : (
                                                        <ChevronDown className='w-2.5 h-2.5 shrink-0' />
                                                    )
                                                ) : (
                                                    <ChevronsUpDown className='w-2.5 h-2.5 shrink-0 opacity-30' />
                                                )}
                                            </button>
                                            {visibleColumns.map((column) => (
                                                <button
                                                    key={column.id}
                                                    onClick={() => handleColumnSort(column.id)}
                                                    className={`${getHeaderColumnClasses(column.id)} flex items-center justify-end gap-0.5 cursor-pointer hover:text-muted-foreground`}
                                                    title={column.title}
                                                >
                                                    <span className='truncate'>{column.label}</span>
                                                    {sortConfig.column === column.id ? (
                                                        sortConfig.direction === 'asc' ? (
                                                            <ChevronUp className='w-2.5 h-2.5 shrink-0' />
                                                        ) : (
                                                            <ChevronDown className='w-2.5 h-2.5 shrink-0' />
                                                        )
                                                    ) : (
                                                        <ChevronsUpDown className='w-2.5 h-2.5 shrink-0 opacity-30' />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                        <div className='w-4 shrink-0' />
                                    </div>
                                    <LayoutGroup>
                                        <Accordion
                                            type='single'
                                            collapsible
                                            value={openItem}
                                            onValueChange={handleOpenChange}
                                            className='w-full'
                                        >
                                            {(sortConfig.column === null
                                                ? levelResources
                                                : [...levelResources].sort((a, b) => {
                                                      const aVal = getSortValue(a.name, sortConfig.column!);
                                                      const bVal = getSortValue(b.name, sortConfig.column!);
                                                      const cmp =
                                                          typeof aVal === 'string' && typeof bVal === 'string'
                                                              ? aVal.localeCompare(bVal)
                                                              : (aVal as number) - (bVal as number);
                                                      return sortConfig.direction === 'asc' ? cmp : -cmp;
                                                  })
                                            ).map(({ name }) => (
                                                <motion.div key={name} layout>
                                                    <ResourceAccordionItem
                                                        resourceName={name}
                                                        agentId={agentId}
                                                        assets={assets}
                                                        local={
                                                            localStates[name] ??
                                                            buildInitialState([{ name }], buyBids, sellOffers)[name]
                                                        }
                                                        onLocalChange={handleLocalChange}
                                                        isOpen={openItem === name}
                                                        overviewRow={overviewRows[name]}
                                                        visibleColumns={visibleColumns}
                                                        allPlanetDeposits={allPlanetDeposits}
                                                    />
                                                </motion.div>
                                            ))}
                                        </Accordion>{' '}
                                    </LayoutGroup>
                                </>
                            )}{' '}
                        </TabsContent>
                    ))}
                </CardContent>
            </Card>
        </Tabs>
    );
}
