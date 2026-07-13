'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { AutomatedPricingConfig, SellDiagnostics, BuyDiagnostics } from '@/simulation/planet/planet';
import { AlertCircle, BarChart3, CheckCircle2, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import React, { useState } from 'react';
import type { AutoConfigLocalState } from './marketTypes';

// ── Slider config ─────────────────────────────────────────────────────────────

type SliderDef = {
    key: keyof AutoConfigLocalState;
    label: string;
    min: number;
    max: number;
    step: number;
    defaultVal: number;
    isPercent?: boolean;
};

const BUY_SLIDERS: SliderDef[] = [
    { key: 'inputBufferTargetTicks', label: 'Input buffer (days)', min: 1, max: 120, step: 1, defaultVal: 30 },
    { key: 'inventorySmoothingMaxExtra', label: 'Max buy rate (days)', min: 0, max: 20, step: 1, defaultVal: 2 },
    {
        key: 'targetFillRate',
        label: 'Target fill rate',
        min: 0.5,
        max: 1.0,
        step: 0.025,
        defaultVal: 0.9,
        isPercent: true,
    },
    { key: 'priceAdjustMaxUp', label: 'Price adjust max up', min: 1.0, max: 1.5, step: 0.01, defaultVal: 1.05 },
    { key: 'priceAdjustMaxDown', label: 'Price adjust max down', min: 0.5, max: 1.0, step: 0.01, defaultVal: 0.95 },
];

const SELL_SLIDERS: SliderDef[] = [
    ...BUY_SLIDERS.filter((s) => s.key !== 'inputBufferTargetTicks' && s.key !== 'targetFillRate'),
    { key: 'outputBufferMaxTicks', label: 'Output buffer (ticks)', min: 1, max: 120, step: 1, defaultVal: 20 },
    {
        key: 'targetSellThrough',
        label: 'Target sell-through',
        min: 0.1,
        max: 0.99,
        step: 0.01,
        defaultVal: 0.9,
        isPercent: true,
    },
    { key: 'automatedCostFloorBuffer', label: 'Cost floor buffer', min: -1, max: 2.0, step: 0.25, defaultVal: 0.5 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function committedVal(config: AutomatedPricingConfig | undefined, key: keyof AutoConfigLocalState): number | undefined {
    const raw = (config as Record<string, unknown>)?.[key as keyof AutomatedPricingConfig];
    return typeof raw === 'number' ? raw : undefined;
}

// Buffer-related slider keys that depend on the company producing/consuming the resource
const BUFFER_KEYS = new Set<keyof AutoConfigLocalState>([
    'inputBufferTargetTicks',
    'outputBufferMaxTicks',
    'inventorySmoothingMaxExtra',
]);

function formatSliderValue(v: number, def: SliderDef): string {
    if (def.isPercent) {
        return `${Math.round(v * 100)}%`;
    }
    return v.toFixed(v % 1 === 0 ? 0 : 2);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AutoConfigPanel({
    mode,
    committedConfig,
    localConfig,
    onConfigChange,
    onSave,
    onReset,
    isSaving,
    successMsg,
    errorMsg,
    diagnostics,
    staleReason,
    bufferApplicable = true,
}: {
    mode: 'buy' | 'sell';
    committedConfig: AutomatedPricingConfig | undefined;
    localConfig: AutoConfigLocalState;
    onConfigChange: (patch: Partial<AutoConfigLocalState>) => void;
    onSave: () => void;
    onReset: () => void;
    isSaving: boolean;
    successMsg: string | null;
    errorMsg: string | null;
    diagnostics?: SellDiagnostics | BuyDiagnostics | null;
    staleReason?: string | null;
    bufferApplicable?: boolean;
}): React.ReactElement {
    const sliders = mode === 'buy' ? BUY_SLIDERS : SELL_SLIDERS;
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const hasDirty = sliders.some((s) => {
        const localVal = localConfig[s.key] !== '' ? parseFloat(localConfig[s.key]) : undefined;
        const committed = committedVal(committedConfig, s.key);
        return localVal !== undefined && localVal !== committed;
    });
    const hasAnyValue = sliders.some((s) => localConfig[s.key] !== '');

    return (
        <div className='space-y-3 pt-2'>
            <div className='rounded-md border bg-muted/30 p-2.5 space-y-3'>
                {sliders.map((def) => {
                    const rawLocal = localConfig[def.key];
                    const localNum = rawLocal !== '' ? parseFloat(rawLocal) : undefined;
                    const committed = committedVal(committedConfig, def.key);
                    const displayVal = localNum ?? committed ?? def.defaultVal;
                    const clampedVal = Math.max(def.min, Math.min(def.max, displayVal));

                    // Compute committed marker position (0-1 range on the track)
                    const committedClamped =
                        committed !== undefined ? Math.max(def.min, Math.min(def.max, committed)) : undefined;
                    const committedFraction =
                        committedClamped !== undefined ? (committedClamped - def.min) / (def.max - def.min) : undefined;

                    const isBufferSlider = BUFFER_KEYS.has(def.key);
                    const sliderDisabled = isSaving || (isBufferSlider && !bufferApplicable);
                    const containerClass = `space-y-1${isBufferSlider && !bufferApplicable ? ' opacity-50' : ''}`;

                    return (
                        <div key={def.key} className={containerClass}>
                            <div className='flex items-center justify-between'>
                                <Label className='text-[11px] text-muted-foreground'>{def.label}</Label>
                                <span className='text-[11px] tabular-nums font-medium'>
                                    {formatSliderValue(clampedVal, def)}
                                    {committed !== undefined && committed !== clampedVal && (
                                        <span className='text-muted-foreground ml-1'>
                                            (current: {formatSliderValue(committed, def)})
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className='relative'>
                                <Slider
                                    min={def.min}
                                    max={def.max}
                                    step={def.step}
                                    value={[clampedVal]}
                                    onValueChange={([v]) => {
                                        if (v !== undefined) {
                                            onConfigChange({ [def.key]: String(v) });
                                        }
                                    }}
                                    disabled={sliderDisabled}
                                    className='w-full'
                                />
                                {/* Committed value marker */}
                                {committedFraction !== undefined && (
                                    <div
                                        className='absolute top-0 w-0.5 h-4 bg-foreground/40 rounded-full pointer-events-none'
                                        style={{
                                            left: `${committedFraction * 100}%`,
                                            transform: 'translateX(-50%)',
                                            top: '2px',
                                        }}
                                    />
                                )}
                            </div>
                            <div className='flex justify-between text-[9px] text-muted-foreground'>
                                <span>{formatSliderValue(def.min, def)}</span>
                                <span>{formatSliderValue(def.max, def)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Diagnostics panel */}
            {(diagnostics || staleReason) && (
                <div className='rounded-md border bg-muted/20 p-2 space-y-2'>
                    <button
                        onClick={() => setShowDiagnostics(!showDiagnostics)}
                        className='flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground w-full text-left'
                    >
                        <BarChart3 className='h-3.5 w-3.5' />
                        <span className='font-medium'>Last tick pricing diagnostics</span>
                        {showDiagnostics ? (
                            <ChevronUp className='h-3 w-3 ml-auto' />
                        ) : (
                            <ChevronDown className='h-3 w-3 ml-auto' />
                        )}
                    </button>
                    {showDiagnostics && (
                        <div className='space-y-2 text-[11px]'>
                            {diagnostics ? (
                                mode === 'sell' ? (
                                    (() => {
                                        const d = diagnostics as SellDiagnostics;
                                        const pct = (v: number) => `${Math.round(v * 100)}%`;
                                        const priceChange = d.newPrice - d.oldPrice;
                                        const dir =
                                            priceChange > 0 ? 'increased' : priceChange < 0 ? 'decreased' : 'stayed';
                                        const dirClass =
                                            priceChange > 0 ? 'text-green-600' : priceChange < 0 ? 'text-red-500' : '';
                                        return (
                                            <>
                                                <div className='grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]'>
                                                    <span>Sell-through</span>
                                                    <span
                                                        className={`tabular-nums ${d.sellThroughRate >= d.targetSellThrough ? 'text-green-600' : 'text-red-500'}`}
                                                    >
                                                        {pct(d.sellThroughRate)} (target {pct(d.targetSellThrough)})
                                                    </span>
                                                    <span>Effectively selling</span>
                                                    <span className='tabular-nums'>
                                                        {d.effectiveQuantity.toFixed(0)} / tick
                                                    </span>
                                                    {d.surplusRatio !== undefined && (
                                                        <>
                                                            <span>Surplus ratio</span>
                                                            <span className='tabular-nums'>{pct(d.surplusRatio)}</span>
                                                        </>
                                                    )}
                                                    <span>Price change factor</span>
                                                    <span className='tabular-nums'>
                                                        base {d.baseFactor.toFixed(4)} ± cost{' '}
                                                        {d.costSpringDeviation.toFixed(4)} − over{' '}
                                                        {d.overDeviation.toFixed(4)}
                                                        {' = '}
                                                        <span className='font-semibold'>{d.netFactor.toFixed(4)}</span>
                                                    </span>
                                                    <span>Price</span>
                                                    <span className={`tabular-nums font-semibold ${dirClass}`}>
                                                        {d.oldPrice.toFixed(2)} → {d.newPrice.toFixed(2)}
                                                    </span>
                                                </div>
                                                <p className='text-[10px] italic text-muted-foreground pt-1 border-t border-border/40'>
                                                    Price {dir} by {Math.abs(priceChange).toFixed(2)} (
                                                    {Math.abs((priceChange / d.oldPrice) * 100).toFixed(1)}%). Cost
                                                    floor: {d.costFloor.toFixed(2)}. Market price:{' '}
                                                    {d.marketPrice.toFixed(2)}.
                                                </p>
                                            </>
                                        );
                                    })()
                                ) : (
                                    (() => {
                                        const d = diagnostics as BuyDiagnostics;
                                        const pct = (v: number) => `${Math.round(v * 100)}%`;
                                        const priceChange = d.newBidPrice - d.oldBidPrice;
                                        const dir =
                                            priceChange > 0 ? 'increased' : priceChange < 0 ? 'decreased' : 'stayed';
                                        const dirClass =
                                            priceChange > 0 ? 'text-green-600' : priceChange < 0 ? 'text-red-500' : '';
                                        return (
                                            <>
                                                <div className='grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]'>
                                                    <span>Fill rate</span>
                                                    <span
                                                        className={`tabular-nums ${d.fillRate >= d.targetFillRate ? 'text-green-600' : 'text-red-500'}`}
                                                    >
                                                        {pct(d.fillRate)} (target {pct(d.targetFillRate)})
                                                    </span>
                                                    <span>Shortfall</span>
                                                    <span className='tabular-nums'>
                                                        {d.shortfall.toFixed(0)} / {d.storageTarget.toFixed(0)}
                                                    </span>
                                                    <span>Price change factor</span>
                                                    <span className='tabular-nums'>
                                                        base {d.baseFactor.toFixed(4)} − ceiling spring{' '}
                                                        {d.ceilingSpring.toFixed(4)}
                                                        {' = '}
                                                        <span className='font-semibold'>{d.netFactor.toFixed(4)}</span>
                                                    </span>
                                                    <span>Ceiling price</span>
                                                    <span className='tabular-nums'>{d.ceilingPrice.toFixed(2)}</span>
                                                    <span>Bid price</span>
                                                    <span className={`tabular-nums font-semibold ${dirClass}`}>
                                                        {d.oldBidPrice.toFixed(2)} → {d.newBidPrice.toFixed(2)}
                                                    </span>
                                                </div>
                                                <p className='text-[10px] italic text-muted-foreground pt-1 border-t border-border/40'>
                                                    Price {dir} by {Math.abs(priceChange).toFixed(2)} (
                                                    {Math.abs((priceChange / d.oldBidPrice) * 100).toFixed(1)}%). Market
                                                    price: {d.marketPrice.toFixed(2)}. Ceiling:{' '}
                                                    {d.ceilingPrice.toFixed(2)}.
                                                </p>
                                            </>
                                        );
                                    })()
                                )
                            ) : (
                                <div className='flex items-center gap-2 text-muted-foreground'>
                                    <AlertCircle className='h-3.5 w-3.5' />
                                    <span>{staleReason ?? 'No pricing data available for the last tick.'}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Validation & feedback */}
            {errorMsg && (
                <div className='text-xs text-destructive flex items-center gap-1'>
                    <AlertCircle className='h-3 w-3' />
                    <span>{errorMsg}</span>
                </div>
            )}

            <div className='flex items-center justify-between gap-2'>
                <div className='flex items-center gap-2'>
                    {successMsg && (
                        <span className='text-xs text-green-600 dark:text-green-400 flex items-center gap-1'>
                            <CheckCircle2 className='h-3.5 w-3.5' /> {successMsg}
                        </span>
                    )}
                </div>
                <div className='flex items-center gap-2'>
                    {hasDirty && (
                        <Button
                            variant='outline'
                            size='sm'
                            className='h-7 text-[11px] px-2'
                            onClick={onReset}
                            disabled={isSaving}
                        >
                            <RotateCcw className='h-3 w-3 mr-1' />
                            Reset
                        </Button>
                    )}
                    <Button
                        size='sm'
                        className='h-7 text-[11px] px-3'
                        onClick={onSave}
                        disabled={!hasDirty || !hasAnyValue || isSaving}
                    >
                        {isSaving ? 'Saving…' : 'Save Config'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
