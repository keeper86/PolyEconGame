import type { AutoConfigLocalState } from './marketTypes';
import {
    AUTOMATED_COST_FLOOR_BUFFER,
    BID_OFFER_MAX_COST_MULTIPLIER,
    FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    INPUT_BUFFER_TARGET_TICKS,
    INPUT_BUFFER_TARGET_TICKS_SERVICES,
    INVENTORY_SMOOTHING_MAX_EXTRA,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    TARGET_FILL_RATE,
    TARGET_FILL_RATE_SERVICES,
    TARGET_SELL_THROUGH,
    TARGET_SELL_THROUGH_SERVICES,
} from '@/simulation/constants';

// ── Preset types ────────────────────────────────────────────────────────────

// Volume types split for buy vs sell semantics
export type BuyVolumePresetType = 'just-in-time' | 'balanced' | 'stockpile' | 'custom';
export type SellVolumePresetType = 'dump' | 'balanced' | 'reserve' | 'custom';
export type PricingPresetType = 'patient' | 'market-rate' | 'urgent' | 'custom';
export type SellPricingPresetType = 'liquidation' | 'market-rate' | 'premium' | 'custom';

// ─── Buy Volume presets ──────────────────────────────────────────────────────

export const BUY_VOLUME_PRESET_LABELS: Record<BuyVolumePresetType, string> = {
    'just-in-time': 'Lean',
    'balanced': 'Balanced',
    'stockpile': 'Hoard',
    'custom': '⚙️',
};

export const BUY_VOLUME_PRESET_ORDER: BuyVolumePresetType[] = ['just-in-time', 'balanced', 'stockpile', 'custom'];

export const SELL_VOLUME_PRESET_LABELS: Record<SellVolumePresetType, string> = {
    dump: 'Dump',
    balanced: 'Balanced',
    reserve: 'Reserve',
    custom: '⚙️',
};

export const SELL_VOLUME_PRESET_ORDER: SellVolumePresetType[] = ['dump', 'balanced', 'reserve', 'custom'];

export const BUY_PRICING_PRESET_LABELS: Record<PricingPresetType, string> = {
    'patient': 'Patient',
    'market-rate': 'Market Rate',
    'urgent': 'Urgent',
    'custom': '⚙️',
};

export const BUY_PRICING_PRESET_ORDER: PricingPresetType[] = ['patient', 'market-rate', 'urgent', 'custom'];

export const SELL_PRICING_PRESET_LABELS: Record<SellPricingPresetType, string> = {
    'liquidation': 'Liquidation',
    'market-rate': 'Market Rate',
    'premium': 'Premium',
    'custom': '⚙️',
};

export const SELL_PRICING_PRESET_ORDER: SellPricingPresetType[] = ['liquidation', 'market-rate', 'premium', 'custom'];

// ─── Volume presets (buy) ───────────────────────────────────────────────────
// Balanced uses constants directly. Extreme presets apply factors.

export type VolumeBuyValues = Pick<
    AutoConfigLocalState,
    'inventorySmoothingMaxExtra' | 'inputBufferTargetTicks' | 'freeBuyQuantity' | 'freeBuyQuantitySmoothingMaxExtra'
>;

export const VOLUME_BUY_PRESETS: Record<Exclude<BuyVolumePresetType, 'custom'>, VolumeBuyValues> = {
    'just-in-time': {
        inventorySmoothingMaxExtra: '0',
        inputBufferTargetTicks: String(Math.round(INPUT_BUFFER_TARGET_TICKS / 6)),
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: String(Math.max(1, Math.round(FREE_QUANTITY_SMOOTHING_MAX_EXTRA / 5))),
    },
    'balanced': {
        inventorySmoothingMaxExtra: String(INVENTORY_SMOOTHING_MAX_EXTRA),
        inputBufferTargetTicks: String(INPUT_BUFFER_TARGET_TICKS),
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: String(FREE_QUANTITY_SMOOTHING_MAX_EXTRA),
    },
    'stockpile': {
        inventorySmoothingMaxExtra: String(Math.round(INVENTORY_SMOOTHING_MAX_EXTRA * 2.5)),
        inputBufferTargetTicks: String(INPUT_BUFFER_TARGET_TICKS * 2),
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: String(FREE_QUANTITY_SMOOTHING_MAX_EXTRA),
    },
};

// Services decay at 10%/tick, so tiny buffer targets — hoarding is wasteful.
export const VOLUME_BUY_PRESETS_SERVICES: Record<Exclude<BuyVolumePresetType, 'custom'>, VolumeBuyValues> = {
    'just-in-time': {
        inventorySmoothingMaxExtra: '0',
        inputBufferTargetTicks: String(Math.round(INPUT_BUFFER_TARGET_TICKS_SERVICES / 3)),
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: String(Math.max(1, Math.round(FREE_QUANTITY_SMOOTHING_MAX_EXTRA / 10))),
    },
    'balanced': {
        inventorySmoothingMaxExtra: String(INVENTORY_SMOOTHING_MAX_EXTRA),
        inputBufferTargetTicks: String(INPUT_BUFFER_TARGET_TICKS_SERVICES),
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: String(FREE_QUANTITY_SMOOTHING_MAX_EXTRA),
    },
    'stockpile': {
        inventorySmoothingMaxExtra: String(INVENTORY_SMOOTHING_MAX_EXTRA),
        inputBufferTargetTicks: String(Math.round(INPUT_BUFFER_TARGET_TICKS_SERVICES * 1.67)),
        freeBuyQuantity: '0',
        freeBuyQuantitySmoothingMaxExtra: String(FREE_QUANTITY_SMOOTHING_MAX_EXTRA),
    },
};

export function getVolumeBuyPreset(
    preset: Exclude<BuyVolumePresetType, 'custom'>,
    isService: boolean,
): VolumeBuyValues {
    return isService ? VOLUME_BUY_PRESETS_SERVICES[preset] : VOLUME_BUY_PRESETS[preset];
}

// ─── Volume presets (sell) ──────────────────────────────────────────────────

export type VolumeSellValues = Pick<AutoConfigLocalState, 'freeRetainment' | 'freeRetainmentSmoothingMaxExtra'>;

export const VOLUME_SELL_PRESETS: Record<Exclude<SellVolumePresetType, 'custom'>, VolumeSellValues> = {
    dump: {
        freeRetainment: '0',
        freeRetainmentSmoothingMaxExtra: String(Math.max(1, Math.round(FREE_QUANTITY_SMOOTHING_MAX_EXTRA / 5))),
    },
    balanced: {
        freeRetainment: '0',
        freeRetainmentSmoothingMaxExtra: String(FREE_QUANTITY_SMOOTHING_MAX_EXTRA),
    },
    reserve: {
        freeRetainment: '0',
        freeRetainmentSmoothingMaxExtra: String(FREE_QUANTITY_SMOOTHING_MAX_EXTRA * 1.5),
    },
};

export function getVolumeSellPreset(preset: Exclude<SellVolumePresetType, 'custom'>): VolumeSellValues {
    return VOLUME_SELL_PRESETS[preset];
}

// ─── Pricing presets (buy) ──────────────────────────────────────────────────
// market-rate uses constants directly. Extreme presets apply factors.

export type PricingBuyValues = Pick<
    AutoConfigLocalState,
    'priceAdjustMaxUp' | 'priceAdjustMaxDown' | 'targetFillRate' | 'bidOfferMaxCostMultiplier'
>;

// Helper: format to 2 decimal places as used in presets
const f2 = (n: number) => n.toFixed(2);

export const PRICING_BUY_PRESETS: Record<Exclude<PricingPresetType, 'custom'>, PricingBuyValues> = {
    'patient': {
        priceAdjustMaxUp: f2(Math.min(1.2, PRICE_ADJUST_MAX_UP * 0.96)),
        priceAdjustMaxDown: f2(PRICE_ADJUST_MAX_DOWN * 0.84),
        targetFillRate: f2(TARGET_FILL_RATE * 0.78),
        bidOfferMaxCostMultiplier: String(Math.round(BID_OFFER_MAX_COST_MULTIPLIER * 0.5)),
    },
    'market-rate': {
        priceAdjustMaxUp: f2(PRICE_ADJUST_MAX_UP),
        priceAdjustMaxDown: f2(PRICE_ADJUST_MAX_DOWN),
        targetFillRate: f2(TARGET_FILL_RATE),
        bidOfferMaxCostMultiplier: String(BID_OFFER_MAX_COST_MULTIPLIER),
    },
    'urgent': {
        priceAdjustMaxUp: f2(PRICE_ADJUST_MAX_UP * 1.1),
        priceAdjustMaxDown: f2(1 - (1 - PRICE_ADJUST_MAX_DOWN) * 0.6),
        targetFillRate: f2(Math.min(1, TARGET_FILL_RATE * 1.06)),
        bidOfferMaxCostMultiplier: String(Math.round(BID_OFFER_MAX_COST_MULTIPLIER * 1.67)),
    },
};

// Services: higher target fill rate since decaying stock needs aggressive fill
export const PRICING_BUY_PRESETS_SERVICES: Record<Exclude<PricingPresetType, 'custom'>, PricingBuyValues> = {
    'patient': {
        priceAdjustMaxUp: f2(Math.min(1.2, PRICE_ADJUST_MAX_UP * 0.96)),
        priceAdjustMaxDown: f2(PRICE_ADJUST_MAX_DOWN * 0.89),
        targetFillRate: f2(TARGET_FILL_RATE_SERVICES * 0.89),
        bidOfferMaxCostMultiplier: String(Math.round(BID_OFFER_MAX_COST_MULTIPLIER * 0.5)),
    },
    'market-rate': {
        priceAdjustMaxUp: f2(PRICE_ADJUST_MAX_UP),
        priceAdjustMaxDown: f2(PRICE_ADJUST_MAX_DOWN),
        targetFillRate: f2(TARGET_FILL_RATE_SERVICES),
        bidOfferMaxCostMultiplier: String(BID_OFFER_MAX_COST_MULTIPLIER),
    },
    'urgent': {
        priceAdjustMaxUp: f2(PRICE_ADJUST_MAX_UP * 1.1),
        priceAdjustMaxDown: f2(1 - (1 - PRICE_ADJUST_MAX_DOWN) * 0.6),
        targetFillRate: f2(Math.min(1, TARGET_FILL_RATE_SERVICES * 1.04)),
        bidOfferMaxCostMultiplier: String(Math.round(BID_OFFER_MAX_COST_MULTIPLIER * 1.67)),
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

export const PRICING_SELL_PRESETS: Record<Exclude<SellPricingPresetType, 'custom'>, PricingSellValues> = {
    'liquidation': {
        priceAdjustMaxUp: f2(Math.min(1.2, PRICE_ADJUST_MAX_UP * 0.96)),
        priceAdjustMaxDown: f2(PRICE_ADJUST_MAX_DOWN * 0.84),
        automatedCostFloorBuffer: f2(AUTOMATED_COST_FLOOR_BUFFER * 0.67),
        targetSellThrough: f2(Math.min(1, TARGET_SELL_THROUGH * 1.06)),
    },
    'market-rate': {
        priceAdjustMaxUp: f2(PRICE_ADJUST_MAX_UP),
        priceAdjustMaxDown: f2(PRICE_ADJUST_MAX_DOWN),
        automatedCostFloorBuffer: f2(AUTOMATED_COST_FLOOR_BUFFER),
        targetSellThrough: f2(TARGET_SELL_THROUGH),
    },
    'premium': {
        priceAdjustMaxUp: f2(PRICE_ADJUST_MAX_UP * 1.1),
        priceAdjustMaxDown: f2(1 - (1 - PRICE_ADJUST_MAX_DOWN) * 0.6),
        automatedCostFloorBuffer: f2(AUTOMATED_COST_FLOOR_BUFFER * 1.67),
        targetSellThrough: f2(TARGET_SELL_THROUGH * 0.56),
    },
};

// Services: need higher sell-through to prevent decay waste
export const PRICING_SELL_PRESETS_SERVICES: Record<Exclude<SellPricingPresetType, 'custom'>, PricingSellValues> = {
    'liquidation': {
        priceAdjustMaxUp: f2(Math.min(1.2, PRICE_ADJUST_MAX_UP * 0.96)),
        priceAdjustMaxDown: f2(PRICE_ADJUST_MAX_DOWN * 0.84),
        automatedCostFloorBuffer: f2(AUTOMATED_COST_FLOOR_BUFFER * 0.67),
        targetSellThrough: f2(Math.min(1, TARGET_SELL_THROUGH_SERVICES * 1.04)),
    },
    'market-rate': {
        priceAdjustMaxUp: f2(PRICE_ADJUST_MAX_UP),
        priceAdjustMaxDown: f2(PRICE_ADJUST_MAX_DOWN),
        automatedCostFloorBuffer: f2(AUTOMATED_COST_FLOOR_BUFFER),
        targetSellThrough: f2(TARGET_SELL_THROUGH_SERVICES),
    },
    'premium': {
        priceAdjustMaxUp: f2(PRICE_ADJUST_MAX_UP * 1.1),
        priceAdjustMaxDown: f2(1 - (1 - PRICE_ADJUST_MAX_DOWN) * 0.6),
        automatedCostFloorBuffer: f2(AUTOMATED_COST_FLOOR_BUFFER * 1.67),
        targetSellThrough: f2(TARGET_SELL_THROUGH_SERVICES * 0.84),
    },
};

export function getPricingSellPreset(
    preset: Exclude<SellPricingPresetType, 'custom'>,
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
    return keys.every((key) => {
        const presetStr = presetValues[key] ?? '';
        const localStr = localConfig[key];
        if (presetStr === '' && localStr === '') {
            return true;
        }
        if (presetStr === '' || localStr === '') {
            return false;
        }
        return parseFloat(localStr) === parseFloat(presetStr);
    });
}

export function detectVolumeBuyPreset(localConfig: AutoConfigLocalState, isService: boolean): BuyVolumePresetType {
    if (VOLUME_BUY_KEYS.every((key) => localConfig[key] === '')) {
        return 'balanced';
    }
    const presets = isService ? VOLUME_BUY_PRESETS_SERVICES : VOLUME_BUY_PRESETS;
    const entries = Object.entries(presets) as [Exclude<BuyVolumePresetType, 'custom'>, VolumeBuyValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, VOLUME_BUY_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}

export function detectVolumeSellPreset(localConfig: AutoConfigLocalState): SellVolumePresetType {
    if (VOLUME_SELL_KEYS.every((key) => localConfig[key] === '')) {
        return 'balanced';
    }
    const entries = Object.entries(VOLUME_SELL_PRESETS) as [
        Exclude<SellVolumePresetType, 'custom'>,
        VolumeSellValues,
    ][];
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

export function detectPricingSellPreset(localConfig: AutoConfigLocalState, isService: boolean): SellPricingPresetType {
    if (PRICING_SELL_KEYS.every((key) => localConfig[key] === '')) {
        return 'market-rate';
    }
    const presets = isService ? PRICING_SELL_PRESETS_SERVICES : PRICING_SELL_PRESETS;
    const entries = Object.entries(presets) as [Exclude<SellPricingPresetType, 'custom'>, PricingSellValues][];
    for (const [preset, values] of entries) {
        if (matchesPreset(localConfig, values, PRICING_SELL_KEYS)) {
            return preset;
        }
    }
    return 'custom';
}
