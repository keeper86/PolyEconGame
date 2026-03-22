import { describe, it, expect } from 'vitest';
import { automaticPricing } from './automaticPricing';
import { makeAgent, makePlanet, makeProductionFacility, makeStorageFacility } from '../utils/testHelper';
import { agriculturalProductResourceType, ironOreResourceType, waterResourceType } from '../planet/resources';
import type { StorageFacility } from '../planet/storage';

const PLANET_ID = 'p';

function makePlanetWithPrice(prices: Record<string, number> = {}) {
    return makePlanet({ marketPrices: prices });
}

function makeStorageWith(
    contents: Record<string, { resource: StorageFacility['currentInStorage'][string]['resource']; quantity: number }>,
) {
    return makeStorageFacility({ planetId: PLANET_ID, currentInStorage: contents });
}

describe('automaticPricing — sell offer respects own input reserves', () => {
    it('does not offer for sale the portion of inventory reserved for own facility inputs', () => {
        // Food-processing plant produces Agricultural Product.
        // Beverage plant consumes Agricultural Product (quantity 200, scale 10).
        // Storage holds 5000 units of agri-product.
        // Reserved buffer = 200 * 10 * 30 = 60 000 → exceeds stock, so offerQuantity must be 0.

        const producer = makeProductionFacility({ none: 1 }, { id: 'proc', scale: 10 });
        producer.needs = [];
        producer.produces = [{ resource: agriculturalProductResourceType, quantity: 1000 }];

        const consumer = makeProductionFacility({ none: 1 }, { id: 'bev', scale: 10 });
        consumer.needs = [{ resource: agriculturalProductResourceType, quantity: 200 }];
        consumer.produces = [{ resource: ironOreResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [agriculturalProductResourceType.name]: 5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [producer, consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [agriculturalProductResourceType.name]: { resource: agriculturalProductResourceType, quantity: 5_000 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[agriculturalProductResourceType.name];
        // buffer = 200 * 10 * 30 = 60 000 > 5 000 available → nothing to sell
        expect(offer?.offerQuantity).toBe(0);
    });

    it('offers surplus above the reserved buffer', () => {
        // Same setup but storage holds 65 000 units → 5 000 above the 60 000 buffer.
        const producer = makeProductionFacility({ none: 1 }, { id: 'proc', scale: 10 });
        producer.needs = [];
        producer.produces = [{ resource: agriculturalProductResourceType, quantity: 1000 }];

        const consumer = makeProductionFacility({ none: 1 }, { id: 'bev', scale: 10 });
        consumer.needs = [{ resource: agriculturalProductResourceType, quantity: 200 }];
        consumer.produces = [{ resource: ironOreResourceType, quantity: 100 }];

        const planet = makePlanetWithPrice({ [agriculturalProductResourceType.name]: 5 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [producer, consumer];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [agriculturalProductResourceType.name]: { resource: agriculturalProductResourceType, quantity: 65_000 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[agriculturalProductResourceType.name];
        // 65 000 − 60 000 reserved = 5 000 sellable
        expect(offer?.offerQuantity).toBe(5_000);
    });

    it('still offers full inventory when no facility needs that resource as input', () => {
        const producer = makeProductionFacility({ none: 1 }, { id: 'proc', scale: 5 });
        producer.needs = [];
        producer.produces = [{ resource: waterResourceType, quantity: 1000 }];

        const planet = makePlanetWithPrice({ [waterResourceType.name]: 2 });

        const agent = makeAgent('co', PLANET_ID);
        agent.assets[PLANET_ID].productionFacilities = [producer];
        agent.assets[PLANET_ID].storageFacility = makeStorageWith({
            [waterResourceType.name]: { resource: waterResourceType, quantity: 3_000 },
        });

        automaticPricing(new Map([['co', agent]]), planet);

        const offer = agent.assets[PLANET_ID].market?.sell[waterResourceType.name];
        expect(offer?.offerQuantity).toBe(3_000);
    });
});
