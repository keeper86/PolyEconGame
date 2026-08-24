import { describe, expect, it } from 'vitest';
import { buildVolumeFractionPoints, computeVolumeFractionDomain, volumeFractionAt } from './volumeFractionCurve';
import type { VolumeFractionParams } from './volumeFractionCurve';

const sellParams: VolumeFractionParams = {
    floorFraction: 0.2,
    sensitivity: 0.5,
    inflection: 1.5,
};

const buyParams: VolumeFractionParams = {
    floorFraction: 0.1,
    sensitivity: 0.5,
    inflection: 3.5,
};

describe('computeVolumeFractionDomain', () => {
    it('covers the widest inflection point with margin', () => {
        const domain = computeVolumeFractionDomain(sellParams, buyParams);
        expect(domain).toBeGreaterThanOrEqual(buyParams.inflection * 1.6);
        expect(domain).toBeGreaterThanOrEqual(sellParams.inflection * 1.6);
    });

    it('extends to include the current ratio', () => {
        const domain = computeVolumeFractionDomain(sellParams, sellParams, 7.5);
        expect(domain).toBeGreaterThanOrEqual(7.5 * 1.6);
    });

    it('has a sane floor', () => {
        expect(computeVolumeFractionDomain(sellParams, sellParams)).toBeGreaterThanOrEqual(2);
    });
});

describe('buildVolumeFractionPoints', () => {
    it('samples from 0 to the domain inclusive', () => {
        const domain = computeVolumeFractionDomain(sellParams, sellParams);
        const points = buildVolumeFractionPoints('sell', sellParams, sellParams, domain, 50);
        expect(points).toHaveLength(51);
        expect(points[0].ratio).toBe(0);
        expect(points[points.length - 1].ratio).toBeCloseTo(domain, 3);
    });

    it('produces a rising sell curve from floor toward full volume', () => {
        const domain = computeVolumeFractionDomain(sellParams, sellParams);
        const points = buildVolumeFractionPoints('sell', sellParams, sellParams, domain);
        for (let i = 1; i < points.length; i++) {
            expect(points[i].ghost).toBeGreaterThanOrEqual(points[i - 1].ghost - 1e-6);
        }
        expect(points[0].ghost).toBeCloseTo(sellParams.floorFraction, 1);
        expect(points[points.length - 1].ghost).toBeGreaterThan(0.8);
    });

    it('produces a falling buy curve from near full volume toward the floor', () => {
        const domain = computeVolumeFractionDomain(buyParams, buyParams);
        const points = buildVolumeFractionPoints('buy', buyParams, buyParams, domain);
        for (let i = 1; i < points.length; i++) {
            expect(points[i].ghost).toBeLessThanOrEqual(points[i - 1].ghost + 1e-6);
        }
        expect(points[0].ghost).toBeCloseTo(1, 2);
        expect(points[points.length - 1].ghost).toBeCloseTo(buyParams.floorFraction, 1);
    });
});

describe('volumeFractionAt', () => {
    it('anchors the buy curve near full volume at ratio 0 and declines', () => {
        expect(volumeFractionAt('buy', buyParams, 0)).toBeCloseTo(1, 2);
        expect(volumeFractionAt('buy', buyParams, 0.5)).toBeCloseTo(0.998, 3);
        expect(volumeFractionAt('buy', buyParams, 1)).toBeCloseTo(0.994, 3);
        expect(volumeFractionAt('buy', buyParams, 1)).toBeLessThan(1);
    });

    it('is smooth across ratio 1 for the buy curve', () => {
        for (const inflection of [0, 0.5, 1, 3.5, 7]) {
            const params = { ...buyParams, inflection };
            const justBelow = volumeFractionAt('buy', params, 0.9999);
            const justAbove = volumeFractionAt('buy', params, 1.0001);
            expect(Math.abs(justAbove - justBelow)).toBeLessThan(0.0001);
            expect(justAbove).toBeLessThanOrEqual(1);
            expect(justAbove).toBeGreaterThan(buyParams.floorFraction);
        }
    });

    it('sits on the ghost curve at the current ratio', () => {
        const currentRatio = 2.1;
        const ghostY = volumeFractionAt('sell', sellParams, currentRatio);
        const domain = computeVolumeFractionDomain(sellParams, sellParams, currentRatio);
        const points = buildVolumeFractionPoints('sell', sellParams, sellParams, domain);
        const nearest = points.reduce((best, p) =>
            Math.abs(p.ratio - currentRatio) < Math.abs(best.ratio - currentRatio) ? p : best,
        );
        expect(nearest.ghost).toBeCloseTo(ghostY, 1);
    });

    it('hits the midpoint at the inflection point', () => {
        const mid = (1 + sellParams.floorFraction) / 2;
        expect(volumeFractionAt('sell', sellParams, sellParams.inflection)).toBeCloseTo(mid, 3);
    });
});
