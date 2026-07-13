'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { AutomatedPricingConfig } from '@/simulation/planet/planet';
import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import React from 'react';
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
    { key: 'inputBufferTargetTicks', label: 'Input buffer (ticks)', min: 1, max: 120, step: 1, defaultVal: 30 },
    {
        key: 'targetFillRate',
        label: 'Target fill rate',
        min: 0.1,
        max: 1.0,
        step: 0.05,
        defaultVal: 0.9,
        isPercent: true,
    },
    { key: 'priceAdjustMaxUp', label: 'Price adjust max up', min: 1.0, max: 1.5, step: 0.01, defaultVal: 1.05 },
    { key: 'priceAdjustMaxDown', label: 'Price adjust max down', min: 0.5, max: 1.0, step: 0.01, defaultVal: 0.95 },
    { key: 'costSpringStrength', label: 'Cost spring strength', min: 0, max: 0.5, step: 0.01, defaultVal: 0.1 },
    { key: 'bidOfferMaxCostMultiplier', label: 'Max cost multiplier', min: 1, max: 30, step: 1, defaultVal: 6 },
    { key: 'inventorySmoothingMaxExtra', label: 'Inventory smoothing extra', min: 0, max: 20, step: 1, defaultVal: 2 },
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
    { key: 'automatedCostFloorBuffer', label: 'Cost floor buffer', min: 0, max: 5.0, step: 0.1, defaultVal: 0.5 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function committedVal(config: AutomatedPricingConfig | undefined, key: keyof AutoConfigLocalState): number | undefined {
    const raw = (config as Record<string, unknown>)?.[key as keyof AutomatedPricingConfig];
    return typeof raw === 'number' ? raw : undefined;
}

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
}): React.ReactElement {
    const sliders = mode === 'buy' ? BUY_SLIDERS : SELL_SLIDERS;
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

                    return (
                        <div key={def.key} className='space-y-1'>
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
                                    disabled={isSaving}
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
