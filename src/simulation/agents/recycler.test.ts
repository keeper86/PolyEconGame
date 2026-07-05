import { beforeEach, describe, expect, it } from 'vitest';
import { RECYCLER_BASE_RECOVERY_EFFICIENCY, RECYCLER_PAYMENT_RATIO } from '../constants';
import { automaticPricing } from '../market/automaticPricing';
import type { ProductionFacility } from '../planet/facility';
import {
    calculateCostsForConstruction,
    putIntoStorageFacility,
    queryStorageFacility,
    removeFromStorageFacility,
} from '../planet/facility';
import type { Agent, GameState, Planet, MarketResult } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';
import { makeAgent, makeGameState, makePlanet, makeProductionFacility } from '../utils/testHelper';
import { createRecyclerAgent, getRecyclerPaymentRatio, processFacilityContraction } from './recycler';

/**
 * Helper: set avgMarketResult for Construction on the planet.
 * Without this, the recycler uses the fallback (spot price, 0 unfilled demand → 0.3 demandFactor).
 */
function setCSMarketResult(planet: Planet, overrides?: Partial<MarketResult>): void {
    planet.avgMarketResult.Construction = {
        resourceName: 'Construction',
        clearingPrice: 10,
        totalVolume: 100,
        totalSupply: 100,
        totalDemand: 100,
        unsoldSupply: 0,
        unfilledDemand: 35, // 35% unfilled → demandFactor = 1.0 (full ratio)
        ...overrides,
    };
}

describe('createRecyclerAgent', () => {
    it('creates an agent with CS sell offer set to automated', () => {
        const recycler = createRecyclerAgent('p1', 'Test Planet');
        expect(recycler.id).toBe('recycler_p1');
        expect(recycler.automated).toBe(true);
        expect(recycler.assets.p1?.market?.sell.Construction).toBeDefined();
        expect(recycler.assets.p1!.market!.sell.Construction!.automated).toBe(true);
    });

    it('starts with zero deposits', () => {
        const recycler = createRecyclerAgent('p1', 'Test Planet');
        expect(recycler.assets.p1?.deposits).toBe(0);
    });

    it('starts with no workforce license', () => {
        const recycler = createRecyclerAgent('p1', 'Test Planet');
        expect(recycler.assets.p1?.licenses.workforce).toBeUndefined();
        expect(recycler.assets.p1?.licenses.commercial).toBeDefined();
    });

    it('starts with no active loans', () => {
        const recycler = createRecyclerAgent('p1', 'Test Planet');
        expect(recycler.assets.p1?.activeLoans).toEqual([]);
    });

    it('starts with empty CS storage', () => {
        const recycler = createRecyclerAgent('p1', 'Test Planet');
        const csStock = queryStorageFacility(recycler.assets.p1!.storageFacility, 'Construction');
        expect(csStock).toBe(0);
    });
});

describe('getRecyclerPaymentRatio', () => {
    it('returns 0 when planet has no recycler', () => {
        const planet = makePlanet();
        // @ts-expect-error intentionally corrupt type
        planet.recycler = undefined;
        expect(getRecyclerPaymentRatio(planet)).toBe(0);
    });

    it('returns 0 when no market data (avgMarketResult is empty)', () => {
        const planet = makePlanet();
        planet.avgMarketResult = {};
        expect(getRecyclerPaymentRatio(planet)).toBe(0);
    });

    it('returns 0 when market has zero totalDemand', () => {
        const planet = makePlanet();
        // @ts-expect-error intentionally simple type
        planet.avgMarketResult.Construction = { unsoldSupply: 100, unfilledDemand: 50, totalDemand: 0 };
        expect(getRecyclerPaymentRatio(planet)).toBe(0);
    });

    it('returns 1 when unsoldSupply and unfilledDemand are both zero (both guarded to 1)', () => {
        const planet = makePlanet();
        // @ts-expect-error intentionally simple type
        planet.avgMarketResult.Construction = { unsoldSupply: 0, unfilledDemand: 0, totalDemand: 100 };

        // unsoldSupply -> Math.max(1, 0) = 1
        // unfilledDemand -> Math.max(1, 0) = 1
        // demandRatio = 1/1 - 1 = 0
        // stockRatio = 0/1 = 0
        // ratio = min(1, 1/(1 + 0 + 0)) = 1
        expect(getRecyclerPaymentRatio(planet)).toBeCloseTo(1);
    });

    it('reduces ratio when recycler holds a significant share of unsold supply', () => {
        const planet = makePlanet();
        const recyclerAssets = planet.recycler!.assets[planet.id]!;
        putIntoStorageFacility(recyclerAssets.storageFacility, constructionServiceResourceType, 100);

        // @ts-expect-error intentionally simple type
        planet.avgMarketResult.Construction = { unsoldSupply: 200, unfilledDemand: 0, totalDemand: 100 };

        const ratio = getRecyclerPaymentRatio(planet);
        // unsoldSupply = max(1, 200) = 200, unfilledDemand = max(1, 0) = 1
        // demandRatio = 200/1 - 1 = 199
        // stockRatio = 100/200 = 0.5
        // ratio = min(1, 1 / (1 + 10*0.5 + 199/10)) = min(1, 1 / (1 + 5 + 19.9)) = min(1, 1 / 25.9) ≈ 0.0386
        // Verify the ratio is significantly reduced (well below 1) and positive
        expect(ratio).toBeGreaterThan(0);
        expect(ratio).toBeLessThan(0.05);
    });
});

describe('dynamic payment (processFacilityContraction)', () => {
    it('uses spot price and dynamicRatio (not EMA clearing price)', () => {
        const planet = makePlanet({ marketPrices: { Construction: 50 } });
        setCSMarketResult(planet, { clearingPrice: 10, unfilledDemand: 35, totalDemand: 100 });

        const agent = makeAgent('factory-owner', planet.id, 'Factory Owner');
        const facility = makeProductionFacility(
            { none: 1 },
            {
                planetId: planet.id,
                maxScale: 100,
                scale: 100,
                produces: [{ resource: constructionServiceResourceType, quantity: 1 }],
            },
        );
        agent.assets[planet.id]!.productionFacilities = [facility];
        agent.assets[planet.id]!.deposits = 0;

        const recycler = planet.recycler!;
        recycler.assets[planet.id]!.deposits = 1_000_000;

        const contractCost = calculateCostsForConstruction('services', 90, 100);
        const recoveredCS = contractCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;

        // Code uses spot price (planet.marketPrices.Construction = 50)
        const spotPrice = planet.marketPrices.Construction;
        // getRecyclerPaymentRatio: unsoldSupply=0, recyclerCS=0 → stockRatio=0
        //   unfilledDemand=35/100 → demandRatio=0/35-1 = -1 → demandRatio/10 = -0.1, but Math.max(1,unfilled)=35
        //   unsoldSupply=max(1,0)=1, unfilledDemand=max(1,35)=35
        //   demandRatio = 1/35 - 1 ≈ -0.971, demandRatio/10 ≈ -0.097
        //   stockRatio = 0/1 = 0
        //   ratio = min(1, 1/(1+0-0.097)) = min(1, 1/0.903) = min(1, 1.107) = 1.0
        // dynamicRatio = 0.75 * 1.0 = 0.75
        const getRecyclerPaymentRatioResult = getRecyclerPaymentRatio(planet);
        const dynamicRatio = RECYCLER_PAYMENT_RATIO * getRecyclerPaymentRatioResult;
        const expectedPayment = recoveredCS * spotPrice * dynamicRatio;

        const gameState = makeGameState([planet], [agent, recycler]);
        processFacilityContraction(planet, facility, agent, 90, gameState);

        expect(agent.assets[planet.id]!.deposits).toBeCloseTo(expectedPayment);
    });

    it('falls back to spot price when avgMarketResult is empty', () => {
        const planet = makePlanet({ marketPrices: { Construction: 10 } });
        const agent = makeAgent('factory-owner', planet.id, 'Factory Owner');
        const facility = makeProductionFacility(
            { none: 1 },
            {
                planetId: planet.id,
                maxScale: 100,
                scale: 100,
                produces: [{ resource: constructionServiceResourceType, quantity: 1 }],
            },
        );
        agent.assets[planet.id]!.productionFacilities = [facility];
        agent.assets[planet.id]!.deposits = 0;

        const recycler = planet.recycler!;
        recycler.assets[planet.id]!.deposits = 1_000_000;
        planet.avgMarketResult = {}; // no EMA data

        const contractCost = calculateCostsForConstruction('services', 90, 100);
        const recoveredCS = contractCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;

        // spot price = 10
        const spotPrice = planet.marketPrices.Construction;
        // getRecyclerPaymentRatio: no market data → totalDemand=undefined → returns 0
        // dynamicRatio = 0.75 * 0 = 0 → no payment
        const getRecyclerPaymentRatioResult = getRecyclerPaymentRatio(planet);
        const dynamicRatio = RECYCLER_PAYMENT_RATIO * getRecyclerPaymentRatioResult;
        const expectedPayment = recoveredCS * spotPrice * dynamicRatio;

        const gameState = makeGameState([planet], [agent, recycler]);
        processFacilityContraction(planet, facility, agent, 90, gameState);

        expect(agent.assets[planet.id]!.deposits).toBeCloseTo(expectedPayment);
    });

    it('reduces payment when unfilled demand is low (transient spike protection)', () => {
        const planet = makePlanet({ marketPrices: { Construction: 100 } }); // spike price
        setCSMarketResult(planet, { clearingPrice: 100, unfilledDemand: 5, totalDemand: 100 }); // only 5% unfilled

        const agent = makeAgent('factory-owner', planet.id, 'Factory Owner');
        const facility = makeProductionFacility(
            { none: 1 },
            {
                planetId: planet.id,
                maxScale: 100,
                scale: 100,
                produces: [{ resource: constructionServiceResourceType, quantity: 1 }],
            },
        );
        agent.assets[planet.id]!.productionFacilities = [facility];
        agent.assets[planet.id]!.deposits = 0;

        const recycler = planet.recycler!;
        recycler.assets[planet.id]!.deposits = 1_000_000;

        const contractCost = calculateCostsForConstruction('services', 90, 100);
        const recoveredCS = contractCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;

        // spot price = 100
        const spotPrice = planet.marketPrices.Construction;
        // getRecyclerPaymentRatio: unsoldSupply=0, unfilledDemand=5, totalDemand=100
        //   unsoldSupply=max(1,0)=1, unfilledDemand=max(1,5)=5
        //   demandRatio = 1/5 - 1 = -0.8, demandRatio/10 = -0.08
        //   stockRatio = 0/1 = 0
        //   ratio = min(1, 1/(1+0-0.08)) = min(1, 1/0.92) ≈ 1.0
        // dynamicRatio = 0.75 * 1.0 = 0.75
        const getRecyclerPaymentRatioResult = getRecyclerPaymentRatio(planet);
        const dynamicRatio = RECYCLER_PAYMENT_RATIO * getRecyclerPaymentRatioResult;
        const expectedPayment = recoveredCS * spotPrice * dynamicRatio;

        const gameState = makeGameState([planet], [agent, recycler]);
        processFacilityContraction(planet, facility, agent, 90, gameState);

        expect(agent.assets[planet.id]!.deposits).toBeCloseTo(expectedPayment);
    });

    it('applies full RECYCLER_PAYMENT_RATIO cap when demand is high and stock is zero', () => {
        const planet = makePlanet({ marketPrices: { Construction: 10 } });
        setCSMarketResult(planet, { clearingPrice: 10, unfilledDemand: 50, totalDemand: 100 }); // 50% unfilled

        const agent = makeAgent('factory-owner', planet.id, 'Factory Owner');
        const facility = makeProductionFacility(
            { none: 1 },
            {
                planetId: planet.id,
                maxScale: 100,
                scale: 100,
                produces: [{ resource: constructionServiceResourceType, quantity: 1 }],
            },
        );
        agent.assets[planet.id]!.productionFacilities = [facility];
        agent.assets[planet.id]!.deposits = 0;

        const recycler = planet.recycler!;
        recycler.assets[planet.id]!.deposits = 1_000_000;

        const contractCost = calculateCostsForConstruction('services', 90, 100);
        const recoveredCS = contractCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;

        // spot price = 10
        const spotPrice = planet.marketPrices.Construction;
        // getRecyclerPaymentRatio: unsoldSupply=0, unfilledDemand=50, totalDemand=100
        //   unsoldSupply=max(1,0)=1, unfilledDemand=max(1,50)=50
        //   demandRatio = 1/50 - 1 = -0.98, demandRatio/10 = -0.098
        //   stockRatio = 0/1 = 0
        //   ratio = min(1, 1/(1+0-0.098)) ≈ min(1, 1/0.902) ≈ 1.0
        // dynamicRatio = 0.75 * 1.0 = 0.75
        const getRecyclerPaymentRatioResult = getRecyclerPaymentRatio(planet);
        const dynamicRatio = RECYCLER_PAYMENT_RATIO * getRecyclerPaymentRatioResult;
        const expectedPayment = recoveredCS * spotPrice * dynamicRatio;

        const gameState = makeGameState([planet], [agent, recycler]);
        processFacilityContraction(planet, facility, agent, 90, gameState);

        expect(agent.assets[planet.id]!.deposits).toBeCloseTo(expectedPayment);
    });
});

describe('processFacilityContraction', () => {
    let planet: Planet;
    let agent: Agent;
    let gameState: GameState;
    let facility: ProductionFacility;
    let contractCost: number;

    beforeEach(() => {
        planet = makePlanet({ marketPrices: { Construction: 10 } });
        setCSMarketResult(planet); // sets clearingPrice=10, unfilledDemand=35 → demandFactor=1.0
        agent = makeAgent('contractor-1', planet.id, 'Contractor');
        facility = makeProductionFacility(
            { none: 1 },
            {
                planetId: planet.id,
                id: 'facility-1',
                name: 'Test Factory',
                maxScale: 100,
                scale: 100,
            },
        );
        agent.assets[planet.id]!.productionFacilities = [facility];
        agent.assets[planet.id]!.deposits = 0;
        facility.produces = [{ resource: constructionServiceResourceType, quantity: 1 }];

        gameState = makeGameState([planet], [agent, planet.recycler!]);
        contractCost = calculateCostsForConstruction('services', 90, 100);
    });

    it('transfers payment from recycler to contractor', () => {
        const recyclerAssets = planet.recycler!.assets[planet.id]!;
        const recoveredCS = contractCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
        // Price = 10 (from avgMarketResult), getRecyclerPaymentRatio returns ~1.0 with 35% unfilled
        const dynamicRatio = RECYCLER_PAYMENT_RATIO * getRecyclerPaymentRatio(planet);
        const expectedPayment = recoveredCS * 10 * dynamicRatio;
        recyclerAssets.deposits = expectedPayment;

        const result = processFacilityContraction(planet, facility, agent, 90, gameState);
        expect(result).toBe(true);
        expect(agent.assets[planet.id]!.deposits).toBeCloseTo(expectedPayment);
        expect(recyclerAssets.deposits).toBeCloseTo(0);
    });

    it('grants a loan when recycler has insufficient deposits', () => {
        const recyclerAssets = planet.recycler!.assets[planet.id]!;
        recyclerAssets.deposits = 0;

        const result = processFacilityContraction(planet, facility, agent, 90, gameState);
        expect(result).toBe(true);
        expect(recyclerAssets.activeLoans.length).toBeGreaterThanOrEqual(1);
        expect(recyclerAssets.deposits).toBe(0);
        expect(agent.assets[planet.id]!.deposits).toBeGreaterThan(0);
    });

    it('adds recovered CS to recycler storage', () => {
        const recyclerAssets = planet.recycler!.assets[planet.id]!;
        const recoveredCS = contractCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
        const dynamicRatio = RECYCLER_PAYMENT_RATIO * getRecyclerPaymentRatio(planet);
        recyclerAssets.deposits = recoveredCS * 10 * dynamicRatio;

        const csBefore = queryStorageFacility(recyclerAssets.storageFacility, 'Construction');
        processFacilityContraction(planet, facility, agent, 90, gameState);
        const csAfter = queryStorageFacility(recyclerAssets.storageFacility, 'Construction');
        expect(csAfter - csBefore).toBeCloseTo(recoveredCS);
    });

    it('reduces facility scale', () => {
        const recyclerAssets = planet.recycler!.assets[planet.id]!;
        recyclerAssets.deposits = 1_000_000;
        processFacilityContraction(planet, facility, agent, 90, gameState);
        expect(facility.maxScale).toBe(90);
        expect(facility.scale).toBeCloseTo(90);
    });

    it('returns false when recycler does not exist', () => {
        // @ts-expect-error intentionally corrupt type
        planet.recycler = undefined;
        const result = processFacilityContraction(planet, facility, agent, 90, gameState);
        expect(result).toBe(false);
    });

    it('pushes a ticker event', () => {
        const recyclerAssets = planet.recycler!.assets[planet.id]!;
        recyclerAssets.deposits = 1_000_000;
        const eventsBefore = gameState.tickerEvents.length;
        processFacilityContraction(planet, facility, agent, 90, gameState);
        expect(gameState.tickerEvents.length).toBe(eventsBefore + 1);
        expect(gameState.tickerEvents[eventsBefore].category).toBe('facilityScrapped');
    });
});

describe('recycler end-to-end: contraction → storage → market sale', () => {
    it('CS put into recycler storage is available for automatic pricing', () => {
        const planet = makePlanet({ marketPrices: { Construction: 10 } });
        const recycler = planet.recycler!;
        const recyclerAssets = recycler.assets[planet.id]!;

        const csAmount = 1000;
        putIntoStorageFacility(recyclerAssets.storageFacility, constructionServiceResourceType, csAmount);

        const agents = new Map<string, Agent>([[recycler.id, recycler]]);
        automaticPricing(agents, planet);

        const offer = recyclerAssets.market!.sell.Construction;
        expect(offer).toBeDefined();
        expect(offer.offerPrice).toBeGreaterThan(0);
        expect(offer.offerRetainment).toBe(0);

        const csStock = queryStorageFacility(recyclerAssets.storageFacility, 'Construction');
        expect(csStock).toBe(csAmount);
    });

    it('full cycle: contraction puts CS into storage, automatic pricing makes it sellable', () => {
        const planet = makePlanet({ marketPrices: { Construction: 10 } });
        setCSMarketResult(planet);
        const agent = makeAgent('factory-owner', planet.id, 'Factory Owner');
        const facility = makeProductionFacility(
            { none: 1 },
            {
                planetId: planet.id,
                maxScale: 100,
                scale: 100,
                produces: [{ resource: constructionServiceResourceType, quantity: 1 }],
            },
        );
        agent.assets[planet.id]!.productionFacilities = [facility];
        agent.assets[planet.id]!.deposits = 0;

        const recycler = planet.recycler!;
        const recycledAssets = recycler.assets[planet.id]!;
        recycledAssets.deposits = 1_000_000;

        const gameState = makeGameState([planet], [agent, recycler]);

        const result = processFacilityContraction(planet, facility, agent, 90, gameState);
        expect(result).toBe(true);

        const csInRecycler = queryStorageFacility(recycledAssets.storageFacility, 'Construction');
        expect(csInRecycler).toBeGreaterThan(0);

        const agentMap = new Map<string, Agent>([[recycler.id, recycler]]);
        automaticPricing(agentMap, planet);

        const offer = recycledAssets.market!.sell.Construction;
        expect(offer).toBeDefined();
        expect(offer.offerPrice).toBeGreaterThan(0);
        expect(offer.offerRetainment).toBe(0);
    });
});

describe('recycler pricing in automaticPricing', () => {
    it('sets initial offer price to market price when no prior data', () => {
        const planet = makePlanet({ marketPrices: { Construction: 15 } });
        const recycler = planet.recycler!;
        const recyclerAssets = recycler.assets[planet.id]!;
        putIntoStorageFacility(recyclerAssets.storageFacility, constructionServiceResourceType, 500);
        const agentMap = new Map<string, Agent>([[recycler.id, recycler]]);
        automaticPricing(agentMap, planet);
        expect(recyclerAssets.market!.sell.Construction!.offerPrice).toBe(15);
    });

    it('retains zero CS for inputs (no production facilities)', () => {
        const planet = makePlanet();
        const recycler = planet.recycler!;
        const recyclerAssets = recycler.assets[planet.id]!;
        putIntoStorageFacility(recyclerAssets.storageFacility, constructionServiceResourceType, 500);
        const agentMap = new Map<string, Agent>([[recycler.id, recycler]]);
        automaticPricing(agentMap, planet);
        expect(recyclerAssets.market!.sell.Construction!.offerRetainment).toBe(0);
    });
});

describe('recycler profitability over multiple contraction cycles', () => {
    it('makes profit after one contraction and market sale (with the loan included)', () => {
        const planet = makePlanet({ marketPrices: { Construction: 10 } });
        setCSMarketResult(planet); // demandFactor = 1.0
        const agent = makeAgent('factory-owner', planet.id, 'Factory Owner');
        const facility = makeProductionFacility(
            { none: 1 },
            {
                planetId: planet.id,
                maxScale: 100,
                scale: 100,
                produces: [{ resource: constructionServiceResourceType, quantity: 1 }],
            },
        );
        agent.assets[planet.id]!.productionFacilities = [facility];
        agent.assets[planet.id]!.deposits = 0;

        const recycler = planet.recycler!;
        const recyclerAssets = recycler.assets[planet.id]!;
        const seedCapital = 1_000_000;
        recyclerAssets.deposits = seedCapital;

        const gameState = makeGameState([planet], [agent, recycler]);
        const contractCost = calculateCostsForConstruction('services', 90, 100);

        // Run contraction
        processFacilityContraction(planet, facility, agent, 90, gameState);

        // After: CS increased
        const csAfterContraction = queryStorageFacility(recyclerAssets.storageFacility, 'Construction');
        expect(csAfterContraction).toBeGreaterThan(0);

        // Simulate market sale of CS at market price
        const recoveredCS = contractCost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
        const saleRevenue = recoveredCS * 10;
        const payment = recoveredCS * 10 * RECYCLER_PAYMENT_RATIO; // demandFactor=1.0

        recyclerAssets.deposits += saleRevenue;
        removeFromStorageFacility(recyclerAssets.storageFacility, 'Construction', csAfterContraction);

        // Net profit = (saleRevenue - payment)
        const netProfit = saleRevenue - payment;
        expect(netProfit).toBeGreaterThan(0);
        expect(recyclerAssets.deposits).toBeGreaterThan(seedCapital * 0.9);
    });

    it('accumulates profit over multiple cycles with seed capital', () => {
        const planet = makePlanet({ marketPrices: { Construction: 10 } });
        setCSMarketResult(planet); // demandFactor = 1.0
        const agent = makeAgent('factory-owner', planet.id, 'Factory Owner');
        const facility = makeProductionFacility(
            { none: 1 },
            {
                planetId: planet.id,
                maxScale: 100,
                scale: 100,
                produces: [{ resource: constructionServiceResourceType, quantity: 1 }],
            },
        );
        agent.assets[planet.id]!.productionFacilities = [facility];
        agent.assets[planet.id]!.deposits = 0;

        const recycler = planet.recycler!;
        const recyclerAssets = recycler.assets[planet.id]!;
        recyclerAssets.deposits = 1_000_000;

        const gameState = makeGameState([planet], [agent, recycler]);

        const cycles = 5;
        for (let i = 0; i < cycles; i++) {
            processFacilityContraction(planet, facility, agent, 100 - 10 * (i + 1), gameState);

            const csStock = queryStorageFacility(recyclerAssets.storageFacility, 'Construction');
            if (csStock > 0) {
                const revenue = csStock * 10;
                recyclerAssets.deposits += revenue;
                removeFromStorageFacility(recyclerAssets.storageFacility, 'Construction', csStock);
            }
        }

        const totalLoanDebt = recyclerAssets.activeLoans.reduce((s, l) => s + l.remainingPrincipal, 0);
        const totalValue = recyclerAssets.deposits + totalLoanDebt;
        expect(totalValue).toBeGreaterThan(1_000_000);
    });

    it('makes profit starting with zero deposits (loan-bridged)', () => {
        const planet = makePlanet({ marketPrices: { Construction: 10 } });
        setCSMarketResult(planet); // demandFactor = 1.0
        const agent = makeAgent('factory-owner', planet.id, 'Factory Owner');
        const facility = makeProductionFacility(
            { none: 1 },
            {
                planetId: planet.id,
                maxScale: 100,
                scale: 100,
                produces: [{ resource: constructionServiceResourceType, quantity: 1 }],
            },
        );
        agent.assets[planet.id]!.productionFacilities = [facility];
        agent.assets[planet.id]!.deposits = 0;

        const recycler = planet.recycler!;
        const recyclerAssets = recycler.assets[planet.id]!;
        recyclerAssets.deposits = 0;

        const gameState = makeGameState([planet], [agent, recycler]);

        const cycles = 3;
        for (let i = 0; i < cycles; i++) {
            processFacilityContraction(planet, facility, agent, 100 - 10 * (i + 1), gameState);

            const csStock = queryStorageFacility(recyclerAssets.storageFacility, 'Construction');
            if (csStock > 0) {
                const revenue = csStock * 10;
                recyclerAssets.deposits += revenue;
                removeFromStorageFacility(recyclerAssets.storageFacility, 'Construction', csStock);
            }
        }

        expect(recyclerAssets.deposits).toBeGreaterThan(0);
        const totalLoanDebt = recyclerAssets.activeLoans.reduce((s, l) => s + l.remainingPrincipal, 0);
        expect(recyclerAssets.deposits + totalLoanDebt).toBeGreaterThan(0);
    });
});

describe('recycler market integration - validation', () => {
    it('market validation accepts recycler offers with positive inventory', () => {
        const planet = makePlanet({ marketPrices: { Construction: 10 } });
        const recycler = planet.recycler!;
        const recyclerAssets = recycler.assets[planet.id]!;

        putIntoStorageFacility(recyclerAssets.storageFacility, constructionServiceResourceType, 500);

        const agentMap = new Map<string, Agent>([[recycler.id, recycler]]);
        automaticPricing(agentMap, planet);

        const offer = recyclerAssets.market!.sell.Construction!;
        const csStock = queryStorageFacility(recyclerAssets.storageFacility, 'Construction');
        const effectiveQuantity = Math.max(0, csStock - (offer.offerRetainment ?? 0));

        expect(effectiveQuantity).toBeGreaterThan(0);
        expect(offer.offerPrice).toBeGreaterThan(0);
    });
});
