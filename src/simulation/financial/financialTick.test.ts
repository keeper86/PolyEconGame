import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { automaticLoanRepayment, maturesLoans, preProductionFinancialTick } from './financialTick';

import { agentMap, makeAgent, makePlanetWithPopulation } from '../utils/testHelper';
import { makeLoan, totalOutstandingLoans } from './loanTypes';

describe('preProductionFinancialTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
    });

    it('does nothing when agent has no workers', () => {
        preProductionFinancialTick(agentMap(agent), planet);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
        expect(planet.bank!.loans).toBe(0);
    });
});

describe('postProductionFinancialTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.deposits = 0;
    });

    it('repays outstanding loans from firm deposits', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;

        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];

        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits).toBe(10_000);
    });

    it('bank equity stays non-negative after repayment', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.equity).toBeGreaterThanOrEqual(0);
    });
});

describe('money conservation', () => {});

describe('enforceLoanMaturities', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.bank!.loanRate = 0.05 / 360;
    });

    it('does nothing when there are no matured loans', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 361, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 100);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(100);
        expect(planet.bank!.loans).toBe(100);
    });

    it('repays matured loan from deposits when sufficient funds are available', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 100);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(agent.assets[planet.id]!.deposits).toBe(900);
        expect(planet.bank!.loans).toBe(0);
        expect(planet.bank!.deposits).toBe(900);
    });

    it('rolls over matured loan when deposits are insufficient (with 5% fee)', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 30;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 30;

        maturesLoans(agentMap(agent), planet, 100);

        expect(agent.assets[planet.id]!.deposits).toBe(0);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(70);

        expect(planet.bank!.loans).toBe(70);
        expect(planet.bank!.deposits).toBe(0);
    });

    it('preserves monetary conservation invariant after rollover with shortfall', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 50, true)];
        agent.assets[planet.id]!.deposits = 30;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 100;
        planet.bank!.householdDeposits = 70;

        maturesLoans(agentMap(agent), planet, 100);

        const firmDeposits = agent.assets[planet.id]!.deposits;
        const residual = planet.bank!.householdDeposits + firmDeposits - planet.bank!.loans;
        expect(Math.abs(residual)).toBeLessThan(1e-6);
    });

    it('handles multiple matured loans at once', () => {
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 50, 0.05, 1, 50, true),
            makeLoan('bufferCoverage', 30, 0.05, 10, 60, true),
            makeLoan('claimCoverage', 20, 0.05, 20, 200, true),
        ];
        agent.assets[planet.id]!.deposits = 100;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 100;

        maturesLoans(agentMap(agent), planet, 100);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(20);
        expect(agent.assets[planet.id]!.deposits).toBe(20);
        expect(planet.bank!.loans).toBe(20);
        expect(planet.bank!.deposits).toBe(20);
    });

    it('ignores loans with maturityTick = 0 (no fixed maturity)', () => {
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 100, 0.05, 1, 0, true)];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 1000);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(100);
        expect(planet.bank!.loans).toBe(100);
    });
});
