import { describe, expect, it } from 'vitest';
import {
    buildBuyAutoConfigForResource,
    buildSellAutoConfigForResource,
    generateAgentPersonality,
} from './personalities';
import { INPUT_BUFFER_TARGET_TICKS, TARGET_FILL_RATE, TARGET_SELL_THROUGH } from '../constants';

describe('generateAgentPersonality', () => {
    it('returns configs with populated fields', () => {
        const personality = generateAgentPersonality();
        expect(personality.buyAutoConfig).toBeDefined();
        expect(personality.sellAutoConfig).toBeDefined();
        expect(typeof personality.buyAutoConfig.priceAdjustMaxUp).toBe('number');
        expect(typeof personality.sellAutoConfig.priceAdjustMaxUp).toBe('number');
    });

    it('produces diverse results over many samples', () => {
        const seenBuyVolume = new Set<string>();
        const seenBuyPricing = new Set<string>();
        const seenSellVolume = new Set<string>();
        const seenSellPricing = new Set<string>();

        for (let i = 0; i < 500; i++) {
            const cfg = generateAgentPersonality();

            const hasInputBuffer = cfg.buyAutoConfig.inputBufferTargetTicks;
            const hasTargetFill = cfg.buyAutoConfig.targetFillRate;
            const hasTargetSellThrough = cfg.sellAutoConfig.targetSellThrough;

            if (hasInputBuffer === undefined) seenBuyVolume.add('undefined');
            else if (hasInputBuffer <= INPUT_BUFFER_TARGET_TICKS / 3) seenBuyVolume.add('just-in-time');
            else if (hasInputBuffer >= INPUT_BUFFER_TARGET_TICKS * 1.8) seenBuyVolume.add('stockpile');
            else seenBuyVolume.add('balanced');

            if (hasTargetFill === undefined) seenBuyPricing.add('undefined');
            else if (hasTargetFill <= TARGET_FILL_RATE * 0.85) seenBuyPricing.add('patient');
            else if (hasTargetFill >= TARGET_FILL_RATE * 1.04) seenBuyPricing.add('urgent');
            else seenBuyPricing.add('market-rate');

            if (hasTargetSellThrough === undefined) seenSellPricing.add('undefined');
            else if (hasTargetSellThrough <= TARGET_SELL_THROUGH * 0.7) seenSellPricing.add('premium');
            else if (hasTargetSellThrough >= TARGET_SELL_THROUGH * 1.04) seenSellPricing.add('liquidation');
            else seenSellPricing.add('market-rate');

            const freeRet = cfg.sellAutoConfig.freeRetainmentSmoothingMaxExtra;
            if (freeRet === undefined) seenSellVolume.add('undefined');
            else if (freeRet <= 3) seenSellVolume.add('dump');
            else if (freeRet >= 12) seenSellVolume.add('reserve');
            else seenSellVolume.add('balanced');
        }

        expect(seenBuyVolume.has('balanced')).toBe(true);
        expect(seenBuyVolume.has('just-in-time')).toBe(true);
        expect(seenBuyVolume.has('stockpile')).toBe(true);

        expect(seenBuyPricing.has('market-rate')).toBe(true);
        expect(seenBuyPricing.has('patient')).toBe(true);
        expect(seenBuyPricing.has('urgent')).toBe(true);

        expect(seenSellVolume.has('balanced')).toBe(true);
        expect(seenSellVolume.has('dump')).toBe(true);
        expect(seenSellVolume.has('reserve')).toBe(true);

        expect(seenSellPricing.has('market-rate')).toBe(true);
        expect(seenSellPricing.has('liquidation')).toBe(true);
        expect(seenSellPricing.has('premium')).toBe(true);
    });
});

describe('buildBuyAutoConfigForResource', () => {
    it('strips inputBufferTargetTicks and targetFillRate for services', () => {
        const service = { name: 'healthcare', form: 'services', mass: 0, volume: 0, formCategory: 'g' as const };
        const cfg = buildBuyAutoConfigForResource(
            { inputBufferTargetTicks: 30, targetFillRate: 0.9, priceAdjustMaxUp: 1.05 },
            service,
        );
        expect(cfg.inputBufferTargetTicks).toBeUndefined();
        expect(cfg.targetFillRate).toBeUndefined();
        expect(cfg.priceAdjustMaxUp).toBe(1.05);
    });

    it('keeps all fields for goods', () => {
        const goods = { name: 'ironOre', form: 'solid', mass: 1, volume: 1, formCategory: 's' as const };
        const cfg = buildBuyAutoConfigForResource(
            { inputBufferTargetTicks: 30, targetFillRate: 0.9 },
            goods,
        );
        expect(cfg.inputBufferTargetTicks).toBe(30);
        expect(cfg.targetFillRate).toBe(0.9);
    });
});

describe('buildSellAutoConfigForResource', () => {
    it('strips targetSellThrough for services', () => {
        const service = { name: 'healthcare', form: 'services', mass: 0, volume: 0, formCategory: 'g' as const };
        const cfg = buildSellAutoConfigForResource(
            { targetSellThrough: 0.9, automatedCostFloorBuffer: 0.5 },
            service,
        );
        expect(cfg.targetSellThrough).toBeUndefined();
        expect(cfg.automatedCostFloorBuffer).toBe(0.5);
    });

    it('keeps all fields for goods', () => {
        const goods = { name: 'ironOre', form: 'solid', mass: 1, volume: 1, formCategory: 's' as const };
        const cfg = buildSellAutoConfigForResource(
            { targetSellThrough: 0.9, automatedCostFloorBuffer: 0.5 },
            goods,
        );
        expect(cfg.targetSellThrough).toBe(0.9);
    });
});