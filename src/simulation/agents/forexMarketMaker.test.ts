import { beforeEach, describe, expect, it } from 'vitest';

import {
    FOREX_MM_BASE_SPREAD,
    FOREX_MM_COUNT,
    FOREX_MM_MAX_TRADE_FRACTION,
    FOREX_MM_SEED_LOAN,
    FOREX_MM_TARGET_DEPOSIT,
    FOREX_MM_WORKING_CAPITAL,
    PRICE_CEIL,
    TICKS_PER_YEAR,
} from '../constants';
import { FOREX_PRICE_FLOOR, getCurrencyResourceName } from '../market/currencyResources';
import { seedRng } from '../utils/stochasticRound';
import { makeGameState, makeGovernmentAgent, makePlanet } from '../utils/testHelper';
import { seedForexMarketMakers } from './forexMarketMaker';
import { forexMarketMakerPricing } from './forexMarketMakerPricing';

beforeEach(() => {
    seedRng(42);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeededState(loanRate = 0.001) {
    const gov = makeGovernmentAgent('gov-p1', 'p1');
    const planet = makePlanet({
        id: 'p1',
        name: 'Planet 1',
        governmentId: 'gov-p1',
        bank: { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate, depositRate: 0 },
    });
    const state = makeGameState([planet], [gov]);
    seedForexMarketMakers(state);
    return { state, planet };
}

function makeSeededStateMultiPlanet(rate1 = 0.001, rate2 = 0.002) {
    const gov1 = makeGovernmentAgent('gov-p1', 'p1');
    const gov2 = makeGovernmentAgent('gov-p2', 'p2');
    const planet1 = makePlanet({
        id: 'p1',
        name: 'Planet 1',
        governmentId: 'gov-p1',
        bank: { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: rate1, depositRate: 0 },
    });
    const planet2 = makePlanet({
        id: 'p2',
        name: 'Planet 2',
        governmentId: 'gov-p2',
        bank: { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: rate2, depositRate: 0 },
    });
    const state = makeGameState([planet1, planet2], [gov1, gov2]);
    seedForexMarketMakers(state);
    return { state, planet1, planet2 };
}

function makeThreePlanetState() {
    const govs = ['p1', 'p2', 'p3'].map((id) => makeGovernmentAgent(`gov-${id}`, id));
    const planets = ['p1', 'p2', 'p3'].map((id, i) =>
        makePlanet({
            id,
            name: `Planet ${i + 1}`,
            governmentId: `gov-${id}`,
            bank: { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0.001, depositRate: 0 },
        }),
    );
    const state = makeGameState(planets, govs);
    seedForexMarketMakers(state);
    return { state, planets };
}

// ---------------------------------------------------------------------------
// Structure tests
// ---------------------------------------------------------------------------

describe('seedForexMarketMakers', () => {
    describe('MM count and structure', () => {
        it('creates exactly FOREX_MM_COUNT MM per planet (single planet)', () => {
            const { state } = makeSeededState();
            expect(state.forexMarketMakers.size).toBe(FOREX_MM_COUNT * 1);
        });

        it('creates exactly FOREX_MM_COUNT MM per planet (two planets)', () => {
            const { state } = makeSeededStateMultiPlanet();
            expect(state.forexMarketMakers.size).toBe(FOREX_MM_COUNT * 2);
        });

        it('creates exactly FOREX_MM_COUNT MM per planet (three planets)', () => {
            const { state } = makeThreePlanetState();
            expect(state.forexMarketMakers.size).toBe(FOREX_MM_COUNT * 3);
        });

        it('each MM has assets on every planet', () => {
            const { state } = makeSeededStateMultiPlanet();
            for (const mm of state.forexMarketMakers.values()) {
                expect(mm.assets.p1).toBeDefined();
                expect(mm.assets.p2).toBeDefined();
            }
        });

        it('MM ids use per-planet naming scheme', () => {
            const { state } = makeSeededStateMultiPlanet();
            for (const mm of state.forexMarketMakers.values()) {
                expect(mm.id).toMatch(/^mm_(p1|p2)_\d+$/);
            }
        });
    });

    describe('home vs foreign capital asymmetry', () => {
        it('home planet receives FOREX_MM_WORKING_CAPITAL', () => {
            const { state } = makeSeededStateMultiPlanet();
            for (const mm of state.forexMarketMakers.values()) {
                const homeDeposits = mm.assets[mm.associatedPlanetId]!.deposits;
                expect(homeDeposits).toBeCloseTo(FOREX_MM_WORKING_CAPITAL);
            }
        });

        it('foreign planets receive FOREX_MM_SEED_LOAN', () => {
            const { state } = makeSeededStateMultiPlanet();
            for (const mm of state.forexMarketMakers.values()) {
                for (const [planetId, assets] of Object.entries(mm.assets)) {
                    if (planetId !== mm.associatedPlanetId) {
                        expect(assets.deposits).toBeCloseTo(FOREX_MM_SEED_LOAN);
                    }
                }
            }
        });

        it('home and foreign deposits are equal (symmetric fair-mid start)', () => {
            const { state } = makeSeededStateMultiPlanet();
            for (const mm of state.forexMarketMakers.values()) {
                const homeDeposits = mm.assets[mm.associatedPlanetId]!.deposits;
                for (const [planetId, assets] of Object.entries(mm.assets)) {
                    if (planetId !== mm.associatedPlanetId) {
                        expect(homeDeposits).toBeCloseTo(assets.deposits);
                    }
                }
            }
        });
    });

    describe('loan APR per planet', () => {
        it("home-planet loan uses that planet's own bank loanRate", () => {
            const rate1 = 0.001;
            const rate2 = 0.002;
            const { state } = makeSeededStateMultiPlanet(rate1, rate2);
            const rateByPlanet: Record<string, number> = { p1: rate1, p2: rate2 };

            for (const mm of state.forexMarketMakers.values()) {
                const planetRate = rateByPlanet[mm.associatedPlanetId];
                const homeLoan = mm.assets[mm.associatedPlanetId]!.activeLoans.find(
                    (l) => l.type === 'forexWorkingCapital',
                );
                expect(homeLoan?.annualInterestRate).toBeCloseTo(planetRate * TICKS_PER_YEAR);
            }
        });

        it('each planet uses its own loanRate for the APR', () => {
            const rate1 = 0.001;
            const rate2 = 0.002;
            const { state } = makeSeededStateMultiPlanet(rate1, rate2);
            for (const mm of state.forexMarketMakers.values()) {
                const apr1 =
                    mm.assets.p1!.activeLoans.find((l) => l.type === 'forexWorkingCapital')?.annualInterestRate ?? 0;
                const apr2 =
                    mm.assets.p2!.activeLoans.find((l) => l.type === 'forexWorkingCapital')?.annualInterestRate ?? 0;
                expect(apr1).toBeCloseTo(rate1 * TICKS_PER_YEAR);
                expect(apr2).toBeCloseTo(rate2 * TICKS_PER_YEAR);
                expect(apr2).not.toBeCloseTo(apr1);
            }
        });

        it('loan annual rate is 0 when loanRate is 0', () => {
            const { state } = makeSeededState(0);
            for (const mm of state.forexMarketMakers.values()) {
                for (const loan of mm.assets.p1!.activeLoans) {
                    if (loan.type === 'forexWorkingCapital') {
                        expect(loan.annualInterestRate).toBe(0);
                    }
                }
            }
        });
    });

    describe('monetary conservation', () => {
        it('bank.loans === bank.deposits after seeding (single planet)', () => {
            const { planet } = makeSeededState();
            expect(planet.bank.loans).toBe(planet.bank.deposits);
        });

        it('bank.loans === bank.deposits after seeding (multi-planet)', () => {
            const { planet1, planet2 } = makeSeededStateMultiPlanet();
            expect(planet1.bank.loans).toBe(planet1.bank.deposits);
            expect(planet2.bank.loans).toBe(planet2.bank.deposits);
        });
    });
});

// ---------------------------------------------------------------------------
// Pricing behaviour tests
// ---------------------------------------------------------------------------

describe('forexMarketMakerPricing', () => {
    it('produces ask and bid orders on every (trading, issuing) pair for every MM', () => {
        const { state } = makeSeededStateMultiPlanet();
        forexMarketMakerPricing(state);

        for (const mm of state.forexMarketMakers.values()) {
            // On p1 the MM should offer to sell CUR_p2 and bid to buy CUR_p2
            const curP2 = getCurrencyResourceName('p2');
            expect(mm.assets.p1!.market!.sell[curP2]?.offerPrice).toBeGreaterThan(0);
            expect(mm.assets.p1!.market!.buy[curP2]?.bidPrice).toBeGreaterThan(0);

            // On p2 the MM should offer to sell CUR_p1 and bid to buy CUR_p1
            const curP1 = getCurrencyResourceName('p1');
            expect(mm.assets.p2!.market!.sell[curP1]?.offerPrice).toBeGreaterThan(0);
            expect(mm.assets.p2!.market!.buy[curP1]?.bidPrice).toBeGreaterThan(0);
        }
    });

    it('ask price is always strictly above bid price', () => {
        const { state } = makeSeededStateMultiPlanet();
        forexMarketMakerPricing(state);

        const curP2 = getCurrencyResourceName('p2');
        for (const mm of state.forexMarketMakers.values()) {
            const ask = mm.assets.p1!.market!.sell[curP2]?.offerPrice ?? 0;
            const bid = mm.assets.p1!.market!.buy[curP2]?.bidPrice ?? 0;
            expect(ask).toBeGreaterThan(bid);
        }
    });

    it('overstocked MM (inventory > TARGET) has lower ask than neutral', () => {
        const { state } = makeSeededStateMultiPlanet();

        // p1-homed MM: local (p1) balance = TARGET, foreign (p2) balance = 2×TARGET
        // Constant-product formula: fairMid = DEFAULT * (local / foreign) = 1.0 * (T / 2T) = 0.5
        const p1mm = [...state.forexMarketMakers.values()].find((mm) => mm.associatedPlanetId === 'p1')!;
        p1mm.assets.p1!.deposits = FOREX_MM_TARGET_DEPOSIT;
        p1mm.assets.p2!.deposits = FOREX_MM_TARGET_DEPOSIT * 2; // fully overstocked

        // p2-homed MM: local (p1) balance = TARGET, foreign (p2) balance = TARGET
        // Constant-product formula: fairMid = 1.0 * (T / T) = 1.0
        const p2mm = [...state.forexMarketMakers.values()].find((mm) => mm.associatedPlanetId === 'p2')!;
        p2mm.assets.p1!.deposits = FOREX_MM_TARGET_DEPOSIT;
        p2mm.assets.p2!.deposits = FOREX_MM_TARGET_DEPOSIT;

        forexMarketMakerPricing(state);

        const curP2 = getCurrencyResourceName('p2');
        const overstockedAsk = p1mm.assets.p1!.market!.sell[curP2]?.offerPrice ?? 0;
        const neutralAsk = p2mm.assets.p1!.market!.sell[curP2]?.offerPrice ?? 0;

        expect(overstockedAsk).toBeLessThan(neutralAsk);

        // fairMid_over = 0.5, fairMid_neutral = 1.0
        expect(overstockedAsk).toBeCloseTo(0.5 * (1 + FOREX_MM_BASE_SPREAD), 6);
        expect(neutralAsk).toBeCloseTo(1.0 * (1 + FOREX_MM_BASE_SPREAD), 6);
    });

    it('MM with depleted foreign inventory quotes a higher ask than neutral', () => {
        const { state } = makeSeededStateMultiPlanet();

        // With the constant-product model, near-zero foreign gives fairMid → PRICE_CEIL → ask = PRICE_CEIL.
        const p1mm = [...state.forexMarketMakers.values()].find((mm) => mm.associatedPlanetId === 'p1')!;
        p1mm.assets.p1!.deposits = FOREX_MM_TARGET_DEPOSIT;
        p1mm.assets.p2!.deposits = 1; // near-zero foreign inventory (not zero, to keep the ask posted)

        const p2mm = [...state.forexMarketMakers.values()].find((mm) => mm.associatedPlanetId === 'p2')!;
        p2mm.assets.p1!.deposits = FOREX_MM_TARGET_DEPOSIT;
        p2mm.assets.p2!.deposits = FOREX_MM_TARGET_DEPOSIT; // neutral

        forexMarketMakerPricing(state);

        const curP2 = getCurrencyResourceName('p2');
        const depletedAsk = p1mm.assets.p1!.market!.sell[curP2]?.offerPrice ?? 0;
        const neutralAsk = p2mm.assets.p1!.market!.sell[curP2]?.offerPrice ?? 0;

        // Foreign depleted → shading > 1 → higher ask.
        expect(depletedAsk).toBeGreaterThan(neutralAsk);
        // Still below ceiling.
        expect(depletedAsk).toBeLessThanOrEqual(PRICE_CEIL);
    });

    it('3-planet MM splits bid target equally across both trading planets', () => {
        const { state, planets } = makeThreePlanetState();

        // Set p3-currency inventory to 0 on the p1-homed MM → full deficit = TARGET
        const p1mm = [...state.forexMarketMakers.values()].find((mm) => mm.associatedPlanetId === 'p1')!;
        p1mm.assets.p3!.deposits = 0;

        forexMarketMakerPricing(state);

        const curP3 = getCurrencyResourceName('p3');
        // MM wants to acquire more p3-currency.  It bids on both p1 and p2 (2 trading planets).
        // The per-tick bid is capped at FOREX_MM_MAX_TRADE_FRACTION of the per-planet split target.
        // splitTarget = 0 + TARGET/2 = 5M; maxBidQty = 5M * 0.1 = 500K
        // cappedBidTarget = min(0 + 500K, 5M) = 500K per planet
        const bidOnP1 = p1mm.assets.p1!.market!.buy[curP3]?.bidStorageTarget ?? 0;
        const bidOnP2 = p1mm.assets.p2!.market!.buy[curP3]?.bidStorageTarget ?? 0;

        const expectedPerPlanet = (FOREX_MM_TARGET_DEPOSIT / 2) * FOREX_MM_MAX_TRADE_FRACTION;
        expect(bidOnP1).toBeCloseTo(expectedPerPlanet, 0);
        expect(bidOnP2).toBeCloseTo(expectedPerPlanet, 0);
        // Both halves sum to the capped target
        expect(bidOnP1 + bidOnP2).toBeCloseTo(expectedPerPlanet * 2, 0);

        void planets; // used in state
    });
});

// ---------------------------------------------------------------------------
// Inventory-shading mid-price bounds
// ---------------------------------------------------------------------------

describe('forexMarketMakerPricing – inventory shading bounds', () => {
    it('balanced inventory (both at target) produces fairMid ≈ DEFAULT_EXCHANGE_RATE', () => {
        const { state } = makeSeededStateMultiPlanet();
        const p1mm = [...state.forexMarketMakers.values()].find((mm) => mm.associatedPlanetId === 'p1')!;

        // Set both balances to exactly the target so shading = 1.
        p1mm.assets.p1!.deposits = FOREX_MM_TARGET_DEPOSIT;
        p1mm.assets.p2!.deposits = FOREX_MM_TARGET_DEPOSIT;

        forexMarketMakerPricing(state);

        const curP2 = getCurrencyResourceName('p2');
        const ask = p1mm.assets.p1!.market!.sell[curP2]?.offerPrice ?? 0;
        const bid = p1mm.assets.p1!.market!.buy[curP2]?.bidPrice ?? 0;

        // fairMid = 1.0; with spread the ask/bid should bracket DEFAULT_EXCHANGE_RATE (1.0).
        expect(ask).toBeCloseTo(1.0 * (1 + FOREX_MM_BASE_SPREAD), 6);
        expect(bid).toBeCloseTo(1.0 * (1 - FOREX_MM_BASE_SPREAD), 6);
    });

    it('extreme long local → ask is clamped at PRICE_CEIL', () => {
        const { state } = makeSeededStateMultiPlanet();
        const p1mm = [...state.forexMarketMakers.values()].find((mm) => mm.associatedPlanetId === 'p1')!;

        // Make local balance astronomically large relative to the target;
        // shading shoots up, clamping to PRICE_CEIL keeps the ask finite.
        p1mm.assets.p1!.deposits = FOREX_MM_TARGET_DEPOSIT * 1e8; // 100 million × TARGET
        p1mm.assets.p2!.deposits = FOREX_MM_TARGET_DEPOSIT;

        forexMarketMakerPricing(state);

        const curP2 = getCurrencyResourceName('p2');
        const ask = p1mm.assets.p1!.market!.sell[curP2]?.offerPrice ?? 0;
        expect(ask).toBeLessThanOrEqual(PRICE_CEIL);
        expect(ask).toBeGreaterThan(1.0); // still priced above mid-neutral
    });

    it('extreme long foreign → bid is floored at FOREX_PRICE_FLOOR', () => {
        const { state } = makeSeededStateMultiPlanet();
        const p1mm = [...state.forexMarketMakers.values()].find((mm) => mm.associatedPlanetId === 'p1')!;

        // Massive foreign inventory: shading collapses, flooring keeps the bid non-negative.
        p1mm.assets.p1!.deposits = FOREX_MM_TARGET_DEPOSIT;
        p1mm.assets.p2!.deposits = FOREX_MM_TARGET_DEPOSIT * 1e8; // 100 million × TARGET

        forexMarketMakerPricing(state);

        const curP2 = getCurrencyResourceName('p2');
        const bid = p1mm.assets.p1!.market!.buy[curP2]?.bidPrice ?? 0;
        expect(bid).toBeGreaterThanOrEqual(FOREX_PRICE_FLOOR);
        expect(bid).toBeLessThan(1.0); // priced below mid-neutral
    });
});
