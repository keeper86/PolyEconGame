import { describe, expect, it } from 'vitest';
import type { AutoConfigLocalState } from './marketTypes';
import {
    detectPricingBuyPreset,
    detectPricingSellPreset,
    detectVolumeBuyPreset,
    detectVolumeSellPreset,
    PRICING_BUY_PRESETS,
    PRICING_SELL_PRESETS,
    VOLUME_BUY_PRESETS,
    VOLUME_SELL_PRESETS,
} from './StrategyPresets';

function emptyLocal(): AutoConfigLocalState {
    return {
        priceAdjustMaxUp: '',
        priceAdjustMaxDown: '',
        costSpringStrength: '',
        bidOfferMaxCostMultiplier: '',
        inventorySmoothingMaxExtra: '',
        outputBufferMaxTicks: '',
        targetSellThrough: '',
        automatedCostFloorBuffer: '',
        inputBufferTargetTicks: '',
        targetFillRate: '',
        freeBuyQuantity: '',
        freeSellQuantity: '',
        freeBuyQuantitySmoothingMaxExtra: '',
        freeSellQuantitySmoothingMaxExtra: '',
    };
}

function localWith(overrides: Partial<AutoConfigLocalState>): AutoConfigLocalState {
    return { ...emptyLocal(), ...overrides };
}

describe('detectVolumeBuyPreset', () => {
    it('detects just-in-time preset', () => {
        const local = localWith(VOLUME_BUY_PRESETS['just-in-time']);
        expect(detectVolumeBuyPreset(local)).toBe('just-in-time');
    });

    it('detects balanced preset', () => {
        const local = localWith(VOLUME_BUY_PRESETS['balanced']);
        expect(detectVolumeBuyPreset(local)).toBe('balanced');
    });

    it('detects stockpile preset', () => {
        const local = localWith(VOLUME_BUY_PRESETS['stockpile']);
        expect(detectVolumeBuyPreset(local)).toBe('stockpile');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            inventorySmoothingMaxExtra: '3',
            inputBufferTargetTicks: '40',
            freeBuyQuantity: '0',
            freeBuyQuantitySmoothingMaxExtra: '2',
        });
        expect(detectVolumeBuyPreset(local)).toBe('custom');
    });

    it('returns custom for empty config', () => {
        expect(detectVolumeBuyPreset(emptyLocal())).toBe('custom');
    });
});

describe('detectVolumeSellPreset', () => {
    it('detects just-in-time preset', () => {
        const local = localWith(VOLUME_SELL_PRESETS['just-in-time']);
        expect(detectVolumeSellPreset(local)).toBe('just-in-time');
    });

    it('detects balanced preset', () => {
        const local = localWith(VOLUME_SELL_PRESETS['balanced']);
        expect(detectVolumeSellPreset(local)).toBe('balanced');
    });

    it('detects stockpile preset', () => {
        const local = localWith(VOLUME_SELL_PRESETS['stockpile']);
        expect(detectVolumeSellPreset(local)).toBe('stockpile');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            inventorySmoothingMaxExtra: '2',
            outputBufferMaxTicks: '30',
            freeSellQuantity: '0',
            freeSellQuantitySmoothingMaxExtra: '2',
        });
        expect(detectVolumeSellPreset(local)).toBe('custom');
    });
});

describe('detectPricingBuyPreset', () => {
    it('detects liquidation preset', () => {
        const local = localWith(PRICING_BUY_PRESETS['liquidation']);
        expect(detectPricingBuyPreset(local)).toBe('liquidation');
    });

    it('detects market-rate preset', () => {
        const local = localWith(PRICING_BUY_PRESETS['market-rate']);
        expect(detectPricingBuyPreset(local)).toBe('market-rate');
    });

    it('detects premium preset', () => {
        const local = localWith(PRICING_BUY_PRESETS['premium']);
        expect(detectPricingBuyPreset(local)).toBe('premium');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.10',
            priceAdjustMaxDown: '0.90',
            targetFillRate: '0.80',
            bidOfferMaxCostMultiplier: '8',
        });
        expect(detectPricingBuyPreset(local)).toBe('custom');
    });
});

describe('detectPricingSellPreset', () => {
    it('detects liquidation preset', () => {
        const local = localWith(PRICING_SELL_PRESETS['liquidation']);
        expect(detectPricingSellPreset(local)).toBe('liquidation');
    });

    it('detects market-rate preset', () => {
        const local = localWith(PRICING_SELL_PRESETS['market-rate']);
        expect(detectPricingSellPreset(local)).toBe('market-rate');
    });

    it('detects premium preset', () => {
        const local = localWith(PRICING_SELL_PRESETS['premium']);
        expect(detectPricingSellPreset(local)).toBe('premium');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.05',
            priceAdjustMaxDown: '0.93',
            automatedCostFloorBuffer: '0.5',
            targetSellThrough: '0.85',
        });
        expect(detectPricingSellPreset(local)).toBe('custom');
    });
});
