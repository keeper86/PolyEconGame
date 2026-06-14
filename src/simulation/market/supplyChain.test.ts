import { describe, expect, it } from 'vitest';
import { automaticPricing } from './automaticPricing';
import { makeAgent, makePlanet, makeProductionFacility, makeStorageFacility } from '../utils/testHelper';
import {
    electronicsResourceType,
    ironOreResourceType,
    machineryResourceType,
    plasticResourceType,
    steelResourceType,
} from '../planet/resources';
import { INPUT_BUFFER_TARGET_TICKS } from '../constants';
import { machineryFactory } from '../planet/productionFacilities';

const PLANET_ID = 'p';

const IRON_ORE_PRICE = 1.0;
const STEEL_PRICE = 3.0;
const ELECTRONIC_COMPONENT_PRICE = 15.0;
const PLASTIC_PRICE = 2.0;

const IRON_SMELTER_IRON_ORE_QTY = 150;
const IRON_SMELTER_OUTPUT_QTY = 100;

function makeIronSmelterAgent(id: string) {
    const facility = makeProductionFacility({ none: 1 }, { id: `${id}-smelter`, scale: 1 });
    facility.needs = [{ resource: ironOreResourceType, quantity: IRON_SMELTER_IRON_ORE_QTY }];
    facility.produces = [{ resource: steelResourceType, quantity: IRON_SMELTER_OUTPUT_QTY }];

    const storage = makeStorageFacility({ planetId: PLANET_ID, id: `storage-${id}` });

    const agent = makeAgent(id, PLANET_ID);
    agent.assets[PLANET_ID].deposits = 1_000_000;
    agent.assets[PLANET_ID].productionFacilities = [facility];
    agent.assets[PLANET_ID].storageFacility = storage;
    return agent;
}

function makeMachineryAgent(id: string) {
    const facility = machineryFactory(PLANET_ID, `${id}-machinery`);
    const storage = makeStorageFacility({ planetId: PLANET_ID, id: `storage-${id}` });

    const agent = makeAgent(id, PLANET_ID);
    agent.assets[PLANET_ID].deposits = 1_000_000;
    agent.assets[PLANET_ID].productionFacilities = [facility];
    agent.assets[PLANET_ID].storageFacility = storage;
    return agent;
}

describe('supply chain — break-even ceiling does not collapse for unpriced outputs', () => {
    it('iron smelter bids for iron ore above its ask price when steel price is seeded', () => {
        const planet = makePlanet({
            marketPrices: {
                [ironOreResourceType.name]: IRON_ORE_PRICE,
                [steelResourceType.name]: STEEL_PRICE,
            },
        });

        const smelter = makeIronSmelterAgent('smelter');
        automaticPricing(new Map([['smelter', smelter]]), planet);

        const bid = smelter.assets[PLANET_ID].market?.buy[ironOreResourceType.name];
        expect(bid).toBeDefined();
        expect(bid!.bidStorageTarget).toBeGreaterThan(0);

        const expectedCeiling = (IRON_SMELTER_OUTPUT_QTY * STEEL_PRICE) / IRON_SMELTER_IRON_ORE_QTY;
        expect(bid!.bidPrice).toBeGreaterThanOrEqual(IRON_ORE_PRICE);
        expect(bid!.bidPrice).toBeLessThanOrEqual(expectedCeiling);
    });

    it('machinery factory bids for steel even when machinery has no market price yet', () => {
        const planet = makePlanet({
            marketPrices: {
                [steelResourceType.name]: STEEL_PRICE,
                [electronicsResourceType.name]: ELECTRONIC_COMPONENT_PRICE,
                [plasticResourceType.name]: PLASTIC_PRICE,
            },
        });

        const factory = makeMachineryAgent('machinery');
        automaticPricing(new Map([['machinery', factory]]), planet);

        const steelBid = factory.assets[PLANET_ID].market?.buy[steelResourceType.name];
        expect(steelBid).toBeDefined();
        expect(steelBid!.bidStorageTarget).toBeGreaterThan(0);

        expect(steelBid!.bidPrice).toBeGreaterThanOrEqual(STEEL_PRICE);
    });

    it('machinery factory steel bid price stays above steel market price at first tick', () => {
        const planet = makePlanet({
            marketPrices: {
                [steelResourceType.name]: STEEL_PRICE,
                [electronicsResourceType.name]: ELECTRONIC_COMPONENT_PRICE,
                [plasticResourceType.name]: PLASTIC_PRICE,
            },
        });

        const factory = makeMachineryAgent('machinery');
        automaticPricing(new Map([['machinery', factory]]), planet);

        const steelBid = factory.assets[PLANET_ID].market?.buy[steelResourceType.name];

        expect(steelBid!.bidPrice).toBe(STEEL_PRICE);
    });

    it('machinery factory bids a quantity proportional to the input buffer target', () => {
        const planet = makePlanet({
            marketPrices: {
                [steelResourceType.name]: STEEL_PRICE,
                [electronicsResourceType.name]: ELECTRONIC_COMPONENT_PRICE,
                [plasticResourceType.name]: PLASTIC_PRICE,
            },
        });

        const factory = makeMachineryAgent('machinery');
        const facility = factory.assets[PLANET_ID].productionFacilities[0]!;
        const steelNeed = facility.needs.find(n => n.resource.name === steelResourceType.name)!;
        const expectedStorageTarget = steelNeed.quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;

        automaticPricing(new Map([['machinery', factory]]), planet);

        const steelBid = factory.assets[PLANET_ID].market?.buy[steelResourceType.name];

        expect(steelBid!.bidStorageTarget).toBe(expectedStorageTarget);
    });

    it('two-tier chain: iron smelter produces steel that machinery factory bids for', () => {
        const planet = makePlanet({
            marketPrices: {
                [ironOreResourceType.name]: IRON_ORE_PRICE,
                [steelResourceType.name]: STEEL_PRICE,
                [electronicsResourceType.name]: ELECTRONIC_COMPONENT_PRICE,
                [plasticResourceType.name]: PLASTIC_PRICE,
            },
        });

        const smelter = makeIronSmelterAgent('smelter');
        const factory = makeMachineryAgent('machinery');
        automaticPricing(
            new Map([
                ['smelter', smelter],
                ['machinery', factory],
            ]),
            planet,
        );

        const ironOreBid = smelter.assets[PLANET_ID].market?.buy[ironOreResourceType.name];
        const steelBid = factory.assets[PLANET_ID].market?.buy[steelResourceType.name];

        expect(ironOreBid!.bidPrice).toBeGreaterThanOrEqual(IRON_ORE_PRICE);
        expect(steelBid!.bidPrice).toBeGreaterThanOrEqual(STEEL_PRICE);
    });
});