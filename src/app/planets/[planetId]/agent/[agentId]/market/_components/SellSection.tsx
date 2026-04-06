import React from 'react';
import { Tag, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PRICE_FLOOR } from '@/simulation/constants';
import { formatNumbers } from '@/lib/utils';
import type { SellSectionProps } from './marketTypes';
import { productionPerTick, sellFulfillmentClass, priceArrow } from './marketHelpers';

export default function SellSection({
    resourceName,
    offer,
    local,
    assets,
    overviewRow,
    onLocalChange,
    onSaveSell,
    onResetSell,
    onCancelOffer,
    onAutomationChange,
    sellSaving,
    sellSuccessMsg,
    sellErrorMsg,
}: SellSectionProps): React.ReactElement {
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const producedPerTick = productionPerTick(assets.productionFacilities, resourceName);

    const isFacilityOutput = producedPerTick > 0;

    // Effective quantities derived from retainment / storage-target settings
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

    const hasActiveOffer = offer?.offerPrice !== undefined || offer?.offerRetainment !== undefined;

    // Check if sell section has any dirty fields
    const hasDirtySellFields =
        local.dirtyFields.offerPrice || local.dirtyFields.offerRetainment || local.dirtyFields.offerAutomated;

    // Check if there are any validation errors
    const hasValidationErrors = local.validationErrors.offerPrice || local.validationErrors.offerRetainment;

    // Helper function to get field styling based on dirty state and validation
    const getFieldClassName = (fieldName: keyof typeof local.dirtyFields, isDisabled: boolean) => {
        const baseClass = 'h-8 text-sm tabular-nums';
        if (isDisabled) {
            return `${baseClass} opacity-50`;
        }
        const hasError =
            fieldName === 'offerPrice'
                ? !!local.validationErrors.offerPrice
                : fieldName === 'offerRetainment'
                  ? !!local.validationErrors.offerRetainment
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
        <AccordionItem
            value='sell'
            className={`border-1 p-1 ${!canSell ? 'opacity-50 pointer-events-none' : ''} rounded-md`}
        >
            <AccordionPrimitive.Header className='px-1 flex items-center justify-between hover:bg-muted/50 rounded-md px-1 cursor-pointer'>
                <AccordionPrimitive.Trigger className='flex flex-1 items-center gap-1.5 py-2 text-xs font-semibold hover:underline text-left'>
                    <Tag className='h-3.5 w-3.5 text-muted-foreground' /> Sell
                    {!canSell && (
                        <span className='text-[10px] font-normal text-muted-foreground'>— nothing to sell</span>
                    )}
                </AccordionPrimitive.Trigger>
                {/* Controls are outside the trigger button to avoid nested buttons */}
                <div className='flex items-center gap-2 pl-2'>
                    {hasActiveOffer && (
                        <Button
                            variant='ghost'
                            size='sm'
                            className='h-6 text-[10px] px-2 py-0 text-destructive hover:text-destructive'
                            disabled={sellSaving}
                            onClick={onCancelOffer}
                        >
                            Cancel offer
                        </Button>
                    )}
                    <Label
                        htmlFor={`offer-auto-${resourceName}`}
                        className='text-[11px] text-muted-foreground cursor-pointer'
                    >
                        Auto-manage
                    </Label>
                    <Switch
                        id={`offer-auto-${resourceName}`}
                        checked={local.offerAutomated}
                        disabled={sellSaving || !canSell}
                        onCheckedChange={(v) => onAutomationChange(v)}
                    />
                </div>
            </AccordionPrimitive.Header>
            <AccordionContent className='pb-0'>
                <div className='space-y-3 pt-3'>
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
                                min={PRICE_FLOOR}
                                step='any'
                                placeholder={
                                    offer?.offerPrice !== undefined ? offer.offerPrice.toFixed(2) : 'e.g. 1.50'
                                }
                                value={local.offerPrice}
                                disabled={local.offerAutomated || sellSaving}
                                onChange={(e) => onLocalChange(resourceName, { offerPrice: e.target.value })}
                                className={getFieldClassName('offerPrice', local.offerAutomated || sellSaving)}
                            />
                            {overviewRow && !local.offerAutomated && (
                                <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                                    <span>Clearing: {overviewRow.clearingPrice.toFixed(2)}</span>
                                    <Button
                                        variant='outline'
                                        size='sm'
                                        className='h-5 text-[10px] px-1.5 py-0'
                                        disabled={sellSaving}
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
                                disabled={local.offerAutomated || sellSaving}
                                onChange={(e) => onLocalChange(resourceName, { offerRetainment: e.target.value })}
                                className={getFieldClassName('offerRetainment', local.offerAutomated || sellSaving)}
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
                                                disabled={sellSaving}
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
                            {offer.lastSold !== undefined && <span>Last sold: {formatNumbers(offer.lastSold)}</span>}
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

                    {/* Validation error messages */}
                    {(local.validationErrors.offerPrice || local.validationErrors.offerRetainment) && (
                        <div className='space-y-1'>
                            {local.validationErrors.offerPrice && (
                                <div className='text-xs text-red-600 dark:text-red-400 flex items-center gap-1'>
                                    <AlertCircle className='h-3 w-3' />
                                    Price: {local.validationErrors.offerPrice}
                                </div>
                            )}
                            {local.validationErrors.offerRetainment && (
                                <div className='text-xs text-red-600 dark:text-red-400 flex items-center gap-1'>
                                    <AlertCircle className='h-3 w-3' />
                                    Retainment: {local.validationErrors.offerRetainment}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Sell section save button and feedback */}
                    <div className='flex items-center justify-between gap-3 pt-2'>
                        <div className='flex items-center gap-3'>
                            {sellSuccessMsg && (
                                <span className='text-xs text-green-600 dark:text-green-400 flex items-center gap-1'>
                                    <CheckCircle2 className='h-3.5 w-3.5' /> {sellSuccessMsg}
                                </span>
                            )}
                            {sellErrorMsg && (
                                <span className='text-xs text-destructive flex items-center gap-1'>
                                    <AlertCircle className='h-3.5 w-3.5' />
                                    <span dangerouslySetInnerHTML={{ __html: sellErrorMsg }} />
                                </span>
                            )}
                        </div>
                        <div className='flex items-center gap-2'>
                            {hasDirtySellFields && (
                                <Button
                                    variant='outline'
                                    size='sm'
                                    className='h-7 text-[11px] px-2'
                                    onClick={onResetSell}
                                    disabled={sellSaving}
                                >
                                    <RotateCcw className='h-3 w-3 mr-1' />
                                    Reset
                                </Button>
                            )}
                            <Button
                                size='sm'
                                className='h-7 text-[11px] px-3'
                                onClick={onSaveSell}
                                disabled={!hasDirtySellFields || !!hasValidationErrors || sellSaving}
                            >
                                {sellSaving ? 'Saving…' : 'Save Sell'}
                            </Button>
                        </div>
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
