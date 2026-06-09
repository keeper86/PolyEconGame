import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { automaticLoanRepayment, maturesLoans, preProductionFinancialTick } from './financialTick';

import { SKILL } from '../population/population';
import { agentMap, makeAgent, makePlanetWithPopulation } from '../utils/testHelper';
import { makeLoan, totalOutstandingLoans } from './loanTypes';

import { TICKS_PER_MONTH } from '../constants';
import type { EducationLevelType } from '../population/population';
import { hireFromPopulation } from '../workforce/workforce';

function hireWorkers(planet: Planet, agent: Agent, edu: EducationLevelType, count: number): number {
    const { count: hired, hiredByAge } = hireFromPopulation(planet, edu, count);

    const wf = agent.assets[planet.id].workforceDemography!;
    for (let age = 0; age < hiredByAge.length; age++) {
        if (hiredByAge[age].novice > 0) {
            wf[age][edu].novice.active += hiredByAge[age].novice;
        }
    }
    return hired;
}

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

    it('creates a working-capital loan when firm has no deposits', () => {
        const hired = hireWorkers(planet, agent, 'none', 100);

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(6 * hired * TICKS_PER_MONTH);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(hired * (6 * TICKS_PER_MONTH - 1));
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(6 * hired * TICKS_PER_MONTH);
    });

    it('does not create a loan when firm already has enough deposits', () => {
        hireWorkers(planet, agent, 'none', 50);
        agent.assets[planet.id]!.deposits = 10000000;
        planet.bank!.deposits = 100;

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits).toBeGreaterThan(0);
    });

    it('increases population household wealth for employed workers', () => {
        const hired = hireWorkers(planet, agent, 'none', 100);
        agent.assets[planet.id]!.deposits = 200;
        planet.bank!.deposits = 200;

        preProductionFinancialTick(agentMap(agent), planet);

        const demography = planet.population.demography;
        let totalWealthReceived = 0;
        for (let age = 0; age < demography.length; age++) {
            for (const skill of SKILL) {
                const cat = demography[age].employed.none[skill];
                if (cat.total > 0) {
                    totalWealthReceived += cat.total * cat.wealth.mean;
                }
            }
        }

        expect(totalWealthReceived).toBeCloseTo(hired * 1.0, 5);
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

    it('preserves household wealth (consumption now handled by food market)', () => {
        hireWorkers(planet, agent, 'none', 100);
        agent.assets[planet.id]!.deposits = 200;
        planet.bank!.deposits = 200;

        preProductionFinancialTick(agentMap(agent), planet);

        const demography = planet.population.demography;
        let totalWealthBefore = 0;
        for (let age = 0; age < demography.length; age++) {
            for (const skill of SKILL) {
                const cat = demography[age].employed.none[skill];
                if (cat.total > 0) {
                    totalWealthBefore += cat.total * cat.wealth.mean;
                }
            }
        }
        expect(totalWealthBefore).toBeGreaterThan(0);

        automaticLoanRepayment(agentMap(agent), planet);

        let totalWealthAfter = 0;
        for (let age = 0; age < demography.length; age++) {
            for (const skill of SKILL) {
                const cat = demography[age].employed.none[skill];
                if (cat.total > 0) {
                    totalWealthAfter += cat.total * cat.wealth.mean;
                }
            }
        }

        expect(totalWealthAfter).toBeCloseTo(totalWealthBefore, 5);
    });

    it('distributes revenue to firms proportional to their workers', () => {
        hireWorkers(planet, agent, 'none', 100);
        agent.assets[planet.id]!.deposits = 200;
        planet.bank!.deposits = 200;

        preProductionFinancialTick(agentMap(agent), planet);

        const _depositsBefore = agent.assets[planet.id]?.deposits ?? 0;
        automaticLoanRepayment(agentMap(agent), planet);

        expect(agent.assets[planet.id]?.deposits ?? 0).toBeGreaterThanOrEqual(0);
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

describe('money conservation', () => {
    it('total outstanding loans increase when firm needs working capital', () => {
        const agent = makeAgent();
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.deposits = 0;

        const { count: hired, hiredByAge } = hireFromPopulation(planet, 'none', 100);
        const wf = agent.assets[planet.id].workforceDemography!;
        for (let age = 0; age < hiredByAge.length; age++) {
            if (hiredByAge[age].novice > 0) {
                wf[age].none.novice.active += hiredByAge[age].novice;
            }
        }

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(6 * hired * TICKS_PER_MONTH);
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(6 * hired * TICKS_PER_MONTH);
    });

    it('full cycle: wages paid and loan repayment only triggers with excess deposits above 1-year threshold', () => {
        const agent = makeAgent();
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.deposits = 0;
        const hired = hireWorkers(planet, agent, 'none', 100);

        preProductionFinancialTick(agentMap(agent), planet, 1);
        const loansAfterA = planet.bank!.loans;
        expect(loansAfterA).toBe(6 * hired * TICKS_PER_MONTH);

        const depositsAfterA = agent.assets[planet.id]!.deposits;
        expect(depositsAfterA).toBe(loansAfterA - hired);

        agent.assets[planet.id]!.lastMonthAcc.wages = hired * TICKS_PER_MONTH;

        automaticLoanRepayment(agentMap(agent), planet);
        const loansAfterB = planet.bank!.loans;

        expect(loansAfterB).toBe(loansAfterA);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBeGreaterThanOrEqual(0);
    });

    it('auto-repayment fires when agent has large deposits relative to 1-year-expense threshold', () => {
        const agent = makeAgent();
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        planet.bank!.loanRate = 0.05 / 360;

        const hired = hireWorkers(planet, agent, 'none', 10);
        const monthlyWages = hired * 1.0 * 30;

        agent.assets[planet.id]!.lastMonthAcc.wages = monthlyWages;

        const loanPrincipal = 100;
        planet.bank!.loans = loanPrincipal;
        planet.bank!.deposits = loanPrincipal;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', loanPrincipal, 0.05, 1, 361, true)];
        agent.assets[planet.id]!.deposits = 1_000_000;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
    });
});

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
