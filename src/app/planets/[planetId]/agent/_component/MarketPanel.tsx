'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { productImage } from '@/lib/mapResource';
import { useTRPC } from '@/lib/trpc';
import { cn, formatNumbers } from '@/lib/utils';
import { FOOD_PRICE_FLOOR } from '@/simulation/constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bot, CheckCircle2, ShoppingCart, Tag } from 'lucide-react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';

import type { MarketOverviewRow } from '@/server/controller/planet';
import { validateBuyBid, validateSellOffer } from '@/simulation/market/validation';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import type { ProductionFacility, StorageFacility } from '@/simulation/planet/storage';
import type { AgentPlanetAssets } from './useAgentPlanetDetail';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MarketBidEntry = {
    bidPrice?: number;
    bidQuantity?: number;
    bidStorageTarget?: number;
    lastBought?: number;
    lastSpent?: number;
    storageFullWarning?: boolean;
    automated?: boolean;
};

export type MarketOfferEntry = {
    offerPrice?: number;
    offerQuantity?: number;
    offerRetainment?: number;
    lastSold?: number;
    lastRevenue?: number;
    priceDirection?: number;
    automated?: boolean;
};

type LocalResourceState = {
    offerPrice: string;
    /** Retainment: keep at least this many units; sell qty = max(0, inventory - retainment). */
    offerRetainment: string;
    offerAutomated: boolean;
    bidPrice: string;
    /** Storage target: fill up to this; buy qty = max(0, target - inventory). */
    bidStorageTarget: string;
    bidAutomated: boolean;
    // UI-only helpers — not sent to server
    targetBufferTicks: string;
};

type Props = {
    agentId: string;
    planetId: string;
    assets: AgentPlanetAssets;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function priceArrow(dir?: number): { label: string; className: string } {
    if (dir === undefined) {
        return { label: '', className: '' };
    }
    if (dir > 0) {
        return { label: '↑', className: 'text-green-600 dark:text-green-400' };
    }
    if (dir < 0) {
        return { label: '↓', className: 'text-red-500 dark:text-red-400' };
    }
    return { label: '→', className: 'text-muted-foreground' };
}

/**
 * Color class for the effective buy quantity.
 * Green = target met (order inactive), yellow = partially stocked, red = far below target.
 */
function buyFulfillmentClass(inventory: number, storageTarget: number): string {
    if (storageTarget <= 0) {
        return '';
    }
    const ratio = inventory / storageTarget;
    if (ratio >= 1) {
        return 'text-green-600 dark:text-green-400';
    }
    if (ratio >= 0.5) {
        return 'text-yellow-600 dark:text-yellow-400';
    }
    return 'text-red-500 dark:text-red-400';
}

/**
 * Color class for the effective sell quantity.
 * Green = plenty above retainment (active sell), yellow = small surplus, red = nothing to sell (inactive).
 */
function sellFulfillmentClass(inventory: number, retainment: number): string {
    const effective = Math.max(0, inventory - retainment);
    if (effective <= 0) {
        return 'text-red-500 dark:text-red-400';
    }
    if (retainment <= 0 || effective > retainment) {
        return 'text-green-600 dark:text-green-400';
    }
    return 'text-yellow-600 dark:text-yellow-400';
}

/** Sum of consumption per tick (across all facilities) for a given input resource. */
function consumptionPerTick(facilities: ProductionFacility[], resourceName: string): number {
    return facilities.reduce((sum, f) => {
        const need = f.needs.find((n) => n.resource.name === resourceName);
        return need ? sum + need.quantity * f.scale : sum;
    }, 0);
}

/** Sum of production per tick (across all facilities) for a given output resource. */
function productionPerTick(facilities: ProductionFacility[], resourceName: string): number {
    return facilities.reduce((sum, f) => {
        const prod = f.produces.find((p) => p.resource.name === resourceName);
        return prod ? sum + prod.quantity * f.scale : sum;
    }, 0);
}

/** Get resource object by name */
function getResourceByName(resourceName: string) {
    return ALL_RESOURCES.find((r) => r.name === resourceName);
}

/** Convert resource name to URL slug (inverse of slugToResourceName) */
function resourceNameToSlug(resourceName: string): string {
    return resourceName.toLowerCase().replace(/\s+/g, '-');
}

/* ------------------------------------------------------------------ */
/*  Market status classification                                       */
/* ------------------------------------------------------------------ */

type MarketStatus = 'balanced' | 'mostly' | 'partial-shortage' | 'shortage' | 'oversupply' | 'no-demand';

const OVERSUPPLY_RATIO_THRESHOLD = 2;

function classifyMarket(row: MarketOverviewRow): MarketStatus {
    const { totalSupply, totalDemand, fillRatio } = row;
    if (totalDemand === 0 && totalSupply > 0) {
        return 'no-demand';
    }
    if (totalDemand > 0 && totalSupply / totalDemand >= OVERSUPPLY_RATIO_THRESHOLD) {
        return 'oversupply';
    }
    if (fillRatio >= 0.999) {
        return 'balanced';
    }
    if (fillRatio >= 0.8) {
        return 'mostly';
    }
    if (fillRatio >= 0.5) {
        return 'partial-shortage';
    }
    return 'shortage';
}

const MARKET_STATUS_CONFIG: Record<MarketStatus, { label: string; className: string }> = {
    'balanced': { label: 'Full', className: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30' },
    'mostly': {
        label: 'Mostly',
        className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
    },
    'partial-shortage': {
        label: 'Partial',
        className: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30',
    },
    'shortage': { label: 'Shortage', className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30' },
    'oversupply': {
        label: 'Oversupply',
        className: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
    },
    'no-demand': {
        label: 'No demand',
        className: 'bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/30',
    },
};

/** Build the deduplicated list of resources to show. */
function buildResourceList(
    facilities: ProductionFacility[],
    buyBids: Record<string, MarketBidEntry>,
    sellOffers: Record<string, MarketOfferEntry>,
    storageFacility: StorageFacility,
    showAll: boolean,
): { name: string }[] {
    if (showAll) {
        return ALL_RESOURCES.filter((r) => r.form !== 'landBoundResource').map((r) => ({ name: r.name }));
    }

    const seen = new Set<string>();
    const result: { name: string }[] = [];

    const add = (name: string) => {
        if (!seen.has(name)) {
            seen.add(name);
            result.push({ name });
        }
    };

    // Facility inputs and outputs
    for (const f of facilities) {
        for (const { resource } of f.needs) {
            if (resource.form !== 'landBoundResource') {
                add(resource.name);
            }
        }
        for (const { resource } of f.produces) {
            if (resource.form !== 'landBoundResource') {
                add(resource.name);
            }
        }
    }
    // Existing bids / offers
    for (const name of Object.keys(buyBids)) {
        add(name);
    }
    for (const name of Object.keys(sellOffers)) {
        add(name);
    }
    // Stuff already in storage
    for (const [name, entry] of Object.entries(storageFacility.currentInStorage)) {
        if ((entry?.quantity ?? 0) > 0) {
            add(name);
        }
    }

    return result;
}

function buildInitialState(
    resources: { name: string }[],
    buyBids: Record<string, MarketBidEntry>,
    sellOffers: Record<string, MarketOfferEntry>,
): Record<string, LocalResourceState> {
    const result: Record<string, LocalResourceState> = {};
    for (const { name } of resources) {
        const bid = buyBids[name];
        const offer = sellOffers[name];
        result[name] = {
            offerPrice: offer?.offerPrice !== undefined ? String(offer.offerPrice) : '',
            offerRetainment: offer?.offerRetainment !== undefined ? String(Math.round(offer.offerRetainment)) : '',
            offerAutomated: offer?.automated ?? false,
            bidPrice: bid?.bidPrice !== undefined ? String(bid.bidPrice) : '',
            bidStorageTarget: bid?.bidStorageTarget !== undefined ? String(Math.round(bid.bidStorageTarget)) : '',
            bidAutomated: bid?.automated ?? false,
            targetBufferTicks: '',
        };
    }
    return result;
}

/* ------------------------------------------------------------------ */
/*  Sub-component: KPI trigger row                                     */
/* ------------------------------------------------------------------ */

function ResourceTrigger({
    name,
    bid,
    offer,
    overviewRow,
}: {
    name: string;
    bid?: MarketBidEntry;
    offer?: MarketOfferEntry;
    overviewRow?: MarketOverviewRow;
}): React.ReactElement {
    const marketStatus = overviewRow ? classifyMarket(overviewRow) : undefined;
    const statusConfig = marketStatus ? MARKET_STATUS_CONFIG[marketStatus] : undefined;
    const hasActiveBid = bid?.bidPrice !== undefined || bid?.bidStorageTarget !== undefined;
    const hasActiveOffer = offer?.offerPrice !== undefined || offer?.offerRetainment !== undefined;

    return (
        <div className='flex flex-1 items-center gap-2 min-w-0'>
            {/* Icon */}
            <div className='relative h-6 w-6 shrink-0'>
                <Image
                    src={productImage(name)}
                    alt={name}
                    fill
                    sizes='24px'
                    className='object-contain'
                    onError={() => {
                        /* silently skip */
                    }}
                />
            </div>

            {/* Name + market link + order indicators */}
            <div className='flex-1 min-w-0 flex items-center gap-1'>
                <span className='text-sm font-medium truncate'>{name}</span>
                {(hasActiveBid || hasActiveOffer || bid?.automated || offer?.automated || bid?.storageFullWarning) && (
                    <div className='flex items-center gap-0.5 ml-0.5 shrink-0'>
                        {hasActiveBid && (
                            <span
                                className='h-1.5 w-1.5 rounded-full bg-blue-500'
                                title={bid?.automated ? 'Auto buy' : 'Active buy bid'}
                            />
                        )}
                        {hasActiveOffer && (
                            <span
                                className='h-1.5 w-1.5 rounded-full bg-green-500'
                                title={offer?.automated ? 'Auto sell' : 'Active sell offer'}
                            />
                        )}
                        {(bid?.automated || offer?.automated) && <Bot className='h-3 w-3 text-purple-500' />}
                        {bid?.storageFullWarning && (
                            <Badge variant='destructive' className='text-[9px] px-1 py-0 h-3.5'>
                                full
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            {/* ── Market stats — fixed-width columns, aligned with header ── */}
            {overviewRow ? (
                <>
                    <span
                        className='w-14 text-right text-[11px] tabular-nums font-semibold text-foreground shrink-0'
                        title='Clearing price'
                    >
                        {overviewRow.clearingPrice.toFixed(2)}
                    </span>
                    <span
                        className={cn(
                            'w-12 text-right text-[11px] tabular-nums shrink-0 hidden sm:inline-block',
                            overviewRow.totalProduction === 0 ? 'text-muted-foreground/30' : 'text-muted-foreground',
                        )}
                        title='Total production'
                    >
                        {formatNumbers(overviewRow.totalProduction)}
                    </span>
                    <span
                        className={cn(
                            'w-14 text-right text-[11px] tabular-nums shrink-0 hidden md:inline-block',
                            overviewRow.totalSupply === 0 ? 'text-muted-foreground/30' : 'text-muted-foreground',
                        )}
                        title='Total supply'
                    >
                        {formatNumbers(overviewRow.totalSupply)}
                    </span>
                    <span
                        className={cn(
                            'w-14 text-right text-[11px] tabular-nums shrink-0 hidden md:inline-block',
                            overviewRow.totalDemand === 0 ? 'text-muted-foreground/30' : 'text-muted-foreground',
                        )}
                        title='Total demand'
                    >
                        {formatNumbers(overviewRow.totalDemand)}
                    </span>
                    <span
                        className={cn(
                            'w-12 text-right text-[11px] tabular-nums shrink-0 hidden sm:inline-block',
                            overviewRow.totalSold === 0 ? 'text-muted-foreground/30' : 'text-muted-foreground',
                        )}
                        title='Total sold'
                    >
                        {formatNumbers(overviewRow.totalSold)}
                    </span>
                    <div className='w-[4.5rem] shrink-0 flex justify-end' title='Market fill status'>
                        {statusConfig && (
                            <Badge
                                variant='outline'
                                className={cn('text-[9px] px-1.5 py-0 h-5', statusConfig.className)}
                            >
                                {statusConfig.label}
                            </Badge>
                        )}
                    </div>
                </>
            ) : (
                /* No overview data yet — preserve column widths so rows don't shift */
                <>
                    <div className='w-14 shrink-0' />
                    <div className='w-12 shrink-0 hidden sm:block' />
                    <div className='w-14 shrink-0 hidden md:block' />
                    <div className='w-14 shrink-0 hidden md:block' />
                    <div className='w-12 shrink-0 hidden sm:block' />
                    <div className='w-[4.5rem] shrink-0 flex justify-end'>
                        <span className='text-[10px] text-muted-foreground/30 italic'>—</span>
                    </div>
                </>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Sub-component: one resource accordion item                         */
/* ------------------------------------------------------------------ */

function ResourceAccordionItem({
    resourceName,
    agentId,
    assets,
    local,
    onLocalChange,
    _isOpen,
    overviewRow,
}: {
    resourceName: string;
    agentId: string;
    assets: AgentPlanetAssets;
    local: LocalResourceState;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    _isOpen: boolean;
    overviewRow?: MarketOverviewRow;
}): React.ReactElement {
    const bid = assets.market?.buy[resourceName];
    const offer = assets.market?.sell[resourceName];
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const consumedPerTick = consumptionPerTick(assets.productionFacilities, resourceName);
    const producedPerTick = productionPerTick(assets.productionFacilities, resourceName);
    const deposits = assets.deposits;
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    // useParams returns route params; cast to access the dynamic segment
    const { planetId } = useParams() as { planetId: string };

    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const resource = getResourceByName(resourceName);

    // ── Mutations ──────────────────────────────────────────────────────
    const sellMutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onSuccess: () => {
                setSuccessMsg('Saved. Changes take effect on the next tick.');
                setErrorMsg(null);
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.getAgentPlanetDetail.queryKey() });
            },
            onError: (err) => {
                setErrorMsg(err instanceof Error ? err.message : 'Failed to save');
                setSuccessMsg(null);
            },
        }),
    );

    const buyMutation = useMutation(
        trpc.setBuyBids.mutationOptions({
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: trpc.simulation.getAgentPlanetDetail.queryKey() });
            },
        }),
    );

    const saving = sellMutation.isPending || buyMutation.isPending;

    // ── Derived helpers ────────────────────────────────────────────────
    const isFacilityInput = consumedPerTick > 0;
    const isFacilityOutput = producedPerTick > 0;

    const inventoryInBuyTicks = isFacilityInput ? inventoryQty / consumedPerTick : null;

    // Buffer calculator: translate ticks → storage target
    const targetBuffer = parseFloat(local.targetBufferTicks);
    const suggestedStorageTarget =
        isFacilityInput && !isNaN(targetBuffer) && targetBuffer >= 0 ? Math.ceil(targetBuffer * consumedPerTick) : null;

    // Effective quantities derived from retainment / storage-target settings
    const effectiveBuyQty =
        bid?.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - inventoryQty) : undefined;
    const effectiveSellQty =
        offer?.offerRetainment !== undefined ? Math.max(0, inventoryQty - offer.offerRetainment) : undefined;

    // Retainment presets for sell: 0 = sell all, or N ticks of production
    const retainmentPresets =
        isFacilityOutput && producedPerTick > 0
            ? ([
                  { label: '0', qty: 0 },
                  { label: '5 ticks', qty: Math.ceil(producedPerTick * 5) },
                  { label: '10 ticks', qty: Math.ceil(producedPerTick * 10) },
              ] as const)
            : inventoryQty > 0
              ? ([{ label: '0', qty: 0 }] as const)
              : null;

    // Sell section is only active when there's something to sell
    const canSell =
        inventoryQty > 0 || isFacilityOutput || offer?.offerPrice !== undefined || offer?.offerRetainment !== undefined;

    // ── Validation + save ──────────────────────────────────────────────
    const handleSave = () => {
        setSuccessMsg(null);
        setErrorMsg(null);

        if (!resource) {
            setErrorMsg(`Unknown resource: ${resourceName}`);
            return;
        }

        const offerPrice = parseFloat(local.offerPrice);
        const offerRetainment = parseFloat(local.offerRetainment);
        const bidPrice = parseFloat(local.bidPrice);
        const bidStorageTarget = parseFloat(local.bidStorageTarget);

        // Validate sell price only (retainment just needs to be ≥ 0)
        if (!isNaN(offerPrice)) {
            const validation = validateSellOffer(!isNaN(offerPrice) ? offerPrice : undefined, undefined, inventoryQty);
            if (!validation.isValid) {
                setErrorMsg(`Sell validation failed: ${validation.error}`);
                return;
            }
        }

        // Validate bid price and effective quantity against deposits and storage capacity.
        if (!isNaN(bidPrice) || !isNaN(bidStorageTarget)) {
            const validation = validateBuyBid(
                {
                    bidPrice: isNaN(bidPrice) ? undefined : bidPrice,
                    bidStorageTarget: isNaN(bidStorageTarget) ? undefined : bidStorageTarget,
                },
                resource,
                assets,
            );
            if (!validation.isValid) {
                let errorText = validation.error;
                if (errorText && errorText.includes('Insufficient deposits')) {
                    errorText = `${errorText}. You can borrow funds on the <a href="/planets/${planetId}/agent/${agentId}/financial" class="underline font-medium hover:text-blue-700">Financial page</a>.`;
                }
                setErrorMsg(`Buy validation failed: ${errorText}`);
                return;
            }
        }

        const sellPayload: Record<string, { offerPrice?: number; offerRetainment?: number; automated?: boolean }> = {
            [resourceName]: {
                ...(local.offerAutomated !== (offer?.automated ?? false) && { automated: local.offerAutomated }),
                ...(!isNaN(offerPrice) && offerPrice >= FOOD_PRICE_FLOOR && { offerPrice }),
                ...(!isNaN(offerRetainment) && offerRetainment >= 0 && { offerRetainment }),
            },
        };

        const buyPayload: Record<string, { bidPrice?: number; bidStorageTarget?: number; automated?: boolean }> = {
            [resourceName]: {
                ...(local.bidAutomated !== (bid?.automated ?? false) && { automated: local.bidAutomated }),
                ...(!isNaN(bidPrice) && bidPrice > 0 && { bidPrice }),
                ...(!isNaN(bidStorageTarget) && bidStorageTarget >= 0 && { bidStorageTarget }),
            },
        };

        sellMutation.mutate({ agentId, planetId, offers: sellPayload });
        buyMutation.mutate({ agentId, planetId, bids: buyPayload });
    };

    const totalBidCost =
        (bid?.bidPrice ?? 0) *
        (bid?.bidStorageTarget !== undefined
            ? Math.max(0, bid.bidStorageTarget - inventoryQty)
            : (bid?.bidQuantity ?? 0));
    const fundsWarning = totalBidCost > 0 && deposits < totalBidCost;

    return (
        <AccordionItem value={resourceName}>
            <AccordionTrigger className='hover:no-underline px-1'>
                <ResourceTrigger name={resourceName} bid={bid} offer={offer} overviewRow={overviewRow} />
            </AccordionTrigger>
            <AccordionContent>
                <div className='px-1 pb-2 space-y-5'>
                    {/* ── BUY section ── */}
                    <div className='space-y-3'>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs font-semibold flex items-center gap-1.5'>
                                <ShoppingCart className='h-3.5 w-3.5 text-muted-foreground' /> Buy
                            </span>
                            <div className='flex items-center gap-2'>
                                <Label
                                    htmlFor={`bid-auto-${resourceName}`}
                                    className='text-[11px] text-muted-foreground cursor-pointer'
                                >
                                    Auto-manage
                                </Label>
                                <Switch
                                    id={`bid-auto-${resourceName}`}
                                    checked={local.bidAutomated}
                                    disabled={saving}
                                    onCheckedChange={(v) => onLocalChange(resourceName, { bidAutomated: v })}
                                />
                            </div>
                        </div>
                        {isFacilityInput && (
                            <div className='flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px] tabular-nums text-muted-foreground'>
                                <span>
                                    Max capacity consumption{' '}
                                    <span className='font-semibold text-foreground'>
                                        {formatNumbers(consumedPerTick)}/tick
                                    </span>
                                </span>
                            </div>
                        )}

                        <div className='grid grid-cols-2 gap-3'>
                            {/* Max price box */}
                            <div className='rounded-md border bg-muted/30 p-2.5 space-y-1.5'>
                                <Label
                                    htmlFor={`bid-price-${resourceName}`}
                                    className='text-[11px] text-muted-foreground'
                                >
                                    Max price / unit
                                </Label>
                                <Input
                                    id={`bid-price-${resourceName}`}
                                    type='number'
                                    min={0.01}
                                    step='any'
                                    placeholder={bid?.bidPrice !== undefined ? bid.bidPrice.toFixed(2) : 'e.g. 1.50'}
                                    value={local.bidPrice}
                                    disabled={local.bidAutomated || saving}
                                    onChange={(e) => onLocalChange(resourceName, { bidPrice: e.target.value })}
                                    className='h-8 text-sm tabular-nums'
                                />
                                {overviewRow && !local.bidAutomated && (
                                    <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                                        <span>Clearing: {overviewRow.clearingPrice.toFixed(2)}</span>
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            className='h-5 text-[10px] px-1.5 py-0'
                                            disabled={saving}
                                            onClick={() =>
                                                onLocalChange(resourceName, {
                                                    bidPrice: overviewRow.clearingPrice.toFixed(2),
                                                })
                                            }
                                        >
                                            Use
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Storage-target box + buffer calculator */}
                            <div className='rounded-md border bg-muted/30 p-2.5 space-y-1.5'>
                                <Label
                                    htmlFor={`bid-target-${resourceName}`}
                                    className='text-[11px] text-muted-foreground'
                                >
                                    Storage target
                                </Label>
                                <Input
                                    id={`bid-target-${resourceName}`}
                                    type='number'
                                    min={0}
                                    step={1}
                                    placeholder={
                                        bid?.bidStorageTarget !== undefined
                                            ? String(Math.round(bid.bidStorageTarget))
                                            : 'e.g. 500'
                                    }
                                    value={local.bidStorageTarget}
                                    disabled={local.bidAutomated || saving}
                                    onChange={(e) => onLocalChange(resourceName, { bidStorageTarget: e.target.value })}
                                    className='h-8 w-32 text-sm tabular-nums'
                                />
                                {/* Effective buy qty with fulfillment colour */}
                                {bid?.bidStorageTarget !== undefined && effectiveBuyQty !== undefined && (
                                    <div
                                        className={`text-[11px] tabular-nums font-medium ${buyFulfillmentClass(inventoryQty, bid.bidStorageTarget)}`}
                                    >
                                        {effectiveBuyQty === 0
                                            ? 'Target met — order inactive'
                                            : `Buy ${formatNumbers(effectiveBuyQty)} / tick`}
                                    </div>
                                )}
                                {isFacilityInput && (
                                    <div className='space-y-1 text-[11px] text-muted-foreground'>
                                        <div>
                                            {formatNumbers(consumedPerTick)}/tick · Stock: {formatNumbers(inventoryQty)}
                                            {inventoryInBuyTicks !== null && (
                                                <span className='ml-1'>({inventoryInBuyTicks.toFixed(1)} ticks)</span>
                                            )}
                                        </div>
                                        <div className='flex items-center gap-1.5'>
                                            <Label
                                                htmlFor={`buf-ticks-${resourceName}`}
                                                className='text-[11px] text-muted-foreground shrink-0'
                                            >
                                                Target (ticks)
                                            </Label>
                                            <Input
                                                id={`buf-ticks-${resourceName}`}
                                                type='number'
                                                min={0}
                                                step={1}
                                                placeholder='e.g. 30'
                                                value={local.targetBufferTicks}
                                                disabled={local.bidAutomated || saving}
                                                onChange={(e) =>
                                                    onLocalChange(resourceName, {
                                                        targetBufferTicks: e.target.value,
                                                    })
                                                }
                                                className='h-6 w-32 text-[11px] tabular-nums'
                                            />
                                            {suggestedStorageTarget !== null && (
                                                <>
                                                    <span>→ {formatNumbers(suggestedStorageTarget)}</span>
                                                    <Button
                                                        variant='outline'
                                                        className='h-6 text-[11px] px-1.5'
                                                        disabled={local.bidAutomated || saving}
                                                        onClick={() =>
                                                            onLocalChange(resourceName, {
                                                                bidStorageTarget: String(suggestedStorageTarget),
                                                            })
                                                        }
                                                    >
                                                        Use
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {(bid?.lastBought !== undefined || bid?.lastSpent !== undefined) && (
                            <div className='text-[11px] text-muted-foreground tabular-nums flex gap-3'>
                                {bid.lastBought !== undefined && (
                                    <span>Last bought: {formatNumbers(bid.lastBought)}</span>
                                )}
                                {bid.lastSpent !== undefined && <span>Spent: {formatNumbers(bid.lastSpent)}</span>}
                            </div>
                        )}

                        {fundsWarning && (
                            <Alert variant='destructive' className='py-2'>
                                <AlertCircle className='h-3.5 w-3.5' />
                                <AlertDescription className='text-xs'>
                                    Bid cost ({formatNumbers(totalBidCost)}) exceeds available deposits (
                                    {formatNumbers(deposits)}).
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    <div className='border-t' />

                    {/* ── SELL section ── */}
                    <div className={`space-y-3 ${!canSell ? 'opacity-50 pointer-events-none' : ''}`}>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs font-semibold flex items-center gap-1.5'>
                                <Tag className='h-3.5 w-3.5 text-muted-foreground' /> Sell
                                {!canSell && (
                                    <span className='text-[10px] font-normal text-muted-foreground'>
                                        — nothing to sell
                                    </span>
                                )}
                            </span>
                            <div className='flex items-center gap-2'>
                                <Label
                                    htmlFor={`offer-auto-${resourceName}`}
                                    className='text-[11px] text-muted-foreground cursor-pointer'
                                >
                                    Auto-manage
                                </Label>
                                <Switch
                                    id={`offer-auto-${resourceName}`}
                                    checked={local.offerAutomated}
                                    disabled={saving || !canSell}
                                    onCheckedChange={(v) => onLocalChange(resourceName, { offerAutomated: v })}
                                />
                            </div>
                        </div>

                        {isFacilityOutput && (
                            <div className='flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px] tabular-nums text-muted-foreground'>
                                <span>
                                    Max capacity production{' '}
                                    <span className='font-semibold text-foreground'>
                                        {formatNumbers(producedPerTick)}/tick
                                    </span>
                                </span>
                            </div>
                        )}

                        <div className='grid grid-cols-2 gap-3'>
                            {/* Price / unit box */}
                            <div className='rounded-md border bg-muted/30 p-2.5 space-y-1.5'>
                                <Label
                                    htmlFor={`offer-price-${resourceName}`}
                                    className='text-[11px] text-muted-foreground'
                                >
                                    Price / unit
                                </Label>
                                <Input
                                    id={`offer-price-${resourceName}`}
                                    type='number'
                                    min={FOOD_PRICE_FLOOR}
                                    step='any'
                                    placeholder={
                                        offer?.offerPrice !== undefined ? offer.offerPrice.toFixed(2) : 'e.g. 1.50'
                                    }
                                    value={local.offerPrice}
                                    disabled={local.offerAutomated || saving}
                                    onChange={(e) => onLocalChange(resourceName, { offerPrice: e.target.value })}
                                    className='h-8 text-sm tabular-nums'
                                />
                                {overviewRow && !local.offerAutomated && (
                                    <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                                        <span>Clearing: {overviewRow.clearingPrice.toFixed(2)}</span>
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            className='h-5 text-[10px] px-1.5 py-0'
                                            disabled={saving}
                                            onClick={() =>
                                                onLocalChange(resourceName, {
                                                    offerPrice: overviewRow.clearingPrice.toFixed(2),
                                                })
                                            }
                                        >
                                            Use
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Retainment box + presets */}
                            <div className='rounded-md border bg-muted/30 p-2.5 space-y-1.5'>
                                <Label
                                    htmlFor={`offer-retainment-${resourceName}`}
                                    className='text-[11px] text-muted-foreground'
                                >
                                    Retainment (keep ≥)
                                </Label>
                                <Input
                                    id={`offer-retainment-${resourceName}`}
                                    type='number'
                                    min={0}
                                    step={1}
                                    placeholder={
                                        offer?.offerRetainment !== undefined
                                            ? String(Math.round(offer.offerRetainment))
                                            : 'e.g. 0'
                                    }
                                    value={local.offerRetainment}
                                    disabled={local.offerAutomated || saving}
                                    onChange={(e) => onLocalChange(resourceName, { offerRetainment: e.target.value })}
                                    className='h-8 text-sm tabular-nums'
                                />
                                {/* Effective sell qty with fulfillment colour */}
                                {offer?.offerRetainment !== undefined && effectiveSellQty !== undefined && (
                                    <div
                                        className={`text-[11px] tabular-nums font-medium ${sellFulfillmentClass(inventoryQty, offer.offerRetainment)}`}
                                    >
                                        {effectiveSellQty === 0
                                            ? 'Nothing to sell — order inactive'
                                            : `Sell ${formatNumbers(effectiveSellQty)} / tick`}
                                    </div>
                                )}
                                {retainmentPresets && !local.offerAutomated && (
                                    <div className='flex items-center gap-1 text-[11px] text-muted-foreground'>
                                        <span className='shrink-0'>Keep:</span>
                                        <div className='flex gap-1 ml-auto'>
                                            {retainmentPresets.map(({ label, qty }) => (
                                                <Button
                                                    key={label}
                                                    variant='outline'
                                                    size='sm'
                                                    className='h-5 text-[10px] px-1.5 py-0'
                                                    disabled={saving}
                                                    onClick={() =>
                                                        onLocalChange(resourceName, {
                                                            offerRetainment: String(qty),
                                                        })
                                                    }
                                                >
                                                    {label}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {(offer?.lastSold !== undefined || offer?.lastRevenue !== undefined) && (
                            <div className='text-[11px] text-muted-foreground tabular-nums flex gap-3'>
                                {offer.lastSold !== undefined && (
                                    <span>Last sold: {formatNumbers(offer.lastSold)}</span>
                                )}
                                {offer.lastRevenue !== undefined && (
                                    <span>Revenue: {formatNumbers(offer.lastRevenue)}</span>
                                )}
                                {offer.priceDirection !== undefined &&
                                    (() => {
                                        const a = priceArrow(offer.priceDirection);
                                        return a.label ? <span className={a.className}>{a.label}</span> : null;
                                    })()}
                            </div>
                        )}
                    </div>

                    {/* ── Save button + feedback ── */}
                    <div className='flex items-center justify-between gap-3'>
                        <div>
                            {successMsg && (
                                <span className='text-xs text-green-600 dark:text-green-400 flex items-center gap-1'>
                                    <CheckCircle2 className='h-3.5 w-3.5' /> {successMsg}
                                </span>
                            )}
                            {errorMsg && (
                                <span className='text-xs text-destructive flex items-center gap-1'>
                                    <AlertCircle className='h-3.5 w-3.5' />
                                    <span dangerouslySetInnerHTML={{ __html: errorMsg }} />
                                </span>
                            )}
                        </div>
                        <Button size='sm' onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

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

    const [localStates, setLocalStates] = useState<Record<string, LocalResourceState>>(() =>
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

    const handleLocalChange = (name: string, patch: Partial<LocalResourceState>) => {
        setLocalStates((prev) => ({
            ...prev,
            [name]: { ...(prev[name] ?? buildInitialState([{ name }], buyBids, sellOffers)[name]), ...patch },
        }));
    };

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
                        {/* ── Column header — same flex + gap-2 + column widths as ResourceTrigger ── */}
                        <div className='flex items-center px-1 pb-1.5 mb-0.5 border-b'>
                            <div className='flex flex-1 items-center gap-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none'>
                                <div className='w-6 shrink-0' />
                                <span className='flex-1 min-w-0'>Resource</span>
                                <span className='w-14 text-right' title='Clearing price'>
                                    Price
                                </span>
                                <span className='w-12 text-right hidden sm:block' title='Total production'>
                                    Prod
                                </span>
                                <span className='w-14 text-right hidden md:block' title='Total supply'>
                                    Supply
                                </span>
                                <span className='w-14 text-right hidden md:block' title='Total demand'>
                                    Demand
                                </span>
                                <span className='w-12 text-right hidden sm:block' title='Total sold'>
                                    Sold
                                </span>
                                <span className='w-[4.5rem] text-right' title='Market fill'>
                                    Fill
                                </span>
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
