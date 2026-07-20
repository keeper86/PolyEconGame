import { Stat } from '@/components/client/Stat';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { AlertCircle, Anchor, Building2, HardHat, Package, RotateCcw, Ship, ShoppingCart, Wrench } from 'lucide-react';
import React from 'react';
import { AutoConfigPanel } from './AutoConfigPanel';
import { getResourceByName, totalConsumptionPerTick } from './marketHelpers';
import type { BuySectionProps } from './marketTypes';

export default function BuySection({
    resourceName,
    bid,
    local,
    assets,
    overviewRow,
    onLocalChange,
    onSaveBuy,
    onResetBuy,
    onAutomationChange,
    onSaveBuyAutoConfig,
    onResetBuyAutoConfig,
    buyPriceSaving,
    buyAutomationSaving,
    buyAutoConfigSaving,
    planetId,
    ships,
    buyAutomationOverlay,
    buyAutoConfigOverlay,
    buyPriceOverlay,
}: BuySectionProps): React.ReactElement {
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const deposits = assets.deposits;

    const isCurrency = resourceName.startsWith('CUR_');

    const consumptionInfo = totalConsumptionPerTick(assets, ships ?? [], planetId, resourceName);
    const consumedPerTick = consumptionInfo.totalPerTick;
    const isFacilityInput = !isCurrency && consumedPerTick > 0;
    const inventoryInBuyTicks = isFacilityInput ? inventoryQty / consumedPerTick : null;

    const effectiveBuyQty =
        bid?.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - inventoryQty) : undefined;

    const buyStaleReason =
        local.bidAutomated && effectiveBuyQty !== undefined && effectiveBuyQty === 0
            ? 'Storage target met — no bid placed last tick'
            : null;

    const totalBidCost =
        (bid?.bidPrice ?? 0) *
        (bid?.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - inventoryQty) : 0);
    const fundsWarning = totalBidCost > 0 && deposits < totalBidCost;

    const handleBuyConfigChange = (patch: Record<string, string>) => {
        const updatedBuyAutoConfig = { ...local.buyAutoConfig, ...patch } as typeof local.buyAutoConfig;
        onLocalChange(resourceName, { buyAutoConfig: updatedBuyAutoConfig });
    };

    const hasDirtyBuyFields = local.dirtyFields.bidPrice;

    const hasValidationErrors = !!local.validationErrors.bidPrice;

    const getFieldClassName = (fieldName: keyof typeof local.dirtyFields, isDisabled: boolean) => {
        const baseClass = 'h-7 text-sm tabular-nums';
        if (isDisabled) {
            return `${baseClass} opacity-50`;
        }
        const hasError = fieldName === 'bidPrice' && !!local.validationErrors.bidPrice;

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
                        onClick={onResetBuy}
                        disabled={buyPriceSaving || !hasDirtyBuyFields}
                    >
                        <RotateCcw className='h-5 w-5' />
                    </Button>
                    <Input
                        id={`bid-price-${resourceName}`}
                        type='number'
                        min={0.01}
                        step='any'
                        placeholder={
                            bid?.bidPrice !== undefined ? bid.bidPrice.toFixed(2) : (defaultPrice ?? 'e.g. 1.50')
                        }
                        value={local.bidPrice}
                        disabled={buyPriceSaving}
                        onChange={(e) => onLocalChange(resourceName, { bidPrice: e.target.value })}
                        className={getFieldClassName('bidPrice', buyPriceSaving) + ` text-right`}
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
                                disabled={buyPriceSaving}
                                onClick={() => onLocalChange(resourceName, { bidPrice: price.toFixed(2) })}
                            >
                                {formatNumberWithUnit(price, 'currency', planetId)}
                            </Button>
                        ))}
                </span>
            </div>

            <Button
                size='sm'
                className='h-14 w-14 text-[11px] '
                onClick={onSaveBuy}
                disabled={!hasDirtyBuyFields || !!hasValidationErrors || buyPriceSaving}
            >
                {buyPriceSaving ? 'Setting…' : 'Set'}
            </Button>

            {fundsWarning && (
                <Alert variant='destructive' className='py-2'>
                    <AlertCircle className='h-3.5 w-3.5' />
                    <AlertDescription className='text-xs'>
                        Bid cost ({formatNumberWithUnit(totalBidCost, 'currency', planetId)}) exceeds available deposits
                        ({formatNumberWithUnit(deposits, 'currency', planetId)}).
                    </AlertDescription>
                </Alert>
            )}

            {bid?.depositScaleWarning && (
                <Alert variant={bid.depositScaleWarning === 'dropped' ? 'destructive' : 'default'} className='py-2'>
                    <AlertCircle className='h-3.5 w-3.5' />
                    <AlertDescription className='text-xs'>
                        {bid.depositScaleWarning === 'dropped'
                            ? 'No deposits available — bid was not placed last tick.'
                            : 'Bid was proportionally scaled down due to insufficient deposits.'}
                    </AlertDescription>
                </Alert>
            )}

            {local.validationErrors.bidPrice && (
                <div className='text-xs text-red-600 dark:text-red-400 flex items-center gap-1'>
                    <AlertCircle className='h-3 w-3' />
                    Price: {local.validationErrors.bidPrice}
                </div>
            )}
        </div>
    );

    return (
        <div className='flex-1 min-w-[250px] '>
            {/* ─── Zone 1: Automation toggle + header ─── */}
            <div className='relative'>
                <div className='flex items-center justify-start gap-2'>
                    <Switch
                        id={`bid-auto-${resourceName}`}
                        checked={local.bidAutomated}
                        disabled={buyAutomationSaving}
                        onCheckedChange={(v) => onAutomationChange(v)}
                    />
                    <Label
                        htmlFor={`bid-auto-${resourceName}`}
                        className='flex items-center gap-1.5 py-2 text-xs font-semibold text-left cursor-pointer'
                    >
                        <ShoppingCart className='h-3.5 w-3.5 text-muted-foreground' /> Buy
                    </Label>
                </div>
                {overlay(buyAutomationOverlay)}
            </div>

            <div className='relative'>
                <div className='pb-0'>
                    <div className='space-y-3 pt-3'>
                        <div className='grid grid-cols-2 gap-x-4 gap-y-1'>
                            <Stat
                                label='Required'
                                value={isFacilityInput ? `${formatNumberWithUnit(consumedPerTick, unit)}/day` : '—'}
                                bold
                            />
                            <Stat
                                label='Stock'
                                value={`${inventoryInBuyTicks ? inventoryInBuyTicks.toFixed(1) + ' days' : '—'}`}
                            />
                            <Stat label='Last bought' value={formatNumberWithUnit(bid?.lastBought, unit)} />
                            <Stat
                                label='Last spent'
                                value={formatNumberWithUnit(bid?.lastSpent, 'currency', planetId)}
                            />
                        </div>

                        <AutoConfigPanel
                            mode='buy'
                            committedConfig={bid?.autoConfig}
                            localConfig={local.buyAutoConfig}
                            onConfigChange={handleBuyConfigChange}
                            onSave={onSaveBuyAutoConfig}
                            onReset={onResetBuyAutoConfig}
                            isSaving={buyAutoConfigSaving}
                            bufferApplicable={isFacilityInput}
                            diagnostics={bid?.diagnostics}
                            unit={unit}
                            planetId={planetId}
                            staleReason={buyStaleReason}
                            consumptionBreakdown={
                                isFacilityInput && (
                                    <div className='space-y-0.5'>
                                        <Stat
                                            label='Required'
                                            value={`${formatNumberWithUnit(consumedPerTick, unit)}/tick`}
                                            bold
                                        />
                                        {consumptionInfo.breakdown.map((item, i) => {
                                            const Icon =
                                                item.sourceType === 'production'
                                                    ? Package
                                                    : item.sourceType === 'management'
                                                      ? Building2
                                                      : item.sourceType === 'ship_construction'
                                                        ? Anchor
                                                        : item.sourceType === 'construction_service'
                                                          ? HardHat
                                                          : item.sourceType === 'construction_ship'
                                                            ? HardHat
                                                            : item.sourceType === 'transport_ship'
                                                              ? Ship
                                                              : Wrench;
                                            return (
                                                <Stat
                                                    key={i}
                                                    icon={<Icon className='h-3 w-3' />}
                                                    label={item.sourceName}
                                                    value={`${formatNumberWithUnit(item.ratePerTick, unit)}/tick`}
                                                    indent
                                                />
                                            );
                                        })}
                                    </div>
                                )
                            }
                            manualPricingSlot={manualPricing}
                            manualPriceOverlay={buyPriceOverlay}
                        />
                    </div>
                </div>
                {overlay(buyAutoConfigOverlay)}
            </div>
        </div>
    );
}
