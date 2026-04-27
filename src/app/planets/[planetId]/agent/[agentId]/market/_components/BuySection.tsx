import React from 'react';
import { ShoppingCart, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
    onSaveBuy,
    onResetBuy,
    onCancelBid,
    onAutomationChange,
    buySaving,
    buySuccessMsg,
    buyErrorMsg,
}: BuySectionProps): React.ReactElement {
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const consumedPerTick = consumptionPerTick(assets.productionFacilities, resourceName);
    const deposits = assets.deposits;

    // Currency resources (CUR_<planetId>) are denominated in foreign deposits, not local storage.
    const isCurrency = resourceName.startsWith('CUR_');

    const isFacilityInput = !isCurrency && consumedPerTick > 0;
    const inventoryInBuyTicks = isFacilityInput ? inventoryQty / consumedPerTick : null;

    const hasActiveBid = bid?.bidPrice !== undefined || bid?.bidStorageTarget !== undefined;

    // Buffer calculator: translate ticks → storage target
    const targetBuffer = parseFloat(local.targetBufferTicks);
    const suggestedStorageTarget =
        isFacilityInput && !isNaN(targetBuffer) && targetBuffer >= 0 ? Math.ceil(targetBuffer * consumedPerTick) : null;

    // Effective quantities derived from retainment / storage-target settings
    const effectiveBuyQty =
        bid?.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - inventoryQty) : undefined;

    const totalBidCost =
        (bid?.bidPrice ?? 0) *
        (bid?.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - inventoryQty) : 0);
    const fundsWarning = totalBidCost > 0 && deposits < totalBidCost;

    // Check if buy section has any dirty fields
    const hasDirtyBuyFields = local.dirtyFields.bidPrice || local.dirtyFields.bidStorageTarget;

    // Check if there are any validation errors
    const hasValidationErrors = local.validationErrors.bidPrice || local.validationErrors.bidStorageTarget;

    // Helper function to get field styling based on dirty state and validation
    const getFieldClassName = (fieldName: keyof typeof local.dirtyFields, isDisabled: boolean) => {
        const baseClass = 'h-8 text-sm tabular-nums';
        if (isDisabled) {
            return `${baseClass} opacity-50`;
        }
        const hasError =
            fieldName === 'bidPrice'
                ? !!local.validationErrors.bidPrice
                : fieldName === 'bidStorageTarget'
                  ? !!local.validationErrors.bidStorageTarget
                  : false;

        if (hasError) {
            return `${baseClass} border-red-500 bg-red-50 dark:bg-red-950/30`;
        }
        if (local.dirtyFields[fieldName]) {
            return `${baseClass} border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30`;
        }
        return baseClass;
    };

    return (
        <AccordionItem value='buy' className={`border-1 p-1 rounded-md`}>
            <AccordionPrimitive.Header className='flex items-center justify-between hover:bg-muted/50 rounded-md px-1'>
                <AccordionPrimitive.Trigger className='flex flex-1 items-center gap-1.5 py-2 text-xs font-semibold hover:underline text-left'>
                    <ShoppingCart className='h-3.5 w-3.5 text-muted-foreground' /> Buy
                </AccordionPrimitive.Trigger>
                {/* Controls are outside the trigger button to avoid nested buttons */}
                <div className='flex items-center gap-2 pl-2'>
                    {hasActiveBid && (
                        <Button
                            variant='ghost'
                            size='sm'
                            className='h-6 text-[10px] px-2 py-0 text-destructive hover:text-destructive  cursor-pointer'
                            disabled={buySaving}
                            onClick={onCancelBid}
                        >
                            Cancel bid
                        </Button>
                    )}
                    <Label
                        htmlFor={`bid-auto-${resourceName}`}
                        className='text-[11px] text-muted-foreground cursor-pointer'
                    >
                        Auto-manage
                    </Label>
                    <Switch
                        id={`bid-auto-${resourceName}`}
                        checked={local.bidAutomated}
                        disabled={buySaving}
                        onCheckedChange={(v) => onAutomationChange(v)}
                    />
                </div>
            </AccordionPrimitive.Header>
            <AccordionContent className='pb-0'>
                <div className='space-y-3 pt-3'>
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
                                disabled={local.bidAutomated || buySaving}
                                onChange={(e) => onLocalChange(resourceName, { bidPrice: e.target.value })}
                                className={getFieldClassName('bidPrice', local.bidAutomated || buySaving)}
                            />
                            {overviewRow && !local.bidAutomated && (
                                <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                                    <span>Current price: {formatNumbers(overviewRow.clearingPrice)}</span>
                                    <Button
                                        variant='outline'
                                        size='sm'
                                        className='h-5 text-[10px] px-1.5 py-0'
                                        disabled={buySaving}
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
                                {isCurrency ? 'Deposit target' : 'Storage target'}
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
                                disabled={local.bidAutomated || buySaving}
                                onChange={(e) => onLocalChange(resourceName, { bidStorageTarget: e.target.value })}
                                className={getFieldClassName('bidStorageTarget', local.bidAutomated || buySaving)}
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
                                            disabled={local.bidAutomated || buySaving}
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
                                                    disabled={local.bidAutomated || buySaving}
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
                                Bid cost ({formatNumbers(totalBidCost)}) exceeds available deposits (
                                {formatNumbers(deposits)}).
                            </AlertDescription>
                        </Alert>
                    )}

                    {bid?.depositScaleWarning && (
                        <Alert
                            variant={bid.depositScaleWarning === 'dropped' ? 'destructive' : 'default'}
                            className='py-2'
                        >
                            <AlertCircle className='h-3.5 w-3.5' />
                            <AlertDescription className='text-xs'>
                                {bid.depositScaleWarning === 'dropped'
                                    ? 'No deposits available — bid was not placed last tick.'
                                    : 'Bid was proportionally scaled down due to insufficient deposits.'}
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Validation error messages */}
                    {(local.validationErrors.bidPrice || local.validationErrors.bidStorageTarget) && (
                        <div className='space-y-1'>
                            {local.validationErrors.bidPrice && (
                                <div className='text-xs text-red-600 dark:text-red-400 flex items-center gap-1'>
                                    <AlertCircle className='h-3 w-3' />
                                    Price: {local.validationErrors.bidPrice}
                                </div>
                            )}
                            {local.validationErrors.bidStorageTarget && (
                                <div className='text-xs text-red-600 dark:text-red-400 flex items-center gap-1'>
                                    <AlertCircle className='h-3 w-3' />
                                    Storage target: {local.validationErrors.bidStorageTarget}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Buy section save button and feedback */}
                    <div className='flex items-center justify-between gap-3 pt-2'>
                        <div className='flex items-center gap-3'>
                            {buySuccessMsg && (
                                <span className='text-xs text-green-600 dark:text-green-400 flex items-center gap-1'>
                                    <CheckCircle2 className='h-3.5 w-3.5' /> {buySuccessMsg}
                                </span>
                            )}
                            {buyErrorMsg && (
                                <span className='text-xs text-destructive flex items-center gap-1'>
                                    <AlertCircle className='h-3.5 w-3.5' />
                                    <span dangerouslySetInnerHTML={{ __html: buyErrorMsg }} />
                                </span>
                            )}
                        </div>
                        <div className='flex items-center gap-2'>
                            {hasDirtyBuyFields && (
                                <Button
                                    variant='outline'
                                    size='sm'
                                    className='h-7 text-[11px] px-2'
                                    onClick={onResetBuy}
                                    disabled={buySaving}
                                >
                                    <RotateCcw className='h-3 w-3 mr-1' />
                                    Reset
                                </Button>
                            )}
                            <Button
                                size='sm'
                                className='h-7 text-[11px] px-3'
                                onClick={onSaveBuy}
                                disabled={!hasDirtyBuyFields || !!hasValidationErrors || buySaving}
                            >
                                {buySaving ? 'Saving…' : 'Save Buy'}
                            </Button>
                        </div>
                    </div>
                </div>{' '}
            </AccordionContent>
        </AccordionItem>
    );
}
