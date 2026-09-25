import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Planet } from '@/simulation/planet/planet';
import { createShip, shiptypes } from '@/simulation/ships/ships';
import { ShipStatusBadge } from './ShipStatusBadge';

function makeShip() {
    return createShip(shiptypes.solid.bulkCarrier1, 0, 'Hauler', { id: 'p1' } as unknown as Planet);
}

describe('ShipStatusBadge', () => {
    it('renders a readable label for the raw state type', () => {
        const ship = makeShip();
        render(<ShipStatusBadge ship={ship} />);

        expect(screen.getByText('Idle')).toBeInTheDocument();
        expect(screen.queryByText('idle')).not.toBeInTheDocument();
    });
});
