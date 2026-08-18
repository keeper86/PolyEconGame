import { describe, expect, it } from 'vitest';
import {
    getTickAngle,
    resolveTickLabels,
    resolveZones,
    type GaugeZone,
    type ResolvedSubArc,
    type TickLabelCandidate,
} from './gaugeTicks';

function candidate(value: number, priority: number): TickLabelCandidate {
    return { value, priority, renderContent: () => null };
}

function resolvedValues(candidates: TickLabelCandidate[], maxValue: number): number[] {
    return resolveTickLabels(candidates, maxValue).map(({ value }) => value);
}

describe('getTickAngle', () => {
    it('maps 0 to the arc start (-135deg)', () => {
        expect(getTickAngle(0, 100)).toBe(-135);
    });

    it('maps maxValue to the arc end (+135deg)', () => {
        expect(getTickAngle(100, 100)).toBe(135);
    });

    it('maps the midpoint to 0deg', () => {
        expect(getTickAngle(50, 100)).toBeCloseTo(0);
    });

    it('does not return NaN when maxValue is zero', () => {
        expect(getTickAngle(0, 0)).toBe(-135);
    });
});

describe('resolveTickLabels', () => {
    it('drops labels clustered near zero when demand is tiny', () => {
        const maxValue = 1000;
        const demand = 5;
        const candidates = [
            candidate(0, 2),
            candidate(demand, 1),
            candidate(demand * 2, 3),
            candidate(demand * 4, 4),
            candidate(maxValue, 0),
        ];

        expect(resolvedValues(candidates, maxValue)).toEqual([demand, maxValue]);
    });

    it('keeps all labels when they are spread out', () => {
        const maxValue = 1000;
        const demand = 200;
        const candidates = [
            candidate(0, 2),
            candidate(demand, 1),
            candidate(demand * 2, 3),
            candidate(demand * 4, 4),
            candidate(maxValue, 0),
        ];

        expect(resolvedValues(candidates, maxValue)).toEqual([0, 200, 400, 800, 1000]);
    });

    it('excludes labels beyond maxValue', () => {
        const maxValue = 1000;
        const demand = 300;
        const candidates = [
            candidate(0, 2),
            candidate(demand, 1),
            candidate(demand * 2, 3),
            candidate(demand * 4, 4),
            candidate(maxValue, 0),
        ];

        expect(resolvedValues(candidates, maxValue)).toEqual([0, 300, 600, 1000]);
    });

    it('drops the 4x label when it crowds maxValue', () => {
        const maxValue = 1000;
        const demand = 240;
        const candidates = [
            candidate(0, 2),
            candidate(demand, 1),
            candidate(demand * 2, 3),
            candidate(demand * 4, 4),
            candidate(maxValue, 0),
        ];

        expect(resolvedValues(candidates, maxValue)).toEqual([0, 240, 480, 1000]);
    });

    it('keeps only start and end when demand is zero', () => {
        const maxValue = 1000;
        const candidates = [candidate(0, 2), candidate(maxValue, 0)];

        expect(resolvedValues(candidates, maxValue)).toEqual([0, 1000]);
    });

    it('deduplicates labels sharing the same value', () => {
        const maxValue = 1000;
        const demand = 250;
        const candidates = [
            candidate(0, 2),
            candidate(demand, 1),
            candidate(demand * 2, 3),
            candidate(demand * 4, 4),
            candidate(maxValue, 0),
        ];

        expect(resolvedValues(candidates, maxValue)).toEqual([0, 250, 500, 1000]);
    });

    it('does not collapse when maxValue is zero', () => {
        const candidates = [candidate(0, 2), candidate(0, 0)];

        expect(resolvedValues(candidates, 0)).toEqual([0]);
    });
});

describe('resolveZones', () => {
    function bufferZones(demand: number, maxValue: number): GaugeZone[] {
        return [
            { from: 0, to: demand, color: 'red' },
            { from: demand, to: demand * 2, color: 'amber' },
            { from: demand * 2, to: demand * 4, color: 'green' },
            { from: demand * 4, to: maxValue, color: 'blue' },
        ];
    }

    function resolvedZones(demand: number, maxValue: number): ResolvedSubArc[] {
        return resolveZones(bufferZones(demand, maxValue), maxValue);
    }

    it('keeps all zones when they are wide enough', () => {
        expect(resolvedZones(200, 1000)).toEqual([
            { limit: 200, color: 'red' },
            { limit: 400, color: 'amber' },
            { limit: 800, color: 'green' },
            { limit: 1000, color: 'blue' },
        ]);
    });

    it('collapses to the rest zone when demand is tiny', () => {
        expect(resolvedZones(5, 1000)).toEqual([{ limit: 1000, color: 'blue' }]);
    });

    it('drops a thin zone and fills the tail with the rest zone', () => {
        expect(resolvedZones(985, 1000)).toEqual([
            { limit: 985, color: 'red' },
            { limit: 1000, color: 'blue' },
        ]);
    });

    it('colors everything red when demand exceeds maxValue', () => {
        expect(resolvedZones(2000, 1000)).toEqual([{ limit: 1000, color: 'red' }]);
    });

    it('returns an empty list when maxValue is zero', () => {
        expect(resolvedZones(0, 0)).toEqual([]);
    });
});
