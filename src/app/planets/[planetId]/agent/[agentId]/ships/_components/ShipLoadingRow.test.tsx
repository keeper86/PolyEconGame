import { screen } from '@testing-library/react';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { describe, expect, it } from 'vitest';
import { steelResourceType } from '@/simulation/planet/resources';
import { ShipLoadingRow } from './ShipLoadingRow';

const summaries = [{ planetId: 'p2', name: 'Gune' }];

describe('ShipLoadingRow', () => {
    it('shows the destination and a cargo progress bar while loading', () => {
        renderWithIntl(
            <ShipLoadingRow
                state={{
                    type: 'loading',
                    planetId: 'p1',
                    to: 'p2',
                    cargoGoal: { resource: steelResourceType, quantity: 1000 },
                    currentCargo: { resource: steelResourceType, quantity: 400 },
                }}
                planetSummaries={summaries}
            />,
        );

        expect(screen.getByText('Gune')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows repositioning when there is no cargo goal', () => {
        renderWithIntl(
            <ShipLoadingRow
                state={{ type: 'loading', planetId: 'p1', to: 'p2', cargoGoal: null, currentCargo: null }}
                planetSummaries={summaries}
            />,
        );

        expect(screen.getByText('Repositioning (empty)')).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
});
