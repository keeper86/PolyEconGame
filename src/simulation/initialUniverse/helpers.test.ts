import { describe, expect, it } from 'vitest';
import { HR_BUFFER_CAPACITY_MULTIPLIER, TICKS_PER_MONTH } from '../constants';
import { humanResourcesOfficeFacilityType, PRODUCED_HR_QUANTITY } from '../planet/specialFacilities';
import { makeAgent, makeProductionFacility } from '../utils/testHelper';
import { makeAgentPlanetAssets, makeStorage, presizeAgentShellForFacilities } from './helpers';
import { updateAgentShellCompartments } from '../planet/automaticProductionScale/shellCompartments';
import { STORAGE_CAPACITY_MONTHS } from '../planet/automaticProductionScale/constants';
import { STORAGE_SHELL_CAPACITY } from '../planet/facility';
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
    it('raises the shell scale until the authored compartments fit the required footprint', () => {
        const storage = makeStorage({ planetId: 'p', id: 's' });
        const monthsTicks = STORAGE_CAPACITY_MONTHS * TICKS_PER_MONTH;
        const dominant = solidResource('dominant', 1);
        const minor = solidResource('minor', 1);
        const dominantQuantity = Math.round((2 * STORAGE_SHELL_CAPACITY.volume) / monthsTicks);
        const minorQuantity = Math.round((0.2 * STORAGE_SHELL_CAPACITY.volume) / monthsTicks);
        const assets = makeAgentPlanetAssets(
            [
                makeProductionFacility(undefined, {
                    id: 'f-dominant',
                    needs: [{ resource: dominant, quantity: dominantQuantity }],
                }),
                makeProductionFacility(undefined, {
                    id: 'f-minor',
                    needs: [{ resource: minor, quantity: minorQuantity }],
                }),
            ],
            storage,
            null,
        );
        const agent = makeAgent('a', 'p', 'A', { assets: { p: assets } });
        const gameState = { agents: new Map([[agent.id, agent]]) };

        const before = updateAgentShellCompartments(assets);
        expect(before.solid!.requiredScale).toBeGreaterThan(storage.shells.solid.maxScale);
        expect(storage.shells.solid.compartments.dominant).toBeGreaterThan(storage.shells.solid.compartments.minor);

        presizeAgentShellForFacilities(gameState);

        expect(storage.shells.solid.maxScale).toBeGreaterThanOrEqual(before.solid!.requiredScale);
        expect(updateAgentShellCompartments(assets).solid!.requiredScale).toBeLessThanOrEqual(
            storage.shells.solid.maxScale,
        );
    });
});
