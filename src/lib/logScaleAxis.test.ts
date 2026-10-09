import { describe, expect, it } from 'vitest';
import { logAxisForRange, logDecadeTicks, trimmedLogAxis } from './logScaleAxis';

describe('logDecadeTicks', () => {
    it('emits one power of ten per decade between the bounds', () => {
        expect(logDecadeTicks(1, 1000)).toEqual([1, 10, 100, 1000]);
        expect(logDecadeTicks(100, 1000)).toEqual([100, 1000]);
    });

    it('snaps the bounds outward to whole decades', () => {
        expect(logDecadeTicks(2, 100)).toEqual([1, 10, 100]);
        expect(logDecadeTicks(5, 6000)).toEqual([1, 10, 100, 1000, 10000]);
    });
});

describe('logAxisForRange', () => {
    it('anchors the domain on the outermost ticks', () => {
        expect(logAxisForRange(2, 100)).toEqual({ ticks: [1, 10, 100], domain: [1, 100] });
        expect(logAxisForRange(12, 4000)).toEqual({ ticks: [10, 100, 1000, 10000], domain: [10, 10000] });
    });
});

describe('trimmedLogAxis', () => {
    it('ignores non-positive and non-finite values', () => {
        expect(trimmedLogAxis([0, -5, Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
    });

    it('returns null when there is nothing to spread', () => {
        expect(trimmedLogAxis([])).toBeNull();
        expect(trimmedLogAxis([42])).toBeNull();
        expect(trimmedLogAxis([5, 5, 5])).toBeNull();
    });

    it('returns null while the spread stays within one order of magnitude', () => {
        expect(trimmedLogAxis([1, 10])).toBeNull();
        expect(trimmedLogAxis([3, 30])).toBeNull();
        expect(trimmedLogAxis([1, 2, 3, 4, 10])).toBeNull();
    });

    it('returns decade ticks and domain once the spread exceeds one order of magnitude', () => {
        expect(trimmedLogAxis([1, 10, 100, 1000, 10000])).toEqual({
            ticks: [1, 10, 100, 1000, 10000],
            domain: [1, 10000],
        });
    });

    it('drops the two lowest and two highest magnitudes before deciding', () => {
        expect(trimmedLogAxis([0.01, 0.02, 1, 2, 3, 4, 5000, 9000])).toBeNull();
        expect(trimmedLogAxis([1, 2, 3, 4, 5, 6, 100, 200, 300, 400, 500, 600])).toEqual({
            ticks: [1, 10, 100, 1000],
            domain: [1, 1000],
        });
    });

    it('anchors the domain on the trimmed magnitudes, leaving a value beyond the outer decade off the axis', () => {
        expect(trimmedLogAxis([1, 1, 1, 1, 1, 1, 1, 1, 5, 20, 1000, 1_000_000])).toEqual({
            ticks: [1, 10, 100],
            domain: [1, 100],
        });
    });
});
