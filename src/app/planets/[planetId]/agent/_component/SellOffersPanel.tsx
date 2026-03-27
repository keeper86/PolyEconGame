'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Tag } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { PRICE_FLOOR } from '@/simulation/constants';
import type { StorageFacility } from '@/simulation/planet/storage';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SellOfferEntry = {
    offerPrice?: number;
    offerQuantity?: number;
    lastSold?: number;
    lastRevenue?: number;
    priceDirection?: number;
};

type LocalOffer = {
    offerPrice: string;
    offerQuantity: string;
};

type Props = {
    agentId: string;
    planetId: string;
    /**
     * Current sell offers from the live snapshot.
     * Keys are resource names.
     */
    sellOffers: Record<string, SellOfferEntry>;
    /** Storage facility — resources stored here but not yet offered can be added to the panel. */
    storageFacility: StorageFacility;
    /** Whether automatic pricing is enabled. When true this panel is advisory only. */
    automatePricing: boolean;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildLocalOffers(sellOffers: Record<string, SellOfferEntry>): Record<string, LocalOffer> {
    const result: Record<string, LocalOffer> = {};
    for (const [name, entry] of Object.entries(sellOffers)) {
        result[name] = {
            offerPrice: entry.offerPrice !== undefined ? String(entry.offerPrice) : '',
            offerQuantity: entry.offerQuantity !== undefined ? String(Math.round(entry.offerQuantity)) : '',
        };
    }
    return result;
}

function priceDirectionLabel(dir?: number): string {
    if (dir === undefined) {
        return '';
    }
    if (dir > 0) {
        return '↑';
    }
    if (dir < 0) {
        return '↓';
    }
    return '→';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SellOffersPanel({
    agentId,
    planetId,
    sellOffers,
    storageFacility,
    automatePricing,
}: Props): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const [expanded, setExpanded] = useState(false);
    const [localOffers, setLocalOffers] = useState<Record<string, LocalOffer>>(() => buildLocalOffers(sellOffers));
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        setLocalOffers(buildLocalOffers(sellOffers));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(sellOffers)]);

    const mutation = useMutation(
        trpc.setSellOffers.mutationOptions({
            onSuccess: () => {
                setSuccessMsg('Sell offers saved. Changes take effect on the next market tick.');
                setErrorMsg(null);
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey(),
                });
            },
            onError: (err) => {
                setErrorMsg(err instanceof Error ? err.message : 'Failed to update sell offers');
                setSuccessMsg(null);
            },
        }),
    );

    const handleChange = (resource: string, field: 'offerPrice' | 'offerQuantity', value: string) => {
        setLocalOffers((prev) => ({
            ...prev,
            [resource]: { ...(prev[resource] ?? { offerPrice: '', offerQuantity: '' }), [field]: value },
        }));
    };

    const handleSave = () => {
        setSuccessMsg(null);
        setErrorMsg(null);

        // Build the payload: only include fields that parse to valid numbers
        const offers: Record<string, { offerPrice?: number; offerQuantity?: number }> = {};
        for (const [resource, lo] of Object.entries(localOffers)) {
            const entry: { offerPrice?: number; offerQuantity?: number } = {};
            const price = parseFloat(lo.offerPrice);
            const qty = parseFloat(lo.offerQuantity);
            if (!isNaN(price) && price >= PRICE_FLOOR) {
                entry.offerPrice = price;
            }
            if (!isNaN(qty) && qty >= 0) {
                entry.offerQuantity = qty;
            }
            if (Object.keys(entry).length > 0) {
                offers[resource] = entry;
            }
        }

        if (Object.keys(offers).length === 0) {
            setErrorMsg(
                `No valid offer data to save. Enter a price ≥ ${PRICE_FLOOR} or quantity ≥ 0 for at least one resource.`,
            );
            return;
        }

        mutation.mutate({ agentId, planetId, offers });
    };

    const resourceNames = Array.from(
        new Set([...Object.keys(sellOffers), ...Object.keys(storageFacility.currentInStorage)]),
    ).filter((name) => {
        const inStorage = (storageFacility.currentInStorage[name]?.quantity ?? 0) > 0;
        const hasOffer = name in sellOffers;
        return hasOffer || inStorage;
    });

    return (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
            <Card>
                <CardHeader className='p-3 pb-0'>
                    <CollapsibleTrigger className='w-full flex items-center justify-between gap-2'>
                        <div className='flex items-center gap-2'>
                            <Tag className='h-4 w-4 text-muted-foreground' />
                            <span className='text-sm font-semibold'>Sell Offers</span>
                            {automatePricing && (
                                <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                                    AI managed
                                </Badge>
                            )}
                        </div>
                        <span className='text-muted-foreground text-xs'>{expanded ? '▲' : '▼'}</span>
                    </CollapsibleTrigger>
                </CardHeader>

                <CollapsibleContent>
                    <CardContent className='p-3 pt-3 space-y-4'>
                        <p className='text-xs text-muted-foreground'>
                            {automatePricing
                                ? 'Automatic pricing is enabled. The AI adjusts prices each tick using sell-through targeting. Disable automation in the Automation Controls panel to set prices manually.'
                                : 'Set the sell price (per unit) and how many units to offer on the market each tick. Leave a field blank to keep the current value.'}
                        </p>

                        {resourceNames.length === 0 ? (
                            <p className='text-xs text-muted-foreground'>
                                No resources available to sell. Resources appear here once they are in storage or
                                production facilities produce goods.
                            </p>
                        ) : (
                            <div className='space-y-4'>
                                {resourceNames.map((resource) => {
                                    const snap = sellOffers[resource];
                                    const lo = localOffers[resource] ?? { offerPrice: '', offerQuantity: '' };
                                    return (
                                        <div key={resource} className='space-y-2'>
                                            <div className='flex items-center justify-between gap-2'>
                                                <span className='text-xs font-semibold'>{resource}</span>
                                                <div className='flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums'>
                                                    {snap?.lastSold !== undefined && (
                                                        <span>Sold last tick: {formatNumbers(snap.lastSold)}</span>
                                                    )}
                                                    {snap?.lastRevenue !== undefined && (
                                                        <span>Revenue: {formatNumbers(snap.lastRevenue)}</span>
                                                    )}
                                                    {snap?.priceDirection !== undefined && (
                                                        <span
                                                            className={
                                                                snap.priceDirection > 0
                                                                    ? 'text-green-600'
                                                                    : snap.priceDirection < 0
                                                                      ? 'text-red-500'
                                                                      : ''
                                                            }
                                                        >
                                                            {priceDirectionLabel(snap.priceDirection)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className='grid grid-cols-2 gap-3'>
                                                <div className='space-y-1'>
                                                    <Label
                                                        htmlFor={`offer-price-${resource}`}
                                                        className='text-[11px] text-muted-foreground'
                                                    >
                                                        Price / unit
                                                    </Label>
                                                    <Input
                                                        id={`offer-price-${resource}`}
                                                        type='number'
                                                        min={PRICE_FLOOR}
                                                        step='any'
                                                        placeholder={
                                                            snap?.offerPrice !== undefined
                                                                ? snap.offerPrice.toFixed(2)
                                                                : 'e.g. 1.50'
                                                        }
                                                        value={lo.offerPrice}
                                                        disabled={automatePricing || mutation.isPending}
                                                        onChange={(e) =>
                                                            handleChange(resource, 'offerPrice', e.target.value)
                                                        }
                                                        className='h-8 text-sm tabular-nums'
                                                    />
                                                </div>
                                                <div className='space-y-1'>
                                                    <Label
                                                        htmlFor={`offer-qty-${resource}`}
                                                        className='text-[11px] text-muted-foreground'
                                                    >
                                                        Quantity to offer
                                                    </Label>
                                                    <Input
                                                        id={`offer-qty-${resource}`}
                                                        type='number'
                                                        min={0}
                                                        max={storageFacility.currentInStorage[resource]?.quantity ?? ''}
                                                        step={1}
                                                        placeholder={
                                                            snap?.offerQuantity !== undefined
                                                                ? String(Math.round(snap.offerQuantity))
                                                                : 'e.g. 100'
                                                        }
                                                        value={lo.offerQuantity}
                                                        disabled={automatePricing || mutation.isPending}
                                                        onChange={(e) =>
                                                            handleChange(resource, 'offerQuantity', e.target.value)
                                                        }
                                                        className='h-8 text-sm tabular-nums'
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {resourceNames.length > 0 && (
                            <div className='flex justify-end'>
                                <Button size='sm' onClick={handleSave} disabled={automatePricing || mutation.isPending}>
                                    {mutation.isPending ? 'Saving…' : 'Save offers'}
                                </Button>
                            </div>
                        )}

                        {successMsg && (
                            <Alert className='border-green-500 bg-green-50 dark:bg-green-950'>
                                <CheckCircle2 className='h-4 w-4 text-green-600' />
                                <AlertDescription className='text-green-700 dark:text-green-300 text-xs'>
                                    {successMsg}
                                </AlertDescription>
                            </Alert>
                        )}
                        {errorMsg && (
                            <Alert variant='destructive'>
                                <AlertCircle className='h-4 w-4' />
                                <AlertDescription className='text-xs'>{errorMsg}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}
