'use client';

import { Accordion } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import React, { useEffect, useMemo, useState } from 'react';

import type { MarketOverviewRow } from '@/server/controller/planet';
import type { Props } from './marketTypes';
import { buildResourceList, buildInitialState } from './marketHelpers';
import ResourceAccordionItem from './ResourceAccordionItem';
import { getEnabledColumns, getHeaderColumnClasses } from './columnConfig';

export default function MarketPanel({ agentId, planetId: _planetId, assets }: Props): React.ReactElement {
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

    const [localStates, setLocalStates] = useState<Record<string, import('./marketTypes').LocalResourceState>>(() =>
        buildInitialState(resources, buyBids, sellOffers),
    );

    // Re-sync local state when server data changes (a new tick arrived)
    useEffect(() => {
        setLocalStates((prev) => {
            const next = buildInitialState(resources, buyBids, sellOffers);
            // Preserve in-progress UI-only fields
            for (const name of Object.keys(next)) {
                const p = prev[name];
                if (p) {
                    next[name].targetBufferTicks = p.targetBufferTicks;
                }
            }
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(buyBids), JSON.stringify(sellOffers), JSON.stringify(resources.map((r) => r.name))]);

    const handleLocalChange = (name: string, patch: Partial<import('./marketTypes').LocalResourceState>) => {
        setLocalStates((prev) => ({
            ...prev,
            [name]: { ...(prev[name] ?? buildInitialState([{ name }], buyBids, sellOffers)[name]), ...patch },
        }));
    };

    const columns = getEnabledColumns();

    return (
        <Card>
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

                {resources.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                        No resources to display. Build a facility or enable &quot;Show all resources&quot;.
                    </p>
                ) : (
                    <>
                        {/* ── Column header — using column configuration ── */}
                        <div className='flex items-center px-1 pb-1.5 mb-0.5 border-b'>
                            <div className='flex flex-1 items-center gap-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none'>
                                <div className='w-6 shrink-0' />
                                <span className='flex-1 min-w-0'>Resource</span>
                                {columns.map((column) => (
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
                        <Accordion type='multiple' value={openItems} onValueChange={setOpenItems} className='w-full'>
                            {resources.map(({ name }) => (
                                <ResourceAccordionItem
                                    key={name}
                                    resourceName={name}
                                    agentId={agentId}
                                    assets={assets}
                                    local={
                                        localStates[name] ?? buildInitialState([{ name }], buyBids, sellOffers)[name]
                                    }
                                    onLocalChange={handleLocalChange}
                                    _isOpen={openItems.includes(name)}
                                    overviewRow={overviewRows[name]}
                                />
                            ))}
                        </Accordion>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
