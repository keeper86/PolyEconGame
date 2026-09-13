import { describe, expect, it } from 'vitest';
import { PRICE_CEIL, PRICE_FLOOR } from '../constants';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import { makePlanet, makeProductionFacility } from '../utils/testHelper';
import {
    auxiliaryCostPerTick,
    auxiliaryCostRates,
    facilityInputCostPerTick,
    facilityWageCostPerTick,
    jointOutputCostShares,
} from './auxiliaryCosts';
import { chemicalResourceType, coalResourceType, fuelResourceType, waterResourceType } from './resources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
} from './services';
import { fuelRefinery } from './productionFacilities';
import { updateProductionCostFloors } from './production';

const floorFor = (planet: ReturnType<typeof makePlanet>, name: string): number => planet.lastProductionCostFloors[name];

const setFuelDemand = (planet: ReturnType<typeof makePlanet>, totalDemand: number): void => {
    planet.avgMarketResult[fuelResourceType.name] = {
        resourceName: fuelResourceType.name,
        clearingPrice: 1.5,
        totalVolume: totalDemand,
        totalDemand,
        totalSupply: totalDemand,
        unfilledDemand: 0,
        unsoldSupply: 0,
    };
};

const setFuelResiduals = (
    planet: ReturnType<typeof makePlanet>,
    unfilledDemand: number,
    unsoldSupply: number,
    totalDemand = 10,
): void => {
    planet.avgMarketResult[fuelResourceType.name] = {
        resourceName: fuelResourceType.name,
        clearingPrice: 1.5,
        totalVolume: 10,
        totalDemand,
        totalSupply: totalDemand,
        unfilledDemand,
        unsoldSupply,
    };
};

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
});

describe('updateProductionCostFloors — reference weights', () => {
    it('splits joint cost by reference price so the floor ratio equals the design price ratio', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);

        const fuelFloor = floorFor(planet, fuelResourceType.name);
        const chemicalFloor = floorFor(planet, chemicalResourceType.name);
        const refFuel = initialMarketPrices[fuelResourceType.name] ?? 0;
        const refChemical = initialMarketPrices[chemicalResourceType.name] ?? 0;
        expect(chemicalFloor / fuelFloor).toBeCloseTo(refChemical / refFuel, 8);
    });

    it('keeps the bundle identity: sum of floor times quantity equals the facility cost', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);

        const refinery = fuelRefinery('catalog', 'preview');
        const rates = auxiliaryCostRates(planet);
        const bundleCost =
            facilityInputCostPerTick(refinery, planet) +
            facilityWageCostPerTick(refinery, planet) +
            auxiliaryCostPerTick(refinery, rates);

        const sum = 80 * floorFor(planet, fuelResourceType.name) + 120 * floorFor(planet, chemicalResourceType.name);
        expect(sum).toBeCloseTo(bundleCost, 8);
    });

    it('is insensitive to the joint outputs own market prices (no unit root)', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);
        const before = floorFor(planet, fuelResourceType.name);

        planet.marketPrices[fuelResourceType.name] = 0.01;
        planet.marketPrices[chemicalResourceType.name] = 1e6;
        updateProductionCostFloors(planet);

        expect(floorFor(planet, fuelResourceType.name)).toBe(before);
        expect(floorFor(planet, chemicalResourceType.name)).toBeCloseTo(before * 4, 8);
    });

    it('is insensitive to supply residuals of the joint outputs', () => {
        const planet = makePlanet();
        setFuelDemand(planet, 100);
        updateProductionCostFloors(planet);
        const before = floorFor(planet, fuelResourceType.name);

        setFuelResiduals(planet, 100_000, 100_000, 100);
        updateProductionCostFloors(planet);

        expect(floorFor(planet, fuelResourceType.name)).toBe(before);
    });

    it('shifts joint cost toward the output with higher smoothed demand', () => {
        const planet = makePlanet();
        setFuelDemand(planet, 2000);
        updateProductionCostFloors(planet);

        const neutral = makePlanet();
        updateProductionCostFloors(neutral);
        expect(floorFor(planet, fuelResourceType.name)).toBeGreaterThan(floorFor(neutral, fuelResourceType.name));
        expect(floorFor(planet, chemicalResourceType.name)).toBeLessThan(floorFor(neutral, chemicalResourceType.name));
    });

    it('falls back to neutral reference weights when no market data exists yet', () => {
        const planet = makePlanet();
        updateProductionCostFloors(planet);
        const fuelFloor = floorFor(planet, fuelResourceType.name);
        const chemicalFloor = floorFor(planet, chemicalResourceType.name);
        expect(chemicalFloor / fuelFloor).toBeCloseTo(4, 8);
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

describe('jointOutputCostShares', () => {
    const refinery = fuelRefinery('catalog', 'preview');
    const outputAccum = new Map([
        [fuelResourceType.name, 80],
        [chemicalResourceType.name, 120],
    ]);

    it('allocates the whole bundle (shares sum to one)', () => {
        const planet = makePlanet();
        const shares = jointOutputCostShares(refinery, planet, outputAccum, 1);
        const total = [...shares.values()].reduce((sum, share) => sum + share, 0);
        expect(total).toBeCloseTo(1, 10);
    });

    it('shifts cost from a glutted output to its scarce siblings (cross-subsidy direction)', () => {
        const planet = makePlanet();
        setFuelDemand(planet, 20);
        setFuelDemand(planet, 20);
        const shares = jointOutputCostShares(refinery, planet, outputAccum, 1);

        const neutral = jointOutputCostShares(refinery, makePlanet(), outputAccum, 1);
        expect(shares.get(fuelResourceType.name) ?? 0).toBeLessThan(neutral.get(fuelResourceType.name) ?? 0);
        expect(shares.get(chemicalResourceType.name) ?? 0).toBeGreaterThan(neutral.get(chemicalResourceType.name) ?? 0);
    });

    it('does not read the outputs own market prices at any exponent', () => {
        const planet = makePlanet();
        setFuelDemand(planet, 100);
        const before = jointOutputCostShares(refinery, planet, outputAccum, 1);

        planet.marketPrices[fuelResourceType.name] = 1e6;
        planet.marketPrices[chemicalResourceType.name] = 0.01;
        const after = jointOutputCostShares(refinery, planet, outputAccum, 1);

        expect(after.get(fuelResourceType.name)).toBe(before.get(fuelResourceType.name));
        expect(after.get(chemicalResourceType.name)).toBe(before.get(chemicalResourceType.name));
    });

    it('does not read supply residuals (unfilled demand or unsold supply)', () => {
        const planet = makePlanet();
        setFuelDemand(planet, 100);
        const before = jointOutputCostShares(refinery, planet, outputAccum, 1);

        setFuelResiduals(planet, 1_000_000, 1_000_000, 100);
        const after = jointOutputCostShares(refinery, planet, outputAccum, 1);

        expect(after.get(fuelResourceType.name)).toBe(before.get(fuelResourceType.name));
    });

    it('falls back to quantity share when no reference price exists', () => {
        const planet = makePlanet();
        const custom = makeProductionFacility(
            {},
            {
                produces: [
                    {
                        resource: {
                            name: 'Unpriced A',
                            form: 'solid',
                            level: 'raw',
                            volumePerQuantity: 1,
                            massPerQuantity: 1,
                        },
                        quantity: 30,
                    },
                    {
                        resource: {
                            name: 'Unpriced B',
                            form: 'solid',
                            level: 'raw',
                            volumePerQuantity: 1,
                            massPerQuantity: 1,
                        },
                        quantity: 10,
                    },
                ],
            },
        );
        const shares = jointOutputCostShares(custom, planet, new Map(), 1);
        expect(shares.get('Unpriced A')).toBeCloseTo(0.75, 10);
        expect(shares.get('Unpriced B')).toBeCloseTo(0.25, 10);
    });

    it('clamps extreme demand ratios', () => {
        const planet = makePlanet();
        setFuelDemand(planet, 1e-9);
        setFuelDemand(planet, 1e-9);
        const shares = jointOutputCostShares(refinery, planet, outputAccum, 1);
        expect(shares.get(fuelResourceType.name) ?? 0).toBeGreaterThan(0);
        expect(shares.get(chemicalResourceType.name) ?? 0).toBeLessThan(1);
    });
});
