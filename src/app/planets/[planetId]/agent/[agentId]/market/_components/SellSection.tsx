import { Stat } from '@/components/client/Stat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { PRICE_FLOOR } from '@/simulation/constants';
import { AlertCircle, CheckCircle2, RotateCcw, Tag } from 'lucide-react';
import React from 'react';
import { AutoConfigPanel } from './AutoConfigPanel';
import { getResourceByName, productionPerTick } from './marketHelpers';
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
    sellPriceSaving,
    sellAutomationSaving,
    sellAutoConfigSaving,
    sellAutoConfigSuccessMsg,
    sellAutoConfigErrorMsg,
    sellSuccessMsg,
    sellErrorMsg,
    planetId,
    sellAutomationOverlay,
    sellAutoConfigOverlay,
    sellPriceOverlay,
}: SellSectionProps): React.ReactElement {
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const producedPerTick = productionPerTick(assets.productionFacilities, resourceName);

    const isCurrency = resourceName.startsWith('CUR_');

    const isFacilityOutput = !isCurrency && producedPerTick > 0;

    const effectiveSellQty =
        offer?.offerRetainment !== undefined ? Math.max(0, inventoryQty - offer.offerRetainment) : undefined;

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

    const unit = resourceFormToUnit(getResourceByName(resourceName)?.form);

    const overlay = (message: string | null | undefined) =>
        message ? (
            <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-lg'>
                <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                    <Spinner className='h-4 w-4' />
                    {message}
                </span>
            </div>
        ) : null;

    // ── Manual pricing slot (rendered inside AutoConfigPanel's Pricing Strategy box) ──
    const defaultPrice = overviewRow?.clearingPrice?.toFixed(2);
    const costFloor =
        overviewRow && overviewRow.priceCostRatio > 0
            ? overviewRow.clearingPrice / overviewRow.priceCostRatio
            : 0;
    const quickPrices =
        overviewRow && costFloor > 0
            ? [costFloor, overviewRow.clearingPrice, costFloor * 2, costFloor * 3, costFloor * 4]
                  .filter((p) => isFinite(p) && p > 0)
                  .sort((a, b) => a - b)
            : [];

    const manualPricing = (
        <>
            <div className='space-y-3'>
                <div className='grid grid-cols-2 gap-3'>
                    <div className='rounded-md border bg-muted/30 p-2.5 space-y-1.5'>
                        <Label htmlFor={`offer-price-${resourceName}`} className='text-[11px] text-muted-foreground'>
                            Price / unit
                        </Label>
                        <Input
                            id={`offer-price-${resourceName}`}
                            type='number'
                            min={PRICE_FLOOR}
                            step='any'
                            placeholder={offer?.offerPrice !== undefined ? offer.offerPrice.toFixed(2) : (defaultPrice ?? 'e.g. 1.50')}
                            value={local.offerPrice}
                            disabled={sellPriceSaving}
                            onChange={(e) => onLocalChange(resourceName, { offerPrice: e.target.value })}
                            className={getFieldClassName('offerPrice', sellPriceSaving)}
                        />
                        {overviewRow && costFloor > 0 && (
                            <div className='flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground'>
                                {quickPrices.map((price) => (
                                    <Button
                                        key={price}
                                        variant='outline'
                                        size='sm'
                                        className='h-5 text-[10px] px-1.5 py-0'
                                        disabled={sellPriceSaving}
                                        onClick={() =>
                                            onLocalChange(resourceName, {
                                                offerPrice: price.toFixed(2),
                                            })
                                        }
                                    >
                                        {price.toFixed(2)}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

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
                                disabled={sellPriceSaving}
                            >
                                <RotateCcw className='h-3 w-3 mr-1' />
                                Reset
                            </Button>
                        )}
                        <Button
                            size='sm'
                            className='h-7 text-[11px] px-3'
                            onClick={onSaveSell}
                            disabled={!hasDirtySellFields || !!hasValidationErrors || sellPriceSaving}
                        >
                            {sellPriceSaving ? 'Saving…' : 'Save Sell'}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );

    return (
        <div className='flex-1 min-w-[250px]'>
            {/* ─── Zone 1: Automation toggle + header ─── */}
            <div className='relative'>
                <div className='flex items-center gap-6 pl-2'>
                    <div className='flex items-center gap-1.5 py-2 text-xs font-semibold text-left'>
                        <Tag className='h-3.5 w-3.5 text-muted-foreground' /> Sell
                    </div>
                    <Switch
                        id={`offer-auto-${resourceName}`}
                        checked={local.offerAutomated}
                        disabled={sellAutomationSaving}
                        onCheckedChange={(v) => onAutomationChange(v)}
                    />
                </div>
                {overlay(sellAutomationOverlay)}
            </div>

            {/* ─── Zone 2: AutoConfig with inline diagnostics ─── */}
            <div className='relative'>
                <div className='pb-0'>
                    <div className='space-y-3 pt-3'>
                        <div className='grid grid-cols-2 gap-x-4 gap-y-1'>
                            <Stat
                                label='Production'
                                value={isFacilityOutput ? `${formatNumberWithUnit(producedPerTick, unit)}/tick` : '—'}
                                bold
                            />
                            <Stat
                                label='Stock (days)'
                                value={
                                    isFacilityOutput && producedPerTick > 0
                                        ? `${formatNumberWithUnit(inventoryQty / producedPerTick, 'days')}`
                                        : '—'
                                }
                            />
                            <Stat label='Last sold' value={formatNumberWithUnit(offer?.lastSold, unit)} />
                            <Stat
                                label='Revenue'
                                value={formatNumberWithUnit(offer?.lastRevenue, 'currency', planetId)}
                            />
                        </div>

                        <AutoConfigPanel
                            mode='sell'
                            committedConfig={offer?.autoConfig}
                            localConfig={local.sellAutoConfig}
                            onConfigChange={handleSellConfigChange}
                            onSave={onSaveSellAutoConfig}
                            onReset={onResetSellAutoConfig}
                            isSaving={sellAutoConfigSaving}
                            successMsg={sellAutoConfigSuccessMsg}
                            errorMsg={sellAutoConfigErrorMsg}
                            bufferApplicable={isFacilityOutput}
                            diagnostics={offer?.diagnostics}
                            unit={unit}
                            planetId={planetId}
                            staleReason={sellStaleReason}
                            manualPricingSlot={manualPricing}
                            manualPriceOverlay={sellPriceOverlay}
                        />
                    </div>
                </div>
                {overlay(sellAutoConfigOverlay)}
            </div>
        </div>
    );
}
