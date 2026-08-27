import { describe, expect, it } from 'vitest';
import {
    buildSpringCurvePoints,
    buildSpringRatioTicks,
    computeSpringDomain,
    fullPush,
    ratioAtFullPush,
    springFraction,
    springPush,
} from './costSpringCurve';
import type { CostSpringParams } from './costSpringCurve';

const buyParams: CostSpringParams = { strength: 0.1, reference: 3.5, maxUp: 1.05, maxDown: 0.95 };
const sellParams: CostSpringParams = { strength: 0.1, reference: 1.5, maxUp: 1.05, maxDown: 0.95 };
const aggressiveParams: CostSpringParams = { strength: 0.1, reference: 3.5, maxUp: 1.1, maxDown: 0.9 };

describe('fullPush', () => {
    it('uses the up rate for buyers and the down rate for sellers', () => {
        expect(fullPush('buy', buyParams)).toBeCloseTo(0.05, 10);
        expect(fullPush('sell', sellParams)).toBeCloseTo(0.05, 10);
        expect(fullPush('buy', aggressiveParams)).toBeCloseTo(0.1, 10);
        expect(fullPush('sell', aggressiveParams)).toBeCloseTo(0.1, 10);
    });

    it('is 0 when there is no movement to equalize', () => {
        expect(fullPush('buy', { ...buyParams, maxUp: 1 })).toBe(0);
        expect(fullPush('sell', { ...sellParams, maxDown: 1 })).toBe(0);
    });
});

describe('springPush', () => {
    it('is inactive on the safe side of the reference', () => {
        expect(springPush('buy', buyParams, 2)).toBe(0);
        expect(springPush('sell', sellParams, 3)).toBe(0);
    });

    it('grows with the deviation beyond the reference', () => {
        expect(springPush('buy', buyParams, 4.375)).toBeCloseTo(0.05, 10);
        expect(springPush('sell', sellParams, 1.2)).toBeCloseTo(0.05, 10);
    });

    it('returns 0 for a zero strength', () => {
        expect(springPush('buy', { strength: 0, reference: 3.5, maxUp: 1.05, maxDown: 0.95 }, 10)).toBe(0);
        expect(springPush('sell', { strength: 0, reference: 1.5, maxUp: 1.05, maxDown: 0.95 }, 0.5)).toBe(0);
    });

    it('blows up toward P/C=0 for sell (infinite deviation, clamped by springFraction)', () => {
        expect(springPush('sell', sellParams, 0)).toBe(Infinity);
        expect(springPush('sell', sellParams, 0.0001)).toBeGreaterThan(1);
        expect(springFraction('sell', sellParams, 0)).toBe(1);
    });
});

describe('ratioAtFullPush', () => {
    it('marks the price where the push cancels the max movement', () => {
        expect(ratioAtFullPush('buy', buyParams)).toBeCloseTo(3.5 * 1.25, 10);
        expect(ratioAtFullPush('sell', sellParams)).toBeCloseTo(1.5 / 1.25, 10);
    });

    it('is NaN for a zero strength', () => {
        expect(ratioAtFullPush('buy', { strength: 0, reference: 3.5, maxUp: 1.05, maxDown: 0.95 })).toBeNaN();
    });

    it('marks the 100% point farther out when the adjustment speed rises', () => {
        expect(ratioAtFullPush('buy', aggressiveParams)).toBeCloseTo(3.5 * 2, 10);
        expect(ratioAtFullPush('sell', { ...sellParams, maxDown: 0.9 })).toBeCloseTo(1.5 / 2, 10);
    });
});

describe('springFraction', () => {
    it('reaches 100% exactly at the full-push ratio', () => {
        expect(springFraction('buy', buyParams, ratioAtFullPush('buy', buyParams))).toBeCloseTo(1, 10);
        expect(springFraction('sell', sellParams, ratioAtFullPush('sell', sellParams))).toBeCloseTo(1, 10);
    });

    it('clamps at 100% beyond the full-push ratio', () => {
        expect(springFraction('buy', buyParams, 10)).toBe(1);
        expect(springFraction('sell', sellParams, 0.1)).toBe(1);
    });

    it('is 0 on the safe side', () => {
        expect(springFraction('buy', buyParams, 2)).toBe(0);
        expect(springFraction('sell', sellParams, 5)).toBe(0);
    });

    it('is always 100% at P/C=0 for the sell spring unless strength or reference is 0', () => {
        expect(springFraction('sell', sellParams, 0)).toBe(1);
        expect(springFraction('sell', { strength: 0.3, reference: 2, maxUp: 1.05, maxDown: 0.95 }, 0)).toBe(1);
        expect(springFraction('sell', { strength: 0, reference: 1.5, maxUp: 1.05, maxDown: 0.95 }, 0)).toBe(0);
        expect(springFraction('sell', { strength: 0.1, reference: 0, maxUp: 1.05, maxDown: 0.95 }, 0)).toBe(0);
    });

    it('scales 100% with the adjustment speed (buy uses maxUp, sell uses maxDown)', () => {
        expect(springFraction('buy', buyParams, 5.5)).toBe(1);
        expect(springFraction('buy', aggressiveParams, 5.5)).toBeLessThan(1);
        expect(springFraction('sell', sellParams, 1)).toBe(1);
        expect(springFraction('sell', { ...sellParams, maxDown: 0.9 }, 1)).toBeLessThan(1);
    });
});

describe('computeSpringDomain', () => {
    it('covers the full-push ratio for buy with margin', () => {
        const domain = computeSpringDomain('buy', buyParams, buyParams);
        expect(domain.max).toBeGreaterThanOrEqual(ratioAtFullPush('buy', buyParams) * 1.15);
        expect(domain.min).toBe(0);
    });

    it('caps the buy domain at twice the max soft bid', () => {
        const weakBuy: CostSpringParams = { strength: 0.01, reference: 3.5, maxUp: 1.05, maxDown: 0.95 };
        const domain = computeSpringDomain('buy', weakBuy, weakBuy);
        expect(domain.max).toBeLessThanOrEqual(20);
        expect(domain.max).toBe(20);
    });

    it('covers the buffer for sell with margin and starts at 0.75', () => {
        const domain = computeSpringDomain('sell', sellParams, sellParams);
        expect(domain.max).toBeGreaterThanOrEqual(1.5 * 1.15);
        expect(domain.min).toBe(0.75);
    });

    it('extends to include the current ratio', () => {
        expect(computeSpringDomain('sell', sellParams, sellParams, 4).max).toBeGreaterThanOrEqual(4 * 1.15);
    });

    it('extends to include the own price ratio', () => {
        expect(computeSpringDomain('sell', sellParams, sellParams, 4, 5).max).toBeGreaterThanOrEqual(5 * 1.15);
        expect(computeSpringDomain('buy', buyParams, buyParams, 1, 4.375).max).toBeGreaterThanOrEqual(4.375 * 1.15);
    });

    it('caps the buy domain even when the current ratio is far out', () => {
        expect(computeSpringDomain('buy', buyParams, buyParams, 50).max).toBe(20);
    });

    it('starts the sell axis at 0 when the data goes below 0.75', () => {
        const strongSpring: CostSpringParams = { strength: 0.03, reference: 1.5, maxUp: 1.05, maxDown: 0.95 };
        expect(computeSpringDomain('sell', strongSpring, strongSpring).min).toBe(0);
        expect(computeSpringDomain('sell', sellParams, sellParams, 0.4).min).toBe(0);
    });
});

describe('buildSpringCurvePoints', () => {
    it('samples from the domain min to the domain max inclusive', () => {
        const domain = computeSpringDomain('buy', buyParams, buyParams);
        const points = buildSpringCurvePoints('buy', buyParams, buyParams, domain.min, domain.max, 50);
        expect(points).toHaveLength(51);
        expect(points[0].ratio).toBe(0);
        expect(points[points.length - 1].ratio).toBeCloseTo(domain.max, 3);
    });

    it('samples the sell curve from 0.75 upward', () => {
        const domain = computeSpringDomain('sell', sellParams, sellParams);
        const points = buildSpringCurvePoints('sell', sellParams, sellParams, domain.min, domain.max, 50);
        expect(points[0].ratio).toBe(0.75);
        expect(points[points.length - 1].ratio).toBeCloseTo(domain.max, 3);
    });

    it('stays flat at 0 below the buy reference', () => {
        const points = buildSpringCurvePoints('buy', buyParams, buyParams, 0, 4.375, 100);
        for (const p of points.filter((point) => point.ratio <= 3.5)) {
            expect(p.ghost).toBe(0);
        }
    });
});

describe('buildSpringRatioTicks', () => {
    it('reproduces the recharts fixed-domain ticks', () => {
        expect(buildSpringRatioTicks(0, 10, [])).toEqual([0, 3, 6, 10]);
        expect(buildSpringRatioTicks(0, 2, [])).toEqual([0, 0.5, 1, 1.5, 2]);
    });

    it('inserts highlight ratios as extra ticks', () => {
        expect(buildSpringRatioTicks(0, 10, [6.25])).toEqual([0, 3, 6, 6.25, 10]);
        expect(buildSpringRatioTicks(0, 10, [6.25, 1.2])).toEqual([0, 1.2, 3, 6, 6.25, 10]);
    });

    it('ignores highlight ratios outside the domain', () => {
        expect(buildSpringRatioTicks(0, 10, [12])).toEqual([0, 3, 6, 10]);
        expect(buildSpringRatioTicks(0, 10, [0])).toEqual([0, 3, 6, 10]);
    });

    it('starts at the domain min for non-zero domains', () => {
        expect(buildSpringRatioTicks(0.75, 1.725, [1.2, 1.5])).toEqual([0.75, 1, 1.2, 1.25, 1.5, 1.725]);
    });
});
