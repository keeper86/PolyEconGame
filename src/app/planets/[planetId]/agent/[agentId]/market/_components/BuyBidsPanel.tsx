'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ShoppingCart } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import type { ProductionFacility } from '@/simulation/planet/storage';

export type BuyBidEntry = {
    bidPrice?: number;
    bidStorageTarget?: number;
    lastBought?: number;
    lastSpent?: number;
    storageFullWarning?: boolean;
};

type LocalBid = {
    bidPrice: string;
    bidStorageTarget: string;
};

type Props = {
    agentId: string;
    planetId: string;
    productionFacilities: ProductionFacility[];
    buyBids: Record<string, BuyBidEntry>;
    deposits: number;
    automatePricing: boolean;
};

function collectInputResources(facilities: ProductionFacility[]): { name: string }[] {
    const seen = new Set<string>();
    const result: { name: string }[] = [];
    for (const facility of facilities) {
        for (const { resource } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            if (!seen.has(resource.name)) {
                seen.add(resource.name);
                result.push({ name: resource.name });
            }
        }
    }
    return result;
}

function buildLocalBids(
    inputResources: { name: string }[],
    buyBids: Record<string, BuyBidEntry>,
): Record<string, LocalBid> {
    const result: Record<string, LocalBid> = {};
    for (const { name } of inputResources) {
        const entry = buyBids[name];
        result[name] = {
            bidPrice: entry?.bidPrice !== undefined ? String(entry.bidPrice) : '',
            bidStorageTarget: entry?.bidStorageTarget !== undefined ? String(Math.round(entry.bidStorageTarget)) : '',
        };
    }
    return result;
}

export default function BuyBidsPanel({
    agentId,
    planetId,
    productionFacilities,
    buyBids,
    deposits,
    automatePricing,
}: Props): React.ReactElement {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const inputResources = collectInputResources(productionFacilities);

    const [expanded, setExpanded] = useState(false);
    const [localBids, setLocalBids] = useState<Record<string, LocalBid>>(() => buildLocalBids(inputResources, buyBids));
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        setLocalBids(buildLocalBids(inputResources, buyBids));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(buyBids), JSON.stringify(inputResources.map((r) => r.name))]);

    const mutation = useMutation(
        trpc.setBuyBids.mutationOptions({
            onSuccess: () => {
                setSuccessMsg('Buy bids saved. Changes take effect on the next market tick.');
                setErrorMsg(null);
                void queryClient.invalidateQueries({
                    queryKey: trpc.simulation.getAgentPlanetDetail.queryKey(),
                });
            },
            onError: (err) => {
                let errorMessage = err instanceof Error ? err.message : 'Failed to update buy bids';
                if (errorMessage.includes('Insufficient deposits')) {
                    errorMessage = `${errorMessage}. You can borrow funds on the <a href="/planets/${planetId}/agent/${agentId}/financial" class="underline font-medium hover:text-blue-700">Financial page</a>.`;
                }
                setErrorMsg(errorMessage);
                setSuccessMsg(null);
            },
        }),
    );

    const handleChange = (resource: string, field: 'bidPrice' | 'bidStorageTarget', value: string) => {
        setLocalBids((prev) => ({
            ...prev,
            [resource]: { ...(prev[resource] ?? { bidPrice: '', bidStorageTarget: '' }), [field]: value },
        }));
    };

    const handleSave = () => {
        setSuccessMsg(null);
        setErrorMsg(null);

        const bids: Record<string, { bidPrice?: number; bidStorageTarget?: number }> = {};
        for (const [resource, lo] of Object.entries(localBids)) {
            const entry: { bidPrice?: number; bidStorageTarget?: number } = {};
            const price = parseFloat(lo.bidPrice);
            const target = parseFloat(lo.bidStorageTarget);
            if (!isNaN(price) && price > 0) {
                entry.bidPrice = price;
            }
            if (!isNaN(target) && target >= 0) {
                entry.bidStorageTarget = target;
            }
            if (Object.keys(entry).length > 0) {
                bids[resource] = entry;
            }
        }

        if (Object.keys(bids).length === 0) {
            setErrorMsg('No valid bid data to save. Enter a price > 0 or storage target ≥ 0 for at least one resource.');
            return;
        }

        mutation.mutate({ agentId, planetId, bids });
    };

    const totalBidCost = inputResources.reduce((sum, { name }) => {
        const snap = buyBids[name];
        const price = snap?.bidPrice ?? 0;
        const target = snap?.bidStorageTarget ?? 0;
        // Note: This is an approximation - actual cost depends on current inventory
        return sum + price * target;
    }, 0);

    const depositsInsufficient = totalBidCost > 0 && deposits < totalBidCost;
    const anyStorageFull = inputResources.some(({ name }) => buyBids[name]?.storageFullWarning);

    return (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
            <Card>
                <CardHeader className='p-3 pb-0'>
                    <CollapsibleTrigger className='w-full flex items-center justify-between gap-2'>
                        <div className='flex items-center gap-2'>
                            <ShoppingCart className='h-4 w-4 text-muted-foreground' />
                            <span className='text-sm font-semibold'>Buy Bids</span>
                            {automatePricing && (
                                <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                                    AI managed
                                </Badge>
                            )}
                            {depositsInsufficient && (
                                <Badge variant='destructive' className='text-[10px] px-1.5 py-0'>
                                    Insufficient funds
                                </Badge>
                            )}
                            {anyStorageFull && (
                                <Badge variant='destructive' className='text-[10px] px-1.5 py-0'>
                                    Storage full
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
                                ? 'Automatic pricing is enabled. The AI places buy bids each tick based on facility input shortfalls. Disable automation in the Automation Controls panel to set bids manually.'
                                : 'Set the maximum bid price (per unit) and how many units to demand from the market each tick. Leave a field blank to keep the current value.'}
                        </p>

                        {depositsInsufficient && (
                            <Alert variant='destructive'>
                                <AlertCircle className='h-4 w-4' />
                                <AlertDescription className='text-xs'>
                                    Current deposits ({formatNumbers(deposits)}) are below the total bid cost (
                                    {formatNumbers(totalBidCost)}). Bids that cannot be fully funded will not clear. Top
                                    up your deposits or reduce bid quantities.
                                </AlertDescription>
                            </Alert>
                        )}

                        {inputResources.length === 0 ? (
                            <p className='text-xs text-muted-foreground'>
                                No production facilities yet. Build a facility to see its input resources here.
                            </p>
                        ) : (
                            <div className='space-y-4'>
                                {inputResources.map(({ name: resource }) => {
                                    const snap = buyBids[resource];
                                    const lo = localBids[resource] ?? { bidPrice: '', bidStorageTarget: '' };
                                    return (
                                        <div key={resource} className='space-y-2'>
                                            <div className='flex items-center justify-between gap-2'>
                                                <div className='flex items-center gap-2'>
                                                    <span className='text-xs font-semibold'>{resource}</span>
                                                    {snap?.storageFullWarning && (
                                                        <Badge
                                                            variant='destructive'
                                                            className='text-[10px] px-1.5 py-0'
                                                        >
                                                            Storage full — bid excluded
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className='flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums'>
                                                    {snap?.lastBought !== undefined && (
                                                        <span>Bought last tick: {formatNumbers(snap.lastBought)}</span>
                                                    )}
                                                    {snap?.lastSpent !== undefined && (
                                                        <span>Spent: {formatNumbers(snap.lastSpent)}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className='grid grid-cols-2 gap-3'>
                                                <div className='space-y-1'>
                                                    <Label
                                                        htmlFor={`bid-price-${resource}`}
                                                        className='text-[11px] text-muted-foreground'
                                                    >
                                                        Max price / unit
                                                    </Label>
                                                    <Input
                                                        id={`bid-price-${resource}`}
                                                        type='number'
                                                        min={0.01}
                                                        step='any'
                                                        placeholder={
                                                            snap?.bidPrice !== undefined
                                                                ? snap.bidPrice.toFixed(2)
                                                                : 'e.g. 1.50'
                                                        }
                                                        value={lo.bidPrice}
                                                        disabled={automatePricing || mutation.isPending}
                                                        onChange={(e) =>
                                                            handleChange(resource, 'bidPrice', e.target.value)
                                                        }
                                                        className='h-8 text-sm tabular-nums'
                                                    />
                                                </div>
                                                <div className='space-y-1'>
                                                    <Label
                                                        htmlFor={`bid-target-${resource}`}
                                                        className='text-[11px] text-muted-foreground'
                                                    >
                                                        Storage target
                                                    </Label>
                                                    <Input
                                                        id={`bid-target-${resource}`}
                                                        type='number'
                                                        min={0}
                                                        step={1}
                                                        placeholder={
                                                            snap?.bidStorageTarget !== undefined
                                                                ? String(Math.round(snap.bidStorageTarget))
                                                                : 'e.g. 500'
                                                        }
                                                        value={lo.bidStorageTarget}
                                                        disabled={automatePricing || mutation.isPending}
                                                        onChange={(e) =>
                                                            handleChange(resource, 'bidStorageTarget', e.target.value)
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

                        {inputResources.length > 0 && (
                            <div className='flex justify-end'>
                                <Button size='sm' onClick={handleSave} disabled={automatePricing || mutation.isPending}>
                                    {mutation.isPending ? 'Saving…' : 'Save bids'}
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
                                <AlertDescription className='text-xs' dangerouslySetInnerHTML={{ __html: errorMsg }} />
                            </Alert>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}
