'use client';

import { Accordion } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigationGuard } from '@/hooks/useNavigationGuard';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { MarketOverviewRow } from '@/server/controller/planet';
import { useHashAccordion } from '@/hooks/useHashAccordion';
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

// Fixed pixel overhead for non-column content in each row:
// card p-3 (24) + trigger px-1 (8) + icon (32) + gap-2 (8) + label (LABEL_COLUMN_WIDTH) + gap-2 (8) + chevron w-4 (16) = 96 + LABEL_COLUMN_WIDTH
const COLUMN_AREA_OVERHEAD = 96 + LABEL_COLUMN_WIDTH;

// Helper function to group resources by level
function groupResourcesByLevel(resources: { name: string }[]): Map<string, { name: string }[]> {
    const groups = new Map<string, { name: string }[]>();
    for (const resource of resources) {
        // Currency resources are dynamic (not in ALL_RESOURCES) — always slot them into 'currency'.
        const level = resource.name.startsWith(CURRENCY_RESOURCE_PREFIX)
            ? 'currency'
            : (getResourceByName(resource.name)?.level ?? 'raw');
        const existing = groups.get(level) ?? [];
        existing.push(resource);
        groups.set(level, existing);
    }
    return groups;
}

// Level order for display
const LEVEL_ORDER = ['raw', 'refined', 'manufactured', 'services', 'currency'] as const;

// Display labels — extends RESOURCE_LEVEL_LABELS with the dynamic 'currency' level.
const MARKET_LEVEL_LABELS: Record<string, string> = {
    ...RESOURCE_LEVEL_LABELS,
    currency: 'Currency',
    all: 'All',
};

/** Resolve the level group for any resource name, including dynamic currency resources. */
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

    // ── Hoisted market overview query ──────────────────────────────────
    const { data: overviewData } = useSimulationQuery(
        trpc.simulation.getPlanetMarketOverview.queryOptions({ planetId: planetId, average: false }),
    );

    // ── Planet summaries for currency display names and showAll currencies ──
    const { data: planetSummariesData } = useSimulationQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const planetNames = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of planetSummariesData?.planets ?? []) {
            map.set(p.planetId, p.name);
        }
        return map;
    }, [planetSummariesData]);
    const availableCurrencies = useMemo(
        () =>
            (planetSummariesData?.planets ?? [])
                .filter((p) => p.planetId !== planetId)
                .map((p) => ({ name: getCurrencyResourceName(p.planetId) })),
        [planetSummariesData, planetId],
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

    // Group resources by level
    const resourceGroups = useMemo(() => {
        const groups = groupResourcesByLevel(resources);
        // Always include all levels so tabs never vanish when showAll is toggled off.
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

    // Hydrate activeTab after Next.js soft navigation (hash may arrive after useState runs).
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

    // Re-sync local state when server data changes (a new tick arrived)
    useEffect(() => {
        setLocalStates((prev) => {
            const next = buildInitialState(resources, buyBids, sellOffers);
            for (const name of Object.keys(next)) {
                const p = prev[name];
                if (!p) {
                    continue;
                }

                // Always preserve UI-only fields that are never sent to the server
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

            // Create updated state with patch
            const updated = { ...current, ...patch };

            // Update dirty fields based on what changed
            const dirtyFields = { ...current.dirtyFields };

            // Update dirty fields for each field that was patched
            if ('offerPrice' in patch) {
                dirtyFields.offerPrice = patch.offerPrice !== current.savedOfferPrice;
            }
            if ('offerRetainment' in patch) {
                dirtyFields.offerRetainment = patch.offerRetainment !== current.savedOfferRetainment;
            }

            if ('bidPrice' in patch) {
                dirtyFields.bidPrice = patch.bidPrice !== current.savedBidPrice;
            }
            if ('bidStorageTarget' in patch) {
                dirtyFields.bidStorageTarget = patch.bidStorageTarget !== current.savedBidStorageTarget;
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
            case 'marketFill':
                return overviewRows[resourceName]?.fillRatio ?? 0;
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
                // asc → no sort
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
                                    {/* ── Column header — using column configuration ── */}
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
                                        {/* spacer matching ChevronDown w-4 in AccordionTrigger */}
                                        <div className='w-4 shrink-0' />
                                    </div>
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
                                            <ResourceAccordionItem
                                                key={name}
                                                resourceName={name}
                                                agentId={agentId}
                                                assets={assets}
                                                local={
                                                    localStates[name] ??
                                                    buildInitialState([{ name }], buyBids, sellOffers)[name]
                                                }
                                                onLocalChange={handleLocalChange}
                                                _isOpen={openItem === name}
                                                overviewRow={overviewRows[name]}
                                                visibleColumns={visibleColumns}
                                                planetNames={planetNames}
                                                allPlanetDeposits={allPlanetDeposits}
                                            />
                                        ))}
                                    </Accordion>{' '}
                                </>
                            )}{' '}
                        </TabsContent>
                    ))}
                </CardContent>
            </Card>
        </Tabs>
    );
}
