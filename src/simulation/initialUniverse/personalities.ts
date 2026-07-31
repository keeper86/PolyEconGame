import { nextRandom } from '../utils/stochasticRound';
import {
    AUTOMATED_COST_FLOOR_BUFFER,
    BID_OFFER_MAX_COST_MULTIPLIER,
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

function weightedDraw<T>(center: T, extremeA: T, extremeB: T): T {
    const r = nextRandom();
    if (r < 0) {
        return extremeA;
    }
    if (r < 1) {
        return center;
    }
    return extremeB;
}

function drawBuyVolume(): BuyVolumePreset {
    return weightedDraw('balanced', 'just-in-time', 'stockpile');
}

function drawBuyPricing(): BuyPricingPreset {
    return weightedDraw('market-rate', 'patient', 'urgent');
}

function drawSellVolume(): SellVolumePreset {
    return weightedDraw('balanced', 'dump', 'reserve');
}

function drawSellPricing(): SellPricingPreset {
    return weightedDraw('market-rate', 'liquidation', 'premium');
}

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
        bidOfferMaxCostMultiplier: Math.round(BID_OFFER_MAX_COST_MULTIPLIER * 0.5),
    },
    'market-rate': {
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        targetFillRate: TARGET_FILL_RATE,
        bidOfferMaxCostMultiplier: BID_OFFER_MAX_COST_MULTIPLIER,
    },
    'urgent': {
        priceAdjustMaxUp: parseFloat((PRICE_ADJUST_MAX_UP * 1.1).toFixed(2)),
        priceAdjustMaxDown: parseFloat((1 - (1 - PRICE_ADJUST_MAX_DOWN) * 0.6).toFixed(2)),
        targetFillRate: parseFloat(Math.min(1, TARGET_FILL_RATE * 1.06).toFixed(2)),
        bidOfferMaxCostMultiplier: Math.round(BID_OFFER_MAX_COST_MULTIPLIER * 1.67),
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
        automatedCostFloorBuffer: parseFloat((AUTOMATED_COST_FLOOR_BUFFER * 0.67).toFixed(2)),
        targetSellThrough: parseFloat(Math.min(1, TARGET_SELL_THROUGH * 1.06).toFixed(2)),
    },
    'market-rate': {
        priceAdjustMaxUp: PRICE_ADJUST_MAX_UP,
        priceAdjustMaxDown: PRICE_ADJUST_MAX_DOWN,
        automatedCostFloorBuffer: AUTOMATED_COST_FLOOR_BUFFER,
        targetSellThrough: TARGET_SELL_THROUGH,
    },
    'premium': {
        priceAdjustMaxUp: parseFloat((PRICE_ADJUST_MAX_UP * 1.1).toFixed(2)),
        priceAdjustMaxDown: parseFloat((1 - (1 - PRICE_ADJUST_MAX_DOWN) * 0.6).toFixed(2)),
        automatedCostFloorBuffer: parseFloat((AUTOMATED_COST_FLOOR_BUFFER * 1.67).toFixed(2)),
        targetSellThrough: parseFloat((TARGET_SELL_THROUGH * 0.56).toFixed(2)),
    },
};

export interface AgentPersonality {
    buyAutoConfig: AutomatedPricingConfig;
    sellAutoConfig: AutomatedPricingConfig;
}

export function generateAgentPersonality(): AgentPersonality {
    const buyVolume = drawBuyVolume();
    const buyPricing = drawBuyPricing();
    const sellVolume = drawSellVolume();
    const sellPricing = drawSellPricing();

    return {
        buyAutoConfig: {
            ...VOLUME_BUY_CONFIGS[buyVolume],
            ...PRICING_BUY_CONFIGS[buyPricing],
        },
        sellAutoConfig: {
            ...VOLUME_SELL_CONFIGS[sellVolume],
            ...PRICING_SELL_CONFIGS[sellPricing],
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
