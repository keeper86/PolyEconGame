import { beforeEach, describe, expect, it } from 'vitest';
import { forexTick } from './forexTick';
import { getCurrencyResourceName } from './currencyResources';
import { checkMonetaryConservation } from '../invariants';
import { creditForeignDeposit, makeAgent, makeAgentPlanetAssets, makeGameState, makePlanet } from '../utils/testHelper';
import type { Agent, Planet } from '../planet/planet';
import type { GameState } from '../planet/planet';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTwoPlanetState(): {
    gameState: GameState;
    planetA: Planet;
    planetB: Planet;
    agentA: Agent;
    agentB: Agent;
} {
    const planetA = makePlanet({ id: 'pA', name: 'Planet A' });
    const planetB = makePlanet({ id: 'pB', name: 'Planet B' });

    // agentA lives on pA but also has assets on pB (it imports machinery)
    const agentA = makeAgent('agentA', 'pA', 'Agent A');
    agentA.assets.pB = makeAgentPlanetAssets('pB');

    // agentB lives on pB but also has assets on pA (it imports food)
    const agentB = makeAgent('agentB', 'pB', 'Agent B');
    agentB.assets.pA = makeAgentPlanetAssets('pA');

    const gameState = makeGameState([planetA, planetB], [agentA, agentB]);

    return { gameState, planetA, planetB, agentA, agentB };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
        // Bootstrap: agentA holds 1000 units of PlanetB currency
        creditForeignDeposit(aA, pB, 1000);

        // agentA posts a sell offer for CUR_pB on Planet A's forex market
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

        // agentB bids to buy CUR_pB on Planet A's forex market using pA deposits
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
        // Give pA a reference price for the currency so clearing works
        pA.marketPrices[curB] = 1.0;

        const aAForeignBefore = aA.assets.pB!.deposits;
        const aBForeignBefore = aB.assets.pB?.deposits ?? 0;

        forexTick(gs);

        const traded = (aA.assets.pB?.deposits ?? 0) - aAForeignBefore;
        const received = (aB.assets.pB?.deposits ?? 0) - aBForeignBefore;

        // Conservation: what agentA lost = what agentB gained
        expect(traded + received).toBeCloseTo(0, 8);

        // agentA should have sold some (positive revenue in pA deposits)
        expect(aA.assets.pA.deposits).toBeGreaterThan(0);

        // agentB's pA deposits should have decreased (paid local currency)
        expect(aB.assets.pA.deposits).toBeLessThan(500);

        // PlanetB bank deposits unchanged: net zero transfer

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

        // All deposit holds must be zero after the tick
        expect(aB.assets.pA.depositHold).toBe(0);
        // Deposits fully restored
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
        // Bootstrap: agentA holds 500 units of pB currency
        creditForeignDeposit(aA, pB, 500);

        const curB = getCurrencyResourceName('pB');

        // agentA posts a sell offer for CUR_pB on pA's forex market
        if (!aA.assets.pA.market) {
            aA.assets.pA.market = { sell: {}, buy: {} };
        }
        aA.assets.pA.market.sell[curB] = {
            resource: { name: curB, form: 'currency', level: 'currency', volumePerQuantity: 0, massPerQuantity: 0 },
            offerPrice: 1.0,
            offerRetainment: 0,
            automated: false,
        };

        // agentB bids with ALL its available pA deposits (edge-case: exhausts the budget)
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
            // target equals full budget at bid price: buyer commits all deposits
            bidStorageTarget: fullBudget,
            automated: false,
        };
        pA.marketPrices[curB] = 1.0;

        forexTick(gs);

        // agentB should have received pB currency (trade was filled)
        expect(aB.assets.pB?.deposits ?? 0).toBeGreaterThan(0);

        // monetary conservation must hold
        const issues = checkMonetaryConservation(gs.agents, gs.planets);
        expect(issues).toEqual([]);
    });
});

describe('forexTick — heterogeneous pricing seeds', () => {
    it('getAgentDeterministicSeed returns different values for different agents', async () => {
        const { getAgentDeterministicSeed } = await import('./automaticPricing');
        const agentA = makeAgent('alpha', 'p');
        const agentB = makeAgent('beta', 'p');
        const agentC = makeAgent('gamma', 'p');

        const seedA = getAgentDeterministicSeed(agentA);
        const seedB = getAgentDeterministicSeed(agentB);
        const seedC = getAgentDeterministicSeed(agentC);

        // All in [0, 1)
        expect(seedA).toBeGreaterThanOrEqual(0);
        expect(seedA).toBeLessThan(1);

        // All different
        expect(seedA).not.toBe(seedB);
        expect(seedB).not.toBe(seedC);

        // Deterministic (same input → same output)
        expect(getAgentDeterministicSeed(makeAgent('alpha', 'p'))).toBe(seedA);
    });
});
