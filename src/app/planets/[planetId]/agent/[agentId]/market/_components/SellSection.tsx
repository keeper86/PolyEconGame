import { Stat } from '@/components/client/Stat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { AlertCircle, Package, RotateCcw, Tag } from 'lucide-react';
import React, { useMemo } from 'react';
import { AutoConfigPanel } from './AutoConfigPanel';
import { getResourceByName, productionPerTick } from './marketHelpers';
import type { SellSectionProps } from './marketTypes';
import { Label } from '@/components/ui/label';

type SellStatusKind =
    | 'offering'
    | 'sold'
    | 'partial_no_demand'
    | 'partial_high_price'
    | 'partial'
    | 'not_sold_no_demand'
    | 'not_sold_high_price'
    | 'not_sold'
    | 'no_offer';

function sellStatus(
    automated: boolean,
    diagnostics: import('@/simulation/planet/planet').SellDiagnostics | undefined,
    lastSold: number | undefined,
    overviewRow: { totalDemand: number } | undefined,
): { kind: SellStatusKind; text: string; className: string } {
    if (!automated || !diagnostics) {
        return {
            kind: 'no_offer',
            text: 'No offer.',
            className: 'bg-muted text-muted-foreground border-muted-foreground/30',
        };
    }
    const sellThroughRate = diagnostics.effectiveQuantity > 0 ? (lastSold ?? 0) / diagnostics.effectiveQuantity : 0;
    const noDemand = (overviewRow?.totalDemand ?? 0) <= 0;
    const highPrice = diagnostics.newPrice > diagnostics.marketPrice;

    if (lastSold && lastSold > 0 && sellThroughRate >= diagnostics.targetSellThrough) {
        return {
            kind: 'sold',
            text: 'Sold.',
            className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
        };
    }
    if (lastSold && lastSold > 0 && sellThroughRate < diagnostics.targetSellThrough) {
        if (noDemand) {
            return {
                kind: 'partial_no_demand',
                text: 'Partial. No demand.',
                className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
            };
        }
        if (highPrice) {
            return {
                kind: 'partial_high_price',
                text: 'Partial. High price.',
                className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
            };
        }
        return {
            kind: 'partial',
            text: 'Partially sold.',
            className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
        };
    }
    if (noDemand) {
        return {
            kind: 'not_sold_no_demand',
            text: 'Not sold. No demand.',
            className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
        };
    }
    if (highPrice) {
        return {
            kind: 'not_sold_high_price',
            text: 'Not sold. High price.',
            className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
        };
    }
    return {
        kind: 'not_sold',
        text: 'Not sold.',
        className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
    };
}

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
    planetId,
    sellAutomationOverlay,
    sellAutoConfigOverlay,
    sellPriceOverlay,
}: SellSectionProps): React.ReactElement {
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const producedPerTick = productionPerTick(assets.productionFacilities, resourceName);

    const isCurrency = resourceName.startsWith('CUR_');

    const isFacilityOutput = !isCurrency && producedPerTick > 0;

    const handleSellConfigChange = (patch: Record<string, string>) => {
        const updatedSellAutoConfig = { ...local.sellAutoConfig, ...patch } as typeof local.sellAutoConfig;
        onLocalChange(resourceName, { sellAutoConfig: updatedSellAutoConfig });
    };

    const hasDirtySellFields = local.dirtyFields.offerPrice;

    const hasValidationErrors = !!local.validationErrors.offerPrice;

    const getFieldClassName = (fieldName: keyof typeof local.dirtyFields, isDisabled: boolean) => {
        const baseClass = 'h-7 text-sm tabular-nums';
        if (isDisabled) {
            return `${baseClass} opacity-50`;
        }
        const hasError = fieldName === 'offerPrice' && !!local.validationErrors.offerPrice;

        if (hasError) {
            return `${baseClass} border-red-500 bg-red-50 dark:bg-red-950/30`;
        }
        if (local.dirtyFields[fieldName]) {
            return `${baseClass} border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30`;
        }
        return baseClass;
    };

    const unit = resourceFormToUnit(getResourceByName(resourceName)?.form);

    const productionBreakdown = useMemo(
        () =>
            isFacilityOutput && (
                <div className='space-y-0.5'>
                    <Stat label='Production' value={`${formatNumberWithUnit(producedPerTick, unit)}/day`} bold />
                    {assets.productionFacilities.map((facility) => {
                        const prod = facility.produces.find((p) => p.resource.name === resourceName);
                        if (!prod) {
                            return null;
                        }
                        const rate = prod.quantity * facility.scale;
                        return (
                            <Stat
                                key={facility.id}
                                icon={<Package className='h-3 w-3' />}
                                label={facility.name}
                                value={`${formatNumberWithUnit(rate, unit)}/day`}
                                indent
                            />
                        );
                    })}
                </div>
            ),
        [isFacilityOutput, unit, producedPerTick, resourceName, assets.productionFacilities],
    );

    const overlay = (message: string | null | undefined) =>
        message ? (
            <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-lg'>
                <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                    <Spinner className='h-4 w-4' />
                    {message}
                </span>
            </div>
        ) : null;

    const status = useMemo(
        () => sellStatus(local.offerAutomated, offer?.diagnostics, offer?.lastSold, overviewRow),
        [local.offerAutomated, offer?.diagnostics, offer?.lastSold, overviewRow],
    );

    // ── Manual pricing slot (rendered inside AutoConfigPanel's Pricing Strategy box) ──
    const defaultPrice = overviewRow?.clearingPrice?.toFixed(2);
    const costFloor =
        overviewRow && overviewRow.priceCostRatio > 0 ? overviewRow.clearingPrice / overviewRow.priceCostRatio : 0;
    const quickPrices =
        overviewRow && costFloor > 0
            ? [costFloor, overviewRow.clearingPrice, costFloor * 2, costFloor * 3, costFloor * 4]
                  .filter((p) => isFinite(p) && p > 0)
                  .sort((a, b) => a - b)
            : [];

    const manualPricing = (
        <div className='flex flex-row flex-grow gap-2 items-center py-2'>
            <div className='flex flex-col flex-grow gap-1'>
                <span className='flex flex-row items-center gap-1'>
                    <Button
                        className='h-7 text-[11px] p-0 px-1'
                        variant='ghost'
                        size='sm'
                        onClick={onResetSell}
                        disabled={sellPriceSaving || !hasDirtySellFields}
                    >
                        <RotateCcw className='h-5 w-5' />
                    </Button>
                    <Input
                        id={`offer-price-${resourceName}`}
                        type='number'
                        min={0.01}
                        step='any'
                        placeholder={
                            offer?.offerPrice !== undefined
                                ? offer.offerPrice.toFixed(2)
                                : (defaultPrice ?? 'e.g. 1.50')
                        }
                        value={local.offerPrice}
                        disabled={sellPriceSaving}
                        onChange={(e) => onLocalChange(resourceName, { offerPrice: e.target.value })}
                        className={getFieldClassName('offerPrice', sellPriceSaving) + ` text-right`}
                    />
                </span>
                <span className='flex items-center justify-end gap-1 '>
                    {overviewRow &&
                        costFloor > 0 &&
                        quickPrices.map((price) => (
                            <Button
                                key={price}
                                variant='secondary'
                                size='sm'
                                className='h-6 text-[9px] text-right px-1 py-0'
                                disabled={sellPriceSaving}
                                onClick={() => onLocalChange(resourceName, { offerPrice: price.toFixed(2) })}
                            >
                                {formatNumberWithUnit(price, 'currency', planetId)}
                            </Button>
                        ))}
                </span>
            </div>

            <Button
                size='sm'
                className='h-14 w-14 text-[11px] '
                onClick={onSaveSell}
                disabled={!hasDirtySellFields || !!hasValidationErrors || sellPriceSaving}
            >
                {sellPriceSaving ? 'Setting…' : 'Set'}
            </Button>

            {local.validationErrors.offerPrice && (
                <div className='text-xs text-red-600 dark:text-red-400 flex items-center gap-1'>
                    <AlertCircle className='h-3 w-3' />
                    Price: {local.validationErrors.offerPrice}
                </div>
            )}
        </div>
    );

    return (
        <div className='flex-1 min-w-[250px]'>
            <div className='relative'>
                <div className='flex items-center justify-between gap-2'>
                    <div className='flex items-center justify-start gap-2'>
                        <Switch
                            id={`offer-auto-${resourceName}`}
                            checked={local.offerAutomated}
                            disabled={sellAutomationSaving}
                            onCheckedChange={(v) => onAutomationChange(v)}
                        />
                        <Label
                            htmlFor={`offer-auto-${resourceName}`}
                            className='flex items-center gap-1.5 py-2 text-xs font-semibold text-left cursor-pointer'
                        >
                            <Tag className='h-3.5 w-3.5 text-muted-foreground' /> Sell
                        </Label>
                    </div>

                    <div className='flex items-center gap-2'>
                        <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${status.className}`}
                        >
                            {status.text}
                        </span>
                    </div>
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
                                value={isFacilityOutput ? `${formatNumberWithUnit(producedPerTick, unit)}/day` : '—'}
                                bold
                            />
                            <Stat
                                label='Stock'
                                value={
                                    isFacilityOutput && producedPerTick > 0
                                        ? `${formatNumberWithUnit(inventoryQty / producedPerTick, 'days')}`
                                        : '—'
                                }
                            />
                            <Stat
                                label='Last offered'
                                value={formatNumberWithUnit(offer?.diagnostics?.effectiveQuantity, unit)}
                            />
                            <Stat
                                label='Last price'
                                value={formatNumberWithUnit(offer?.diagnostics?.newPrice, 'currency', planetId)}
                            />
                            <Stat label='Last sold' value={formatNumberWithUnit(offer?.lastSold, unit)} />
                            <Stat
                                label='Last revenue'
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
                            bufferApplicable={isFacilityOutput}
                            manualPricingSlot={manualPricing}
                            manualPriceOverlay={sellPriceOverlay}
                            productionBreakdown={productionBreakdown || undefined}
                        />
                    </div>
                </div>
                {overlay(sellAutoConfigOverlay)}
            </div>
        </div>
    );
}
