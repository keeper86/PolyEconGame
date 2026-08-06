import { describe, expect, it } from 'vitest';
import { HR_BUFFER_CAPACITY_MULTIPLIER } from '../constants';
import { humanResourcesOfficeFacilityType, PRODUCED_QUANTITY } from '../planet/specialFacilities';
import { makeAgentPlanetAssets, makeStorage } from './helpers';

describe('makeAgentPlanetAssets hrBuffer initialization', () => {
    it('initializes hrBuffer to capacity when HR department is present', () => {
        const hrDepartment = humanResourcesOfficeFacilityType('p', 'hr');
        hrDepartment.maxScale = 2;
        const storage = makeStorage({ planetId: 'p', id: 's', name: 'S' });
        const assets = makeAgentPlanetAssets('p', [], storage, hrDepartment);

        expect(assets.hrBuffer).toBe(PRODUCED_QUANTITY * 2 * HR_BUFFER_CAPACITY_MULTIPLIER);
        expect(assets.hrProductivityMultiplier).toBe(1);
    });

    it('keeps hrBuffer at 0 when no HR department is present', () => {
        const storage = makeStorage({ planetId: 'p', id: 's', name: 'S' });
        const assets = makeAgentPlanetAssets('p', [], storage, null);

        expect(assets.hrBuffer).toBe(0);
        expect(assets.hrProductivityMultiplier).toBe(1);
    });
});
