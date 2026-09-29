import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { steelResourceType } from '@/simulation/planet/resources';
import { ShipTransportingRow } from './ShipTransportingRow';

const summaries = [{ planetId: 'p2', name: 'Gune' }];

describe('ShipTransportingRow', () => {
    it('shows cargo, destination and ETA', () => {
        renderWithIntl(
            <ShipTransportingRow
                state={{
                    type: 'transporting',
                    from: 'p1',
                    to: 'p2',
                    arrivalTick: 30,
                    cargo: { resource: steelResourceType, quantity: 1000 },
                }}
                planetSummaries={summaries}
                tick={25}
            />,
        );

        expect(screen.getByText('Gune')).toBeInTheDocument();
        expect(screen.getByText('5 days')).toBeInTheDocument();
    });

    it('shows empty and arriving when the trip is due', () => {
        renderWithIntl(
            <ShipTransportingRow
                state={{ type: 'transporting', from: 'p1', to: 'p2', arrivalTick: 30, cargo: null }}
                planetSummaries={summaries}
                tick={30}
            />,
        );

        expect(screen.getByText('Empty')).toBeInTheDocument();
        expect(screen.getByText('arriving')).toBeInTheDocument();
    });
});
