import { describe, expect, it } from 'vitest';
import { HR_BUFFER_CAPACITY_MULTIPLIER } from '../constants';
import { humanResourcesOfficeFacilityType, PRODUCED_HR_QUANTITY } from '../planet/specialFacilities';
import { makeAgent, makeProductionFacility } from '../utils/testHelper';
import { makeAgentPlanetAssets, makeStorage, presizeAgentShellForFacilities } from './helpers';
import { updateAgentShellCompartments } from '../planet/automaticProductionScale/shellCompartments';
import type { Resource } from '../planet/claims';

const solidResource = (name: string, volumePerQuantity: number): Resource =>
    ({
        name,
        form: 'solid',
        level: 'raw',
        volumePerQuantity,
        massPerQuantity: 0,
    }) as unknown as Resource;

describe('makeAgentPlanetAssets hrBuffer initialization', () => {
    it('initializes hrBuffer to capacity when HR department is present', () => {
        const hrDepartment = humanResourcesOfficeFacilityType('p', 'hr');
        hrDepartment.maxScale = 2;
        const storage = makeStorage({ planetId: 'p', id: 's' });
        const assets = makeAgentPlanetAssets([], storage, hrDepartment);

        expect(hrDepartment.hrBuffer).toBe(PRODUCED_HR_QUANTITY * 2 * HR_BUFFER_CAPACITY_MULTIPLIER);
        expect(assets.hrProductivityMultiplier).toBe(1);
    });

    it('keeps hrBuffer at 0 when no HR department is present', () => {
        const storage = makeStorage({ planetId: 'p', id: 's' });
        const assets = makeAgentPlanetAssets([], storage, null);

        expect(assets.humanResourcesDepartment).toBeNull();
        expect(assets.hrProductivityMultiplier).toBe(1);
    });
});

describe('presizeAgentShellForFacilities', () => {
    // A footprint that overflows one shell scale leaves the allocator in its infeasible water-fill branch,
    // which hands every growable cell an equal share instead of the share its own footprint needs.
    it('re-allocates compartments against the raised scale so a dominant resource keeps its share', () => {
        const storage = makeStorage({ planetId: 'p', id: 's' });
        const dominant = solidResource('dominant', 1);
        const minor = solidResource('minor', 1);
        const assets = makeAgentPlanetAssets(
            [
                makeProductionFacility(undefined, {
                    id: 'f-dominant',
                    needs: [{ resource: dominant, quantity: 1000 }],
                }),
                makeProductionFacility(undefined, {
                    id: 'f-minor',
                    needs: [{ resource: minor, quantity: 100 }],
                }),
            ],
            storage,
            null,
        );
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        const gameState = { agents: new Map([[agent.id, agent]]) };

        const before = updateAgentShellCompartments(assets);
        expect(before.solid!.feasible).toBe(false);
        expect(storage.shells.solid.compartments.dominant).toBeCloseTo(storage.shells.solid.compartments.minor);

        presizeAgentShellForFacilities(gameState);

        expect(storage.shells.solid.compartments.dominant).toBeGreaterThan(storage.shells.solid.compartments.minor);
        expect(updateAgentShellCompartments(assets).solid!.feasible).toBe(true);
    });
});
