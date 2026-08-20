import {
    ASK_PRICE_SENSITIVITY,
    ASK_VOLUME_FLOOR_FRACTION,
    BID_PRICE_SENSITIVITY,
    BID_VOLUME_FLOOR_FRACTION,
    FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    INPUT_BUFFER_TARGET_TICKS,
    INVENTORY_SMOOTHING_MAX_EXTRA,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    TARGET_FILL_RATE,
    TARGET_SELL_THROUGH,
} from '../constants';
import type { Resource } from '../planet/claims';
import type { AutomatedPricingConfig } from '../planet/planet';

type BuyVolumePreset = 'just-in-time' | 'balanced' | 'stockpile';
type BuyPricingPreset = 'patient' | 'market-rate' | 'urgent';
type SellVolumePreset = 'dump' | 'balanced' | 'reserve';
type SellPricingPreset = 'liquidation' | 'market-rate' | 'premium';

const BUY_VOLUME_PRESETS: BuyVolumePreset[] = ['just-in-time', 'balanced', 'stockpile'];
const BUY_PRICING_PRESETS: BuyPricingPreset[] = ['patient', 'market-rate', 'urgent'];
const SELL_VOLUME_PRESETS: SellVolumePreset[] = ['dump', 'balanced', 'reserve'];
const SELL_PRICING_PRESETS: SellPricingPreset[] = ['liquidation', 'market-rate', 'premium'];

const VOLUME_BUY_CONFIGS: Record<BuyVolumePreset, Partial<AutomatedPricingConfig>> = {
    'just-in-time': {
        inventorySmoothingMaxExtra: 0,
        inputBufferTargetTicks: Math.round(INPUT_BUFFER_TARGET_TICKS / 6),
        freeBuyQuantitySmoothingMaxExtra: Math.max(1, Math.round(FREE_QUANTITY_SMOOTHING_MAX_EXTRA / 5)),
    },
    'balanced': {
        inventorySmoothingMaxExtra: INVENTORY_SMOOTHING_MAX_EXTRA,
        inputBufferTargetTicks: INPUT_BUFFER_TARGET_TICKS,
        freeBuyQuantitySmoothingMaxExtra: FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    },
    'stockpile': {
        inventorySmoothingMaxExtra: Math.round(INVENTORY_SMOOTHING_MAX_EXTRA * 2.5),
        inputBufferTargetTicks: INPUT_BUFFER_TARGET_TICKS * 2,
        freeBuyQuantitySmoothingMaxExtra: FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    },
};

const PRICING_BUY_CONFIGS: Record<BuyPricingPreset, Partial<AutomatedPricingConfig>> = {
    'patient': {
        priceAdjustMaxUp: parseFloat(Math.min(1.2, PRICE_ADJUST_MAX_UP * 0.96).toFixed(2)),
        priceAdjustMaxDown: parseFloat((PRICE_ADJUST_MAX_DOWN * 0.84).toFixed(2)),
        targetFillRate: parseFloat((TARGET_FILL_RATE * 0.78).toFixed(2)),
        bidVolumeFloorFraction: 0.05,
        bidPriceSensitivity: 0.6,
    },
    'market-rate': {
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        targetFillRate: TARGET_FILL_RATE,
        bidVolumeFloorFraction: BID_VOLUME_FLOOR_FRACTION,
        bidPriceSensitivity: BID_PRICE_SENSITIVITY,
    },
    'urgent': {
        priceAdjustMaxUp: parseFloat((PRICE_ADJUST_MAX_UP * 1.1).toFixed(2)),
        priceAdjustMaxDown: parseFloat((1 - (1 - PRICE_ADJUST_MAX_DOWN) * 0.6).toFixed(2)),
        targetFillRate: parseFloat(Math.min(1, TARGET_FILL_RATE * 1.06).toFixed(2)),
        bidVolumeFloorFraction: 0.2,
        bidPriceSensitivity: 1.5,
    },
};

const VOLUME_SELL_CONFIGS: Record<SellVolumePreset, Partial<AutomatedPricingConfig>> = {
    dump: {
        freeRetainmentSmoothingMaxExtra: Math.max(1, Math.round(FREE_QUANTITY_SMOOTHING_MAX_EXTRA / 5)),
    },
    balanced: {
        freeRetainmentSmoothingMaxExtra: FREE_QUANTITY_SMOOTHING_MAX_EXTRA,
    },
    reserve: {
        freeRetainmentSmoothingMaxExtra: FREE_QUANTITY_SMOOTHING_MAX_EXTRA * 1.5,
    },
};

const PRICING_SELL_CONFIGS: Record<SellPricingPreset, Partial<AutomatedPricingConfig>> = {
    'liquidation': {
        priceAdjustMaxUp: parseFloat(Math.min(1.2, PRICE_ADJUST_MAX_UP * 0.96).toFixed(2)),
        priceAdjustMaxDown: parseFloat((PRICE_ADJUST_MAX_DOWN * 0.84).toFixed(2)),
        targetSellThrough: parseFloat(Math.min(1, TARGET_SELL_THROUGH * 1.06).toFixed(2)),
        askVolumeFloorFraction: 0.4,
        askPriceSensitivity: 1.5,
    },
    'market-rate': {
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        targetSellThrough: TARGET_SELL_THROUGH,
        askVolumeFloorFraction: ASK_VOLUME_FLOOR_FRACTION,
        askPriceSensitivity: ASK_PRICE_SENSITIVITY,
    },
    'premium': {
        priceAdjustMaxUp: parseFloat((PRICE_ADJUST_MAX_UP * 1.1).toFixed(2)),
        priceAdjustMaxDown: parseFloat((1 - (1 - PRICE_ADJUST_MAX_DOWN) * 0.6).toFixed(2)),
        targetSellThrough: parseFloat((TARGET_SELL_THROUGH * 0.7).toFixed(2)),
        askVolumeFloorFraction: 0.1,
        askPriceSensitivity: 0.6,
    },
};

export interface AgentPersonality {
    buyAutoConfig: AutomatedPricingConfig;
    sellAutoConfig: AutomatedPricingConfig;
}

export function generateAgentPersonality(): AgentPersonality {
    return {
        buyAutoConfig: {
            ...VOLUME_BUY_CONFIGS.balanced,
            ...PRICING_BUY_CONFIGS['market-rate'],
        },
        sellAutoConfig: {
            ...VOLUME_SELL_CONFIGS.balanced,
            ...PRICING_SELL_CONFIGS['market-rate'],
        },
    };
}

export { BUY_VOLUME_PRESETS, BUY_PRICING_PRESETS, SELL_VOLUME_PRESETS, SELL_PRICING_PRESETS };
export type { BuyVolumePreset, BuyPricingPreset, SellVolumePreset, SellPricingPreset };

export function buildBuyAutoConfigForResource(
    base: AutomatedPricingConfig,
    resource: Resource,
): AutomatedPricingConfig {
    const cfg = { ...base };
    if (resource.form === 'services') {
        delete cfg.inputBufferTargetTicks;
        delete cfg.targetFillRate;
    }
    return cfg;
}

export function buildSellAutoConfigForResource(
    base: AutomatedPricingConfig,
    resource: Resource,
): AutomatedPricingConfig {
    const cfg = { ...base };
    if (resource.form === 'services') {
        delete cfg.targetSellThrough;
    }
    return cfg;
}
