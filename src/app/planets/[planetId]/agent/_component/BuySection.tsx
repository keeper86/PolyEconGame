import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertCircle } from 'lucide-react';
import { formatNumbers } from '@/lib/utils';
import type { BuySectionProps } from './marketTypes';
import { consumptionPerTick, buyFulfillmentClass } from './marketHelpers';

export default function BuySection({
    resourceName,
    bid,
    local,
    assets,
    overviewRow,
    onLocalChange,
    saving,
}: BuySectionProps): React.ReactElement {
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const consumedPerTick = consumptionPerTick(assets.productionFacilities, resourceName);
    const deposits = assets.deposits;

    const isFacilityInput = consumedPerTick > 0;
    const inventoryInBuyTicks = isFacilityInput ? inventoryQty / consumedPerTick : null;

    // Buffer calculator: translate ticks → storage target
    const targetBuffer = parseFloat(local.targetBufferTicks);
    const suggestedStorageTarget =
        isFacilityInput && !isNaN(targetBuffer) && targetBuffer >= 0 ? Math.ceil(targetBuffer * consumedPerTick) : null;

    // Effective quantities derived from retainment / storage-target settings
    const effectiveBuyQty =
        bid?.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - inventoryQty) : undefined;

    const totalBidCost =
        (bid?.bidPrice ?? 0) *
        (bid?.bidStorageTarget !== undefined
            ? Math.max(0, bid.bidStorageTarget - inventoryQty)
            : (bid?.bidQuantity ?? 0));
    const fundsWarning = totalBidCost > 0 && deposits < totalBidCost;

    return (
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
                        <span className='font-semibold text-foreground'>{formatNumbers(consumedPerTick)}/tick</span>
                    </span>
                </div>
            )}

            <div className='grid grid-cols-2 gap-3'>
                {/* Max price box */}
                <div className='rounded-md border bg-muted/30 p-2.5 space-y-1.5'>
                    <Label htmlFor={`bid-price-${resourceName}`} className='text-[11px] text-muted-foreground'>
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
                    <Label htmlFor={`bid-target-${resourceName}`} className='text-[11px] text-muted-foreground'>
                        Storage target
                    </Label>
                    <Input
                        id={`bid-target-${resourceName}`}
                        type='number'
                        min={0}
                        step={1}
                        placeholder={
                            bid?.bidStorageTarget !== undefined ? String(Math.round(bid.bidStorageTarget)) : 'e.g. 500'
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
                    {bid.lastBought !== undefined && <span>Last bought: {formatNumbers(bid.lastBought)}</span>}
                    {bid.lastSpent !== undefined && <span>Spent: {formatNumbers(bid.lastSpent)}</span>}
                </div>
            )}

            {fundsWarning && (
                <Alert variant='destructive' className='py-2'>
                    <AlertCircle className='h-3.5 w-3.5' />
                    <AlertDescription className='text-xs'>
                        Bid cost ({formatNumbers(totalBidCost)}) exceeds available deposits ({formatNumbers(deposits)}).
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
