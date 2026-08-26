import { describe, expect, it } from 'vitest';
import {
    buildSpringCurvePoints,
    buildSpringRatioTicks,
    computeSpringDomain,
    ratioAtFullPush,
    springFraction,
    springPush,
} from './costSpringCurve';
import type { CostSpringParams } from './costSpringCurve';

const buyParams: CostSpringParams = { strength: 0.1, reference: 3.5 };
const sellParams: CostSpringParams = { strength: 0.1, reference: 1.5 };

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
        expect(springPush('buy', { strength: 0, reference: 3.5 }, 10)).toBe(0);
        expect(springPush('sell', { strength: 0, reference: 1.5 }, 0.5)).toBe(0);
    });
});

describe('ratioAtFullPush', () => {
    it('marks the price where the push cancels the max movement', () => {
        expect(ratioAtFullPush('buy', buyParams)).toBeCloseTo(3.5 * 1.25, 10);
        expect(ratioAtFullPush('sell', sellParams)).toBeCloseTo(1.5 / 1.25, 10);
    });

    it('is NaN for a zero strength', () => {
        expect(ratioAtFullPush('buy', { strength: 0, reference: 3.5 })).toBeNaN();
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
});

describe('computeSpringDomain', () => {
    it('covers the full-push ratio for buy with margin', () => {
        const domain = computeSpringDomain('buy', buyParams, buyParams);
        expect(domain).toBeGreaterThanOrEqual(ratioAtFullPush('buy', buyParams) * 1.15);
    });

    it('covers the buffer for sell with margin', () => {
        const domain = computeSpringDomain('sell', sellParams, sellParams);
        expect(domain).toBeGreaterThanOrEqual(1.5 * 1.15);
    });

    it('extends to include the current ratio', () => {
        expect(computeSpringDomain('sell', sellParams, sellParams, 4)).toBeGreaterThanOrEqual(4 * 1.15);
    });
});

describe('buildSpringCurvePoints', () => {
    it('samples from 0 to the domain inclusive', () => {
        const domain = computeSpringDomain('buy', buyParams, buyParams);
        const points = buildSpringCurvePoints('buy', buyParams, buyParams, domain, 50);
        expect(points).toHaveLength(51);
        expect(points[0].ratio).toBe(0);
        expect(points[points.length - 1].ratio).toBeCloseTo(domain, 3);
    });

    it('stays flat at 0 below the buy reference', () => {
        const points = buildSpringCurvePoints('buy', buyParams, buyParams, 4.375, 100);
        for (const p of points.filter((point) => point.ratio <= 3.5)) {
            expect(p.ghost).toBe(0);
        }
    });
});

describe('buildSpringRatioTicks', () => {
    it('reproduces the recharts fixed-domain ticks', () => {
        expect(buildSpringRatioTicks(10)).toEqual([0, 3, 6, 10]);
        expect(buildSpringRatioTicks(2)).toEqual([0, 0.5, 1, 1.5, 2]);
    });

    it('inserts the current ratio as an extra tick', () => {
        expect(buildSpringRatioTicks(10, 6.25)).toEqual([0, 3, 6, 6.25, 10]);
    });

    it('ignores current ratios outside the domain', () => {
        expect(buildSpringRatioTicks(10, 12)).toEqual([0, 3, 6, 10]);
    });
});
