import { describe, expect, it } from 'vitest';
import { raiseWagesMonotone } from './financialChartLogic';

describe('raiseWagesMonotone', () => {
    it('keeps already-monotone wages unchanged', () => {
        expect(raiseWagesMonotone([10, 20, 30, 40])).toEqual([10, 20, 30, 40]);
    });

    it('raises every higher edu to the max when wages descend', () => {
        expect(raiseWagesMonotone([100, 50, 30, 10])).toEqual([100, 100, 100, 100]);
    });

    it('raises only the violating higher edus for mixed input', () => {
        expect(raiseWagesMonotone([100, 8, 5])).toEqual([100, 100, 100]);
    });

    it('equals the running maximum of each prefix', () => {
        const input = [3, 1, 7, 2, 4];
        const result = raiseWagesMonotone(input);
        for (let i = 0; i < input.length; i++) {
            expect(result[i]).toBe(Math.max(...input.slice(0, i + 1)));
        }
    });

    it('never lowers a wage and keeps the lowest level untouched', () => {
        const input = [50, 10, 20, 5];
        const result = raiseWagesMonotone(input);
        expect(result[0]).toBe(input[0]);
        expect(result[result.length - 1]).toBe(Math.max(...input));
        for (let i = 0; i < input.length; i++) {
            expect(result[i]).toBeGreaterThanOrEqual(input[i]);
        }
    });

    it('produces a non-decreasing sequence for arbitrary input', () => {
        const cases = [
            [10, 8, 5],
            [1, 2, 3, 4, 5],
            [5, 4, 3, 2, 1],
            [1, 5, 2, 4, 3],
            [-1, -2, -3],
            [0, 0, 0, 0],
        ];
        for (const input of cases) {
            const result = raiseWagesMonotone(input);
            for (let i = 0; i < result.length - 1; i++) {
                expect(result[i]).toBeLessThanOrEqual(result[i + 1]);
            }
        }
    });

    it('handles empty and single-element arrays', () => {
        expect(raiseWagesMonotone([])).toEqual([]);
        expect(raiseWagesMonotone([42])).toEqual([42]);
    });

    it('does not mutate the input array', () => {
        const input = [50, 10, 20];
        raiseWagesMonotone(input);
        expect(input).toEqual([50, 10, 20]);
    });
});
