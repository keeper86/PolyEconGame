import { describe, expect, it } from 'vitest';

import { TICKS_PER_YEAR } from '../constants';
import { makeGameState, makeGovernmentAgent, makePlanet } from '../utils/testHelper';
import { seedForexMarketMakers } from './forexMarketMaker';

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

function makeSeededStateMultiPlanet(homeRate = 0.001, foreignRate = 0.002) {
    const gov1 = makeGovernmentAgent('gov-p1', 'p1');
    const gov2 = makeGovernmentAgent('gov-p2', 'p2');
    const planet1 = makePlanet({
        id: 'p1',
        name: 'Planet 1',
        governmentId: 'gov-p1',
        bank: { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: homeRate, depositRate: 0 },
    });
    const planet2 = makePlanet({
        id: 'p2',
        name: 'Planet 2',
        governmentId: 'gov-p2',
        bank: { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: foreignRate, depositRate: 0 },
    });
    const state = makeGameState([planet1, planet2], [gov1, gov2]);
    seedForexMarketMakers(state);
    return { state, planet1, planet2 };
}

describe('seedForexMarketMakers', () => {
    describe('home-planet working-capital loan APR', () => {
        it('stores annualInterestRate = bank.loanRate * TICKS_PER_YEAR on home-planet loan', () => {
            const loanRate = 0.001;
            const { state } = makeSeededState(loanRate);

            for (const mm of state.forexMarketMakers.values()) {
                const homeAssets = mm.assets.p1;
                expect(homeAssets).toBeDefined();
                for (const loan of homeAssets!.activeLoans) {
                    if (loan.type === 'forexWorkingCapital') {
                        expect(loan.annualInterestRate).toBeCloseTo(loanRate * TICKS_PER_YEAR);
                    }
                }
            }
        });

        it('home-planet loan annual rate is greater than per-tick rate', () => {
            const loanRate = 0.001;
            const { state } = makeSeededState(loanRate);

            for (const mm of state.forexMarketMakers.values()) {
                const homeAssets = mm.assets.p1;
                for (const loan of homeAssets!.activeLoans) {
                    if (loan.type === 'forexWorkingCapital') {
                        expect(loan.annualInterestRate).toBeGreaterThan(loanRate);
                    }
                }
            }
        });

        it('home-planet loan annual rate is 0 when loanRate is 0', () => {
            const { state } = makeSeededState(0);

            for (const mm of state.forexMarketMakers.values()) {
                const homeAssets = mm.assets.p1;
                for (const loan of homeAssets!.activeLoans) {
                    if (loan.type === 'forexWorkingCapital') {
                        expect(loan.annualInterestRate).toBe(0);
                    }
                }
            }
        });
    });

    describe('foreign-planet seed loan APR', () => {
        it('stores annualInterestRate = foreignPlanet.bank.loanRate * TICKS_PER_YEAR on foreign-planet loan', () => {
            const homeRate = 0.001;
            const foreignRate = 0.002;
            const { state, planet2 } = makeSeededStateMultiPlanet(homeRate, foreignRate);

            // MMs homed on planet1 should have foreign-planet loans on planet2
            for (const mm of state.forexMarketMakers.values()) {
                if (mm.associatedPlanetId !== 'p1') {
                    continue;
                }
                const foreignAssets = mm.assets.p2;
                expect(foreignAssets).toBeDefined();
                for (const loan of foreignAssets!.activeLoans) {
                    if (loan.type === 'forexWorkingCapital') {
                        expect(loan.annualInterestRate).toBeCloseTo(planet2.bank.loanRate * TICKS_PER_YEAR);
                    }
                }
            }
        });

        it('foreign-planet loan APR differs from home-planet loan APR when rates differ', () => {
            const homeRate = 0.001;
            const foreignRate = 0.002;
            const { state } = makeSeededStateMultiPlanet(homeRate, foreignRate);

            for (const mm of state.forexMarketMakers.values()) {
                if (mm.associatedPlanetId !== 'p1') {
                    continue;
                }
                const homeAssets = mm.assets.p1;
                const foreignAssets = mm.assets.p2;
                const homeApr = homeAssets!.activeLoans[0]?.annualInterestRate ?? 0;
                const foreignApr = foreignAssets!.activeLoans[0]?.annualInterestRate ?? 0;
                expect(foreignApr).not.toEqual(homeApr);
                expect(foreignApr).toBeCloseTo(foreignRate * TICKS_PER_YEAR);
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
