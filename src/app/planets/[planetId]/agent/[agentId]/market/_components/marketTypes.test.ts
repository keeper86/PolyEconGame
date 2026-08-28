import { describe, expect, it } from 'vitest';
import type { AutomatedPricingConfig } from '@/simulation/planet/planet';
import {
    autoConfigToLocal,
    buildResetTarget,
    canResetToTarget,
    isAutoConfigDirty,
    localToAutoConfig,
    type AutoConfigLocalState,
} from './marketTypes';

describe('autoConfigToLocal', () => {
    it('returns empty strings for undefined config', () => {
        const local = autoConfigToLocal(undefined);
        for (const val of Object.values(local)) {
            expect(val).toBe('');
        }
    });

    it('converts all numeric fields to strings', () => {
        const config: AutomatedPricingConfig = {
            priceAdjustMaxUp: 1.05,
            priceAdjustMaxDown: 0.95,
            costSpringStrength: 0.1,
            bidOfferMaxCostMultiplier: 6,
            inventorySmoothingMaxExtra: 2,
            targetSellThrough: 0.9,
            automatedCostFloorBuffer: 0.5,
            inputBufferTargetTicks: 30,
            targetFillRate: 0.9,
            freeBuyQuantity: 1000,
            freeRetainment: 2000,
            freeBuyQuantitySmoothingMaxExtra: 2,
            freeRetainmentSmoothingMaxExtra: 3,
        };
        const local = autoConfigToLocal(config);
        expect(local.priceAdjustMaxUp).toBe('1.05');
        expect(local.priceAdjustMaxDown).toBe('0.95');
        expect(local.costSpringStrength).toBe('0.1');
        expect(local.bidOfferMaxCostMultiplier).toBe('6');
        expect(local.inventorySmoothingMaxExtra).toBe('2');
        expect(local.targetSellThrough).toBe('0.9');
        expect(local.automatedCostFloorBuffer).toBe('0.5');
        expect(local.inputBufferTargetTicks).toBe('30');
        expect(local.targetFillRate).toBe('0.9');
        expect(local.freeBuyQuantity).toBe('1000');
        expect(local.freeRetainment).toBe('2000');
        expect(local.freeBuyQuantitySmoothingMaxExtra).toBe('2');
        expect(local.freeRetainmentSmoothingMaxExtra).toBe('3');
    });

    it('handles partial config (missing fields are empty)', () => {
        const config: AutomatedPricingConfig = { priceAdjustMaxUp: 1.1 };
        const local = autoConfigToLocal(config);
        expect(local.priceAdjustMaxUp).toBe('1.1');
        expect(local.priceAdjustMaxDown).toBe('');
        expect(local.costSpringStrength).toBe('');
    });
});

describe('localToAutoConfig', () => {
    it('returns undefined when all fields are empty', () => {
        const local: AutoConfigLocalState = {
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
        expect(localToAutoConfig(local)).toBeUndefined();
    });

    it('converts string numbers to numeric config', () => {
        const local: AutoConfigLocalState = {
            priceAdjustMaxUp: '1.05',
            priceAdjustMaxDown: '0.95',
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
        const config = localToAutoConfig(local);
        expect(config).toBeDefined();
        expect(config!.priceAdjustMaxUp).toBe(1.05);
        expect(config!.priceAdjustMaxDown).toBe(0.95);
        expect(config!.costSpringStrength).toBeUndefined();
    });

    it('skips fields with non-numeric values', () => {
        const local: AutoConfigLocalState = {
            priceAdjustMaxUp: 'abc',
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
        expect(localToAutoConfig(local)).toBeUndefined();
    });

    it('round-trips from config to local and back', () => {
        const original: AutomatedPricingConfig = {
            priceAdjustMaxUp: 1.1,
            priceAdjustMaxDown: 0.9,
            targetFillRate: 0.85,
        };
        const local = autoConfigToLocal(original);
        const restored = localToAutoConfig(local);
        expect(restored).toBeDefined();
        expect(restored!.priceAdjustMaxUp).toBe(1.1);
        expect(restored!.priceAdjustMaxDown).toBe(0.9);
        expect(restored!.targetFillRate).toBe(0.85);
        expect(restored!.costSpringStrength).toBeUndefined();
    });
});

describe('isAutoConfigDirty', () => {
    it('returns false when local matches committed', () => {
        const local: AutoConfigLocalState = autoConfigToLocal({ priceAdjustMaxUp: 1.05 });
        const committed: AutomatedPricingConfig = { priceAdjustMaxUp: 1.05 };
        expect(isAutoConfigDirty(local, committed)).toBe(false);
    });

    it('returns true when local differs from committed', () => {
        const local: AutoConfigLocalState = autoConfigToLocal({ priceAdjustMaxUp: 1.1 });
        const committed: AutomatedPricingConfig = { priceAdjustMaxUp: 1.05 };
        expect(isAutoConfigDirty(local, committed)).toBe(true);
    });

    it('returns false when committed is undefined and local is empty', () => {
        const local: AutoConfigLocalState = autoConfigToLocal(undefined);
        expect(isAutoConfigDirty(local, undefined)).toBe(false);
    });

    it('returns true when local has a value but committed is undefined', () => {
        const local: AutoConfigLocalState = autoConfigToLocal({ priceAdjustMaxUp: 1.05 });
        expect(isAutoConfigDirty(local, undefined)).toBe(true);
    });
});

describe('buildResetTarget', () => {
    const KEYS = ['priceAdjustMaxUp', 'priceAdjustMaxDown'] as const;

    it('returns the committed values for the given keys', () => {
        const committed = autoConfigToLocal({ priceAdjustMaxUp: 1.05, priceAdjustMaxDown: 0.95 });
        const target = buildResetTarget(committed, KEYS);
        expect(target.priceAdjustMaxUp).toBe('1.05');
        expect(target.priceAdjustMaxDown).toBe('0.95');
    });

    it('returns only the selected keys', () => {
        const committed = autoConfigToLocal({ priceAdjustMaxUp: 1.05, costSpringStrength: 0.2 });
        const target = buildResetTarget(committed, KEYS);
        expect(Object.keys(target)).toEqual(['priceAdjustMaxUp', 'priceAdjustMaxDown']);
    });

    it('returns empty strings when committed is undefined', () => {
        const target = buildResetTarget(autoConfigToLocal(undefined), KEYS);
        expect(target.priceAdjustMaxUp).toBe('');
        expect(target.priceAdjustMaxDown).toBe('');
    });
});

describe('canResetToTarget', () => {
    const KEYS = ['priceAdjustMaxUp', 'priceAdjustMaxDown'] as const;
    const empty = (): AutoConfigLocalState => autoConfigToLocal(undefined);
    const committed = autoConfigToLocal({ priceAdjustMaxUp: 1.05, priceAdjustMaxDown: 0.95 });

    it('returns false when the draft matches the committed state', () => {
        expect(canResetToTarget(committed, committed, KEYS, 'market-rate', 'market-rate')).toBe(false);
    });

    it('returns false when committed is undefined and the draft is empty', () => {
        const target = { priceAdjustMaxUp: '', priceAdjustMaxDown: '' };
        expect(canResetToTarget(empty(), target, KEYS, 'custom', 'custom')).toBe(false);
    });

    it('returns true when switching to another preset, so Reset restores the committed preset', () => {
        const draft = autoConfigToLocal({ priceAdjustMaxUp: 1.16, priceAdjustMaxDown: 0.98 });
        expect(canResetToTarget(draft, committed, KEYS, 'urgent', 'market-rate')).toBe(true);
    });

    it('returns true when a knob click flipped the mode to custom while values are unchanged', () => {
        expect(canResetToTarget(committed, committed, KEYS, 'custom', 'market-rate')).toBe(true);
    });

    it('returns true when only one value differs from the committed config', () => {
        const draft = autoConfigToLocal({ priceAdjustMaxUp: 1.05, priceAdjustMaxDown: 0.85 });
        expect(canResetToTarget(draft, committed, KEYS, 'custom', 'market-rate')).toBe(true);
    });
});
