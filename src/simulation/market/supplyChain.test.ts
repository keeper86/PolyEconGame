import { describe, expect, it } from 'vitest';
import { automaticPricing } from './automaticPricing';
import { makeAgent, makePlanet, makeProductionFacility, makeStorageFacility } from '../utils/testHelper';
import {
    electronicComponentResourceType,
    ironOreResourceType,
    machineryResourceType,
    plasticResourceType,
    steelResourceType,
} from '../planet/resources';
import { INPUT_BUFFER_TARGET_TICKS } from '../constants';

const PLANET_ID = 'p';

const IRON_ORE_PRICE = 1.0;
const STEEL_PRICE = 3.0;
const ELECTRONIC_COMPONENT_PRICE = 15.0;
const PLASTIC_PRICE = 2.0;

/**
 * ironSmelter recipe: 150 iron ore + 30 coal → 100 steel
 * Break-even ceiling for iron ore = (100 × steelPrice) / 150
 */
const IRON_SMELTER_IRON_ORE_QTY = 150;
const IRON_SMELTER_OUTPUT_QTY = 100;

/**
 * machineryFactory recipe: 80 steel + 10 electronic components + 20 plastic → 50 machinery
 * Break-even ceiling for steel = (50 × machineryPrice) / 80
 */
const MACHINERY_FACTORY_STEEL_QTY = 80;
const MACHINERY_FACTORY_ELEC_QTY = 10;
const MACHINERY_FACTORY_PLASTIC_QTY = 20;
const MACHINERY_FACTORY_OUTPUT_QTY = 50;

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
    const facility = makeProductionFacility({ none: 1 }, { id: `${id}-machinery`, scale: 1 });
    facility.needs = [
        { resource: steelResourceType, quantity: MACHINERY_FACTORY_STEEL_QTY },
        { resource: electronicComponentResourceType, quantity: MACHINERY_FACTORY_ELEC_QTY },
        { resource: plasticResourceType, quantity: MACHINERY_FACTORY_PLASTIC_QTY },
    ];
    facility.produces = [{ resource: machineryResourceType, quantity: MACHINERY_FACTORY_OUTPUT_QTY }];

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
        expect(bid!.bidQuantity).toBeGreaterThan(0);

        // Break-even ceiling = (100 steel × 3.0) / 150 iron ore = 2.0
        // Bid price must not exceed ceiling (2.0) but must be ≥ market price (1.0)
        const expectedCeiling = (IRON_SMELTER_OUTPUT_QTY * STEEL_PRICE) / IRON_SMELTER_IRON_ORE_QTY;
        expect(bid!.bidPrice).toBeGreaterThanOrEqual(IRON_ORE_PRICE);
        expect(bid!.bidPrice).toBeLessThanOrEqual(expectedCeiling);
    });

    it('machinery factory bids for steel even when machinery has no market price yet', () => {
        const planet = makePlanet({
            marketPrices: {
                [steelResourceType.name]: STEEL_PRICE,
                [electronicComponentResourceType.name]: ELECTRONIC_COMPONENT_PRICE,
                [plasticResourceType.name]: PLASTIC_PRICE,
            },
        });

        const factory = makeMachineryAgent('machinery');
        automaticPricing(new Map([['machinery', factory]]), planet);

        const steelBid = factory.assets[PLANET_ID].market?.buy[steelResourceType.name];
        expect(steelBid).toBeDefined();
        expect(steelBid!.bidQuantity).toBeGreaterThan(0);

        // With no machinery price, fallback = total input cost per output unit:
        // (80 × 3.0 + 10 × 15.0 + 20 × 2.0) / 50 = (240 + 150 + 40) / 50 = 430 / 50 = 8.6
        // ceiling for steel = (50 × 8.6) / 80 = 5.375 > steelPrice 3.0 → bid must be ≥ 3.0
        expect(steelBid!.bidPrice).toBeGreaterThanOrEqual(STEEL_PRICE);
    });

    it('machinery factory steel bid price stays above steel market price at first tick', () => {
        const planet = makePlanet({
            marketPrices: {
                [steelResourceType.name]: STEEL_PRICE,
                [electronicComponentResourceType.name]: ELECTRONIC_COMPONENT_PRICE,
                [plasticResourceType.name]: PLASTIC_PRICE,
            },
        });

        const factory = makeMachineryAgent('machinery');
        automaticPricing(new Map([['machinery', factory]]), planet);

        const steelBid = factory.assets[PLANET_ID].market?.buy[steelResourceType.name];

        // Initial bid price is min(marketPrice, ceiling). Since ceiling > marketPrice,
        // the bid must equal the market price on the first tick.
        expect(steelBid!.bidPrice).toBe(STEEL_PRICE);
    });

    it('machinery factory bids a quantity proportional to the input buffer target', () => {
        const planet = makePlanet({
            marketPrices: {
                [steelResourceType.name]: STEEL_PRICE,
                [electronicComponentResourceType.name]: ELECTRONIC_COMPONENT_PRICE,
                [plasticResourceType.name]: PLASTIC_PRICE,
            },
        });

        const factory = makeMachineryAgent('machinery');
        automaticPricing(new Map([['machinery', factory]]), planet);

        const steelBid = factory.assets[PLANET_ID].market?.buy[steelResourceType.name];

        // Full buffer shortfall = MACHINERY_FACTORY_STEEL_QTY × scale(1) × INPUT_BUFFER_TARGET_TICKS
        const expectedShortfall = MACHINERY_FACTORY_STEEL_QTY * 1 * INPUT_BUFFER_TARGET_TICKS;
        expect(steelBid!.bidQuantity).toBe(expectedShortfall);
    });

    it('two-tier chain: iron smelter produces steel that machinery factory bids for', () => {
        const planet = makePlanet({
            marketPrices: {
                [ironOreResourceType.name]: IRON_ORE_PRICE,
                [steelResourceType.name]: STEEL_PRICE,
                [electronicComponentResourceType.name]: ELECTRONIC_COMPONENT_PRICE,
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
