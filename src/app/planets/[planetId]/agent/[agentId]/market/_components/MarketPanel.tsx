'use client';

import { Accordion } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigationGuard } from '@/hooks/useNavigationGuard';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
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
};

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
        // Filter to only include levels that have resources and sort by LEVEL_ORDER
        return LEVEL_ORDER.filter((level) => groups.has(level)).map((level) => ({
            level,
            label: MARKET_LEVEL_LABELS[level] ?? level,
            resources: groups.get(level)!,
        }));
    }, [resources]);

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

    return (
        <Card ref={cardRef}>
            <CardContent className='p-3 space-y-3'>
                {resourceGroups.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                        No resources to display. Build a facility or enable &quot;Show all resources&quot;.
                    </p>
                ) : (
                    <div className='space-y-6'>
                        {resourceGroups.map(({ level, label, resources: levelResources }) => (
                            <div key={level} className='space-y-2'>
                                {/* Level header */}
                                <div className='px-1'>
                                    <h3 className='text-sm font-semibold text-foreground'>{label}</h3>
                                </div>

                                {/* ── Column header — using column configuration ── */}
                                <div className='flex items-center px-1 pb-1.5 mb-0.5 border-b'>
                                    <div className='flex flex-1 items-center gap-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none'>
                                        <div className='w-6 shrink-0' />
                                        <span className='flex-1 min-w-0 truncate'>Resource</span>
                                        {visibleColumns.map((column) => (
                                            <span
                                                key={column.id}
                                                className={getHeaderColumnClasses(column.id)}
                                                title={column.title}
                                            >
                                                {column.label}
                                            </span>
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
                                    {levelResources.map(({ name }) => (
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
                                </Accordion>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
