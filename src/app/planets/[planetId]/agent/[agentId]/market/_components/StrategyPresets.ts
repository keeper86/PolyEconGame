import type { AutoConfigLocalState } from './marketTypes';

// ── Preset types ────────────────────────────────────────────────────────────

export type VolumePresetType = 'just-in-time' | 'balanced' | 'stockpile' | 'custom';
export type PricingPresetType = 'liquidation' | 'market-rate' | 'premium' | 'custom';

export const VOLUME_PRESET_LABELS: Record<VolumePresetType, string> = {
    'just-in-time': 'Lean',
    'balanced': 'Balanced',
    'stockpile': 'Hoard',
    'custom': '⚙️',
};

export const VOLUME_PRESET_ORDER: VolumePresetType[] = ['just-in-time', 'balanced', 'stockpile', 'custom'];

export const PRICING_PRESET_LABELS: Record<PricingPresetType, string> = {
    'liquidation': 'Slow',
    'market-rate': 'Market Rate',
    'premium': 'Fast',
    'custom': '⚙️',
};

export const PRICING_PRESET_ORDER: PricingPresetType[] = ['liquidation', 'market-rate', 'premium', 'custom'];

// ─── Volume presets (buy) ───────────────────────────────────────────────────

export type VolumeBuyValues = Pick<
    AutoConfigLocalState,
    'inventorySmoothingMaxExtra' | 'inputBufferTargetTicks' | 'freeBuyQuantity' | 'freeBuyQuantitySmoothingMaxExtra'
>;

export const VOLUME_BUY_PRESETS: Record<Exclude<VolumePresetType, 'custom'>, VolumeBuyValues> = {
    'just-in-time': {
        inventorySmoothingMaxExtra: '0',
        inputBufferTargetTicks: '5',
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: '2',
    },
    'balanced': {
        inventorySmoothingMaxExtra: '2',
        inputBufferTargetTicks: '30',
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: '2',
    },
    'stockpile': {
        inventorySmoothingMaxExtra: '5',
        inputBufferTargetTicks: '60',
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: '2',
    },
};

// Services decay at 10%/tick, so tiny buffer targets — hoarding is wasteful.
export const VOLUME_BUY_PRESETS_SERVICES: Record<Exclude<VolumePresetType, 'custom'>, VolumeBuyValues> = {
    'just-in-time': {
        inventorySmoothingMaxExtra: '0',
        inputBufferTargetTicks: '1',
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: '1',
    },
    'balanced': {
        inventorySmoothingMaxExtra: '1',
        inputBufferTargetTicks: '3',
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: '1',
    },
    'stockpile': {
        inventorySmoothingMaxExtra: '2',
        inputBufferTargetTicks: '5',
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: '2',
    },
};

export function getVolumeBuyPreset(preset: Exclude<VolumePresetType, 'custom'>, isService: boolean): VolumeBuyValues {
    return isService ? VOLUME_BUY_PRESETS_SERVICES[preset] : VOLUME_BUY_PRESETS[preset];
}

// ─── Volume presets (sell) ──────────────────────────────────────────────────

export type VolumeSellValues = Pick<AutoConfigLocalState, 'freeRetainment' | 'freeRetainmentSmoothingMaxExtra'>;

// Fixed: each preset now actually differs
export const VOLUME_SELL_PRESETS: Record<Exclude<VolumePresetType, 'custom'>, VolumeSellValues> = {
    'just-in-time': {
        freeRetainment: '0',
        freeRetainmentSmoothingMaxExtra: '1',
    },
    'balanced': {
        freeRetainment: '0',
        freeRetainmentSmoothingMaxExtra: '5',
    },
    'stockpile': {
        freeRetainment: '500',
        freeRetainmentSmoothingMaxExtra: '10',
    },
};

export function getVolumeSellPreset(preset: Exclude<VolumePresetType, 'custom'>): VolumeSellValues {
    return VOLUME_SELL_PRESETS[preset];
}

// ─── Pricing presets (buy) ──────────────────────────────────────────────────

export type PricingBuyValues = Pick<
    AutoConfigLocalState,
    'priceAdjustMaxUp' | 'priceAdjustMaxDown' | 'targetFillRate' | 'bidOfferMaxCostMultiplier'
>;

export const PRICING_BUY_PRESETS: Record<Exclude<PricingPresetType, 'custom'>, PricingBuyValues> = {
    'liquidation': {
        priceAdjustMaxUp: '1.01',
        priceAdjustMaxDown: '0.80',
        targetFillRate: '0.70',
        bidOfferMaxCostMultiplier: '3',
    },
    'market-rate': {
        priceAdjustMaxUp: '1.05',
        priceAdjustMaxDown: '0.95',
        targetFillRate: '0.90',
        bidOfferMaxCostMultiplier: '6',
    },
    'premium': {
        priceAdjustMaxUp: '1.15',
        priceAdjustMaxDown: '0.98',
        targetFillRate: '0.95',
        bidOfferMaxCostMultiplier: '10',
    },
};

// Services: higher target fill rate since decaying stock needs aggressive fill
export const PRICING_BUY_PRESETS_SERVICES: Record<Exclude<PricingPresetType, 'custom'>, PricingBuyValues> = {
    'liquidation': {
        priceAdjustMaxUp: '1.01',
        priceAdjustMaxDown: '0.85',
        targetFillRate: '0.85',
        bidOfferMaxCostMultiplier: '3',
    },
    'market-rate': {
        priceAdjustMaxUp: '1.05',
        priceAdjustMaxDown: '0.95',
        targetFillRate: '0.95',
        bidOfferMaxCostMultiplier: '6',
    },
    'premium': {
        priceAdjustMaxUp: '1.15',
        priceAdjustMaxDown: '0.98',
        targetFillRate: '0.99',
        bidOfferMaxCostMultiplier: '10',
    },
};

export function getPricingBuyPreset(
    preset: Exclude<PricingPresetType, 'custom'>,
    isService: boolean,
): PricingBuyValues {
    return isService ? PRICING_BUY_PRESETS_SERVICES[preset] : PRICING_BUY_PRESETS[preset];
}

// ─── Pricing presets (sell) ─────────────────────────────────────────────────

export type PricingSellValues = Pick<
    AutoConfigLocalState,
    'priceAdjustMaxUp' | 'priceAdjustMaxDown' | 'automatedCostFloorBuffer' | 'targetSellThrough'
>;

export const PRICING_SELL_PRESETS: Record<Exclude<PricingPresetType, 'custom'>, PricingSellValues> = {
    'liquidation': {
        priceAdjustMaxUp: '1.01',
        priceAdjustMaxDown: '0.80',
        automatedCostFloorBuffer: '1.0',
        targetSellThrough: '0.95',
    },
    'market-rate': {
        priceAdjustMaxUp: '1.05',
        priceAdjustMaxDown: '0.95',
        automatedCostFloorBuffer: '1.5',
        targetSellThrough: '0.85',
    },
    'premium': {
        priceAdjustMaxUp: '1.15',
        priceAdjustMaxDown: '0.98',
        automatedCostFloorBuffer: '2.5',
        targetSellThrough: '0.50',
    },
};

// Services: need higher sell-through to prevent decay waste
export const PRICING_SELL_PRESETS_SERVICES: Record<Exclude<PricingPresetType, 'custom'>, PricingSellValues> = {
    'liquidation': {
        priceAdjustMaxUp: '1.01',
        priceAdjustMaxDown: '0.80',
        automatedCostFloorBuffer: '1.0',
        targetSellThrough: '0.99',
    },
    'market-rate': {
        priceAdjustMaxUp: '1.05',
        priceAdjustMaxDown: '0.95',
        automatedCostFloorBuffer: '1.5',
        targetSellThrough: '0.95',
    },
    'premium': {
        priceAdjustMaxUp: '1.15',
        priceAdjustMaxDown: '0.98',
        automatedCostFloorBuffer: '2.5',
        targetSellThrough: '0.80',
    },
};

export function getPricingSellPreset(
    preset: Exclude<PricingPresetType, 'custom'>,
    isService: boolean,
): PricingSellValues {
    return isService ? PRICING_SELL_PRESETS_SERVICES[preset] : PRICING_SELL_PRESETS[preset];
}

// ─── Detection helpers ──────────────────────────────────────────────────────

const VOLUME_BUY_KEYS: (keyof VolumeBuyValues)[] = [
    'inventorySmoothingMaxExtra',
    'inputBufferTargetTicks',
    'freeBuyQuantity',
    'freeBuyQuantitySmoothingMaxExtra',
];

const VOLUME_SELL_KEYS: (keyof VolumeSellValues)[] = ['freeRetainment', 'freeRetainmentSmoothingMaxExtra'];

const PRICING_BUY_KEYS: (keyof PricingBuyValues)[] = [
    'priceAdjustMaxUp',
    'priceAdjustMaxDown',
    'targetFillRate',
    'bidOfferMaxCostMultiplier',
];

const PRICING_SELL_KEYS: (keyof PricingSellValues)[] = [
    'priceAdjustMaxUp',
    'priceAdjustMaxDown',
    'automatedCostFloorBuffer',
    'targetSellThrough',
];

function matchesPreset(
    localConfig: AutoConfigLocalState,
    presetValues: Record<string, string>,
    keys: (keyof AutoConfigLocalState)[],
): boolean {
    return keys.every((key) => localConfig[key] === (presetValues[key] ?? ''));
}

export function detectVolumeBuyPreset(localConfig: AutoConfigLocalState, isService: boolean): VolumePresetType {
    if (VOLUME_BUY_KEYS.every((key) => localConfig[key] === '')) {
        return 'balanced';
    }
    const presets = isService ? VOLUME_BUY_PRESETS_SERVICES : VOLUME_BUY_PRESETS;
    const entries = Object.entries(presets) as [Exclude<VolumePresetType, 'custom'>, VolumeBuyValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, VOLUME_BUY_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}

export function detectVolumeSellPreset(localConfig: AutoConfigLocalState): VolumePresetType {
    if (VOLUME_SELL_KEYS.every((key) => localConfig[key] === '')) {
        return 'balanced';
    }
    const entries = Object.entries(VOLUME_SELL_PRESETS) as [Exclude<VolumePresetType, 'custom'>, VolumeSellValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, VOLUME_SELL_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}

export function detectPricingBuyPreset(localConfig: AutoConfigLocalState, isService: boolean): PricingPresetType {
    if (PRICING_BUY_KEYS.every((key) => localConfig[key] === '')) {
        return 'market-rate';
    }
    const presets = isService ? PRICING_BUY_PRESETS_SERVICES : PRICING_BUY_PRESETS;
    const entries = Object.entries(presets) as [Exclude<PricingPresetType, 'custom'>, PricingBuyValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, PRICING_BUY_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}

export function detectPricingSellPreset(localConfig: AutoConfigLocalState, isService: boolean): PricingPresetType {
    if (PRICING_SELL_KEYS.every((key) => localConfig[key] === '')) {
        return 'market-rate';
    }
    const presets = isService ? PRICING_SELL_PRESETS_SERVICES : PRICING_SELL_PRESETS;
    const entries = Object.entries(presets) as [Exclude<PricingPresetType, 'custom'>, PricingSellValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, PRICING_SELL_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}
