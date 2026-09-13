import { describe, expect, it } from 'vitest';
import { PRICE_CEIL, PRICE_FLOOR } from '../constants';
import { makePlanet } from '../utils/testHelper';
import { coalResourceType, waterResourceType } from './resources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
} from './services';
import { updateProductionCostFloors } from './production';

const floorFor = (planet: ReturnType<typeof makePlanet>, name: string): number => planet.lastProductionCostFloors[name];

describe('updateProductionCostFloors', () => {
    it('includes auxiliary overhead on top of inputs and wages', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);

        // coalMine: 52 workers at wage 1, only a land-bound input priced at 0
        const inputAndWageCostPerUnit = 52 / 500;
        expect(floorFor(planet, coalResourceType.name)).toBeGreaterThan(inputAndWageCostPerUnit);
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
