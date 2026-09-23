import { describe, expect, it } from 'vitest';
import type { ResourceQuantity } from '@/simulation/planet/claims';
import { cargoProgressPercent } from './ShipCargoProgress';

const quantity = (q: number): ResourceQuantity =>
    ({ resource: { name: 'Steel' }, quantity: q }) as unknown as ResourceQuantity;

describe('cargoProgressPercent', () => {
    it('returns the loaded fraction as a percentage', () => {
        expect(cargoProgressPercent(quantity(100), quantity(25))).toBe(25);
    });

    it('returns 0 when no cargo is loaded', () => {
        expect(cargoProgressPercent(quantity(100), null)).toBe(0);
    });

    it('clamps to 100 when overfilled', () => {
        expect(cargoProgressPercent(quantity(100), quantity(150))).toBe(100);
    });

    it('returns 0 for a non-positive goal', () => {
        expect(cargoProgressPercent(quantity(0), quantity(10))).toBe(0);
    });
});
