import React from 'react';
import {
    AlertCircle,
    Anchor,
    Building2,
    CheckCircle2,
    HardHat,
    Package,
    RotateCcw,
    Ship,
    ShoppingCart,
    Wrench,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Stat } from '@/components/client/Stat';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import type { BuySectionProps } from './marketTypes';
import { totalConsumptionPerTick, buyFulfillmentClass, getResourceByName } from './marketHelpers';
import { AutoConfigPanel } from './AutoConfigPanel';

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
    buySaving,
    buyAutoConfigSuccessMsg,
    buyAutoConfigErrorMsg,
    buySuccessMsg,
    buyErrorMsg,
    planetId,
    ships,
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

    const targetBuffer = parseFloat(local.targetBufferTicks);
    const suggestedStorageTarget =
        isFacilityInput && !isNaN(targetBuffer) && targetBuffer >= 0 ? Math.ceil(targetBuffer * consumedPerTick) : null;

    const totalBidCost =
        (bid?.bidPrice ?? 0) *
        (bid?.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - inventoryQty) : 0);
    const fundsWarning = totalBidCost > 0 && deposits < totalBidCost;

    const handleBuyConfigChange = (patch: Record<string, string>) => {
        const updatedBuyAutoConfig = { ...local.buyAutoConfig, ...patch } as typeof local.buyAutoConfig;
        onLocalChange(resourceName, { buyAutoConfig: updatedBuyAutoConfig });
    };

    const hasDirtyBuyFields = local.dirtyFields.bidPrice || local.dirtyFields.bidStorageTarget;

    const hasValidationErrors = local.validationErrors.bidPrice || local.validationErrors.bidStorageTarget;

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

    const unit = resourceFormToUnit(getResourceByName(resourceName)?.form ?? 'pieces');

    return (
        <div className=''>
            <div className='flex items-center justify-between  '>
                <Label
                    htmlFor={`bid-auto-${resourceName}`}
                    className='flex items-center gap-1.5 py-2 text-xs font-semibold text-left cursor-pointer'
                >
                    <ShoppingCart className='h-3.5 w-3.5 text-muted-foreground' /> Buy
                </Label>

                <span className='flex items-end h-full gap-4 sm:gap-8 px-2.5 py-1.5 text-[10px] text-muted-foreground'>
                    <span className='tabular-nums'>
                        <span className='font-medium'>Required:</span>{' '}
                        {isFacilityInput ? `${formatNumberWithUnit(consumedPerTick, unit)}/tick` : '—'}
                    </span>
                    <span className='tabular-nums'>
                        <span className='font-medium'>Stock:</span> {formatNumberWithUnit(inventoryQty, unit)}
                        {inventoryInBuyTicks !== null && (
                            <span className='ml-1'>({inventoryInBuyTicks.toFixed(1)} ticks)</span>
                        )}
                    </span>
                </span>

                <Switch
                    id={`bid-auto-${resourceName}`}
                    checked={local.bidAutomated}
                    disabled={buySaving}
                    onCheckedChange={(v) => onAutomationChange(v)}
                />
            </div>

            {/* Collapsible: everything below is only visible when buying is active */}
            <div className='pb-0'>
                <div className='grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-4'>
                    <div className='rounded-md bg-muted/50 px-2.5 py-1.5'>
                        <div className='space-y-0.5'>
                            <Stat
                                label='Required'
                                value={isFacilityInput ? `${formatNumberWithUnit(consumedPerTick, unit)}/tick` : '—'}
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
                            <Stat
                                label='Last bought'
                                value={bid?.lastBought !== undefined ? formatNumberWithUnit(bid.lastBought, unit) : '—'}
                            />
                            <Stat
                                label='Spent'
                                value={
                                    bid?.lastSpent !== undefined
                                        ? formatNumberWithUnit(bid.lastSpent, 'currency', planetId)
                                        : '—'
                                }
                            />
                            <Stat
                                label='Fill rate'
                                value={
                                    bid?.diagnostics
                                        ? `${Math.round(bid.diagnostics.fillRate * 100)}% (target ${Math.round(bid.diagnostics.targetFillRate * 100)}%)`
                                        : '—'
                                }
                                valueClassName={
                                    bid?.diagnostics
                                        ? bid.diagnostics.fillRate >= bid.diagnostics.targetFillRate
                                            ? 'text-green-600'
                                            : 'text-red-500'
                                        : ''
                                }
                            />
                            <Stat
                                label='Shortfall'
                                value={
                                    bid?.diagnostics
                                        ? `${bid.diagnostics.shortfall.toFixed(0)} / ${bid.diagnostics.storageTarget.toFixed(0)}`
                                        : '—'
                                }
                            />
                            <Stat
                                label='Bid price'
                                value={
                                    bid?.diagnostics
                                        ? `${bid.diagnostics.oldBidPrice.toFixed(2)} → ${bid.diagnostics.newBidPrice.toFixed(2)}`
                                        : '—'
                                }
                            />
                            <Stat
                                label='Market / Ceiling'
                                value={
                                    bid?.diagnostics
                                        ? `${bid.diagnostics.marketPrice.toFixed(2)} / ${bid.diagnostics.ceilingPrice.toFixed(2)}`
                                        : '—'
                                }
                            />
                        </div>
                        {buyStaleReason && (
                            <div className='text-[10px] text-muted-foreground italic border-t border-border/40 pt-1 mt-1'>
                                {buyStaleReason}
                            </div>
                        )}
                    </div>

                    <AutoConfigPanel
                        mode='buy'
                        committedConfig={bid?.autoConfig}
                        localConfig={local.buyAutoConfig}
                        onConfigChange={handleBuyConfigChange}
                        onSave={onSaveBuyAutoConfig}
                        onReset={onResetBuyAutoConfig}
                        isSaving={buySaving}
                        successMsg={buyAutoConfigSuccessMsg}
                        errorMsg={buyAutoConfigErrorMsg}
                        bufferApplicable={isFacilityInput}
                    />
                </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
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
                            <span>
                                Current price: {formatNumberWithUnit(overviewRow.clearingPrice, 'currency', planetId)}
                            </span>
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
                            bid?.bidStorageTarget !== undefined ? String(Math.round(bid.bidStorageTarget)) : 'e.g. 500'
                        }
                        value={local.bidStorageTarget}
                        disabled={local.bidAutomated || buySaving}
                        onChange={(e) => onLocalChange(resourceName, { bidStorageTarget: e.target.value })}
                        className={getFieldClassName('bidStorageTarget', local.bidAutomated || buySaving)}
                    />

                    {bid?.bidStorageTarget !== undefined && effectiveBuyQty !== undefined && (
                        <div
                            className={`text-[11px] tabular-nums font-medium ${buyFulfillmentClass(inventoryQty, bid.bidStorageTarget)}`}
                        >
                            {effectiveBuyQty === 0
                                ? 'Target met — order inactive'
                                : `Buy ${formatNumberWithUnit(effectiveBuyQty, unit)} / tick`}
                        </div>
                    )}
                    {isFacilityInput && (
                        <div className='space-y-1 text-[11px] text-muted-foreground'>
                            <div>
                                {formatNumberWithUnit(consumedPerTick, unit)}
                                /tick · Stock: {formatNumberWithUnit(inventoryQty, unit)}
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
                                        <span>→ {formatNumberWithUnit(suggestedStorageTarget, unit)}</span>
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
                            <span>{buyErrorMsg}</span>
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
        </div>
    );
}
