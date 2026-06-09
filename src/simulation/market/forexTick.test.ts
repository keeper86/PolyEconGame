import { beforeEach, describe, expect, it } from 'vitest';
import { forexTick } from './forexTick';
import { getCurrencyResourceName } from './currencyResources';
import { checkMonetaryConservation } from '../invariants';
import { creditForeignDeposit, makeAgent, makeAgentPlanetAssets, makeGameState, makePlanet } from '../utils/testHelper';
import type { Agent, Planet } from '../planet/planet';
import type { GameState } from '../planet/planet';

function makeTwoPlanetState(): {
    gameState: GameState;
    planetA: Planet;
    planetB: Planet;
    agentA: Agent;
    agentB: Agent;
} {
    const planetA = makePlanet({ id: 'pA', name: 'Planet A' });
    const planetB = makePlanet({ id: 'pB', name: 'Planet B' });

    const agentA = makeAgent('agentA', 'pA', 'Agent A');
    agentA.assets.pB = makeAgentPlanetAssets('pB');

    const agentB = makeAgent('agentB', 'pB', 'Agent B');
    agentB.assets.pA = makeAgentPlanetAssets('pA');

    const gameState = makeGameState([planetA, planetB], [agentA, agentB]);

    return { gameState, planetA, planetB, agentA, agentB };
}

describe('forexTick', () => {
    let gs: GameState;
    let pA: Planet;
    let pB: Planet;
    let aA: Agent;
    let aB: Agent;

    beforeEach(() => {
        const s = makeTwoPlanetState();
        gs = s.gameState;
        pA = s.planetA;
        pB = s.planetB;
        aA = s.agentA;
        aB = s.agentB;
    });

    it('does nothing when no agents have forex orders posted', () => {
        const aDeposits = aA.assets.pB?.deposits ?? 0;
        const bDeposits = aB.assets.pA?.deposits ?? 0;

        forexTick(gs);

        expect(aA.assets.pB?.deposits ?? 0).toBe(aDeposits);
        expect(aB.assets.pA?.deposits ?? 0).toBe(bDeposits);
    });

    it('transfers foreign deposits correctly when a trade executes', () => {
        creditForeignDeposit(aA, pB, 1000);

        const curB = getCurrencyResourceName('pB');
        if (!aA.assets.pA.market) {
            aA.assets.pA.market = { sell: {}, buy: {} };
        }
        aA.assets.pA.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };

        aB.assets.pA.deposits = 500;
        pA.bank.deposits += 500;
        pA.bank.loans += 500;
        if (!aB.assets.pA.market) {
            aB.assets.pA.market = { sell: {}, buy: {} };
        }
        aB.assets.pA.market.buy[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            bidPrice: 1.1,
            bidStorageTarget: 400,
            automated: false,
        };

        pA.marketPrices[curB] = 1.0;

        const aAForeignBefore = aA.assets.pB!.deposits;
        const aBForeignBefore = aB.assets.pB?.deposits ?? 0;

        forexTick(gs);

        const traded = (aA.assets.pB?.deposits ?? 0) - aAForeignBefore;
        const received = (aB.assets.pB?.deposits ?? 0) - aBForeignBefore;

        expect(traded + received).toBeCloseTo(0, 8);

        expect(aA.assets.pA.deposits).toBeGreaterThan(0);

        expect(aB.assets.pA.deposits).toBeLessThan(500);

        expect(pB.bank.deposits).toBe(1000);
    });

    it('issues no-trade result when only asks exist (no bids)', () => {
        creditForeignDeposit(aA, pB, 500);
        const curB = getCurrencyResourceName('pB');
        if (!aA.assets.pA.market) {
            aA.assets.pA.market = { sell: {}, buy: {} };
        }
        aA.assets.pA.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };
        pA.marketPrices[curB] = 1.0;

        forexTick(gs);

        const result = pA.lastMarketResult[curB];
        expect(result).toBeDefined();
        expect(result.totalVolume).toBe(0);
        expect(result.unsoldSupply).toBeGreaterThan(0);
        expect(aA.assets.pB?.depositHold ?? 0).toBe(0);
    });

    it('releases deposit holds fully after a no-trade tick (only bids)', () => {
        const curB = getCurrencyResourceName('pB');
        aB.assets.pA.deposits = 300;
        pA.bank.deposits += 300;
        pA.bank.loans += 300;
        if (!aB.assets.pA.market) {
            aB.assets.pA.market = { sell: {}, buy: {} };
        }
        aB.assets.pA.market.buy[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            bidPrice: 1.0,
            bidStorageTarget: 200,
            automated: false,
        };
        pA.marketPrices[curB] = 1.0;

        forexTick(gs);

        expect(aB.assets.pA.depositHold).toBe(0);

        expect(aB.assets.pA.deposits).toBe(300);
    });

    it('maintains monetary conservation on the issuing planet after forex trades', () => {
        creditForeignDeposit(aA, pB, 800);
        creditForeignDeposit(aB, pA, 800);

        const curB = getCurrencyResourceName('pB');
        const curA = getCurrencyResourceName('pA');

        if (!aA.assets.pA.market) {
            aA.assets.pA.market = { sell: {}, buy: {} };
        }
        aA.assets.pA.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };
        aA.assets.pA.deposits = 600;
        pA.bank.deposits += 600;
        pA.bank.loans += 600;
        aA.assets.pA.market.buy[curA] = {
            resource: { name: curA, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            bidPrice: 1.05,
            bidStorageTarget: 300,
            automated: false,
        };
        pA.marketPrices[curB] = 1.0;

        if (!aB.assets.pB.market) {
            aB.assets.pB.market = { sell: {}, buy: {} };
        }
        aB.assets.pB.market.sell[curA] = {
            resource: { name: curA, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };
        aB.assets.pB.deposits = 600;
        pB.bank.deposits += 600;
        pB.bank.loans += 600;
        aB.assets.pB.market.buy[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            bidPrice: 1.05,
            bidStorageTarget: 300,
            automated: false,
        };
        pB.marketPrices[curA] = 1.0;

        forexTick(gs);

        const issues = checkMonetaryConservation(gs.agents, gs.planets);
        expect(issues).toEqual([]);
    });

    it('fills bids correctly when buyer commits all available deposits', () => {
        creditForeignDeposit(aA, pB, 500);

        const curB = getCurrencyResourceName('pB');

        if (!aA.assets.pA.market) {
            aA.assets.pA.market = { sell: {}, buy: {} };
        }
        aA.assets.pA.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };

        const fullBudget = 200;
        aB.assets.pA.deposits = fullBudget;
        pA.bank.deposits += fullBudget;
        pA.bank.loans += fullBudget;
        if (!aB.assets.pA.market) {
            aB.assets.pA.market = { sell: {}, buy: {} };
        }
        aB.assets.pA.market.buy[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            bidPrice: 1.0,

            bidStorageTarget: fullBudget,
            automated: false,
        };
        pA.marketPrices[curB] = 1.0;

        forexTick(gs);

        expect(aB.assets.pB?.deposits ?? 0).toBeGreaterThan(0);

        const issues = checkMonetaryConservation(gs.agents, gs.planets);
        expect(issues).toEqual([]);
    });

    it('restores deposits fully when no buyers exist (no-fill tick)', () => {
        creditForeignDeposit(aA, pB, 100);
        const curB = getCurrencyResourceName('pB');
        aA.assets.pA.market = { sell: {}, buy: {} };
        aA.assets.pA.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };
        pA.marketPrices[curB] = 1.0;

        forexTick(gs);

        expect(aA.assets.pB!.deposits).toBeCloseTo(100, 8);
        expect(aA.assets.pB!.depositHold).toBe(0);
    });

    it('returns only the unfilled portion after a partial fill', () => {
        creditForeignDeposit(aA, pB, 100);
        const curB = getCurrencyResourceName('pB');
        aA.assets.pA.market = { sell: {}, buy: {} };
        aA.assets.pA.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 90,
            automated: false,
        };
        pA.marketPrices[curB] = 1.0;

        aB.assets.pA.deposits = 10;
        pA.bank.deposits += 10;
        pA.bank.loans += 10;
        aB.assets.pA.market = { sell: {}, buy: {} };
        aB.assets.pA.market.buy[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            bidPrice: 1.0,
            bidStorageTarget: 3,
            automated: false,
        };

        forexTick(gs);

        expect(aA.assets.pB!.deposits).toBeCloseTo(97, 6);
        expect(aA.assets.pB!.depositHold).toBe(0);

        const issues = checkMonetaryConservation(gs.agents, gs.planets);
        expect(issues).toEqual([]);
    });

    it('prevents cross-pair double-spending for the same issuing currency', () => {
        const pC = makePlanet({ id: 'pC', name: 'Planet C' });
        gs.planets.set('pC', pC);

        aA.assets.pC = makeAgentPlanetAssets('pC');

        aB.assets.pC = makeAgentPlanetAssets('pC');
        aB.assets.pC.deposits = 200;
        pC.bank.deposits += 200;
        pC.bank.loans += 200;

        creditForeignDeposit(aA, pB, 100);
        const curB = getCurrencyResourceName('pB');

        aA.assets.pA.market = { sell: {}, buy: {} };
        aA.assets.pA.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };
        aA.assets.pC.market = { sell: {}, buy: {} };
        aA.assets.pC.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };

        aB.assets.pA.deposits = 200;
        pA.bank.deposits += 200;
        pA.bank.loans += 200;
        aB.assets.pA.market = { sell: {}, buy: {} };
        aB.assets.pA.market.buy[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            bidPrice: 1.0,
            bidStorageTarget: 80,
            automated: false,
        };
        aB.assets.pC.market = { sell: {}, buy: {} };
        aB.assets.pC.market.buy[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            bidPrice: 1.0,
            bidStorageTarget: 80,
            automated: false,
        };

        pA.marketPrices[curB] = 1.0;
        pC.marketPrices[curB] = 1.0;

        forexTick(gs);

        const totalPBCurrency =
            (aA.assets.pB?.deposits ?? 0) +
            (aA.assets.pB?.depositHold ?? 0) +
            (aB.assets.pB?.deposits ?? 0) +
            (aB.assets.pB?.depositHold ?? 0);
        expect(totalPBCurrency).toBeCloseTo(100, 6);

        expect(aA.assets.pB?.depositHold ?? 0).toBe(0);
        expect(aB.assets.pB?.depositHold ?? 0).toBe(0);
    });

    it('scales buyer order down when deposits are insufficient and hold matches cost', () => {
        creditForeignDeposit(aA, pB, 500);
        const curB = getCurrencyResourceName('pB');
        aA.assets.pA.market = { sell: {}, buy: {} };
        aA.assets.pA.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };
        pA.marketPrices[curB] = 1.0;

        const buyerDeposits = 50;
        aB.assets.pA.deposits = buyerDeposits;
        pA.bank.deposits += buyerDeposits;
        pA.bank.loans += buyerDeposits;
        aB.assets.pA.market = { sell: {}, buy: {} };
        aB.assets.pA.market.buy[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            bidPrice: 1.0,
            bidStorageTarget: 200,
            automated: false,
        };

        forexTick(gs);

        expect(aB.assets.pA.depositHold).toBe(0);

        expect(aB.assets.pB?.deposits ?? 0).toBeLessThanOrEqual(buyerDeposits);
        expect(aB.assets.pB?.deposits ?? 0).toBeGreaterThan(0);

        const issues = checkMonetaryConservation(gs.agents, gs.planets);
        expect(issues).toEqual([]);
    });
});
