import { describe, expect, it } from 'vitest';
import { clampArea } from './marketHelpers';

describe('clampArea', () => {
    const domain: [number, number] = [100, 500];

    it('returns undefined when area is undefined', () => {
        expect(clampArea(undefined, domain)).toBeUndefined();
    });

    it('returns undefined when domain is undefined', () => {
        expect(clampArea({ x1: 0, x2: 200, y: 1.5 }, undefined)).toBeUndefined();
    });

    it('passes through area fully inside domain', () => {
        const area = { x1: 200, x2: 300, y: 1.5 };
        const result = clampArea(area, domain);
        expect(result).toEqual({ x1: 200, x2: 300, y: 1.5, clipped: false });
    });

    it('clamps area partially overlapping left edge', () => {
        const area = { x1: 50, x2: 200, y: 1.5 };
        const result = clampArea(area, domain);
        expect(result).toEqual({ x1: 100, x2: 200, y: 1.5, clipped: true });
    });

    it('clamps area partially overlapping right edge', () => {
        const area = { x1: 400, x2: 600, y: 1.5 };
        const result = clampArea(area, domain);
        expect(result).toEqual({ x1: 400, x2: 500, y: 1.5, clipped: true });
    });

    it('returns indicator band when area is fully left of domain', () => {
        const area = { x1: 0, x2: 80, y: 2.0 };
        const result = clampArea(area, domain);
        // indicator band at left boundary: [100, 100 + (400 * 0.005)] = [100, 102]
        expect(result).toEqual({ x1: 100, x2: 102, y: 2.0, clipped: true });
    });

    it('returns indicator band when area is fully right of domain', () => {
        const area = { x1: 550, x2: 600, y: 0.5 };
        const result = clampArea(area, domain);
        // indicator band at right boundary: [500 - 2, 500] = [498, 500]
        expect(result).toEqual({ x1: 498, x2: 500, y: 0.5, clipped: true });
    });

    it('expands area narrower than minWidth', () => {
        const area = { x1: 200, x2: 201.5, y: 1.0 };
        const result = clampArea(area, domain);
        // minWidth = 400 * 0.0025 = 1, area width = 1.5 >= 1, unchanged
        // area width 1.5 passes minWidth threshold, so no expansion
        expect(result!.clipped).toBe(false);
    });

    it('expands zero-width area to minWidth', () => {
        const area = { x1: 200, x2: 200, y: 1.0 };
        const result = clampArea(area, domain);
        // minWidth = 1, half = 0.5 → area becomes [199.5, 200.5]
        expect(result).toEqual({ x1: 199.5, x2: 200.5, y: 1.0, clipped: false });
    });

    it('applies custom minWidth and indicatorWidth', () => {
        const area = { x1: 10, x2: 40, y: 1.0 };
        const result = clampArea(area, domain, 2, 4);
        // Fully outside left, indicator at [100, 104]
        expect(result).toEqual({ x1: 100, x2: 104, y: 1.0, clipped: true });
    });
});
