'use client';

import { Stat } from '@/components/client/Stat';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { AlertCircle, ChevronDown, Package, RotateCcw, Tag } from 'lucide-react';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { getResourceByName, productionPerTick } from './marketHelpers';
import type { SellSectionProps } from './marketTypes';
import type { AutoConfigLocalState } from './marketTypes';
import { ConfigSlider, ConfigRangeSlider } from './ConfigSlider';
import { PriceAlgorithmDialog } from './PriceAlgorithmDialog';
import { Label } from '@/components/ui/label';
import {
    detectPricingSellPreset,
    detectVolumeSellPreset,
    PRICING_SELL_PRESETS,
    PRICING_PRESET_LABELS,
    PRICING_PRESET_ORDER,
    VOLUME_SELL_PRESETS,
    VOLUME_PRESET_LABELS,
    VOLUME_PRESET_ORDER,
    type PricingPresetType,
    type VolumePresetType,
} from './StrategyPresets';

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

function committedVal(
    config: import('@/simulation/planet/planet').AutomatedPricingConfig | undefined,
    key: keyof AutoConfigLocalState,
): number | undefined {
    const raw = (config as Record<string, unknown>)?.[
        key as keyof import('@/simulation/planet/planet').AutomatedPricingConfig
    ];
    return typeof raw === 'number' ? raw : undefined;
}

const BUFFER_KEYS = new Set<keyof AutoConfigLocalState>(['outputBufferMaxTicks', 'inventorySmoothingMaxExtra']);

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

    const handleSellConfigChange = useCallback(
        (patch: Record<string, string>) => {
            const updatedSellAutoConfig = { ...local.sellAutoConfig, ...patch } as typeof local.sellAutoConfig;
            onLocalChange(resourceName, { sellAutoConfig: updatedSellAutoConfig });
        },
        [local, onLocalChange, resourceName],
    );

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

    // ── Auto-config state ────────────────────────────────────────────────────
    const committedConfig = offer?.autoConfig;

    const [activeVolumePreset, setActiveVolumePreset] = useState<VolumePresetType>(() =>
        detectVolumeSellPreset(local.sellAutoConfig),
    );
    const [activePricingPreset, setActivePricingPreset] = useState<PricingPresetType>(() =>
        detectPricingSellPreset(local.sellAutoConfig),
    );

    useEffect(() => {
        setActiveVolumePreset(detectVolumeSellPreset(local.sellAutoConfig));
        setActivePricingPreset(detectPricingSellPreset(local.sellAutoConfig));
    }, [local.sellAutoConfig]);

    const handleVolumePresetSelect = useCallback(
        (preset: VolumePresetType) => {
            setActiveVolumePreset(preset);
            if (preset === 'custom') {
                return;
            }
            const values = VOLUME_SELL_PRESETS[preset as Exclude<VolumePresetType, 'custom'>];
            handleSellConfigChange(values as unknown as Record<string, string>);
        },
        [handleSellConfigChange],
    );

    const handlePricingPresetSelect = useCallback(
        (preset: PricingPresetType) => {
            setActivePricingPreset(preset);
            if (preset === 'custom') {
                return;
            }
            const values = PRICING_SELL_PRESETS[preset as Exclude<PricingPresetType, 'custom'>];
            handleSellConfigChange(values as unknown as Record<string, string>);
        },
        [handleSellConfigChange],
    );

    const handleSliderChange = useCallback(
        (patch: Record<string, string>) => {
            const changedKey = Object.keys(patch)[0] as keyof AutoConfigLocalState | undefined;
            if (changedKey) {
                if (
                    BUFFER_KEYS.has(changedKey) ||
                    changedKey === 'freeSellQuantity' ||
                    changedKey === 'freeSellQuantitySmoothingMaxExtra'
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
            handleSellConfigChange(patch);
        },
        [handleSellConfigChange, activeVolumePreset, activePricingPreset],
    );

    const ALL_AUTO_KEYS: (keyof AutoConfigLocalState)[] = [
        'inventorySmoothingMaxExtra',
        'outputBufferMaxTicks',
        'freeSellQuantity',
        'freeSellQuantitySmoothingMaxExtra',
        'priceAdjustMaxUp',
        'priceAdjustMaxDown',
        'automatedCostFloorBuffer',
        'targetSellThrough',
    ];

    const hasAutoConfigDirty = ALL_AUTO_KEYS.some((key) => {
        const localVal = local.sellAutoConfig[key] !== '' ? parseFloat(local.sellAutoConfig[key]) : undefined;
        const committed = committedVal(committedConfig, key);
        return localVal !== undefined && localVal !== committed;
    });
    const hasAnyAutoValue = ALL_AUTO_KEYS.some((key) => local.sellAutoConfig[key] !== '');

    const sliderVal = (key: keyof AutoConfigLocalState, defaultVal: number): number => {
        const raw = local.sellAutoConfig[key];
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
                                                    disabled={sellAutoConfigSaving}
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
                                        {productionBreakdown ?? <Stat label='Production' value='-' />}
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
                                    {/* Output buffer group */}
                                    <div className='space-y-2'>
                                        <Label className='text-[10px] text-muted-foreground/70 uppercase tracking-wider'>
                                            Output buffer
                                        </Label>
                                        <div className={isFacilityOutput ? 'space-y-2' : 'space-y-2 opacity-50'}>
                                            <ConfigSlider
                                                label='Max sell rate (days)'
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
                                                    sellAutoConfigSaving ||
                                                    activeVolumePreset !== 'custom' ||
                                                    !isFacilityOutput
                                                }
                                            />
                                            <ConfigSlider
                                                label='Output buffer (days)'
                                                value={sliderVal('outputBufferMaxTicks', 20)}
                                                committed={committedVal(committedConfig, 'outputBufferMaxTicks')}
                                                min={1}
                                                max={120}
                                                step={1}
                                                onChange={(v) =>
                                                    handleSliderChange({ outputBufferMaxTicks: String(v) })
                                                }
                                                disabled={
                                                    sellAutoConfigSaving ||
                                                    activeVolumePreset !== 'custom' ||
                                                    !isFacilityOutput
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
                                            label='Free sell quantity (total)'
                                            value={sliderVal('freeSellQuantity', 0)}
                                            committed={committedVal(committedConfig, 'freeSellQuantity')}
                                            min={0}
                                            max={10000}
                                            step={1}
                                            onChange={(v) => handleSliderChange({ freeSellQuantity: String(v) })}
                                            disabled={sellAutoConfigSaving || activeVolumePreset !== 'custom'}
                                        />
                                        <ConfigSlider
                                            label='Free sell fill days'
                                            value={sliderVal('freeSellQuantitySmoothingMaxExtra', 2)}
                                            committed={committedVal(
                                                committedConfig,
                                                'freeSellQuantitySmoothingMaxExtra',
                                            )}
                                            min={1}
                                            max={20}
                                            step={1}
                                            onChange={(v) =>
                                                handleSliderChange({ freeSellQuantitySmoothingMaxExtra: String(v) })
                                            }
                                            disabled={sellAutoConfigSaving || activeVolumePreset !== 'custom'}
                                        />
                                    </div>
                                </div>

                                <div className='flex items-center justify-end gap-2 pt-1'>
                                    <Button
                                        variant='outline'
                                        size='sm'
                                        className={`h-7 text-[11px] px-2 ${hasAutoConfigDirty ? '' : 'invisible'}`}
                                        onClick={onResetSellAutoConfig}
                                        disabled={sellAutoConfigSaving}
                                    >
                                        <RotateCcw className='h-3 w-3 mr-1' />
                                        Reset
                                    </Button>
                                    <Button
                                        size='sm'
                                        className='h-7 text-[11px] px-3'
                                        onClick={onSaveSellAutoConfig}
                                        disabled={!hasAutoConfigDirty || !hasAnyAutoValue || sellAutoConfigSaving}
                                    >
                                        {sellAutoConfigSaving ? 'Saving…' : 'Save Config'}
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
                                                    disabled={sellAutoConfigSaving}
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
                                        disabled={sellAutoConfigSaving || activePricingPreset !== 'custom'}
                                    />
                                    <ConfigSlider
                                        label='Soft min ask (in est. cost)'
                                        value={sliderVal('automatedCostFloorBuffer', 1.5)}
                                        committed={committedVal(committedConfig, 'automatedCostFloorBuffer')}
                                        min={0}
                                        max={10}
                                        step={0.25}
                                        inverted
                                        onChange={(v) => handleSliderChange({ automatedCostFloorBuffer: String(v) })}
                                        disabled={sellAutoConfigSaving || activePricingPreset !== 'custom'}
                                    />
                                    <ConfigSlider
                                        label='Target sell-through'
                                        value={sliderVal('targetSellThrough', 0.9)}
                                        committed={committedVal(committedConfig, 'targetSellThrough')}
                                        min={0.1}
                                        max={0.99}
                                        step={0.01}
                                        isPercent
                                        onChange={(v) => handleSliderChange({ targetSellThrough: String(v) })}
                                        disabled={sellAutoConfigSaving || activePricingPreset !== 'custom'}
                                    />
                                </div>

                                <div className='flex items-center justify-between gap-2 pt-1 pb-1.5'>
                                    <PriceAlgorithmDialog mode='sell' diagnostics={offer?.diagnostics} />
                                    <div className='flex items-center gap-2'>
                                        <Button
                                            variant='outline'
                                            size='sm'
                                            className={`h-7 text-[11px] px-2 ${hasAutoConfigDirty ? '' : 'invisible'}`}
                                            onClick={onResetSellAutoConfig}
                                            disabled={sellAutoConfigSaving}
                                        >
                                            <RotateCcw className='h-3 w-3 mr-1' />
                                            Reset
                                        </Button>
                                        <Button
                                            size='sm'
                                            className='h-7 text-[11px] px-3'
                                            onClick={onSaveSellAutoConfig}
                                            disabled={!hasAutoConfigDirty || !hasAnyAutoValue || sellAutoConfigSaving}
                                        >
                                            {sellAutoConfigSaving ? 'Saving…' : 'Save Config'}
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
                                                        onChange={(e) =>
                                                            onLocalChange(resourceName, { offerPrice: e.target.value })
                                                        }
                                                        className={
                                                            getFieldClassName('offerPrice', sellPriceSaving) +
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
                                                                disabled={sellPriceSaving}
                                                                onClick={() =>
                                                                    onLocalChange(resourceName, {
                                                                        offerPrice: price.toFixed(2),
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
                                                onClick={onSaveSell}
                                                disabled={
                                                    !hasDirtySellFields || !!hasValidationErrors || sellPriceSaving
                                                }
                                            >
                                                {sellPriceSaving ? 'Setting…' : 'Set'}
                                            </Button>
                                        </div>

                                        {local.validationErrors.offerPrice && (
                                            <div className='text-xs text-red-600 dark:text-red-400 flex items-center gap-1'>
                                                <AlertCircle className='h-3 w-3' />
                                                Price: {local.validationErrors.offerPrice}
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        className={`absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-lg transition-opacity duration-200 ${
                                            sellPriceOverlay
                                                ? 'opacity-100 pointer-events-auto'
                                                : 'opacity-0 pointer-events-none'
                                        }`}
                                    >
                                        <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                                            {sellPriceOverlay && <Spinner className='h-4 w-4' />}
                                            {sellPriceOverlay ?? '-'}
                                        </span>
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
                </div>
                {overlay(sellAutoConfigOverlay)}
            </div>
        </div>
    );
}
