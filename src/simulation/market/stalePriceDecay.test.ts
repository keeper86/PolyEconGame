import { describe, expect, it } from 'vitest';

import { PRICE_CEIL, PRICE_FLOOR, PRICE_NO_TRADE_CONVERGENCE_RATE, TICKS_PER_MONTH } from '../constants';
import type { Agent } from '../planet/planet';
import { coalResourceType } from '../planet/resources';
import { putIntoStorageFacility } from '../planet/facility';
import { agentMap, makeAgent, makePlanet, makeStorageFacility } from '../utils/testHelper';
import { marketTick } from './market';

const COAL = coalResourceType.name;

function makeSellerAgent(stock: number, askPrice: number, id = 'seller'): Agent {
    const agent = makeAgent(id);
    agent.assets.p.storageFacility = makeStorageFacility({
        planetId: 'p',
        id: 'storage-p',
        capacity: { volume: 1e9, mass: 1e9 },
    });
    putIntoStorageFacility(agent.assets.p.storageFacility, coalResourceType, stock);
    agent.assets.p.market = {
        sell: {
            [COAL]: {
                resource: coalResourceType,
                offerPrice: askPrice,
                offerRetainment: 0,
            },
        },
        buy: {},
    };
    return agent;
}

describe('stale price convergence — sellers but no buyers', () => {
    it('moves the market price toward the best ask when there are sellers but no buyers', () => {
        const planet = makePlanet();
        const initialPrice = 10;
        planet.marketPrices[COAL] = initialPrice;

        const askPrice = 6;
        const seller = makeSellerAgent(1000, askPrice);

        marketTick(agentMap(seller), planet);

        const expected = initialPrice + (askPrice - initialPrice) * PRICE_NO_TRADE_CONVERGENCE_RATE;
        expect(planet.marketPrices[COAL]).toBeCloseTo(expected, 6);
    });

    it('converges upward when best ask is above the current price', () => {
        const planet = makePlanet();
        const initialPrice = 5;
        planet.marketPrices[COAL] = initialPrice;

        const askPrice = 20;
        const seller = makeSellerAgent(1000, askPrice);

        marketTick(agentMap(seller), planet);

        const expected = initialPrice + (askPrice - initialPrice) * PRICE_NO_TRADE_CONVERGENCE_RATE;
        expect(planet.marketPrices[COAL]).toBeCloseTo(expected, 6);
    });

    it('converges to within a small fraction of the best ask after one month of no trades', () => {
        const planet = makePlanet();
        planet.marketPrices[COAL] = 100;

        const askPrice = 1;
        const seller = makeSellerAgent(1e9, askPrice);

        for (let t = 0; t < TICKS_PER_MONTH; t++) {
            marketTick(agentMap(seller), planet);
        }

        expect(planet.marketPrices[COAL]).toBeLessThan(50);
        expect(planet.marketPrices[COAL]).toBeGreaterThanOrEqual(PRICE_FLOOR);
    });

    it('does not mutate marketPrices when there are no sellers', () => {
        const planet = makePlanet();
        const initialPrice = 42;
        planet.marketPrices[COAL] = initialPrice;

        marketTick(new Map(), planet);

        expect(planet.marketPrices[COAL]).toBe(initialPrice);
    });

    it('respects PRICE_FLOOR when converging to a very low ask', () => {
        const planet = makePlanet();
        planet.marketPrices[COAL] = PRICE_FLOOR * 2;

        const seller = makeSellerAgent(1000, 0);
        marketTick(agentMap(seller), planet);

        expect(planet.marketPrices[COAL]).toBeGreaterThanOrEqual(PRICE_FLOOR);
    });

    it('respects PRICE_CEIL when converging to a very high ask', () => {
        const planet = makePlanet();
        planet.marketPrices[COAL] = PRICE_CEIL * 0.9;

        const seller = makeSellerAgent(1000, PRICE_CEIL * 10);
        marketTick(agentMap(seller), planet);

        expect(planet.marketPrices[COAL]).toBeLessThanOrEqual(PRICE_CEIL);
    });
});
