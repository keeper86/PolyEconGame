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
        targetSellThrough: '',
        automatedCostFloorBuffer: '',
        inputBufferTargetTicks: '',
        targetFillRate: '',
        freeBuyQuantity: '',
        freeRetainment: '',
        freeBuyQuantitySmoothingMaxExtra: '',
        freeRetainmentSmoothingMaxExtra: '',
    };
}

function localWith(overrides: Partial<AutoConfigLocalState>): AutoConfigLocalState {
    return { ...emptyLocal(), ...overrides };
}

describe('detectVolumeBuyPreset', () => {
    it('detects just-in-time preset', () => {
        const local = localWith(VOLUME_BUY_PRESETS['just-in-time']);
        expect(detectVolumeBuyPreset(local, false)).toBe('just-in-time');
    });

    it('detects balanced preset', () => {
        const local = localWith(VOLUME_BUY_PRESETS.balanced);
        expect(detectVolumeBuyPreset(local, false)).toBe('balanced');
    });

    it('detects stockpile preset', () => {
        const local = localWith(VOLUME_BUY_PRESETS.stockpile);
        expect(detectVolumeBuyPreset(local, false)).toBe('stockpile');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            inventorySmoothingMaxExtra: '3',
            inputBufferTargetTicks: '40',
            freeBuyQuantity: '0',
            freeBuyQuantitySmoothingMaxExtra: '2',
        });
        expect(detectVolumeBuyPreset(local, false)).toBe('custom');
    });

    it('returns balanced for empty config', () => {
        expect(detectVolumeBuyPreset(emptyLocal(), false)).toBe('balanced');
    });
});

describe('detectVolumeSellPreset', () => {
    it('detects dump preset', () => {
        const local = localWith(VOLUME_SELL_PRESETS.dump);
        expect(detectVolumeSellPreset(local)).toBe('dump');
    });

    it('detects balanced preset', () => {
        const local = localWith(VOLUME_SELL_PRESETS.balanced);
        expect(detectVolumeSellPreset(local)).toBe('balanced');
    });

    it('detects reserve preset', () => {
        const local = localWith(VOLUME_SELL_PRESETS.reserve);
        expect(detectVolumeSellPreset(local)).toBe('reserve');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            freeRetainment: '100',
            freeRetainmentSmoothingMaxExtra: '3',
        });
        expect(detectVolumeSellPreset(local)).toBe('custom');
    });

    it('returns balanced for empty config', () => {
        expect(detectVolumeSellPreset(emptyLocal())).toBe('balanced');
    });
});

describe('detectPricingBuyPreset', () => {
    it('detects patient preset', () => {
        const local = localWith(PRICING_BUY_PRESETS.patient);
        expect(detectPricingBuyPreset(local, false)).toBe('patient');
    });

    it('detects market-rate preset', () => {
        const local = localWith(PRICING_BUY_PRESETS['market-rate']);
        expect(detectPricingBuyPreset(local, false)).toBe('market-rate');
    });

    it('detects urgent preset', () => {
        const local = localWith(PRICING_BUY_PRESETS.urgent);
        expect(detectPricingBuyPreset(local, false)).toBe('urgent');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.10',
            priceAdjustMaxDown: '0.90',
            targetFillRate: '0.80',
            bidOfferMaxCostMultiplier: '8',
        });
        expect(detectPricingBuyPreset(local, false)).toBe('custom');
    });

    it('returns market-rate for empty config', () => {
        expect(detectPricingBuyPreset(emptyLocal(), false)).toBe('market-rate');
    });
});

describe('detectPricingSellPreset', () => {
    it('detects liquidation preset', () => {
        const local = localWith(PRICING_SELL_PRESETS.liquidation);
        expect(detectPricingSellPreset(local, false)).toBe('liquidation');
    });

    it('detects market-rate preset', () => {
        const local = localWith(PRICING_SELL_PRESETS['market-rate']);
        expect(detectPricingSellPreset(local, false)).toBe('market-rate');
    });

    it('detects premium preset', () => {
        const local = localWith(PRICING_SELL_PRESETS.premium);
        expect(detectPricingSellPreset(local, false)).toBe('premium');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.05',
            priceAdjustMaxDown: '0.93',
            automatedCostFloorBuffer: '0.5',
            targetSellThrough: '0.85',
        });
        expect(detectPricingSellPreset(local, false)).toBe('custom');
    });

    it('returns market-rate for empty config', () => {
        expect(detectPricingSellPreset(emptyLocal(), false)).toBe('market-rate');
    });
});