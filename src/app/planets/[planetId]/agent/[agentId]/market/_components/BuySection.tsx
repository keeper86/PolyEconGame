'use client';

import { Stat } from '@/components/client/Stat';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import {
    AlertCircle,
    Anchor,
    Building2,
    ChevronDown,
    HardHat,
    Package,
    RotateCcw,
    Ship,
    ShoppingCart,
    Wrench,
} from 'lucide-react';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { getResourceByName, totalConsumptionPerTick } from './marketHelpers';
import type { BuySectionProps } from './marketTypes';
import type { BuyDiagnostics } from '@/simulation/planet/planet';
import type { AutoConfigLocalState } from './marketTypes';
import { ConfigSlider, ConfigRangeSlider } from './ConfigSlider';
import { PriceAlgorithmDialog } from './PriceAlgorithmDialog';
import {
    detectPricingBuyPreset,
    detectVolumeBuyPreset,
    PRICING_BUY_PRESETS,
    PRICING_PRESET_LABELS,
    PRICING_PRESET_ORDER,
    VOLUME_BUY_PRESETS,
    VOLUME_PRESET_LABELS,
    VOLUME_PRESET_ORDER,
    type PricingPresetType,
    type VolumePresetType,
} from './StrategyPresets';

type BuyStatusKind =
    | 'filled'
    | 'partial_no_supply'
    | 'partial_low_price'
    | 'not_filled_low_price'
    | 'not_filled_no_supply'
    | 'not_filled'
    | 'no_bid'
    | 'target_met'
    | 'off';

function buyStatus(
    automated: boolean,
    diagnostics: BuyDiagnostics | undefined,
    lastBought: number | undefined,
    overviewRow: { totalSupply: number } | undefined,
): { kind: BuyStatusKind; text: string; className: string } {
    if (!automated) {
        return {
            kind: 'off',
            text: 'Off.',
            className: '',
        };
    }
    if (!diagnostics) {
        return {
            kind: 'no_bid',
            text: 'No bid.',
            className: 'bg-muted text-muted-foreground border-muted-foreground/30',
        };
    }
    if (diagnostics.shortfall === 0) {
        return {
            kind: 'target_met',
            text: 'Inactive. Target met.',
            className: 'bg-muted text-muted-foreground border-muted-foreground/30',
        };
    }
    const fillRate = lastBought && diagnostics.shortfall > 0 ? lastBought / diagnostics.shortfall : 0;
    const noSupply = (overviewRow?.totalSupply ?? 0) <= 0;
    const lowPrice = diagnostics.newBidPrice < diagnostics.marketPrice;

    if (lastBought && lastBought > 0 && fillRate >= diagnostics.targetFillRate) {
        return {
            kind: 'filled',
            text: 'Filled.',
            className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
        };
    }
    if (lastBought && lastBought > 0 && fillRate < diagnostics.targetFillRate) {
        if (noSupply) {
            return {
                kind: 'partial_no_supply',
                text: 'Partial. No supply.',
                className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
            };
        }
        if (lowPrice) {
            return {
                kind: 'partial_low_price',
                text: 'Partial. Low price.',
                className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
            };
        }
        return {
            kind: 'partial_no_supply',
            text: 'Partial. No supply.',
            className: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
        };
    }
    if (noSupply) {
        return {
            kind: 'not_filled_no_supply',
            text: 'Not filled. No supply.',
            className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
        };
    }
    if (lowPrice) {
        return {
            kind: 'not_filled_low_price',
            text: 'Not filled. Low price.',
            className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
        };
    }
    return {
        kind: 'not_filled',
        text: 'Not filled.',
        className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
    };
}

function committedVal(
    config: import('@/simulation/planet/planet').AutomatedPricingConfig | undefined,
    key: keyof AutoConfigLocalState,
): number | undefined {
    const raw = (config as Record<string, unknown>)?.[
        key as keyof import('@/simulation/planet/planet').AutomatedPricingConfig
    ];
    return typeof raw === 'number' ? raw : undefined;
}

const BUFFER_KEYS = new Set<keyof AutoConfigLocalState>(['inputBufferTargetTicks', 'inventorySmoothingMaxExtra']);

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

    const consumptionInfo = useMemo(
        () => totalConsumptionPerTick(assets, ships ?? [], planetId, resourceName),
        [assets, ships, planetId, resourceName],
    );
    const consumedPerTick = consumptionInfo.totalPerTick;
    const isFacilityInput = !isCurrency && consumedPerTick > 0;
    const inventoryInBuyTicks = isFacilityInput ? inventoryQty / consumedPerTick : null;

    const totalBidCost =
        (bid?.bidPrice ?? 0) *
        (bid?.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - inventoryQty) : 0);
    const fundsWarning = totalBidCost > 0 && deposits < totalBidCost;

    const handleBuyConfigChange = useCallback(
        (patch: Record<string, string>) => {
            const updatedBuyAutoConfig = { ...local.buyAutoConfig, ...patch } as typeof local.buyAutoConfig;
            onLocalChange(resourceName, { buyAutoConfig: updatedBuyAutoConfig });
        },
        [local, onLocalChange, resourceName],
    );

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

    const status = useMemo(
        () => buyStatus(local.bidAutomated, bid?.diagnostics, bid?.lastBought, overviewRow),
        [local.bidAutomated, bid?.diagnostics, bid?.lastBought, overviewRow],
    );

    // ── Auto-config state ────────────────────────────────────────────────────
    const committedConfig = bid?.autoConfig;

    const [activeVolumePreset, setActiveVolumePreset] = useState<VolumePresetType>(() =>
        detectVolumeBuyPreset(local.buyAutoConfig),
    );
    const [activePricingPreset, setActivePricingPreset] = useState<PricingPresetType>(() =>
        detectPricingBuyPreset(local.buyAutoConfig),
    );

    useEffect(() => {
        setActiveVolumePreset(detectVolumeBuyPreset(local.buyAutoConfig));
        setActivePricingPreset(detectPricingBuyPreset(local.buyAutoConfig));
    }, [local.buyAutoConfig]);

    const handleVolumePresetSelect = useCallback(
        (preset: VolumePresetType) => {
            setActiveVolumePreset(preset);
            if (preset === 'custom') {
                return;
            }
            const values = VOLUME_BUY_PRESETS[preset as Exclude<VolumePresetType, 'custom'>];
            handleBuyConfigChange(values as unknown as Record<string, string>);
        },
        [handleBuyConfigChange],
    );

    const handlePricingPresetSelect = useCallback(
        (preset: PricingPresetType) => {
            setActivePricingPreset(preset);
            if (preset === 'custom') {
                return;
            }
            const values = PRICING_BUY_PRESETS[preset as Exclude<PricingPresetType, 'custom'>];
            handleBuyConfigChange(values as unknown as Record<string, string>);
        },
        [handleBuyConfigChange],
    );

    const handleSliderChange = useCallback(
        (patch: Record<string, string>) => {
            const changedKey = Object.keys(patch)[0] as keyof AutoConfigLocalState | undefined;
            if (changedKey) {
                if (
                    BUFFER_KEYS.has(changedKey) ||
                    changedKey === 'freeBuyQuantity' ||
                    changedKey === 'freeBuyQuantitySmoothingMaxExtra'
                ) {
                    if (activeVolumePreset !== 'custom') {
                        setActiveVolumePreset('custom');
                    }
                } else {
                    if (activePricingPreset !== 'custom') {
                        setActivePricingPreset('custom');
                    }
                }
            }
            handleBuyConfigChange(patch);
        },
        [handleBuyConfigChange, activeVolumePreset, activePricingPreset],
    );

    const ALL_AUTO_KEYS: (keyof AutoConfigLocalState)[] = [
        'inputBufferTargetTicks',
        'inventorySmoothingMaxExtra',
        'freeBuyQuantity',
        'freeBuyQuantitySmoothingMaxExtra',
        'priceAdjustMaxUp',
        'priceAdjustMaxDown',
        'bidOfferMaxCostMultiplier',
        'targetFillRate',
    ];

    const hasAutoConfigDirty = ALL_AUTO_KEYS.some((key) => {
        const localVal = local.buyAutoConfig[key] !== '' ? parseFloat(local.buyAutoConfig[key]) : undefined;
        const committed = committedVal(committedConfig, key);
        return localVal !== undefined && localVal !== committed;
    });
    const hasAnyAutoValue = ALL_AUTO_KEYS.some((key) => local.buyAutoConfig[key] !== '');

    // ── Helper to get a slider value with committed fallback ─────────────────
    const sliderVal = (key: keyof AutoConfigLocalState, defaultVal: number): number => {
        const raw = local.buyAutoConfig[key];
        const localNum = raw !== '' ? parseFloat(raw) : undefined;
        const committed = committedVal(committedConfig, key);
        return localNum ?? committed ?? defaultVal;
    };

    // ── Manual pricing slot ───────────────────────────────────────────────────
    const defaultPrice = overviewRow?.clearingPrice?.toFixed(2);
    const costFloor =
        overviewRow && overviewRow.priceCostRatio > 0 ? overviewRow.clearingPrice / overviewRow.priceCostRatio : 0;
    const quickPrices =
        overviewRow && costFloor > 0
            ? [costFloor, overviewRow.clearingPrice, costFloor * 2, costFloor * 3, costFloor * 4]
                  .filter((p) => isFinite(p) && p > 0)
                  .sort((a, b) => a - b)
            : [];

    return (
        <div className='flex-1 min-w-[250px] '>
            {/* ─── Zone 1: Automation toggle + header ─── */}
            <div className='relative'>
                <div className='flex items-center justify-between gap-2'>
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
                    <div className='flex items-center gap-2'>
                        <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${status.className}`}
                        >
                            {status.text}
                        </span>
                    </div>
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
                                value={`${inventoryInBuyTicks !== null ? inventoryInBuyTicks.toFixed(1) + ' days' : '—'}`}
                            />
                            <Stat label='Last wanted' value={formatNumberWithUnit(bid?.diagnostics?.shortfall, unit)} />
                            <Stat
                                label='Last price'
                                value={formatNumberWithUnit(bid?.diagnostics?.newBidPrice, 'currency', planetId)}
                            />
                            <Stat label='Last bought' value={formatNumberWithUnit(bid?.lastBought, unit, planetId)} />
                            <Stat
                                label='Last spent'
                                value={formatNumberWithUnit(bid?.lastSpent, 'currency', planetId)}
                            />
                        </div>

                        {/* ── Volume Strategy Collapsible ──────────────────────── */}
                        <Collapsible defaultOpen={false} className='rounded-md border bg-muted/30'>
                            <CollapsibleTrigger className='flex items-center justify-between w-full p-2.5 hover:bg-muted/50 cursor-pointer [&[data-state=open]>svg]:rotate-180'>
                                <span className='text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'>
                                    Volume Strategy
                                </span>
                                <ChevronDown className='h-3.5 w-3.5 transition-transform duration-200' />
                            </CollapsibleTrigger>
                            <CollapsibleContent className='px-2.5 pb-2.5 space-y-2'>
                                <div className='space-y-1'>
                                    <div className='flex flex-wrap gap-1'>
                                        {VOLUME_PRESET_ORDER.map((preset, index) => {
                                            const isActive = preset === activeVolumePreset;
                                            const isCustom = preset === 'custom';
                                            return (
                                                <Button
                                                    key={preset}
                                                    variant={isActive ? 'default' : 'outline'}
                                                    size='sm'
                                                    className={`h-7 text-[11px] px-2 ${isCustom ? 'font-medium' : ''} ${index === VOLUME_PRESET_ORDER.length - 1 ? 'ml-auto' : ''}`}
                                                    disabled={buyAutoConfigSaving}
                                                    onClick={() => handleVolumePresetSelect(preset)}
                                                >
                                                    {VOLUME_PRESET_LABELS[preset] ?? preset}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className='rounded-md bg-muted/50 px-2.5 py-1.5 mb-1'>
                                    <div className='space-y-0.5'>
                                        {isFacilityInput ? (
                                            <div className='space-y-0.5'>
                                                <Stat
                                                    label='Required'
                                                    value={`${formatNumberWithUnit(consumedPerTick, unit)}/day`}
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
                                                            value={`${formatNumberWithUnit(item.ratePerTick, unit)}/day`}
                                                            indent
                                                        />
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <Stat label='Consumption' value='-' />
                                        )}
                                    </div>
                                </div>

                                <div
                                    className='space-y-3 pt-1'
                                    onClick={() => {
                                        if (activeVolumePreset !== 'custom') {
                                            setActiveVolumePreset('custom');
                                        }
                                    }}
                                >
                                    {/* Combined Needs group */}
                                    <div className='space-y-2'>
                                        <Label className='text-[10px] text-muted-foreground/70 uppercase tracking-wider'>
                                            Combined Needs
                                        </Label>
                                        <div className={isFacilityInput ? 'space-y-2' : 'space-y-2 opacity-50'}>
                                            <ConfigSlider
                                                label='Input buffer (days)'
                                                value={sliderVal('inputBufferTargetTicks', 30)}
                                                committed={committedVal(committedConfig, 'inputBufferTargetTicks')}
                                                min={1}
                                                max={120}
                                                step={1}
                                                onChange={(v) =>
                                                    handleSliderChange({ inputBufferTargetTicks: String(v) })
                                                }
                                                disabled={
                                                    buyAutoConfigSaving ||
                                                    activeVolumePreset !== 'custom' ||
                                                    !isFacilityInput
                                                }
                                            />
                                            <ConfigSlider
                                                label='Max buy rate (days)'
                                                value={sliderVal('inventorySmoothingMaxExtra', 2)}
                                                committed={committedVal(committedConfig, 'inventorySmoothingMaxExtra')}
                                                min={0}
                                                max={20}
                                                step={1}
                                                displayTransform={(v) => v + 1}
                                                onChange={(v) =>
                                                    handleSliderChange({ inventorySmoothingMaxExtra: String(v) })
                                                }
                                                disabled={
                                                    buyAutoConfigSaving ||
                                                    activeVolumePreset !== 'custom' ||
                                                    !isFacilityInput
                                                }
                                            />
                                        </div>
                                    </div>

                                    <Separator className='my-1' />

                                    {/* Free quantity group */}
                                    <div className='space-y-2'>
                                        <Label className='text-[10px] text-muted-foreground/70 uppercase tracking-wider'>
                                            Free quantity
                                        </Label>
                                        <ConfigSlider
                                            label='Free buy quantity (total)'
                                            value={sliderVal('freeBuyQuantity', 0)}
                                            committed={committedVal(committedConfig, 'freeBuyQuantity')}
                                            min={0}
                                            max={10000}
                                            step={1}
                                            onChange={(v) => handleSliderChange({ freeBuyQuantity: String(v) })}
                                            disabled={buyAutoConfigSaving || activeVolumePreset !== 'custom'}
                                        />
                                        <ConfigSlider
                                            label='Free buy fill days'
                                            value={sliderVal('freeBuyQuantitySmoothingMaxExtra', 2)}
                                            committed={committedVal(
                                                committedConfig,
                                                'freeBuyQuantitySmoothingMaxExtra',
                                            )}
                                            min={1}
                                            max={20}
                                            step={1}
                                            onChange={(v) =>
                                                handleSliderChange({ freeBuyQuantitySmoothingMaxExtra: String(v) })
                                            }
                                            disabled={buyAutoConfigSaving || activeVolumePreset !== 'custom'}
                                        />
                                    </div>
                                </div>

                                <div className='flex items-center justify-end gap-2 pt-1'>
                                    <Button
                                        variant='outline'
                                        size='sm'
                                        className={`h-7 text-[11px] px-2 ${hasAutoConfigDirty ? '' : 'invisible'}`}
                                        onClick={onResetBuyAutoConfig}
                                        disabled={buyAutoConfigSaving}
                                    >
                                        <RotateCcw className='h-3 w-3 mr-1' />
                                        Reset
                                    </Button>
                                    <Button
                                        size='sm'
                                        className='h-7 text-[11px] px-3'
                                        onClick={onSaveBuyAutoConfig}
                                        disabled={!hasAutoConfigDirty || !hasAnyAutoValue || buyAutoConfigSaving}
                                    >
                                        {buyAutoConfigSaving ? 'Saving…' : 'Save Config'}
                                    </Button>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        {/* ── Pricing Strategy Collapsible ────────────────────── */}
                        <Collapsible defaultOpen={false} className='rounded-md border bg-muted/30'>
                            <CollapsibleTrigger className='flex items-center justify-between w-full p-2.5 hover:bg-muted/50 cursor-pointer [&[data-state=open]>svg]:rotate-180'>
                                <span className='text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'>
                                    Pricing Strategy
                                </span>
                                <ChevronDown className='h-3.5 w-3.5 transition-transform duration-200' />
                            </CollapsibleTrigger>
                            <CollapsibleContent className='px-2.5 pb-1 space-y-2'>
                                <div className='space-y-1'>
                                    <div className='flex flex-wrap gap-1'>
                                        {PRICING_PRESET_ORDER.map((preset, index) => {
                                            const isActive = preset === activePricingPreset;
                                            const isCustom = preset === 'custom';
                                            return (
                                                <Button
                                                    key={preset}
                                                    variant={isActive ? 'default' : 'outline'}
                                                    size='sm'
                                                    className={`h-7 text-[11px] px-2 ${isCustom ? 'font-medium' : ''} ${index === PRICING_PRESET_ORDER.length - 1 ? 'ml-auto' : ''}`}
                                                    disabled={buyAutoConfigSaving}
                                                    onClick={() => handlePricingPresetSelect(preset)}
                                                >
                                                    {PRICING_PRESET_LABELS[preset] ?? preset}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div
                                    className={`space-y-2 pt-1${activePricingPreset !== 'custom' ? ' opacity-50' : ''}`}
                                    onClick={() => {
                                        if (activePricingPreset !== 'custom') {
                                            setActivePricingPreset('custom');
                                        }
                                    }}
                                >
                                    <ConfigRangeSlider
                                        label='Adjustment speed'
                                        valueLow={sliderVal('priceAdjustMaxDown', 0.95)}
                                        valueHigh={sliderVal('priceAdjustMaxUp', 1.05)}
                                        committedLow={committedVal(committedConfig, 'priceAdjustMaxDown')}
                                        committedHigh={committedVal(committedConfig, 'priceAdjustMaxUp')}
                                        min={0.8}
                                        max={1.2}
                                        step={0.01}
                                        onChange={(low, high) =>
                                            handleSliderChange({
                                                priceAdjustMaxDown: String(low),
                                                priceAdjustMaxUp: String(high),
                                            })
                                        }
                                        disabled={buyAutoConfigSaving || activePricingPreset !== 'custom'}
                                    />
                                    <ConfigSlider
                                        label='Soft max bid (in est. cost)'
                                        value={sliderVal('bidOfferMaxCostMultiplier', 6)}
                                        committed={committedVal(committedConfig, 'bidOfferMaxCostMultiplier')}
                                        min={0}
                                        max={10}
                                        step={0.25}
                                        onChange={(v) => handleSliderChange({ bidOfferMaxCostMultiplier: String(v) })}
                                        disabled={buyAutoConfigSaving || activePricingPreset !== 'custom'}
                                    />
                                    <ConfigSlider
                                        label='Target fill rate'
                                        value={sliderVal('targetFillRate', 0.9)}
                                        committed={committedVal(committedConfig, 'targetFillRate')}
                                        min={0.1}
                                        max={1.0}
                                        step={0.05}
                                        isPercent
                                        onChange={(v) => handleSliderChange({ targetFillRate: String(v) })}
                                        disabled={buyAutoConfigSaving || activePricingPreset !== 'custom'}
                                    />
                                </div>

                                <div className='flex items-center justify-between gap-2 pt-1 pb-1.5'>
                                    <PriceAlgorithmDialog mode='buy' diagnostics={bid?.diagnostics} />
                                    <div className='flex items-center gap-2'>
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            className={`h-7 text-[11px] px-2 ${hasAutoConfigDirty ? '' : 'invisible'}`}
                                            onClick={onResetBuyAutoConfig}
                                            disabled={buyAutoConfigSaving}
                                        >
                                            <RotateCcw className='h-3 w-3 mr-1' />
                                            Reset
                                        </Button>
                                        <Button
                                            size='sm'
                                            className='h-7 text-[11px] px-3'
                                            onClick={onSaveBuyAutoConfig}
                                            disabled={!hasAutoConfigDirty || !hasAnyAutoValue || buyAutoConfigSaving}
                                        >
                                            {buyAutoConfigSaving ? 'Saving…' : 'Save Config'}
                                        </Button>
                                    </div>
                                </div>

                                <Separator />

                                <div className='pt-1'>
                                    <Label className='text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'>
                                        Set Price
                                    </Label>
                                    <div className='relative'>
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
                                                            bid?.bidPrice !== undefined
                                                                ? bid.bidPrice.toFixed(2)
                                                                : (defaultPrice ?? 'e.g. 1.50')
                                                        }
                                                        value={local.bidPrice}
                                                        disabled={buyPriceSaving}
                                                        onChange={(e) =>
                                                            onLocalChange(resourceName, { bidPrice: e.target.value })
                                                        }
                                                        className={
                                                            getFieldClassName('bidPrice', buyPriceSaving) +
                                                            ` text-right`
                                                        }
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
                                                                onClick={() =>
                                                                    onLocalChange(resourceName, {
                                                                        bidPrice: price.toFixed(2),
                                                                    })
                                                                }
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
                                        </div>

                                        {fundsWarning && (
                                            <Alert variant='destructive' className='py-2'>
                                                <AlertCircle className='h-3.5 w-3.5' />
                                                <AlertDescription className='text-xs'>
                                                    Bid cost ({formatNumberWithUnit(totalBidCost, 'currency', planetId)}
                                                    ) exceeds available deposits (
                                                    {formatNumberWithUnit(deposits, 'currency', planetId)}).
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        {bid?.depositScaleWarning && (
                                            <Alert
                                                variant={
                                                    bid.depositScaleWarning === 'dropped' ? 'destructive' : 'default'
                                                }
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

                                        {local.validationErrors.bidPrice && (
                                            <div className='text-xs text-red-600 dark:text-red-400 flex items-center gap-1'>
                                                <AlertCircle className='h-3 w-3' />
                                                Price: {local.validationErrors.bidPrice}
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        className={`absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-lg transition-opacity duration-200 ${
                                            buyPriceOverlay
                                                ? 'opacity-100 pointer-events-auto'
                                                : 'opacity-0 pointer-events-none'
                                        }`}
                                    >
                                        <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                                            {buyPriceOverlay && <Spinner className='h-4 w-4' />}
                                            {buyPriceOverlay ?? '-'}
                                        </span>
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
                </div>
                {overlay(buyAutoConfigOverlay)}
            </div>
        </div>
    );
}
