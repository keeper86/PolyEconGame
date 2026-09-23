import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Planet } from '@/simulation/planet/planet';
import { createShip, shiptypes } from '@/simulation/ships/ships';
import { ShipConditionRow } from './ShipConditionRow';

function makeShip() {
    return createShip(shiptypes.solid.bulkCarrier1, 0, 'Hauler', { id: 'p1' } as unknown as Planet);
}

describe('ShipConditionRow', () => {
    it('shows condition relative to max maintenance', () => {
        const ship = makeShip();
        ship.maintainanceStatus = 0.5;
        ship.maxMaintenance = 1;

        render(<ShipConditionRow ship={ship} />);

        expect(screen.getByText('Condition')).toBeInTheDocument();
        expect(screen.getByText('50% / 100% max')).toBeInTheDocument();
    });

    it('shows degraded max maintenance', () => {
        const ship = makeShip();
        ship.maintainanceStatus = 0.3;
        ship.maxMaintenance = 0.6;

        render(<ShipConditionRow ship={ship} />);

        expect(screen.getByText('30% / 60% max')).toBeInTheDocument();
    });
});
