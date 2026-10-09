import { describe, expect, it } from 'vitest';

import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import { constructionServiceResourceType } from '../planet/services';
import { TRADABLE_RESOURCES } from '../planet/resourceCatalog';
import { makePlanet } from '../utils/testHelper';
import { generalPriceLevel } from './priceLevel';

describe('generalPriceLevel', () => {
    it('averages the tradable basket, including Construction', () => {
        const planet = makePlanet();
        const expected =
            TRADABLE_RESOURCES.reduce((sum, resource) => sum + initialMarketPrices[resource.name], 0) /
            TRADABLE_RESOURCES.length;
        expect(generalPriceLevel(planet)).toBeCloseTo(expected);
        expect(TRADABLE_RESOURCES.some((resource) => resource.name === constructionServiceResourceType.name)).toBe(
            true,
        );
    });

    it('scales linearly with a uniform price change', () => {
        const planet = makePlanet();
        const before = generalPriceLevel(planet);
        for (const resource of TRADABLE_RESOURCES) {
            planet.marketPrices[resource.name] *= 3;
        }
        expect(generalPriceLevel(planet)).toBeCloseTo(3 * before);
    });

    it('damps a single resource move to its 1/basket share', () => {
        const planet = makePlanet();
        const before = generalPriceLevel(planet);
        const constructionPrice = planet.marketPrices[constructionServiceResourceType.name];
        planet.marketPrices[constructionServiceResourceType.name] = constructionPrice * 10;

        const contribution = (9 * constructionPrice) / TRADABLE_RESOURCES.length;
        expect(generalPriceLevel(planet) - before).toBeCloseTo(contribution);
        expect(generalPriceLevel(planet) - before).toBeLessThan(before);
    });

    it('ignores non-positive prices', () => {
        const planet = makePlanet();
        planet.marketPrices[constructionServiceResourceType.name] = 0;
        const expected =
            TRADABLE_RESOURCES.filter((resource) => resource.name !== constructionServiceResourceType.name).reduce(
                (sum, resource) => sum + planet.marketPrices[resource.name],
                0,
            ) /
            (TRADABLE_RESOURCES.length - 1);
        expect(generalPriceLevel(planet)).toBeCloseTo(expected);
    });

    it('returns 0 when no tradable price is available', () => {
        const planet = makePlanet();
        for (const resource of TRADABLE_RESOURCES) {
            planet.marketPrices[resource.name] = 0;
        }
        expect(generalPriceLevel(planet)).toBe(0);
    });
});
