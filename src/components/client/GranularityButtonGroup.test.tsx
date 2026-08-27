import { describe, expect, it } from 'vitest';
import { availableGranularity, type Granularity } from './GranularityButtonGroup';

const CASES: Array<[tick: number, stored: Granularity, expected: Granularity]> = [
    [0, 'monthly', 'monthly'],
    [0, 'yearly', 'monthly'],
    [0, 'decade', 'monthly'],
    [719, 'yearly', 'monthly'],
    [720, 'yearly', 'yearly'],
    [719, 'decade', 'monthly'],
    [3_599, 'decade', 'yearly'],
    [3_600, 'decade', 'decade'],
    [7_200, 'decade', 'decade'],
    [1_000, 'monthly', 'monthly'],
];

describe('availableGranularity', () => {
    it.each(CASES)('tick %i with stored %s resolves to %s', (tick, stored, expected) => {
        expect(availableGranularity(stored, tick)).toBe(expected);
    });
});
