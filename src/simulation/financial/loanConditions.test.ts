import { describe, expect, it } from 'vitest';

import {
    BANKRUPTCY_TRIGGER_MULTIPLE,
    LOAN_CASH_FLOW_MONTHS,
    LOAN_COLLATERAL_FACTOR,
    RECYCLER_BASE_RECOVERY_EFFICIENCY,
    STARTER_LOAN_AMOUNT,
} from '../constants';
import { calculateCostsForConstruction } from '../planet/facility';
import { createEmptyAccumulator, type Agent, type Planet } from '../planet/planet';
import { constructionServiceResourceType } from '../planet/services';
import { makeAgent, makeGameState, makePlanet, makeProductionFacility, makeStorageFacility } from '../utils/testHelper';
import { automaticLoanType, computeLoanConditions, grantAutomaticLoan } from './loanConditions';
import { hasOutstandingEmergencyLoan, makeLoan, totalOutstandingLoans } from './loanTypes';

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
    if (overrides?.existingLoans && overrides.existingLoans > 0) {
        assets.activeLoans = [makeLoan('discretionary', overrides.existingLoans, 0.05, 0, 360, true)];
    }
    assets.lastMonthAcc = {
        ...createEmptyAccumulator(),
        wages: overrides?.lastMonthWages ?? 0,
        revenue: overrides?.lastMonthRevenue ?? 0,
    };
    assets.monthAcc = {
        ...createEmptyAccumulator(),
        depositsAtMonthStart: 0,
        wages: overrides?.currentMonthWages ?? 0,
        revenue: overrides?.currentMonthRevenue ?? 0,
    };
    return a;
}

describe('computeLoanConditions', () => {
    it('grants STARTER_LOAN_AMOUNT to a brand-new agent (starterLoanTaken=false)', () => {
        const planet = makePlanet();
        const agent = makeAgent('a1', planet.id, 'Player', { automated: false });
        const result = computeLoanConditions(agent, planet);
        expect(result.isNewAgent).toBe(true);
        expect(result.maxLoanAmount).toBe(STARTER_LOAN_AMOUNT);
    });

    it('does NOT use starter path when starterLoanTaken=true', () => {
        const planet = makePlanet();
        const agent = makeAgent('a1', planet.id, 'Player', { automated: false, starterLoanTaken: true });
        const result = computeLoanConditions(agent, planet);
        expect(result.isNewAgent).toBe(false);
    });

    it('still uses starter path when agent has loans but starterLoanTaken=false', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { existingLoans: 1 });
        agent.starterLoanTaken = false;
        const result = computeLoanConditions(agent, planet);
        expect(result.isNewAgent).toBe(true);
    });

    it('at tick % TICKS_PER_MONTH === 0 (progress 0) uses 100% last month', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 1200, lastMonthWages: 0 });

        const result = computeLoanConditions(agent, planet);
        expect(result.lastMonthlyRevenue).toBeCloseTo(1200);
    });

    it('cash-flow positive limit is floored at 0 when existing loans exceed capacity', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, {
            lastMonthRevenue: 100,
            lastMonthWages: 0,
            existingLoans: 1_000_000,
        });
        const result = computeLoanConditions(agent, planet);
        expect(result.maxLoanAmount).toBe(0);
        expect(result.bankruptcyTrigger).toBe(BANKRUPTCY_TRIGGER_MULTIPLE * (STARTER_LOAN_AMOUNT + 6 * 100));
    });

    it('keeps the starter loan as a floor for maxLoanAmount when negative cash flow leaves headroom', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 0, lastMonthWages: 100, existingLoans: 1 });
        const result = computeLoanConditions(agent, planet);
        expect(result.maxLoanAmount).toBe(STARTER_LOAN_AMOUNT - 1);
    });

    it('cash-flow negative with storage: storageCollateral is computed but not included in maxLoanAmount', () => {
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

        const result = computeLoanConditions(agent, planet);
        const expectedCollateral = 100 * 10 * LOAN_COLLATERAL_FACTOR;
        expect(result.storageCollateral).toBeCloseTo(expectedCollateral);
        expect(result.maxLoanAmount).toBe(STARTER_LOAN_AMOUNT - 1);
    });

    it('storage collateral is computed but not added to credit limit for profitable agents', () => {
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

        const withoutStorage = computeLoanConditions(makeEstablishedAgent(planet, { lastMonthRevenue: 1000 }), planet);
        const withStorage = computeLoanConditions(agent, planet);

        const collateral = 50 * 20 * LOAN_COLLATERAL_FACTOR;
        expect(withStorage.storageCollateral).toBeCloseTo(collateral);
        expect(withStorage.maxLoanAmount).toBe(withoutStorage.maxLoanAmount);
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

        const result = computeLoanConditions(agent, planet);
        expect(result.storageCollateral).toBe(0);
    });

    it('reports annualInterestRate as bank.loanRatePerYear', () => {
        const planet = makePlanet();
        planet.bank.loanRatePerYear = 0.001;
        const agent = makeAgent('a1', planet.id, 'Player', { automated: false });
        const result = computeLoanConditions(agent, planet);
        expect(result.annualInterestRate).toBeCloseTo(0.001);
    });

    it('reports existingLoans from activeLoans', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { existingLoans: 12345, lastMonthRevenue: 1 });
        const result = computeLoanConditions(agent, planet);
        expect(result.existingLoans).toBe(12345);
    });

    it('computes the bankruptcy trigger as the multiple of total lending capacity', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, {
            lastMonthRevenue: 100,
            lastMonthWages: 50,
            existingLoans: 12345,
        });
        const result = computeLoanConditions(agent, planet);
        expect(result.bankruptcyTrigger).toBe(
            Math.floor(BANKRUPTCY_TRIGGER_MULTIPLE * (STARTER_LOAN_AMOUNT + LOAN_CASH_FLOW_MONTHS * 50)),
        );
    });

    it('keeps the bankruptcy trigger independent of existing loans', () => {
        const planet = makePlanet();
        const lightDebt = makeEstablishedAgent(planet, { existingLoans: 1000 });
        const heavyDebt = makeEstablishedAgent(planet, { existingLoans: 50_000_000 });
        expect(computeLoanConditions(lightDebt, planet).bankruptcyTrigger).toBe(
            computeLoanConditions(heavyDebt, planet).bankruptcyTrigger,
        );
        expect(computeLoanConditions(heavyDebt, planet).bankruptcyTrigger).toBe(
            BANKRUPTCY_TRIGGER_MULTIPLE * STARTER_LOAN_AMOUNT,
        );
    });

    it('classifies an automatic loan within loan conditions as its purpose', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 1000, lastMonthWages: 0 });
        const conditions = computeLoanConditions(agent, planet);
        expect(automaticLoanType(conditions, 10_000, 'wageCoverage')).toBe('wageCoverage');
    });

    it('classifies an automatic loan beyond loan conditions as emergency', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 1000, lastMonthWages: 0 });
        const conditions = computeLoanConditions(agent, planet);
        expect(automaticLoanType(conditions, conditions.maxLoanAmount * 10, 'wageCoverage')).toBe('emergency');
    });

    it('grantAutomaticLoan grants the purpose type within conditions and records no emergency', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 1000, lastMonthWages: 0 });
        const gameState = makeGameState([planet], [agent]);
        const result = grantAutomaticLoan(gameState, agent, planet, 10_000, 'wageCoverage', 1);
        expect(result.kind).toBe('granted');
        if (result.kind === 'granted') {
            expect(result.loan.type).toBe('wageCoverage');
        }
        expect(hasOutstandingEmergencyLoan(agent.assets[planet.id].activeLoans)).toBe(false);
        expect(planet.bank.emergencyLoansGranted).toBe(0);
    });

    it('grantAutomaticLoan grants an emergency loan beyond conditions and records it', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 1000, lastMonthWages: 0 });
        const gameState = makeGameState([planet], [agent]);
        const result = grantAutomaticLoan(gameState, agent, planet, 100_000_000, 'bufferCoverage', 1);
        expect(result.kind).toBe('granted');
        if (result.kind === 'granted') {
            expect(result.loan.type).toBe('emergency');
        }
        expect(hasOutstandingEmergencyLoan(agent.assets[planet.id].activeLoans)).toBe(true);
        expect(totalOutstandingLoans(agent.assets[planet.id].activeLoans)).toBe(100_000_000);
        expect(planet.bank.emergencyLoansGranted).toBe(1);
    });

    it('grantAutomaticLoan declares bankruptcy when an emergency loan breaches the trigger', () => {
        const planet = makePlanet();
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 0, lastMonthWages: 0 });
        agent.assets[planet.id].activeLoans = [makeLoan('emergency', 20_000_000, 0.05, 1, 361, true)];
        planet.bank.loans = 20_000_000;
        planet.bank.deposits = 20_000_000;
        const gameState = makeGameState([planet], [agent]);
        const result = grantAutomaticLoan(gameState, agent, planet, 100_000, 'bufferCoverage', 1);
        expect(result.kind).toBe('bankrupt');
        expect(planet.bank.bankruptcies).toBe(1);
    });

    it('uses market price for construction services when the cost floor is not yet populated', () => {
        const planet = makePlanet();
        planet.lastProductionCostFloors = {};
        planet.marketPrices[constructionServiceResourceType.name] = 100;
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 0, lastMonthWages: 0, existingLoans: 1 });
        agent.assets[planet.id]!.productionFacilities = [
            makeProductionFacility(undefined, { maxScale: 1, scale: 1, construction: null }),
        ];

        const result = computeLoanConditions(agent, planet);

        const csPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
        const completedCS = calculateCostsForConstruction('raw', 0, 1).cost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
        expect(result.facilitiesCollateral).toBe(Math.floor(completedCS * csPrice * LOAN_COLLATERAL_FACTOR));
    });

    it('caps construction service price at 2× the cost floor', () => {
        const planet = makePlanet();
        planet.marketPrices[constructionServiceResourceType.name] = 1000;
        planet.lastProductionCostFloors[constructionServiceResourceType.name] = 1;
        const agent = makeEstablishedAgent(planet, { lastMonthRevenue: 0, lastMonthWages: 0, existingLoans: 1 });
        agent.assets[planet.id]!.productionFacilities = [
            makeProductionFacility(undefined, { maxScale: 1, scale: 1, construction: null }),
        ];

        const result = computeLoanConditions(agent, planet);

        const csPrice = 2 * planet.lastProductionCostFloors[constructionServiceResourceType.name];
        const completedCS = calculateCostsForConstruction('raw', 0, 1).cost * RECYCLER_BASE_RECOVERY_EFFICIENCY;
        expect(result.facilitiesCollateral).toBe(Math.floor(completedCS * csPrice * LOAN_COLLATERAL_FACTOR));
    });
});
