import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Facility } from '@/simulation/planet/facility';
import type { ConstructionShipStatusLoading } from '@/simulation/ships/ships';
import { ShipPreFabricationRow } from './ShipPreFabricationRow';

const planetSummaries = [{ planetId: 'p2', name: 'Gune' }];

function makeBuildingTarget(progress: number, totalRequired: number): Facility {
    return {
        type: 'production',
        planetId: 'p1',
        id: 'f1',
        name: 'Steel Mill',
        maxScale: 1,
        scale: 1,
        construction: {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: totalRequired,
            maximumConstructionServiceConsumption: 10,
            progress,
            lastTickInvestedConstructionServices: 5,
            suspended: false,
        },
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        needs: [],
        produces: [],
    } as unknown as Facility;
}

function stateWith(target: Facility | null, progress: number): ConstructionShipStatusLoading {
    return { type: 'pre-fabrication', planetId: 'p1', to: 'p2', buildingTarget: target, progress };
}

describe('ShipPreFabricationRow', () => {
    it('shows build progress as the completed share of the construction service required', () => {
        render(
            <ShipPreFabricationRow
                state={stateWith(makeBuildingTarget(100, 400), 100)}
                planetSummaries={planetSummaries}
            />,
        );

        expect(screen.getByText('Gune')).toBeInTheDocument();
        expect(screen.getByText('Steel Mill')).toBeInTheDocument();
        expect(screen.getByText('25%')).toBeInTheDocument();
    });

    it('does not render a progress bar without a construction target', () => {
        render(<ShipPreFabricationRow state={stateWith(null, 0)} planetSummaries={planetSummaries} />);

        expect(screen.getByText('Repositioning')).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
});
