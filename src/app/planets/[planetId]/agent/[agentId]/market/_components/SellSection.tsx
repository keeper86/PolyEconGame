import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Stat } from '@/components/client/Stat';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { PRICE_FLOOR } from '@/simulation/constants';
import { AlertCircle, CheckCircle2, RotateCcw, Tag } from 'lucide-react';
import React from 'react';
import { AutoConfigPanel } from './AutoConfigPanel';
import { getResourceByName, productionPerTick, sellFulfillmentClass } from './marketHelpers';
import type { SellSectionProps } from './marketTypes';

export default function SellSection({
    resourceName,
    offer,
    local,
    assets,
    overviewRow,
    onLocalChange,
    onSaveSell,
    onResetSell,
    onAutomationChange,
    onSaveSellAutoConfig,
    onResetSellAutoConfig,
    sellSaving,
    sellAutoConfigSuccessMsg,
    sellAutoConfigErrorMsg,
    sellSuccessMsg,
    sellErrorMsg,
    planetId,
}: SellSectionProps): React.ReactElement {
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const producedPerTick = productionPerTick(assets.productionFacilities, resourceName);

    const isCurrency = resourceName.startsWith('CUR_');

    const isFacilityOutput = !isCurrency && producedPerTick > 0;

    const effectiveSellQty =
        offer?.offerRetainment !== undefined ? Math.max(0, inventoryQty - offer.offerRetainment) : undefined;

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

    const sellStaleReason =
        local.offerAutomated && effectiveSellQty !== undefined && effectiveSellQty === 0
            ? 'Output buffer full — nothing offered for sale last tick'
            : null;

    const handleSellConfigChange = (patch: Record<string, string>) => {
        const updatedSellAutoConfig = { ...local.sellAutoConfig, ...patch } as typeof local.sellAutoConfig;
        onLocalChange(resourceName, { sellAutoConfig: updatedSellAutoConfig });
    };

    const hasDirtySellFields = local.dirtyFields.offerPrice || local.dirtyFields.offerRetainment;

    const hasValidationErrors = local.validationErrors.offerPrice || local.validationErrors.offerRetainment;

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

    const unit = resourceFormToUnit(getResourceByName(resourceName)?.form ?? 'pieces');

    return (
        <div>
            <div className='flex items-center gap-6 pl-2'>
                <div className='flex items-center gap-1.5 py-2 text-xs font-semibold text-left'>
                    <Tag className='h-3.5 w-3.5 text-muted-foreground' /> Sell
                </div>
                <Switch
                    id={`offer-auto-${resourceName}`}
                    checked={local.offerAutomated}
                    disabled={sellSaving}
                    onCheckedChange={(v) => onAutomationChange(v)}
                />
            </div>

            <div className='pb-0'>
                <div className='space-y-3 pt-3'>
                    {/* Always-visible info box — all rows rendered to prevent layout shifts */}
                    <div className='rounded-md bg-muted/50 px-2.5 py-1.5'>
                        <div className='space-y-0.5'>
                            <Stat
                                label='Production'
                                value={isFacilityOutput ? `${formatNumberWithUnit(producedPerTick, unit)}/tick` : '—'}
                                bold
                            />
                            <Stat
                                label='Stock'
                                value={
                                    isFacilityOutput && producedPerTick > 0
                                        ? `${formatNumberWithUnit(inventoryQty, unit)} (${(inventoryQty / producedPerTick).toFixed(1)} ticks)`
                                        : formatNumberWithUnit(inventoryQty, unit)
                                }
                            />
                            <Stat
                                label='Last sold'
                                value={offer?.lastSold !== undefined ? formatNumberWithUnit(offer.lastSold, unit) : '—'}
                            />
                            <Stat
                                label='Revenue'
                                value={
                                    offer?.lastRevenue !== undefined
                                        ? formatNumberWithUnit(offer.lastRevenue, 'currency', planetId)
                                        : '—'
                                }
                            />
                            <Stat
                                label='Sell-through'
                                value={
                                    offer?.diagnostics
                                        ? `${Math.round(offer.diagnostics.sellThroughRate * 100)}% (target ${Math.round(offer.diagnostics.targetSellThrough * 100)}%)`
                                        : '—'
                                }
                                valueClassName={
                                    offer?.diagnostics
                                        ? offer.diagnostics.sellThroughRate >= offer.diagnostics.targetSellThrough
                                            ? 'text-green-600'
                                            : 'text-red-500'
                                        : ''
                                }
                            />
                            <Stat
                                label='Selling'
                                value={
                                    offer?.diagnostics
                                        ? `${offer.diagnostics.effectiveQuantity.toFixed(0)} / tick`
                                        : '—'
                                }
                            />
                            <Stat
                                label='Surplus'
                                value={
                                    offer?.diagnostics?.surplusRatio !== undefined
                                        ? `${Math.round(offer.diagnostics.surplusRatio * 100)}%`
                                        : '—'
                                }
                            />
                            <Stat
                                label='Price'
                                value={
                                    offer?.diagnostics
                                        ? `${offer.diagnostics.oldPrice.toFixed(2)} → ${offer.diagnostics.newPrice.toFixed(2)}`
                                        : '—'
                                }
                            />
                            <Stat
                                label='Market / Cost floor'
                                value={
                                    offer?.diagnostics
                                        ? `${offer.diagnostics.marketPrice.toFixed(2)} / ${offer.diagnostics.costFloor.toFixed(2)}`
                                        : '—'
                                }
                            />
                        </div>
                        {sellStaleReason && (
                            <div className='text-[10px] text-muted-foreground italic border-t border-border/40 pt-1 mt-1'>
                                {sellStaleReason}
                            </div>
                        )}
                    </div>

                    <AutoConfigPanel
                        mode='sell'
                        committedConfig={offer?.autoConfig}
                        localConfig={local.sellAutoConfig}
                        onConfigChange={handleSellConfigChange}
                        onSave={onSaveSellAutoConfig}
                        onReset={onResetSellAutoConfig}
                        isSaving={sellSaving}
                        successMsg={sellAutoConfigSuccessMsg}
                        errorMsg={sellAutoConfigErrorMsg}
                        bufferApplicable={isFacilityOutput}
                    />

                    <div className='grid grid-cols-2 gap-3'>
                        {}
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

                        {}
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
                            {}
                            {!isCurrency && offer?.offerRetainment !== undefined && effectiveSellQty !== undefined && (
                                <div
                                    className={`text-[11px] tabular-nums font-medium ${sellFulfillmentClass(inventoryQty, offer.offerRetainment)}`}
                                >
                                    {effectiveSellQty === 0
                                        ? 'Nothing to sell — order inactive'
                                        : `Sell ${formatNumberWithUnit(effectiveSellQty, unit)} / tick`}
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

                    {}
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

                    {}
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
            </div>
        </div>
    );
}
