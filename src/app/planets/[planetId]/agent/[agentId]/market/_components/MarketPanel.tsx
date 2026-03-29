'use client';

import { Accordion } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useNavigationGuard } from '@/hooks/useNavigationGuard';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { MarketOverviewRow } from '@/server/controller/planet';
import type { Props } from './marketTypes';
import { buildResourceList, buildInitialState, getResourceByName } from './marketHelpers';
import ResourceAccordionItem from './ResourceAccordionItem';
import { getHeaderColumnClasses } from '../../../_component/columnConfig';
import { RESOURCE_LEVEL_LABELS } from '@/simulation/planet/resourceCatalog';
import { useVisibleColumns } from '../../../_component/useVisibleColumns';

// Fixed pixel overhead for non-column content in each row:
// card p-3 (24) + trigger px-1 (8) + icon w-6/32px (32) + gap-2 (8) + min name (80) + gap-2 (8) + chevron w-4 (16) ≈ 176
const COLUMN_AREA_OVERHEAD = 180;

// Helper function to group resources by level
function groupResourcesByLevel(resources: { name: string }[]): Map<string, { name: string }[]> {
    const groups = new Map<string, { name: string }[]>();
    for (const resource of resources) {
        const resourceObj = getResourceByName(resource.name);
        const level = resourceObj?.level ?? 'raw'; // Default to 'raw' if level not found
        const existing = groups.get(level) ?? [];
        existing.push(resource);
        groups.set(level, existing);
    }
    return groups;
}

// Level order for display
const LEVEL_ORDER = ['raw', 'refined', 'manufactured', 'consumerGood'];

export default function MarketPanel({ agentId, planetId: _planetId, assets }: Props): React.ReactElement {
    const cardRef = useRef<HTMLDivElement>(null);
    const visibleColumns = useVisibleColumns(cardRef, COLUMN_AREA_OVERHEAD);
    const [showAll, setShowAll] = useState(false);
    const [openItems, setOpenItems] = useState<string[]>([]);
    const trpc = useTRPC();

    const { productionFacilities, storageFacility, market } = assets;

    // ── Hoisted market overview query ──────────────────────────────────
    const { data: overviewData } = useSimulationQuery(
        trpc.simulation.getPlanetMarketOverview.queryOptions({ planetId: _planetId }),
    );
    const overviewRows: Record<string, MarketOverviewRow> = useMemo(() => {
        const map: Record<string, MarketOverviewRow> = {};
        for (const row of overviewData?.rows ?? []) {
            map[row.resourceName] = row;
        }
        return map;
    }, [overviewData]);

    const buyBids = market?.buy ?? {};
    const sellOffers = market?.sell ?? {};

    const buyBidKeys = Object.keys(buyBids).join(',');
    const sellOfferKeys = Object.keys(sellOffers).join(',');
    const resources = useMemo(
        () => buildResourceList(productionFacilities, buyBids, sellOffers, storageFacility, showAll),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [showAll, buyBidKeys, sellOfferKeys, productionFacilities.length],
    );

    // Group resources by level
    const resourceGroups = useMemo(() => {
        const groups = groupResourcesByLevel(resources);
        // Filter to only include levels that have resources and sort by LEVEL_ORDER
        return LEVEL_ORDER.filter((level) => groups.has(level)).map((level) => ({
            level,
            label: RESOURCE_LEVEL_LABELS[level as keyof typeof RESOURCE_LEVEL_LABELS] ?? level,
            resources: groups.get(level)!,
        }));
    }, [resources]);

    const [localStates, setLocalStates] = useState<Record<string, import('./marketTypes').LocalResourceState>>(() =>
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

                // For each dirty field: keep the user's unsaved input but re-evaluate
                // dirtiness against the fresh server baseline (savedXxx in `next`).
                // After a successful save the server echoes back the saved value, so
                // the comparison will produce false and the dirty indicator clears.
                if (p.dirtyFields.offerPrice) {
                    next[name].offerPrice = p.offerPrice;
                    next[name].dirtyFields.offerPrice = p.offerPrice !== next[name].savedOfferPrice;
                }
                if (p.dirtyFields.offerRetainment) {
                    next[name].offerRetainment = p.offerRetainment;
                    next[name].dirtyFields.offerRetainment = p.offerRetainment !== next[name].savedOfferRetainment;
                }
                if (p.dirtyFields.offerAutomated) {
                    next[name].offerAutomated = p.offerAutomated;
                    next[name].dirtyFields.offerAutomated = p.offerAutomated !== next[name].savedOfferAutomated;
                }
                if (p.dirtyFields.bidPrice) {
                    next[name].bidPrice = p.bidPrice;
                    next[name].dirtyFields.bidPrice = p.bidPrice !== next[name].savedBidPrice;
                }
                if (p.dirtyFields.bidStorageTarget) {
                    next[name].bidStorageTarget = p.bidStorageTarget;
                    next[name].dirtyFields.bidStorageTarget = p.bidStorageTarget !== next[name].savedBidStorageTarget;
                }
                if (p.dirtyFields.bidAutomated) {
                    next[name].bidAutomated = p.bidAutomated;
                    next[name].dirtyFields.bidAutomated = p.bidAutomated !== next[name].savedBidAutomated;
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
            if ('offerAutomated' in patch) {
                dirtyFields.offerAutomated = patch.offerAutomated !== current.savedOfferAutomated;
            }
            if ('bidPrice' in patch) {
                dirtyFields.bidPrice = patch.bidPrice !== current.savedBidPrice;
            }
            if ('bidStorageTarget' in patch) {
                dirtyFields.bidStorageTarget = patch.bidStorageTarget !== current.savedBidStorageTarget;
            }
            if ('bidAutomated' in patch) {
                dirtyFields.bidAutomated = patch.bidAutomated !== current.savedBidAutomated;
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
                {/* Top bar */}
                <div className='flex items-center justify-between gap-3'>
                    <span className='text-sm font-semibold'>Market Orders</span>
                    <div className='flex items-center gap-2'>
                        <Label htmlFor='show-all-resources' className='text-xs text-muted-foreground cursor-pointer'>
                            Show all resources
                        </Label>
                        <Switch id='show-all-resources' checked={showAll} onCheckedChange={setShowAll} />
                    </div>
                </div>

                <p className='text-xs text-muted-foreground'>
                    One entry per resource. Expand to set buy bids and sell offers. Toggle{' '}
                    <span className='font-medium'>Auto-manage</span> to let the AI adjust prices and quantities each
                    tick.
                </p>

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
                                        <span className='flex-1 min-w-0'>Resource</span>
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
                                    type='multiple'
                                    value={openItems}
                                    onValueChange={setOpenItems}
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
                                            _isOpen={openItems.includes(name)}
                                            overviewRow={overviewRows[name]}
                                            visibleColumns={visibleColumns}
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
