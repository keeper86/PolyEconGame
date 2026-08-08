import { describe, expect, it } from 'vitest';
import { splitScale } from './proceduralWorld';

describe('splitScale', () => {
    it('distributes a large total proportionally with all positive shares', () => {
        const shares = splitScale(391951, 8, 'administrativeCenter');
        expect(shares).toHaveLength(8);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(391951);
        expect(shares.every((s) => s >= 1)).toBe(true);
    });

    it('gives each agent at least 1 share when count >= total', () => {
        const shares = splitScale(1, 4, 'maintenanceFacility');
        expect(shares).toHaveLength(4);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(4);
        expect(shares.every((s) => s >= 1)).toBe(true);
    });

    it('never lets rounding over-allocation drain the last share below zero', () => {
        const shares = splitScale(10, 3, 'cementPlant');
        expect(shares.reduce((a, b) => a + b, 0)).toBe(10);
        expect(shares.every((s) => s >= 0)).toBe(true);
    });

    it('distributes exactly one unit per agent when total equals the count', () => {
        const shares = splitScale(4, 4, 'paperMill');
        expect(shares.reduce((a, b) => a + b, 0)).toBe(4);
        expect(shares.every((s) => s >= 1)).toBe(true);
    });

    it('gives each agent 1 share for a non-positive total', () => {
        expect(splitScale(0, 4, 'coalMine')).toEqual([1, 1, 1, 1]);
        expect(splitScale(-5, 4, 'coalMine')).toEqual([1, 1, 1, 1]);
    });

    it('returns an empty array for a non-positive count', () => {
        expect(splitScale(100, 0, 'oilWell')).toEqual([]);
    });

    it('is deterministic for the same seed', () => {
        expect(splitScale(66919, 4, 'maintenanceFacility')).toEqual(splitScale(66919, 4, 'maintenanceFacility'));
    });
});
