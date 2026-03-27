'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { AlertCircle, Bot, CheckCircle2, ShoppingCart, Tag } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/lib/trpc';
import { productImage } from '@/lib/mapResource';
import { formatNumbers } from '@/lib/utils';
import { FOOD_PRICE_FLOOR } from '@/simulation/constants';
import type { ProductionFacility, StorageFacility } from '@/simulation/planet/storage';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import type { AgentPlanetAssets } from './useAgentPlanetDetail';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MarketBidEntry = {
    bidPrice?: number;
    bidQuantity?: number;
    lastBought?: number;
    lastSpent?: number;
    storageFullWarning?: boolean;
    automated?: boolean;
};

export type MarketOfferEntry = {
    offerPrice?: number;
    offerQuantity?: number;
    lastSold?: number;
    lastRevenue?: number;
    priceDirection?: number;
    automated?: boolean;
};

type LocalResourceState = {
    offerPrice: string;
    offerQuantity: string;
    offerAutomated: boolean;
    bidPrice: string;
    bidQuantity: string;
    bidAutomated: boolean;
    // UI-only helpers — not sent to server
    targetBufferTicks: string;
    retainTicks: string;
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
            offerQuantity: offer?.offerQuantity !== undefined ? String(Math.round(offer.offerQuantity)) : '',
            offerAutomated: offer?.automated ?? false,
            bidPrice: bid?.bidPrice !== undefined ? String(bid.bidPrice) : '',
            bidQuantity: bid?.bidQuantity !== undefined ? String(Math.round(bid.bidQuantity)) : '',
            bidAutomated: bid?.automated ?? false,
            targetBufferTicks: '',
            retainTicks: '',
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
}: {
    name: string;
    bid?: MarketBidEntry;
    offer?: MarketOfferEntry;
}): React.ReactElement {
    const arrow = priceArrow(offer?.priceDirection);

    return (
        <div className='flex flex-1 items-center gap-3 min-w-0 py-1'>
            {/* Resource icon */}
            <div className='relative h-6 w-6 shrink-0'>
                <Image
                    src={productImage(name)}
                    alt={name}
                    fill
                    sizes='24px'
                    className='object-contain'
                    onError={() => {
                        /* silently skip missing icons */
                    }}
                />
            </div>

            {/* Resource name */}
            <span className='text-sm font-medium truncate min-w-0 flex-1'>{name}</span>

            {/* KPI pills */}
            <div className='flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground shrink-0'>
                {/* BUY side */}
                {(bid?.lastBought !== undefined || bid?.bidPrice !== undefined) && (
                    <span className='flex items-center gap-1'>
                        <ShoppingCart className='h-3 w-3' />
                        {bid.bidPrice !== undefined && <span>{bid.bidPrice.toFixed(2)}</span>}
                        {bid.lastBought !== undefined && (
                            <span className='text-blue-600 dark:text-blue-400'>{formatNumbers(bid.lastBought)}</span>
                        )}
                        {bid.automated && <Bot className='h-3 w-3 text-purple-500' />}
                        {bid.storageFullWarning && (
                            <Badge variant='destructive' className='text-[9px] px-1 py-0 h-3.5'>
                                full
                            </Badge>
                        )}
                    </span>
                )}

                {/* SELL side */}
                {(offer?.lastSold !== undefined || offer?.offerPrice !== undefined) && (
                    <span className='flex items-center gap-1'>
                        <Tag className='h-3 w-3' />
                        {offer.offerPrice !== undefined && <span>{offer.offerPrice.toFixed(2)}</span>}
                        {offer.lastSold !== undefined && (
                            <span className='text-green-600 dark:text-green-400'>{formatNumbers(offer.lastSold)}</span>
                        )}
                        {arrow.label && <span className={arrow.className}>{arrow.label}</span>}
                        {offer.automated && <Bot className='h-3 w-3 text-purple-500' />}
                    </span>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Sub-component: one resource accordion item                         */
/* ------------------------------------------------------------------ */

function ResourceAccordionItem({
    resourceName,
    agentId,
    planetId,
    bid,
    offer,
    storageFacility,
    facilities,
    deposits,
    local,
    onLocalChange,
    isPending,
}: {
    resourceName: string;
    agentId: string;
    planetId: string;
    bid?: MarketBidEntry;
    offer?: MarketOfferEntry;
    storageFacility: StorageFacility;
    facilities: ProductionFacility[];
    deposits: number;
    local: LocalResourceState;
    onLocalChange: (name: string, patch: Partial<LocalResourceState>) => void;
    isPending: boolean;
}): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

    const saving = sellMutation.isPending || buyMutation.isPending || isPending;

    const consumedPerTick = consumptionPerTick(facilities, resourceName);
    const producedPerTick = productionPerTick(facilities, resourceName);
    const isFacilityInput = consumedPerTick > 0;
    const isFacilityOutput = producedPerTick > 0;

    const inventoryQty = storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const inventoryInBuyTicks = isFacilityInput && consumedPerTick > 0 ? inventoryQty / consumedPerTick : null;
    const inventoryInSellTicks = isFacilityOutput && producedPerTick > 0 ? inventoryQty / producedPerTick : null;

    // Buffer calculator: suggested bid quantity
    const targetBuffer = parseFloat(local.targetBufferTicks);
    const suggestedBidQty =
        isFacilityInput && !isNaN(targetBuffer) && targetBuffer >= 0
            ? Math.max(0, targetBuffer * consumedPerTick - inventoryQty)
            : null;

    // Retain calculator: suggested offer quantity
    const retainTicks = parseFloat(local.retainTicks);
    const suggestedOfferQty =
        isFacilityOutput && !isNaN(retainTicks) && retainTicks >= 0
            ? Math.max(0, inventoryQty - retainTicks * producedPerTick)
            : null;

    const handleSave = () => {
        setSuccessMsg(null);
        setErrorMsg(null);

        // Build sell payload
        const offerPrice = parseFloat(local.offerPrice);
        const offerQty = parseFloat(local.offerQuantity);
        const sellPayload: Record<string, { offerPrice?: number; offerQuantity?: number; automated?: boolean }> = {
            [resourceName]: {
                ...(local.offerAutomated !== (offer?.automated ?? false) && { automated: local.offerAutomated }),
                ...(!isNaN(offerPrice) && offerPrice >= FOOD_PRICE_FLOOR && { offerPrice }),
                ...(!isNaN(offerQty) && offerQty >= 0 && { offerQuantity: offerQty }),
            },
        };
        // Always send automated flag change
        if (local.offerAutomated !== (offer?.automated ?? false)) {
            sellPayload[resourceName].automated = local.offerAutomated;
        }

        // Build buy payload
        const bidPrice = parseFloat(local.bidPrice);
        const bidQty = parseFloat(local.bidQuantity);
        const buyPayload: Record<string, { bidPrice?: number; bidQuantity?: number; automated?: boolean }> = {
            [resourceName]: {
                ...(local.bidAutomated !== (bid?.automated ?? false) && { automated: local.bidAutomated }),
                ...(!isNaN(bidPrice) && bidPrice > 0 && { bidPrice }),
                ...(!isNaN(bidQty) && bidQty >= 0 && { bidQuantity: bidQty }),
            },
        };
        if (local.bidAutomated !== (bid?.automated ?? false)) {
            buyPayload[resourceName].automated = local.bidAutomated;
        }

        // Always send both to make sure automated flag is persisted
        sellMutation.mutate({ agentId, planetId, offers: sellPayload });
        buyMutation.mutate({ agentId, planetId, bids: buyPayload });
    };

    const totalBidCost = (bid?.bidPrice ?? 0) * (bid?.bidQuantity ?? 0);
    const fundsWarning = totalBidCost > 0 && deposits < totalBidCost;

    return (
        <AccordionItem value={resourceName}>
            <AccordionTrigger className='hover:no-underline px-1'>
                <ResourceTrigger name={resourceName} bid={bid} offer={offer} />
            </AccordionTrigger>
            <AccordionContent>
                <div className='px-1 pb-2 space-y-5'>
                    {/* ---- BUY section ---- */}
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
                            <div className='rounded-md bg-muted/50 p-2.5 space-y-2 text-xs'>
                                <p className='font-medium text-muted-foreground'>Buffer calculator</p>
                                <div className='flex items-center gap-2 text-muted-foreground'>
                                    <span>Consumption: {formatNumbers(consumedPerTick)}/tick</span>
                                    <span>·</span>
                                    <span>
                                        Stock: {formatNumbers(inventoryQty)}
                                        {inventoryInBuyTicks !== null && (
                                            <span className='ml-1'>({inventoryInBuyTicks.toFixed(1)} ticks)</span>
                                        )}
                                    </span>
                                </div>
                                <div className='flex items-center gap-2'>
                                    <Label htmlFor={`buf-ticks-${resourceName}`} className='text-[11px] shrink-0'>
                                        Target buffer (ticks)
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
                                            onLocalChange(resourceName, { targetBufferTicks: e.target.value })
                                        }
                                        className='h-7 text-xs w-24 tabular-nums'
                                    />
                                    {suggestedBidQty !== null && (
                                        <span className='text-muted-foreground'>
                                            → bid qty: {formatNumbers(suggestedBidQty)}
                                        </span>
                                    )}
                                    {suggestedBidQty !== null && (
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            className='h-7 text-xs px-2'
                                            disabled={local.bidAutomated || saving}
                                            onClick={() =>
                                                onLocalChange(resourceName, {
                                                    bidQuantity: String(Math.ceil(suggestedBidQty)),
                                                })
                                            }
                                        >
                                            Use
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className='grid grid-cols-2 gap-3'>
                            <div className='space-y-1'>
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
                            </div>
                            <div className='space-y-1'>
                                <Label
                                    htmlFor={`bid-qty-${resourceName}`}
                                    className='text-[11px] text-muted-foreground'
                                >
                                    Quantity to buy
                                </Label>
                                <Input
                                    id={`bid-qty-${resourceName}`}
                                    type='number'
                                    min={0}
                                    step={1}
                                    placeholder={
                                        bid?.bidQuantity !== undefined
                                            ? String(Math.round(bid.bidQuantity))
                                            : 'e.g. 100'
                                    }
                                    value={local.bidQuantity}
                                    disabled={local.bidAutomated || saving}
                                    onChange={(e) => onLocalChange(resourceName, { bidQuantity: e.target.value })}
                                    className='h-8 text-sm tabular-nums'
                                />
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

                    {/* ---- SELL section ---- */}
                    <div className='space-y-3'>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs font-semibold flex items-center gap-1.5'>
                                <Tag className='h-3.5 w-3.5 text-muted-foreground' /> Sell
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
                                    disabled={saving}
                                    onCheckedChange={(v) => onLocalChange(resourceName, { offerAutomated: v })}
                                />
                            </div>
                        </div>

                        {isFacilityOutput && (
                            <div className='rounded-md bg-muted/50 p-2.5 space-y-2 text-xs'>
                                <p className='font-medium text-muted-foreground'>Retain calculator</p>
                                <div className='flex items-center gap-2 text-muted-foreground'>
                                    <span>Production: {formatNumbers(producedPerTick)}/tick</span>
                                    <span>·</span>
                                    <span>
                                        Stock: {formatNumbers(inventoryQty)}
                                        {inventoryInSellTicks !== null && (
                                            <span className='ml-1'>({inventoryInSellTicks.toFixed(1)} ticks)</span>
                                        )}
                                    </span>
                                </div>
                                <div className='flex items-center gap-2'>
                                    <Label htmlFor={`retain-ticks-${resourceName}`} className='text-[11px] shrink-0'>
                                        Retain (ticks)
                                    </Label>
                                    <Input
                                        id={`retain-ticks-${resourceName}`}
                                        type='number'
                                        min={0}
                                        step={1}
                                        placeholder='e.g. 5'
                                        value={local.retainTicks}
                                        disabled={local.offerAutomated || saving}
                                        onChange={(e) => onLocalChange(resourceName, { retainTicks: e.target.value })}
                                        className='h-7 text-xs w-24 tabular-nums'
                                    />
                                    {suggestedOfferQty !== null && (
                                        <span className='text-muted-foreground'>
                                            → offer qty: {formatNumbers(suggestedOfferQty)}
                                        </span>
                                    )}
                                    {suggestedOfferQty !== null && (
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            className='h-7 text-xs px-2'
                                            disabled={local.offerAutomated || saving}
                                            onClick={() =>
                                                onLocalChange(resourceName, {
                                                    offerQuantity: String(Math.ceil(suggestedOfferQty)),
                                                })
                                            }
                                        >
                                            Use
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className='grid grid-cols-2 gap-3'>
                            <div className='space-y-1'>
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
                            </div>
                            <div className='space-y-1'>
                                <Label
                                    htmlFor={`offer-qty-${resourceName}`}
                                    className='text-[11px] text-muted-foreground'
                                >
                                    Quantity to sell
                                </Label>
                                <Input
                                    id={`offer-qty-${resourceName}`}
                                    type='number'
                                    min={0}
                                    max={inventoryQty}
                                    step={1}
                                    placeholder={
                                        offer?.offerQuantity !== undefined
                                            ? String(Math.round(offer.offerQuantity))
                                            : 'e.g. 100'
                                    }
                                    value={local.offerQuantity}
                                    disabled={local.offerAutomated || saving}
                                    onChange={(e) => onLocalChange(resourceName, { offerQuantity: e.target.value })}
                                    className='h-8 text-sm tabular-nums'
                                />
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

                    {/* ---- Save button ---- */}
                    <div className='flex items-center justify-between gap-3'>
                        <div>
                            {successMsg && (
                                <span className='text-xs text-green-600 dark:text-green-400 flex items-center gap-1'>
                                    <CheckCircle2 className='h-3.5 w-3.5' /> {successMsg}
                                </span>
                            )}
                            {errorMsg && (
                                <span className='text-xs text-destructive flex items-center gap-1'>
                                    <AlertCircle className='h-3.5 w-3.5' /> {errorMsg}
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

export default function MarketPanel({
    agentId,
    planetId,
    assets,
}: Props): React.ReactElement {
    const [showAll, setShowAll] = useState(false);

    // Destructure assets for internal use
    const {
        productionFacilities,
        storageFacility,
        deposits,
        market,
    } = assets;
    
    const buyBids = market?.buy ?? {};
    const sellOffers = market?.sell ?? {};

    const resources = useMemo(
        () => buildResourceList(productionFacilities, buyBids, sellOffers, storageFacility, showAll),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            showAll,
            JSON.stringify(Object.keys(buyBids)),
            JSON.stringify(Object.keys(sellOffers)),
            productionFacilities.length,
        ],
    );

    const [localStates, setLocalStates] = useState<Record<string, LocalResourceState>>(() =>
        buildInitialState(resources, buyBids, sellOffers),
    );

    // Re-sync local state when server data changes (a new tick arrived)
    useEffect(() => {
        setLocalStates((prev) => {
            const next = buildInitialState(resources, buyBids, sellOffers);
            // Preserve any in-progress UI-only fields (targetBufferTicks, retainTicks)
            for (const name of Object.keys(next)) {
                const p = prev[name];
                if (p) {
                    next[name].targetBufferTicks = p.targetBufferTicks;
                    next[name].retainTicks = p.retainTicks;
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
                    <Accordion type='multiple' className='w-full'>
                        {resources.map(({ name }) => (
                            <ResourceAccordionItem
                                key={name}
                                resourceName={name}
                                agentId={agentId}
                                planetId={planetId}
                                bid={buyBids[name]}
                                offer={sellOffers[name]}
                                storageFacility={storageFacility}
                                facilities={productionFacilities}
                                deposits={deposits}
                                local={localStates[name] ?? buildInitialState([{ name }], buyBids, sellOffers)[name]}
                                onLocalChange={handleLocalChange}
                                isPending={false}
                            />
                        ))}
                    </Accordion>
                )}
            </CardContent>
        </Card>
    );
}
