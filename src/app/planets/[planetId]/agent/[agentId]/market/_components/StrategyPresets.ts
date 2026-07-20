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
    'liquidation': 'Liquidation',
    'market-rate': 'Market Rate',
    'premium': 'Premium',
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

// ─── Volume presets (sell) ──────────────────────────────────────────────────

export type VolumeSellValues = Pick<
    AutoConfigLocalState,
    'inventorySmoothingMaxExtra' | 'outputBufferMaxTicks' | 'freeSellQuantity' | 'freeSellQuantitySmoothingMaxExtra'
>;

export const VOLUME_SELL_PRESETS: Record<Exclude<VolumePresetType, 'custom'>, VolumeSellValues> = {
    'just-in-time': {
        inventorySmoothingMaxExtra: '0',
        outputBufferMaxTicks: '2',
        freeSellQuantity: '0',
        freeSellQuantitySmoothingMaxExtra: '2',
    },
    'balanced': {
        inventorySmoothingMaxExtra: '2',
        outputBufferMaxTicks: '20',
        freeSellQuantity: '0',
        freeSellQuantitySmoothingMaxExtra: '2',
    },
    'stockpile': {
        inventorySmoothingMaxExtra: '5',
        outputBufferMaxTicks: '60',
        freeSellQuantity: '0',
        freeSellQuantitySmoothingMaxExtra: '2',
    },
};

// ─── Pricing presets (buy) ──────────────────────────────────────────────────

export type PricingBuyValues = Pick<
    AutoConfigLocalState,
    | 'priceAdjustMaxUp'
    | 'priceAdjustMaxDown'
    | 'targetFillRate'
    | 'bidOfferMaxCostMultiplier'
    | 'automatedCostFloorBuffer'
>;

export const PRICING_BUY_PRESETS: Record<Exclude<PricingPresetType, 'custom'>, PricingBuyValues> = {
    'liquidation': {
        priceAdjustMaxUp: '1.01',
        priceAdjustMaxDown: '0.80',
        targetFillRate: '0.70',
        bidOfferMaxCostMultiplier: '3',
        automatedCostFloorBuffer: '0',
    },
    'market-rate': {
        priceAdjustMaxUp: '1.05',
        priceAdjustMaxDown: '0.95',
        targetFillRate: '0.90',
        bidOfferMaxCostMultiplier: '6',
        automatedCostFloorBuffer: '0',
    },
    'premium': {
        priceAdjustMaxUp: '1.15',
        priceAdjustMaxDown: '0.98',
        targetFillRate: '0.95',
        bidOfferMaxCostMultiplier: '10',
        automatedCostFloorBuffer: '0',
    },
};

// ─── Pricing presets (sell) ─────────────────────────────────────────────────

export type PricingSellValues = Pick<
    AutoConfigLocalState,
    | 'priceAdjustMaxUp'
    | 'priceAdjustMaxDown'
    | 'automatedCostFloorBuffer'
    | 'targetSellThrough'
    | 'bidOfferMaxCostMultiplier'
>;

export const PRICING_SELL_PRESETS: Record<Exclude<PricingPresetType, 'custom'>, PricingSellValues> = {
    'liquidation': {
        priceAdjustMaxUp: '1.01',
        priceAdjustMaxDown: '0.80',
        automatedCostFloorBuffer: '0.0',
        targetSellThrough: '0.95',
        bidOfferMaxCostMultiplier: '3',
    },
    'market-rate': {
        priceAdjustMaxUp: '1.05',
        priceAdjustMaxDown: '0.95',
        automatedCostFloorBuffer: '0.5',
        targetSellThrough: '0.85',
        bidOfferMaxCostMultiplier: '6',
    },
    'premium': {
        priceAdjustMaxUp: '1.15',
        priceAdjustMaxDown: '0.98',
        automatedCostFloorBuffer: '1.5',
        targetSellThrough: '0.50',
        bidOfferMaxCostMultiplier: '10',
    },
};

// ─── Detection helpers ──────────────────────────────────────────────────────

const VOLUME_BUY_KEYS: (keyof VolumeBuyValues)[] = [
    'inventorySmoothingMaxExtra',
    'inputBufferTargetTicks',
    'freeBuyQuantity',
    'freeBuyQuantitySmoothingMaxExtra',
];

const VOLUME_SELL_KEYS: (keyof VolumeSellValues)[] = [
    'inventorySmoothingMaxExtra',
    'outputBufferMaxTicks',
    'freeSellQuantity',
    'freeSellQuantitySmoothingMaxExtra',
];

const PRICING_BUY_KEYS: (keyof PricingBuyValues)[] = [
    'priceAdjustMaxUp',
    'priceAdjustMaxDown',
    'targetFillRate',
    'bidOfferMaxCostMultiplier',
    'automatedCostFloorBuffer',
];

const PRICING_SELL_KEYS: (keyof PricingSellValues)[] = [
    'priceAdjustMaxUp',
    'priceAdjustMaxDown',
    'automatedCostFloorBuffer',
    'targetSellThrough',
    'bidOfferMaxCostMultiplier',
];

function matchesPreset(
    localConfig: AutoConfigLocalState,
    presetValues: Record<string, string>,
    keys: (keyof AutoConfigLocalState)[],
): boolean {
    return keys.every((key) => localConfig[key] === (presetValues[key] ?? ''));
}

export function detectVolumeBuyPreset(localConfig: AutoConfigLocalState): VolumePresetType {
    const entries = Object.entries(VOLUME_BUY_PRESETS) as [Exclude<VolumePresetType, 'custom'>, VolumeBuyValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, VOLUME_BUY_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}

export function detectVolumeSellPreset(localConfig: AutoConfigLocalState): VolumePresetType {
    const entries = Object.entries(VOLUME_SELL_PRESETS) as [Exclude<VolumePresetType, 'custom'>, VolumeSellValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, VOLUME_SELL_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}

export function detectPricingBuyPreset(localConfig: AutoConfigLocalState): PricingPresetType {
    const entries = Object.entries(PRICING_BUY_PRESETS) as [Exclude<PricingPresetType, 'custom'>, PricingBuyValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, PRICING_BUY_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}

export function detectPricingSellPreset(localConfig: AutoConfigLocalState): PricingPresetType {
    const entries = Object.entries(PRICING_SELL_PRESETS) as [Exclude<PricingPresetType, 'custom'>, PricingSellValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, PRICING_SELL_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}
