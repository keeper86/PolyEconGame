import { describe, expect, it } from 'vitest';
import { BUFFER_TRADER_RETAIN_DEPOSIT_FRACTION, BUFFER_TRADER_SEED_DEPOSIT } from '../constants';
import { grantLoan } from '../financial/loanTypes';
import { TRADABLE_RESOURCES } from '../planet/resourceCatalog';
import { makeAgent, makeAgentPlanetAssets, makeGameState, makePlanet } from '../utils/testHelper';
import { makeStorage } from '../initialUniverse/helpers';
import { bufferCapacityQuantity, bufferTraderTick } from './bufferTraderTick';
import type { Agent, GameState, Planet } from '../planet/planet';

const normalizeName = (name: string): string => name.replace(/[^A-Za-z0-9]/g, '');
const IRON_ORE = TRADABLE_RESOURCES.find((r) => normalizeName(r.name) === 'IronOre');

function makeTraderState(opts?: {
    scale?: number;
    allocateCompartment?: boolean;
    cost?: number;
    price?: number;
    volume?: number;
    deposits?: number;
    tick?: number;
}) {
    const price = opts?.price ?? 5;
    const planet: Planet = makePlanet({ id: 'p1', name: 'P1', marketPrices: { 'Iron Ore': price } });
    planet.productionCosts = { 'Iron Ore': opts?.cost ?? 4 };
    planet.avgMarketResult = {
        'Iron Ore': {
            resourceName: 'Iron Ore',
            clearingPrice: price,
            totalVolume: opts?.volume ?? 100,
            totalDemand: 100,
            totalSupply: 100,
            unfilledDemand: 0,
            unsoldSupply: 0,
        },
    };
    planet.bank.deposits = Number.MAX_SAFE_INTEGER / 4;
    planet.bank.loans = 0;

    const storage = makeStorage({ planetId: 'p1', id: 'buf-store', scale: opts?.scale ?? 200 });
    const assets = makeAgentPlanetAssets('p1', {
        storage,
        deposits: opts?.deposits ?? 1_000,
        market: { sell: {}, buy: {} },
        licenses: { commercial: { acquiredTick: 0, frozen: false } },
    });

    if (opts?.allocateCompartment !== false && IRON_ORE) {
        assets.storage.shells.solid.compartments[IRON_ORE.name] = 1;
    }

    const agent: Agent = makeAgent('buf-1', 'p1', 'Buffer', {
        agentRole: 'buffer_trader',
        automated: true,
        assets: { p1: assets },
    });

    const state: GameState = makeGameState([planet], [agent], opts?.tick ?? 0);
    state.bufferTraders.set(agent.id, agent);

    return { state, agent, assets, planet };
}

describe('bufferTraderTick – quoting', () => {
    it('bids at the market price when the ratio sits below the pivot band', () => {
        const { state, assets } = makeTraderState({ price: 5, cost: 4 });

        bufferTraderTick(state);

        const bid = assets.market!.buy[IRON_ORE!.name];
        expect(bid).toBeDefined();
        expect(bid.bidPrice).toBeCloseTo(5);
        expect(bid.bidStorageTarget).toBeGreaterThan(0);
        expect(assets.market!.sell[IRON_ORE!.name]).toBeUndefined();
    });

    it('offers at the market price when the ratio sits above the pivot band', () => {
        const { state, assets } = makeTraderState({ price: 8, cost: 4 });
        assets.storage.currentInStorage[IRON_ORE!.name] = { resource: IRON_ORE!, quantity: 500 };

        bufferTraderTick(state);

        const offer = assets.market!.sell[IRON_ORE!.name];
        expect(offer).toBeDefined();
        expect(offer.offerPrice).toBeCloseTo(8);
        expect(offer.offerRetainment).toBeLessThan(500);
        expect(assets.market!.buy[IRON_ORE!.name]).toBeUndefined();
    });

    it('scales the order with the distance from the pivot', () => {
        const near = makeTraderState({ price: 5.6, cost: 4 });
        const far = makeTraderState({ price: 4, cost: 4 });

        bufferTraderTick(near.state);
        bufferTraderTick(far.state);

        const nearQty = near.assets.market!.buy[IRON_ORE!.name]?.bidStorageTarget ?? 0;
        const farQty = far.assets.market!.buy[IRON_ORE!.name]?.bidStorageTarget ?? 0;
        expect(farQty).toBeGreaterThan(nearQty * 100);
    });

    it('takes a working-capital loan when deposits cannot cover the order', () => {
        const { state, assets } = makeTraderState({ price: 5, cost: 4, deposits: 1 });

        bufferTraderTick(state);

        expect(assets.activeLoans.length).toBeGreaterThan(0);
        expect(assets.deposits).toBeGreaterThan(1);
    });

    it('never quotes a service resource', () => {
        const { state, assets } = makeTraderState();

        bufferTraderTick(state);

        for (const name of Object.keys(assets.market!.buy)) {
            expect(TRADABLE_RESOURCES.find((r) => r.name === name)?.form).not.toBe('services');
        }
        for (const name of Object.keys(assets.market!.sell)) {
            expect(TRADABLE_RESOURCES.find((r) => r.name === name)?.form).not.toBe('services');
        }
    });

    it('does not offer when nothing is held', () => {
        const { state, assets } = makeTraderState({ price: 8, cost: 4 });

        bufferTraderTick(state);

        expect(assets.market!.sell[IRON_ORE!.name]).toBeUndefined();
    });

    it('does not bid when the production cost is unknown', () => {
        const { state, assets, planet } = makeTraderState();
        planet.productionCosts = {};

        bufferTraderTick(state);

        expect(assets.market!.buy[IRON_ORE!.name]).toBeUndefined();
    });

    it('needs an allocated compartment before it sizes a position', () => {
        const withCompartment = makeTraderState({ allocateCompartment: true });
        const withoutCompartment = makeTraderState({ allocateCompartment: false });

        expect(bufferCapacityQuantity(withCompartment.assets.storage, IRON_ORE!)).toBeGreaterThan(0);
        expect(bufferCapacityQuantity(withoutCompartment.assets.storage, IRON_ORE!)).toBe(0);

        bufferTraderTick(withoutCompartment.state);
        expect(withoutCompartment.assets.market!.buy[IRON_ORE!.name]).toBeUndefined();
    });

    it('caps the order by the free space', () => {
        const { state, assets } = makeTraderState({ price: 4, cost: 4 });

        bufferTraderTick(state);

        const space = bufferCapacityQuantity(assets.storage, IRON_ORE!);
        const bid = assets.market!.buy[IRON_ORE!.name];
        expect(bid.bidPrice).toBeCloseTo(4);
        expect(bid.bidStorageTarget).toBeLessThanOrEqual(space);
    });
});

describe('bufferTraderTick – loan servicing', () => {
    it('repays principal down to the retained working balance', () => {
        const { state, assets, planet } = makeTraderState({ deposits: 0 });
        grantLoan(assets, planet.bank, BUFFER_TRADER_SEED_DEPOSIT, 'forexWorkingCapital', 0);

        bufferTraderTick(state);

        const retain = BUFFER_TRADER_SEED_DEPOSIT * BUFFER_TRADER_RETAIN_DEPOSIT_FRACTION;
        expect(assets.activeLoans.length).toBe(1);
        expect(assets.deposits).toBeCloseTo(retain, -9);
        expect(assets.deposits).toBeLessThan(BUFFER_TRADER_SEED_DEPOSIT);
    });

    it('rolls over a matured loan when deposits cannot cover it', () => {
        const { state, assets, planet } = makeTraderState({ deposits: 0, tick: 100_000 });
        grantLoan(assets, planet.bank, BUFFER_TRADER_SEED_DEPOSIT, 'forexWorkingCapital', 0);

        bufferTraderTick(state);

        expect(assets.activeLoans.length).toBeGreaterThan(0);
    });

    it('ignores an empty trader map', () => {
        const { state } = makeTraderState();
        state.bufferTraders.clear();

        expect(() => bufferTraderTick(state)).not.toThrow();
    });
});
