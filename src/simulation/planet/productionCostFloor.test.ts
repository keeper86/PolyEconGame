import { describe, expect, it } from 'vitest';
import { PRICE_CEIL, PRICE_FLOOR, THEORETICAL_PRODUCTION_COST_FACTOR } from '../constants';
import { makePlanet } from '../utils/testHelper';
import { ALL_PRODUCTION_FACILITY_ENTRIES } from './productionFacilities';
import type { EducationLevelType } from '../population/education';
import { coalResourceType, waterResourceType } from './resources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
} from './services';
import { updateProductionCostFloors } from './production';

const floorFor = (planet: ReturnType<typeof makePlanet>, name: string): number => planet.lastProductionCostFloors[name];

const coalTemplate = Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)
    .map((entry) => entry.template)
    .find((template) => template.produces.some((output) => output.resource.name === coalResourceType.name));

const coalWageCostPerUnit = (planet: ReturnType<typeof makePlanet>): number => {
    if (!coalTemplate) {
        throw new Error('no template produces coal');
    }
    const wagePerTick = Object.entries(coalTemplate.workerRequirement).reduce(
        (sum, [edu, requirement]) => sum + (requirement ?? 0) * planet.wagePerEdu[edu as EducationLevelType],
        0,
    );
    const outputPerTick = coalTemplate.produces.find(
        (output) => output.resource.name === coalResourceType.name,
    )!.quantity;
    return wagePerTick / outputPerTick;
};

describe('updateProductionCostFloors', () => {
    it('includes auxiliary overhead on top of inputs and wages', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);

        expect(floorFor(planet, coalResourceType.name)).toBeGreaterThan(coalWageCostPerUnit(planet));
    });

    it('scales the theoretical production cost by the 1.3 factor', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);

        expect(floorFor(planet, coalResourceType.name)).toBeGreaterThanOrEqual(
            coalWageCostPerUnit(planet) * THEORETICAL_PRODUCTION_COST_FACTOR,
        );
    });

    it('passes storage department input costs into the floor of mass-heavy goods', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);
        const before = floorFor(planet, waterResourceType.name);

        planet.marketPrices[logisticsServiceResourceType.name] =
            (planet.marketPrices[logisticsServiceResourceType.name] ?? 0) * 2;
        updateProductionCostFloors(planet);

        expect(floorFor(planet, waterResourceType.name)).toBeGreaterThan(before);
    });

    it('passes HR department input costs into the floor of goods without service needs', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);
        const before = floorFor(planet, coalResourceType.name);

        planet.marketPrices[administrativeServiceResourceType.name] =
            (planet.marketPrices[administrativeServiceResourceType.name] ?? 0) * 2;
        updateProductionCostFloors(planet);

        expect(floorFor(planet, coalResourceType.name)).toBeGreaterThan(before);
    });

    it('passes maintenance and construction service costs into every floor', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);
        const before = floorFor(planet, coalResourceType.name);

        planet.marketPrices[maintenanceServiceResourceType.name] =
            (planet.marketPrices[maintenanceServiceResourceType.name] ?? 0) * 2;
        planet.marketPrices[constructionServiceResourceType.name] =
            (planet.marketPrices[constructionServiceResourceType.name] ?? 0) * 2;
        updateProductionCostFloors(planet);

        expect(floorFor(planet, coalResourceType.name)).toBeGreaterThan(before);
    });

    it('clamps all floors to the price bounds', () => {
        const planet = makePlanet();
        planet.marketPrices[administrativeServiceResourceType.name] = 1e9;
        planet.marketPrices[logisticsServiceResourceType.name] = 1e9;
        planet.marketPrices[maintenanceServiceResourceType.name] = 1e9;
        planet.marketPrices[constructionServiceResourceType.name] = 1e9;
        updateProductionCostFloors(planet);

        expect(Object.keys(planet.lastProductionCostFloors).length).toBeGreaterThan(0);
        for (const floor of Object.values(planet.lastProductionCostFloors)) {
            expect(floor).toBeLessThanOrEqual(PRICE_CEIL);
            expect(floor).toBeGreaterThanOrEqual(PRICE_FLOOR);
        }
    });
});
