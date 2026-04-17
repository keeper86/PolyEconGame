import { describe, expect, it } from 'vitest';

import { LOAN_CASH_FLOW_MONTHS, LOAN_COLLATERAL_FACTOR, STARTER_LOAN_AMOUNT, TICKS_PER_MONTH } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { makeAgent, makePlanet, makeStorageFacility } from '../utils/testHelper';
import { computeLoanConditions } from './loanConditions';

function makeEstablishedAgent(
    planet: Planet,
    overrides?: {
        lastMonthRevenue?: number;
        lastMonthWages?: number;
        currentMonthRevenue?: number;
        currentMonthWages?: number;
        existingLoans?: number;
    },
): Agent {
    const a = makeAgent('a1', planet.id, 'Player', { automated: false, starterLoanTaken: true });
    const assets = a.assets[planet.id]!;
    assets.loans = overrides?.existingLoans ?? 0;
    assets.lastMonthAcc = {
        productionValue: 0,
        consumptionValue: 0,
        wages: overrides?.lastMonthWages ?? 0,
        revenue: overrides?.lastMonthRevenue ?? 0,
        purchases: 0,
        claimPayments: 0,
        totalWorkersTicks: 0,
    };
    assets.monthAcc = {
        depositsAtMonthStart: 0,
        productionValue: 0,
        consumptionValue: 0,
        wages: overrides?.currentMonthWages ?? 0,
        revenue: overrides?.currentMonthRevenue ?? 0,
        purchases: 0,
        claimPayments: 0,
        totalWorkersTicks: 0,
    };
    return a;
}

describe('computeLoanConditions', () => {
    // ----------------------------------------------------------------
    // Starter-loan path
    // ----------------------------------------------------------------

    it('grants STARTER_LOAN_AMOUNT to a brand-new agent (starterLoanTaken=false)', () => {
        const planet = makePlanet();
        const agent = makeAgent('a1', planet.id, 'Player', { automated: false });
        const result = computeLoanConditions(agent, planet, 2);
        expect(result.isNewAgent).toBe(true);
        expect(result.maxLoanAmount).toBe(STARTER_LOAN_AMOUNT);
    });

    it('does NOT use starter path when starterLoanTaken=true', () => {
        const planet = makePlanet();
        const agent = makeAgent('a1', planet.id, 'Player', { automated: false, starterLoanTaken: true });
        const result = computeLoanConditions(agent, planet, 2);
        expect(result.isNewAgent).toBe(false);
    });

    it('still uses starter path when agent has loans but starterLoanTaken=false', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { existingLoans: 1 });
        agent.starterLoanTaken = false;
        const result = computeLoanConditions(agent, planet, 2);
        expect(result.isNewAgent).toBe(true);
    });

    // ----------------------------------------------------------------
    // Blending logic
    // ----------------------------------------------------------------

    it('at tick % TICKS_PER_MONTH === 0 (progress 0) uses 100% last month', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 1200, lastMonthWages: 0 });
        // tick = TICKS_PER_MONTH → progress = 0
        const result = computeLoanConditions(agent, planet, TICKS_PER_MONTH);
        expect(result.blendedMonthlyRevenue).toBeCloseTo(1200);
    });

    it('mid-month blends last and extrapolated current month', () => {
        const planet = makePlanet();
        // Half-way through month, half the month revenue accumulated = 600
        const halfTick = Math.floor(TICKS_PER_MONTH / 2);
        const agent = makeEstablishedAgent(planet, {
            lastMonthRevenue: 800,
            currentMonthRevenue: 600, // extrapolates to 1200
        });
        const result = computeLoanConditions(agent, planet, halfTick);
        // progress = 0.5 → extrapolated = 1200, blend = 800*0.5 + 1200*0.5 = 1000
        expect(result.blendedMonthlyRevenue).toBeCloseTo(1000, 0);
    });

    it('near end of month is dominated by extrapolated current value', () => {
        const planet = makePlanet();
        const nearEnd = TICKS_PER_MONTH - 1;
        const agent = makeEstablishedAgent(planet, {
            lastMonthRevenue: 0,
            currentMonthRevenue: TICKS_PER_MONTH - 1, // extrapolates to ~30
        });
        const result = computeLoanConditions(agent, planet, nearEnd);
        expect(result.blendedMonthlyRevenue).toBeGreaterThan(25);
    });

    // ----------------------------------------------------------------
    // Cash-flow positive path
    // ----------------------------------------------------------------

    it('cash-flow positive: limit = LOAN_CASH_FLOW_MONTHS × netCashFlow − existingLoans', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, {
            lastMonthRevenue: 1000,
            lastMonthWages: 200,
            existingLoans: 500,
        });
        // At month boundary (tick = TICKS_PER_MONTH): 100% last month
        const result = computeLoanConditions(agent, planet, TICKS_PER_MONTH);
        const expected = Math.floor(LOAN_CASH_FLOW_MONTHS * (1000 - 200) - 500);
        expect(result.maxLoanAmount).toBe(expected);
        expect(result.monthlyNetCashFlow).toBeCloseTo(800);
    });

    it('cash-flow positive limit is floored at 0 when existing loans exceed capacity', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, {
            lastMonthRevenue: 100,
            lastMonthWages: 0,
            existingLoans: 1_000_000,
        });
        const result = computeLoanConditions(agent, planet, TICKS_PER_MONTH);
        expect(result.maxLoanAmount).toBe(0);
    });

    // ----------------------------------------------------------------
    // Cash-flow negative / zero path
    // ----------------------------------------------------------------

    it('cash-flow negative without storage: maxLoanAmount is 0', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 0, lastMonthWages: 100, existingLoans: 1 });
        const result = computeLoanConditions(agent, planet, TICKS_PER_MONTH);
        expect(result.maxLoanAmount).toBe(0);
    });

    it('cash-flow negative with storage: limit = storageCollateral − existingLoans', () => {
        const planet = makePlanet();
        planet.marketPrices.wheat = 10;
        const resource = {
            name: 'wheat',
            form: 'solid' as const,
            level: 'raw' as const,
            volumePerQuantity: 1,
            massPerQuantity: 1,
        };
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 0, lastMonthWages: 100, existingLoans: 1 });
        agent.assets[planet.id]!.storageFacility = makeStorageFacility({
            currentInStorage: { wheat: { resource, quantity: 100 } },
        });

        const result = computeLoanConditions(agent, planet, TICKS_PER_MONTH);
        const expectedCollateral = 100 * 10 * LOAN_COLLATERAL_FACTOR;
        expect(result.storageCollateral).toBeCloseTo(expectedCollateral);
        expect(result.maxLoanAmount).toBe(Math.floor(expectedCollateral - 1));
    });

    // ----------------------------------------------------------------
    // Storage collateral
    // ----------------------------------------------------------------

    it('storage collateral adds to credit limit for profitable agents', () => {
        const planet = makePlanet();
        planet.marketPrices.iron = 20;
        const resource = {
            name: 'iron',
            form: 'solid' as const,
            level: 'raw' as const,
            volumePerQuantity: 1,
            massPerQuantity: 1,
        };
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 1000, lastMonthWages: 0 });
        agent.assets[planet.id]!.storageFacility = makeStorageFacility({
            currentInStorage: { iron: { resource, quantity: 50 } },
        });

        const withoutStorage = computeLoanConditions(
            makeEstablishedAgent(planet, { lastMonthRevenue: 1000 }),
            planet,
            TICKS_PER_MONTH,
        );
        const withStorage = computeLoanConditions(agent, planet, TICKS_PER_MONTH);

        const collateral = 50 * 20 * LOAN_COLLATERAL_FACTOR;
        expect(withStorage.storageCollateral).toBeCloseTo(collateral);
        expect(withStorage.maxLoanAmount).toBe(withoutStorage.maxLoanAmount + Math.floor(collateral));
    });

    it('ignores storage items with zero quantity in collateral', () => {
        const planet = makePlanet();
        planet.marketPrices.iron = 20;
        const resource = {
            name: 'iron',
            form: 'solid' as const,
            level: 'raw' as const,
            volumePerQuantity: 1,
            massPerQuantity: 1,
        };
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 0, lastMonthWages: 0, existingLoans: 1 });
        agent.assets[planet.id]!.storageFacility = makeStorageFacility({
            currentInStorage: { iron: { resource, quantity: 0 } },
        });

        const result = computeLoanConditions(agent, planet, TICKS_PER_MONTH);
        expect(result.storageCollateral).toBe(0);
    });

    // ----------------------------------------------------------------
    // Informational fields
    // ----------------------------------------------------------------

    it('reports annualInterestRate as bank.loanRate × 360', () => {
        const planet = makePlanet();
        planet.bank.loanRate = 0.001;
        const agent = makeAgent('a1', planet.id, 'Player', { automated: false });
        const result = computeLoanConditions(agent, planet, 2);
        expect(result.annualInterestRate).toBeCloseTo(0.36);
    });

    it('reports existingLoans from assets.loans', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { existingLoans: 12345, lastMonthRevenue: 1 });
        const result = computeLoanConditions(agent, planet, TICKS_PER_MONTH);
        expect(result.existingLoans).toBe(12345);
    });
});
