import { describe, expect, it } from 'vitest';
import { makeAgent, makeAgentPlanetAssets, makeGameState, makeProductionFacility } from '../utils/testHelper';
import type { ProductionFacility } from './facility';
import { backfillRecipes, recipeTemplatesByName } from './recipeBackfill';
import { coalResourceType } from './resources';

const coalTemplate = [...recipeTemplatesByName().values()].find((template) =>
    template.produces.some((output) => output.resource.name === coalResourceType.name),
)!;

const staleFacility = (overrides: Partial<ProductionFacility> = {}): ProductionFacility =>
    makeProductionFacility(
        { none: 1 },
        {
            name: coalTemplate.name,
            needs: [],
            produces: [{ resource: coalResourceType, quantity: 99 }],
            powerConsumptionPerTick: 7,
            scale: 3,
            maxScale: 12,
            maintenanceStatus: 0.5,
            ...overrides,
        },
    );

const stateWithFacilities = (facilities: ProductionFacility[]): ReturnType<typeof makeGameState> =>
    makeGameState(undefined, [
        makeAgent('agent-1', 'p', 'Agent 1', {
            assets: { p: makeAgentPlanetAssets('p', { productionFacilities: facilities }) },
        }),
    ]);

describe('backfillRecipes', () => {
    it('re-bases a stale recipe on the catalog template', () => {
        const facility = staleFacility();
        backfillRecipes(stateWithFacilities([facility]));

        expect(facility.needs).toEqual(coalTemplate.needs);
        expect(facility.produces).toEqual(coalTemplate.produces);
        expect(facility.workerRequirement).toEqual(coalTemplate.workerRequirement);
        expect(facility.powerConsumptionPerTick).toBe(coalTemplate.powerConsumptionPerTick);
    });

    it('leaves the facility instance state untouched', () => {
        const facility = staleFacility();
        const priorResults = facility.lastTickResults;
        backfillRecipes(stateWithFacilities([facility]));

        expect(facility.id).toBe('facility-1');
        expect(facility.planetId).toBe('p');
        expect(facility.scale).toBe(3);
        expect(facility.maxScale).toBe(12);
        expect(facility.maintenanceStatus).toBe(0.5);
        expect(facility.lastTickResults).toBe(priorResults);
    });

    it('copies the recipe instead of aliasing the catalog template', () => {
        const facility = staleFacility();
        backfillRecipes(stateWithFacilities([facility]));

        expect(facility.needs).not.toBe(coalTemplate.needs);
        expect(facility.produces).not.toBe(coalTemplate.produces);
        expect(facility.produces[0]).not.toBe(coalTemplate.produces[0]);
        expect(facility.workerRequirement).not.toBe(coalTemplate.workerRequirement);

        facility.produces[0].quantity = 1234;
        expect(coalTemplate.produces[0].quantity).not.toBe(1234);
    });

    it('reports facilities whose name has no catalog template', () => {
        const known = staleFacility();
        const retired = makeProductionFacility({ none: 1 }, { name: 'Retired Facility', needs: [] });
        const result = backfillRecipes(stateWithFacilities([known, retired]));

        expect(result.updated).toBe(1);
        expect(result.unknownNames).toEqual(['Retired Facility']);
        expect(retired.needs).toEqual([]);
        expect(retired.produces).toEqual([]);
    });

    it('is idempotent', () => {
        const facility = staleFacility();
        const state = stateWithFacilities([facility]);
        backfillRecipes(state);
        const afterFirst = structuredClone(facility);
        backfillRecipes(state);

        expect(facility).toEqual(afterFirst);
    });
});
