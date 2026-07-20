'use client';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Stat } from '@/components/client/Stat';
import { formatNumberWithUnit, type Units } from '@/lib/utils';
import type { AutomatedPricingConfig, SellDiagnostics, BuyDiagnostics } from '@/simulation/planet/planet';
import { Spinner } from '@/components/ui/spinner';
import { ChevronDown, RotateCcw } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import type { AutoConfigLocalState } from './marketTypes';
import {
    detectPricingBuyPreset,
    detectPricingSellPreset,
    detectVolumeBuyPreset,
    detectVolumeSellPreset,
    PRICING_BUY_PRESETS,
    PRICING_PRESET_LABELS,
    PRICING_PRESET_ORDER,
    PRICING_SELL_PRESETS,
    VOLUME_BUY_PRESETS,
    VOLUME_PRESET_LABELS,
    VOLUME_PRESET_ORDER,
    VOLUME_SELL_PRESETS,
    type PricingBuyValues,
    type PricingPresetType,
    type PricingSellValues,
    type VolumeBuyValues,
    type VolumePresetType,
    type VolumeSellValues,
} from './StrategyPresets';

// ── Slider config ─────────────────────────────────────────────────────────────

type SliderDef = {
    key: keyof AutoConfigLocalState;
    label: string;
    min: number;
    max: number;
    step: number;
    defaultVal: number;
    isPercent?: boolean;
    displayTransform?: (v: number) => number;
};

type RangeSliderDef = {
    keys: [keyof AutoConfigLocalState, keyof AutoConfigLocalState];
    label: string;
    min: number;
    max: number;
    step: number;
    defaultVals: [number, number];
    isPercent?: boolean;
};

/** A group of sliders rendered together, optionally preceded by a <Separator /> */
type SliderGroupDef = {
    /** Shown as a small muted label above the group. If omitted, no label is rendered. */
    label?: string;
    sliders: SliderDef[];
    /** If true, this entire group is subject to the `bufferApplicable` prop (dimmed/disabled when false) */
    isBufferGroup?: boolean;
};

const BUY_VOLUME_GROUPS: SliderGroupDef[] = [
    {
        label: 'Combined Needs',
        isBufferGroup: true,
        sliders: [
            { key: 'inputBufferTargetTicks', label: 'Input buffer (days)', min: 1, max: 120, step: 1, defaultVal: 30 },
            {
                key: 'inventorySmoothingMaxExtra',
                label: 'Max buy rate (days)',
                min: 0,
                max: 20,
                step: 1,
                defaultVal: 2,
            },
        ],
    },
    {
        label: 'Free quantity',
        isBufferGroup: false,
        sliders: [
            { key: 'freeBuyQuantity', label: 'Free buy quantity (total)', min: 0, max: 10000, step: 1, defaultVal: 0 },
            {
                key: 'freeBuyQuantitySmoothingMaxExtra',
                label: 'Free buy fill days',
                min: 1,
                max: 20,
                step: 1,
                defaultVal: 2,
            },
        ],
    },
];

const SELL_VOLUME_GROUPS: SliderGroupDef[] = [
    {
        label: 'Output buffer',
        isBufferGroup: true,
        sliders: [
            {
                key: 'inventorySmoothingMaxExtra',
                label: 'Max sell rate (days)',
                min: 0,
                max: 20,
                step: 1,
                defaultVal: 2,
            },
            { key: 'outputBufferMaxTicks', label: 'Output buffer (days)', min: 1, max: 120, step: 1, defaultVal: 20 },
        ],
    },
    {
        label: 'Free quantity',
        isBufferGroup: false,
        sliders: [
            {
                key: 'freeSellQuantity',
                label: 'Free sell quantity (total)',
                min: 0,
                max: 10000,
                step: 1,
                defaultVal: 0,
            },
            {
                key: 'freeSellQuantitySmoothingMaxExtra',
                label: 'Free sell fill days',
                min: 1,
                max: 20,
                step: 1,
                defaultVal: 2,
            },
        ],
    },
];

const PRICE_ADJUST_RANGE: RangeSliderDef = {
    keys: ['priceAdjustMaxDown', 'priceAdjustMaxUp'],
    label: 'Adjustment speed',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultVals: [0.95, 1.05],
};

const BUY_PRICING_SLIDERS: SliderDef[] = [
    {
        key: 'targetFillRate',
        label: 'Target fill rate',
        min: 0.1,
        max: 1.0,
        step: 0.05,
        defaultVal: 0.9,
        isPercent: true,
    },
];

const P_C_RATIO_RANGE_SELL: RangeSliderDef = {
    keys: ['automatedCostFloorBuffer', 'bidOfferMaxCostMultiplier'],
    label: 'Price/Cost range',
    min: 0,
    max: 10,
    step: 0.25,
    defaultVals: [1.5, 6],
};

const P_C_RATIO_RANGE_BUY: RangeSliderDef = {
    keys: ['automatedCostFloorBuffer', 'bidOfferMaxCostMultiplier'],
    label: 'Price/Cost range',
    min: 0,
    max: 10,
    step: 0.25,
    defaultVals: [0, 6],
};

const SELL_PRICING_SLIDERS: SliderDef[] = [
    {
        key: 'targetSellThrough',
        label: 'Target sell-through',
        min: 0.1,
        max: 0.99,
        step: 0.01,
        defaultVal: 0.9,
        isPercent: true,
    },
];

// Buffer-related slider keys that depend on the company producing/consuming the resource
const BUFFER_KEYS = new Set<keyof AutoConfigLocalState>([
    'inputBufferTargetTicks',
    'outputBufferMaxTicks',
    'inventorySmoothingMaxExtra',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function committedVal(config: AutomatedPricingConfig | undefined, key: keyof AutoConfigLocalState): number | undefined {
    const raw = (config as Record<string, unknown>)?.[key as keyof AutomatedPricingConfig];
    return typeof raw === 'number' ? raw : undefined;
}

function formatSliderValue(v: number, isPercent: boolean): string {
    if (isPercent) {
        return `${Math.round(v * 100)}%`;
    }
    return v.toFixed(v % 1 === 0 ? 0 : 2);
}

function renderSingleSlider(
    def: SliderDef,
    localConfig: AutoConfigLocalState,
    committedConfig: AutomatedPricingConfig | undefined,
    isSaving: boolean,
    bufferApplicable: boolean,
    onConfigChange: (patch: Partial<AutoConfigLocalState>) => void,
    presetDisabled: boolean = false,
): React.ReactElement {
    const rawLocal = localConfig[def.key];
    const localNum = rawLocal !== '' ? parseFloat(rawLocal) : undefined;
    const committed = committedVal(committedConfig, def.key);
    const displayVal = localNum ?? committed ?? def.defaultVal;
    const clampedVal = Math.max(def.min, Math.min(def.max, displayVal));

    const committedClamped = committed !== undefined ? Math.max(def.min, Math.min(def.max, committed)) : undefined;
    const committedFraction =
        committedClamped !== undefined ? (committedClamped - def.min) / (def.max - def.min) : undefined;

    const isBufferSlider = BUFFER_KEYS.has(def.key);
    const sliderDisabled = isSaving || presetDisabled || (isBufferSlider && !bufferApplicable);
    const containerClass = `space-y-1${(isBufferSlider && !bufferApplicable) || presetDisabled ? ' opacity-50' : ''}`;

    const fmt = (v: number): string =>
        formatSliderValue(def.displayTransform ? def.displayTransform(v) : v, !!def.isPercent);

    const showCommitted = committed !== undefined && committed !== clampedVal;

    return (
        <div key={def.key} className={containerClass}>
            <div className='flex items-center justify-between'>
                <Label className='text-[11px] text-muted-foreground'>{def.label}</Label>
                <span className='text-[11px] tabular-nums font-medium'>
                    {fmt(clampedVal)}
                    <span className={`ml-1 ${showCommitted ? '' : 'invisible'}`}>
                        (current: {showCommitted ? fmt(committed) : '-'})
                    </span>
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
                <div
                    className={`absolute top-0 w-0.5 h-4 bg-foreground/40 rounded-full pointer-events-none ${
                        committedFraction !== undefined ? '' : 'opacity-0'
                    }`}
                    style={{
                        left: `${(committedFraction ?? 0) * 100}%`,
                        transform: 'translateX(-50%)',
                        top: '2px',
                    }}
                />
            </div>
            <div className='flex justify-between text-[9px] text-muted-foreground'>
                <span>{fmt(def.min)}</span>
                <span>{fmt(def.max)}</span>
            </div>
        </div>
    );
}

function renderRangeSlider(
    def: RangeSliderDef,
    localConfig: AutoConfigLocalState,
    committedConfig: AutomatedPricingConfig | undefined,
    isSaving: boolean,
    onConfigChange: (patch: Partial<AutoConfigLocalState>) => void,
    presetDisabled: boolean = false,
): React.ReactElement {
    const [keyLow, keyHigh] = def.keys;
    const rawLow = localConfig[keyLow];
    const rawHigh = localConfig[keyHigh];
    const committedLow = committedVal(committedConfig, keyLow);
    const committedHigh = committedVal(committedConfig, keyHigh);

    const valLow = rawLow !== '' ? parseFloat(rawLow) : (committedLow ?? def.defaultVals[0]);
    const valHigh = rawHigh !== '' ? parseFloat(rawHigh) : (committedHigh ?? def.defaultVals[1]);
    const clampedLow = Math.max(def.min, Math.min(def.max, valLow));
    const clampedHigh = Math.max(def.min, Math.min(def.max, valHigh));

    const fmt = (v: number): string => formatSliderValue(v, !!def.isPercent);

    const committedClampedLow =
        committedLow !== undefined ? Math.max(def.min, Math.min(def.max, committedLow)) : undefined;
    const committedClampedHigh =
        committedHigh !== undefined ? Math.max(def.min, Math.min(def.max, committedHigh)) : undefined;
    const commitFracLow =
        committedClampedLow !== undefined ? (committedClampedLow - def.min) / (def.max - def.min) : undefined;
    const commitFracHigh =
        committedClampedHigh !== undefined ? (committedClampedHigh - def.min) / (def.max - def.min) : undefined;

    const showCommittedLow = committedLow !== undefined && committedLow !== clampedLow;
    const showCommittedHigh = committedHigh !== undefined && committedHigh !== clampedHigh;

    return (
        <div key={def.keys.join('-')} className='space-y-1'>
            <div className='flex items-center justify-between'>
                <Label className='text-[11px] text-muted-foreground'>{def.label}</Label>
                <span className='text-[11px] tabular-nums font-medium'>
                    {fmt(clampedLow)} — {fmt(clampedHigh)}
                    <span className={`ml-1 ${showCommittedLow || showCommittedHigh ? '' : 'invisible'}`}>
                        (current: {showCommittedLow ? fmt(committedLow!) : fmt(clampedLow)} —{' '}
                        {showCommittedHigh ? fmt(committedHigh!) : fmt(clampedHigh)})
                    </span>
                </span>
            </div>
            <div className='relative'>
                <Slider
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={[clampedLow, clampedHigh]}
                    onValueChange={([low, high]) => {
                        const patch: Partial<AutoConfigLocalState> = {};
                        if (low !== undefined) {
                            patch[keyLow] = String(low);
                        }
                        if (high !== undefined) {
                            patch[keyHigh] = String(high);
                        }
                        onConfigChange(patch);
                    }}
                    disabled={isSaving || presetDisabled}
                    className='w-full'
                />
                <div
                    className={`absolute top-0 w-0.5 h-4 bg-foreground/40 rounded-full pointer-events-none ${
                        commitFracLow !== undefined ? '' : 'opacity-0'
                    }`}
                    style={{
                        left: `${(commitFracLow ?? 0) * 100}%`,
                        transform: 'translateX(-50%)',
                        top: '2px',
                    }}
                />
                <div
                    className={`absolute top-0 w-0.5 h-4 bg-foreground/40 rounded-full pointer-events-none ${
                        commitFracHigh !== undefined ? '' : 'opacity-0'
                    }`}
                    style={{
                        left: `${(commitFracHigh ?? 0) * 100}%`,
                        transform: 'translateX(-50%)',
                        top: '2px',
                    }}
                />
            </div>
            <div className='flex justify-between text-[9px] text-muted-foreground'>
                <span>{fmt(def.min)}</span>
                <span>{fmt(def.max)}</span>
            </div>
        </div>
    );
}

// ── Preset button row ─────────────────────────────────────────────────────────

function PresetButtonRow<T extends string>({
    label,
    presets,
    labels,
    activePreset,
    onSelect,
    isSaving,
}: {
    label: string;
    presets: readonly T[];
    labels: Record<T, string>;
    activePreset: T;
    onSelect: (preset: T) => void;
    isSaving: boolean;
}): React.ReactElement {
    return (
        <div className='space-y-1'>
            <Label className='text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pb-1'>
                {label}
            </Label>
            <div className='flex flex-wrap gap-1'>
                {presets.map((preset, index) => {
                    const isActive = preset === activePreset;
                    const isCustom = preset === ('custom' as unknown as T);
                    return (
                        <Button
                            key={preset}
                            variant={isActive ? 'default' : 'outline'}
                            size='sm'
                            className={`h-7 text-[11px] px-2 ${isCustom ? 'font-medium' : ''} ${index === presets.length - 1 ? 'ml-auto' : ''}`}
                            disabled={isSaving}
                            onClick={() => onSelect(preset)}
                        >
                            {labels[preset] ?? preset}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}

// ── Diagnostics helpers ───────────────────────────────────────────────────────

function SellVolumeDiagnostics({
    diagnostics,
    unit,
}: {
    diagnostics: SellDiagnostics | undefined;
    unit: string;
}): React.ReactElement {
    return (
        <>
            <Stat
                label='Selling'
                value={
                    diagnostics
                        ? `${formatNumberWithUnit(diagnostics.effectiveQuantity, unit as Units)} / tick`
                        : '-'
                }
            />
            <Stat
                label='Surplus'
                value={diagnostics?.surplusRatio !== undefined ? `${Math.round(diagnostics.surplusRatio * 100)}%` : '-'}
            />
        </>
    );
}

function SellPricingDiagnostics({
    diagnostics,
    planetId,
}: {
    diagnostics: SellDiagnostics | undefined;
    planetId: string;
}): React.ReactElement {
    return (
        <>
            <Stat
                label='Sell-through'
                value={
                    diagnostics
                        ? `${Math.round(diagnostics.sellThroughRate * 100)}% (target ${Math.round(diagnostics.targetSellThrough * 100)}%)`
                        : '-'
                }
                valueClassName={
                    diagnostics && diagnostics.sellThroughRate >= diagnostics.targetSellThrough
                        ? 'text-green-600'
                        : 'text-red-500'
                }
            />
            <Stat
                label='Price'
                value={
                    diagnostics
                        ? `${formatNumberWithUnit(diagnostics.oldPrice, 'currency', planetId)} → ${formatNumberWithUnit(diagnostics.newPrice, 'currency', planetId)}`
                        : '-'
                }
            />
            <Stat
                label='Market / Cost floor'
                value={
                    diagnostics
                        ? `${formatNumberWithUnit(diagnostics.marketPrice, 'currency', planetId)} / ${formatNumberWithUnit(diagnostics.costFloor, 'currency', planetId)}`
                        : '-'
                }
            />
        </>
    );
}

function BuyVolumeDiagnostics({
    diagnostics,
    unit,
}: {
    diagnostics: BuyDiagnostics | undefined;
    unit: string;
}): React.ReactElement {
    return (
        <Stat
            label='Shortfall'
            value={
                diagnostics
                    ? `${formatNumberWithUnit(diagnostics.shortfall, unit as Units)} / ${formatNumberWithUnit(diagnostics.storageTarget, unit as Units)}`
                    : '-'
            }
        />
    );
}

function BuyPricingDiagnostics({
    diagnostics,
    planetId,
}: {
    diagnostics: BuyDiagnostics | undefined;
    planetId: string;
}): React.ReactElement {
    return (
        <>
            <Stat
                label='Fill rate'
                value={
                    diagnostics
                        ? `${Math.round(diagnostics.fillRate * 100)}% (target ${Math.round(diagnostics.targetFillRate * 100)}%)`
                        : '-'
                }
                valueClassName={
                    diagnostics && diagnostics.fillRate >= diagnostics.targetFillRate
                        ? 'text-green-600'
                        : 'text-red-500'
                }
            />
            <Stat
                label='Bid price'
                value={
                    diagnostics
                        ? `${formatNumberWithUnit(diagnostics.oldBidPrice, 'currency', planetId)} → ${formatNumberWithUnit(diagnostics.newBidPrice, 'currency', planetId)}`
                        : '-'
                }
            />
            <Stat
                label='Market / Ceiling'
                value={
                    diagnostics
                        ? `${formatNumberWithUnit(diagnostics.marketPrice, 'currency', planetId)} / ${formatNumberWithUnit(diagnostics.ceilingPrice, 'currency', planetId)}`
                        : '-'
                }
            />
        </>
    );
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
    bufferApplicable = true,
    diagnostics,
    unit = 'pieces',
    planetId = '',
    staleReason,
    consumptionBreakdown,
    manualPricingSlot,
    manualPriceOverlay,
}: {
    mode: 'buy' | 'sell';
    committedConfig: AutomatedPricingConfig | undefined;
    localConfig: AutoConfigLocalState;
    onConfigChange: (patch: Partial<AutoConfigLocalState>) => void;
    onSave: () => void;
    onReset: () => void;
    isSaving: boolean;
    bufferApplicable?: boolean;
    diagnostics?: SellDiagnostics | BuyDiagnostics;
    unit?: string;
    planetId?: string;
    staleReason?: string | null;
    /** ReactNode to render as normal Stats inside the Volume Strategy box (e.g. consumption breakdown for buy mode) */
    consumptionBreakdown?: React.ReactNode;
    /** Slot for manual price/quantity inputs rendered inside the Pricing Strategy box */
    manualPricingSlot?: React.ReactNode;
    /** Overlay message for the manual pricing zone (e.g. "Saving…" or "Awaiting next day…") */
    manualPriceOverlay?: string | null;
}): React.ReactElement {
    const volumeGroups = mode === 'buy' ? BUY_VOLUME_GROUPS : SELL_VOLUME_GROUPS;
    const pricingSliders = mode === 'buy' ? BUY_PRICING_SLIDERS : SELL_PRICING_SLIDERS;
    const pricingRangeSliders = useMemo(
        () => (mode === 'buy' ? [PRICE_ADJUST_RANGE, P_C_RATIO_RANGE_BUY] : [PRICE_ADJUST_RANGE, P_C_RATIO_RANGE_SELL]),
        [mode],
    );

    const detectVolumePreset = mode === 'buy' ? detectVolumeBuyPreset : detectVolumeSellPreset;
    const detectPricingPreset = mode === 'buy' ? detectPricingBuyPreset : detectPricingSellPreset;
    const pricingPresetMap = mode === 'buy' ? PRICING_BUY_PRESETS : PRICING_SELL_PRESETS;

    // Flatten for set/key checks
    const volumeSliders = useMemo(() => volumeGroups.flatMap((g) => g.sliders), [volumeGroups]);
    const volumeKeys = useMemo(() => new Set(volumeSliders.map((s) => s.key)), [volumeSliders]);
    const pricingKeys = useMemo(
        () => new Set([...pricingSliders.map((s) => s.key), ...pricingRangeSliders.flatMap((r) => r.keys)]),
        [pricingSliders, pricingRangeSliders],
    );

    // Detect initial presets from localConfig
    const initialVolumePreset = detectVolumePreset(localConfig);
    const initialPricingPreset = detectPricingPreset(localConfig);

    const [activeVolumePreset, setActiveVolumePreset] = React.useState<VolumePresetType>(initialVolumePreset);
    const [activePricingPreset, setActivePricingPreset] = React.useState<PricingPresetType>(initialPricingPreset);

    // Sync preset detection when localConfig changes externally (e.g. committed values loaded)
    React.useEffect(() => {
        setActiveVolumePreset(detectVolumePreset(localConfig));
        setActivePricingPreset(detectPricingPreset(localConfig));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localConfig.inventorySmoothingMaxExtra, localConfig.priceAdjustMaxUp]);

    const handleVolumePresetSelect = useCallback(
        (preset: VolumePresetType) => {
            setActiveVolumePreset(preset);
            if (preset === 'custom') {
                return;
            }
            const values =
                mode === 'buy'
                    ? (VOLUME_BUY_PRESETS[preset as Exclude<VolumePresetType, 'custom'>] as VolumeBuyValues)
                    : (VOLUME_SELL_PRESETS[preset as Exclude<VolumePresetType, 'custom'>] as VolumeSellValues);
            onConfigChange(values as unknown as Partial<AutoConfigLocalState>);
        },
        [mode, onConfigChange],
    );

    const handlePricingPresetSelect = useCallback(
        (preset: PricingPresetType) => {
            setActivePricingPreset(preset);
            if (preset === 'custom') {
                return;
            }
            const values = pricingPresetMap[preset as Exclude<PricingPresetType, 'custom'>] as
                | PricingBuyValues
                | PricingSellValues;
            onConfigChange(values as unknown as Partial<AutoConfigLocalState>);
        },
        [pricingPresetMap, onConfigChange],
    );

    const handleSliderChange = useCallback(
        (patch: Partial<AutoConfigLocalState>) => {
            // If changing a volume slider while preset is not custom, lock to custom
            const changedKey = Object.keys(patch)[0] as keyof AutoConfigLocalState | undefined;
            if (changedKey) {
                if (volumeKeys.has(changedKey) && activeVolumePreset !== 'custom') {
                    setActiveVolumePreset('custom');
                }
                if (pricingKeys.has(changedKey) && activePricingPreset !== 'custom') {
                    setActivePricingPreset('custom');
                }
            }
            onConfigChange(patch);
        },
        [onConfigChange, activeVolumePreset, activePricingPreset, volumeKeys, pricingKeys],
    );

    const allSliderKeys: (keyof AutoConfigLocalState)[] = useMemo(
        () => [
            ...volumeSliders.map((s) => s.key),
            ...pricingSliders.map((s) => s.key),
            ...pricingRangeSliders.flatMap((r) => r.keys),
        ],
        [volumeSliders, pricingSliders, pricingRangeSliders],
    );

    const hasDirty = allSliderKeys.some((key) => {
        const localVal = localConfig[key] !== '' ? parseFloat(localConfig[key]) : undefined;
        const committed = committedVal(committedConfig, key);
        return localVal !== undefined && localVal !== committed;
    });
    const hasAnyValue = allSliderKeys.some((key) => localConfig[key] !== '');

    return (
        <div className='space-y-3 pt-2'>
            {/* ── Volume Strategy Row ─────────────────────────────────────────── */}
            <Collapsible defaultOpen={false} className='rounded-md border bg-muted/30'>
                <CollapsibleTrigger className='flex items-center justify-between w-full p-2.5 hover:bg-muted/50 cursor-pointer [&[data-state=open]>svg]:rotate-180'>
                    <span className='text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'>
                        Volume Strategy
                    </span>
                    <ChevronDown className='h-3.5 w-3.5 transition-transform duration-200' />
                </CollapsibleTrigger>
                <CollapsibleContent className='px-2.5 pb-2.5 space-y-2'>
                    <PresetButtonRow
                        label=''
                        presets={VOLUME_PRESET_ORDER}
                        labels={VOLUME_PRESET_LABELS}
                        activePreset={activeVolumePreset}
                        onSelect={handleVolumePresetSelect}
                        isSaving={isSaving}
                    />

                    <div className='space-y-0.5 pt-1.5 border-t border-border/40'>
                        {mode === 'sell' && (
                            <SellVolumeDiagnostics diagnostics={diagnostics as SellDiagnostics | undefined} unit={unit} />
                        )}
                        {mode === 'buy' && (
                            <BuyVolumeDiagnostics diagnostics={diagnostics as BuyDiagnostics | undefined} unit={unit} />
                        )}
                    </div>

                    <div className='rounded-md bg-muted/50 px-2.5 py-1.5 mb-1'>
                        <div className='space-y-0.5'>
                            {consumptionBreakdown ? consumptionBreakdown : <Stat label='Consumption' value='-' />}
                        </div>
                    </div>

                    {/* Volume sliders (always visible, disabled when preset is not custom) */}
                    <div
                        className='space-y-3 pt-1'
                        onClick={() => {
                            if (activeVolumePreset !== 'custom') {
                                setActiveVolumePreset('custom');
                            }
                        }}
                    >
                        {volumeGroups.map((group, gi) => (
                            <React.Fragment key={group.label ?? gi}>
                                {gi > 0 && <Separator className='my-1' />}
                                <div
                                    className={
                                        group.isBufferGroup && !bufferApplicable ? 'space-y-2 opacity-50' : 'space-y-2'
                                    }
                                >
                                    {group.label && (
                                        <Label className='text-[10px] text-muted-foreground/70 uppercase tracking-wider'>
                                            {group.label}
                                        </Label>
                                    )}
                                    {group.sliders.map((def) =>
                                        renderSingleSlider(
                                            def,
                                            localConfig,
                                            committedConfig,
                                            isSaving,
                                            bufferApplicable,
                                            handleSliderChange,
                                            activeVolumePreset !== 'custom',
                                        ),
                                    )}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                    {/* Save/Reset buttons inside Volume box */}
                    <div className='flex items-center justify-end gap-2 pt-1'>
                        <div className='flex items-center gap-2'>
                            <Button
                                variant='outline'
                                size='sm'
                                className={`h-7 text-[11px] px-2 ${hasDirty ? '' : 'invisible'}`}
                                onClick={onReset}
                                disabled={isSaving}
                            >
                                <RotateCcw className='h-3 w-3 mr-1' />
                                Reset
                            </Button>
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
                </CollapsibleContent>
            </Collapsible>

            {/* ── Pricing Strategy Row ────────────────────────────────────────── */}
            <Collapsible defaultOpen={false} className='rounded-md border bg-muted/30'>
                <CollapsibleTrigger className='flex items-center justify-between w-full p-2.5 hover:bg-muted/50 cursor-pointer [&[data-state=open]>svg]:rotate-180'>
                    <span className='text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'>
                        Pricing Strategy
                    </span>
                    <ChevronDown className='h-3.5 w-3.5 transition-transform duration-200' />
                </CollapsibleTrigger>
                <CollapsibleContent className='px-2.5 pb-1 space-y-2'>
                    <PresetButtonRow
                        label=''
                        presets={PRICING_PRESET_ORDER}
                        labels={PRICING_PRESET_LABELS}
                        activePreset={activePricingPreset}
                        onSelect={handlePricingPresetSelect}
                        isSaving={isSaving}
                    />

                    {/* Pricing sliders (always visible, disabled when preset is not custom) */}
                    <div
                        className={`space-y-2 pt-1${activePricingPreset !== 'custom' ? ' opacity-50' : ''}`}
                        onClick={() => {
                            if (activePricingPreset !== 'custom') {
                                setActivePricingPreset('custom');
                            }
                        }}
                    >
                        {pricingRangeSliders.map((def) =>
                            renderRangeSlider(
                                def,
                                localConfig,
                                committedConfig,
                                isSaving,
                                handleSliderChange,
                                activePricingPreset !== 'custom',
                            ),
                        )}
                        {pricingSliders.map((def) =>
                            renderSingleSlider(
                                def,
                                localConfig,
                                committedConfig,
                                isSaving,
                                true,
                                handleSliderChange,
                                activePricingPreset !== 'custom',
                            ),
                        )}
                    </div>

                    {/* Pricing diagnostics — always rendered */}
                    <div className='space-y-0.5 pt-1.5 border-t border-border/40'>
                        {mode === 'sell' && (
                            <SellPricingDiagnostics
                                diagnostics={diagnostics as SellDiagnostics | undefined}
                                planetId={planetId}
                            />
                        )}
                        {mode === 'buy' && (
                            <BuyPricingDiagnostics
                                diagnostics={diagnostics as BuyDiagnostics | undefined}
                                planetId={planetId}
                            />
                        )}
                    </div>

                    {/* Save/Reset buttons inside Pricing box */}
                    <div className='flex items-center justify-end gap-2 pt-1 pb-1.5'>
                        <div className='flex items-center gap-2'>
                            <Button
                                variant='outline'
                                size='sm'
                                className={`h-7 text-[11px] px-2 ${hasDirty ? '' : 'invisible'}`}
                                onClick={onReset}
                                disabled={isSaving}
                            >
                                <RotateCcw className='h-3 w-3 mr-1' />
                                Reset
                            </Button>
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

                    <Separator />
                    {/* Set Price section at bottom of Pricing box */}
                    <div className='pt-1'>
                        <Label className='text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'>
                            Set Price
                        </Label>
                        <div className='relative'>
                            {manualPricingSlot ? (
                                manualPricingSlot
                            ) : (
                                <div className='text-[11px] text-muted-foreground py-1'>-</div>
                            )}
                            <div
                                className={`absolute inset-0 z-10 flex items-center justify-center bg-background/95 dark:bg-card shadow-inner rounded-lg transition-opacity duration-200 ${
                                    manualPriceOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                                }`}
                            >
                                <span className='flex items-center gap-2 text-sm font-medium text-foreground'>
                                    {manualPriceOverlay && <Spinner className='h-4 w-4' />}
                                    {manualPriceOverlay ?? '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            {/* Stale reason — always rendered */}
            <div className='text-[10px] text-muted-foreground italic'>{staleReason ?? '-'}</div>
        </div>
    );
}