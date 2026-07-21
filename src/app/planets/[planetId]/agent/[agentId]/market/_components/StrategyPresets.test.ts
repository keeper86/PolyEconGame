import { describe, expect, it } from 'vitest';
import type { AutoConfigLocalState } from './marketTypes';
import {
    detectPricingBuyPreset,
    detectPricingSellPreset,
    detectVolumeBuyPreset,
    detectVolumeSellPreset,
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
        const local = localWith({
            inventorySmoothingMaxExtra: '0',
            inputBufferTargetTicks: '5',
            freeBuyQuantity: '0',
            freeBuyQuantitySmoothingMaxExtra: '2',
        });
        expect(detectVolumeBuyPreset(local)).toBe('just-in-time');
    });

    it('detects balanced preset', () => {
        const local = localWith({
            inventorySmoothingMaxExtra: '2',
            inputBufferTargetTicks: '30',
            freeBuyQuantity: '0',
            freeBuyQuantitySmoothingMaxExtra: '2',
        });
        expect(detectVolumeBuyPreset(local)).toBe('balanced');
    });

    it('detects stockpile preset', () => {
        const local = localWith({
            inventorySmoothingMaxExtra: '5',
            inputBufferTargetTicks: '60',
            freeBuyQuantity: '0',
            freeBuyQuantitySmoothingMaxExtra: '2',
        });
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
        const local = localWith({
            inventorySmoothingMaxExtra: '0',
            outputBufferMaxTicks: '2',
            freeSellQuantity: '0',
            freeSellQuantitySmoothingMaxExtra: '2',
        });
        expect(detectVolumeSellPreset(local)).toBe('just-in-time');
    });

    it('detects balanced preset', () => {
        const local = localWith({
            inventorySmoothingMaxExtra: '2',
            outputBufferMaxTicks: '20',
            freeSellQuantity: '0',
            freeSellQuantitySmoothingMaxExtra: '2',
        });
        expect(detectVolumeSellPreset(local)).toBe('balanced');
    });

    it('detects stockpile preset', () => {
        const local = localWith({
            inventorySmoothingMaxExtra: '5',
            outputBufferMaxTicks: '60',
            freeSellQuantity: '0',
            freeSellQuantitySmoothingMaxExtra: '2',
        });
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
        const local = localWith({
            priceAdjustMaxUp: '1.01',
            priceAdjustMaxDown: '0.80',
            targetFillRate: '0.70',
            bidOfferMaxCostMultiplier: '3',
            automatedCostFloorBuffer: '0',
        });
        expect(detectPricingBuyPreset(local)).toBe('liquidation');
    });

    it('detects market-rate preset', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.05',
            priceAdjustMaxDown: '0.95',
            targetFillRate: '0.90',
            bidOfferMaxCostMultiplier: '6',
            automatedCostFloorBuffer: '0',
        });
        expect(detectPricingBuyPreset(local)).toBe('market-rate');
    });

    it('detects premium preset', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.15',
            priceAdjustMaxDown: '0.98',
            targetFillRate: '0.95',
            bidOfferMaxCostMultiplier: '10',
            automatedCostFloorBuffer: '0',
        });
        expect(detectPricingBuyPreset(local)).toBe('premium');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.10',
            priceAdjustMaxDown: '0.90',
            targetFillRate: '0.80',
            bidOfferMaxCostMultiplier: '8',
            automatedCostFloorBuffer: '0',
        });
        expect(detectPricingBuyPreset(local)).toBe('custom');
    });
});

describe('detectPricingSellPreset', () => {
    it('detects liquidation preset', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.01',
            priceAdjustMaxDown: '0.80',
            automatedCostFloorBuffer: '0.0',
            targetSellThrough: '0.95',
            bidOfferMaxCostMultiplier: '3',
        });
        expect(detectPricingSellPreset(local)).toBe('liquidation');
    });

    it('detects market-rate preset', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.05',
            priceAdjustMaxDown: '0.95',
            automatedCostFloorBuffer: '0.5',
            targetSellThrough: '0.85',
            bidOfferMaxCostMultiplier: '6',
        });
        expect(detectPricingSellPreset(local)).toBe('market-rate');
    });

    it('detects premium preset', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.15',
            priceAdjustMaxDown: '0.98',
            automatedCostFloorBuffer: '1.5',
            targetSellThrough: '0.50',
            bidOfferMaxCostMultiplier: '10',
        });
        expect(detectPricingSellPreset(local)).toBe('premium');
    });

    it('returns custom when no preset matches', () => {
        const local = localWith({
            priceAdjustMaxUp: '1.05',
            priceAdjustMaxDown: '0.93',
            automatedCostFloorBuffer: '0.5',
            targetSellThrough: '0.85',
            bidOfferMaxCostMultiplier: '6',
        });
        expect(detectPricingSellPreset(local)).toBe('custom');
    });
});
