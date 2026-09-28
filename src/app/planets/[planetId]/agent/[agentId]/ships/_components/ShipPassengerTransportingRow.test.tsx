import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import type { PassengerManifest } from '@/simulation/ships/manifest';
import { ShipPassengerTransportingRow } from './ShipPassengerTransportingRow';

const summaries = [{ planetId: 'p2', name: 'Gune' }];

const manifest = { '30:worker:low': { total: 5 } } as unknown as PassengerManifest;

describe('ShipPassengerTransportingRow', () => {
    it('shows the passenger total, destination, ETA and manifest button', () => {
        renderWithIntl(
            <ShipPassengerTransportingRow
                state={{ type: 'passenger_transporting', from: 'p1', to: 'p2', arrivalTick: 40, manifest }}
                planetSummaries={summaries}
                tick={40}
            />,
        );

        expect(screen.getByText('Gune')).toBeInTheDocument();
        expect(screen.getByText('arriving')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View Manifest' })).toBeInTheDocument();
    });
});
