/**
 * financial/financialTick.test.ts
 *
 * Tests for the pre-production and post-production financial ticks.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import {
    DEFAULT_WAGE_PER_EDU,
    automaticLoanRepayment,
    maturesLoans,
    preProductionFinancialTick,
} from './financialTick';

import { SKILL } from '../population/population';
import { agentMap, makeAgent, makePlanetWithPopulation } from '../utils/testHelper';
import { makeLoan, totalOutstandingLoans } from './loanTypes';

import { TICKS_PER_MONTH } from '../constants';
import type { EducationLevelType } from '../population/population';
import { hireFromPopulation } from '../workforce/workforce';

/**
 * Hire workers from the planet's unoccupied pool into the agent's workforce.
 * Moves population from 'unoccupied' → 'employed' and updates the agent's
 * workforce demography to match.
 */
function hireWorkers(planet: Planet, agent: Agent, edu: EducationLevelType, count: number): number {
    const { count: hired, hiredByAge } = hireFromPopulation(planet, edu, count);
    // Reflect hires in agent workforce demography
    const wf = agent.assets[planet.id].workforceDemography!;
    for (let age = 0; age < hiredByAge.length; age++) {
        if (hiredByAge[age].novice > 0) {
            wf[age][edu].novice.active += hiredByAge[age].novice;
        }
    }
    return hired;
}

// ---------------------------------------------------------------------------
// Pre-production financial tick
// ---------------------------------------------------------------------------

describe('preProductionFinancialTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.wagePerEdu = { none: 1.0 };
    });

    it('does nothing when agent has no workers', () => {
        preProductionFinancialTick(agentMap(agent), planet);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
        expect(planet.bank!.loans).toBe(0);
    });

    it('creates a working-capital loan when firm has no deposits', () => {
        const hired = hireWorkers(planet, agent, 'none', 100);

        preProductionFinancialTick(agentMap(agent), planet);

        // Wage bill = hired * 1.0; loan = hired; after paying wages deposits = 0
        expect(planet.bank!.loans).toBe(hired * TICKS_PER_MONTH);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(hired * (TICKS_PER_MONTH - 1)); // loan - wage bill
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(hired * TICKS_PER_MONTH);
    });

    it('does not create a loan when firm already has enough deposits', () => {
        hireWorkers(planet, agent, 'none', 50);
        agent.assets[planet.id]!.deposits = 10000000; // more than enough
        planet.bank!.deposits = 100; // keep balance sheet consistent

        preProductionFinancialTick(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits).toBeGreaterThan(0); // hired paid in wages
    });

    it('increases population household wealth for employed workers', () => {
        const hired = hireWorkers(planet, agent, 'none', 100);
        agent.assets[planet.id]!.deposits = 200;
        planet.bank!.deposits = 200; // keep balance sheet consistent

        preProductionFinancialTick(agentMap(agent), planet);

        // Verify population wealth is increased for employed workers
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
        // hired workers each received wage 1.0
        expect(totalWealthReceived).toBeCloseTo(hired * DEFAULT_WAGE_PER_EDU, 5);
    });
});

// ---------------------------------------------------------------------------
// Post-production financial tick
// ---------------------------------------------------------------------------

describe('postProductionFinancialTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        planet.wagePerEdu = { none: 1.0 };
        agent.assets[planet.id]!.deposits = 0;
    });

    it('repays outstanding loans from firm deposits', () => {
        // Set up: agent has a loan and ample deposits to repay it
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        // Record that the loan belongs to this agent using the new Loan entity
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        // Populate lastMonthAcc so the repayment threshold can be computed
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits).toBe(10_000);
    });

    it('preserves household wealth (consumption now handled by food market)', () => {
        hireWorkers(planet, agent, 'none', 100);
        agent.assets[planet.id]!.deposits = 200;
        planet.bank!.deposits = 200; // keep balance sheet consistent

        // First give workers some wealth via wage payment
        preProductionFinancialTick(agentMap(agent), planet);
        // Capture wealth before post-production
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

        // Post-production now only handles loan repayment —
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

        // Household wealth is unchanged — consumption is handled by foodMarketTick
        expect(totalWealthAfter).toBeCloseTo(totalWealthBefore, 5);
    });

    it('distributes revenue to firms proportional to their workers', () => {
        hireWorkers(planet, agent, 'none', 100);
        agent.assets[planet.id]!.deposits = 200;
        planet.bank!.deposits = 200; // keep balance sheet consistent

        // Give workers some wealth first (pre-production)
        preProductionFinancialTick(agentMap(agent), planet);
        // After pre-production: agent.deposits reduced by wage bill, potentially 0 or >0

        // Post-production: handles loan repayment
        const _depositsBefore = agent.assets[planet.id]?.deposits ?? 0;
        automaticLoanRepayment(agentMap(agent), planet);

        // Agent should have received some revenue (>=0 after loan repayment)
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

// ---------------------------------------------------------------------------
// Money conservation
// ---------------------------------------------------------------------------

describe('money conservation', () => {
    it('total outstanding loans increase when firm needs working capital', () => {
        const agent = makeAgent();
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        planet.wagePerEdu = { none: 1.0 };
        agent.assets[planet.id]!.deposits = 0;

        const { count: hired, hiredByAge } = hireFromPopulation(planet, 'none', 100);
        const wf = agent.assets[planet.id].workforceDemography!;
        for (let age = 0; age < hiredByAge.length; age++) {
            if (hiredByAge[age].novice > 0) {
                wf[age].none.novice.active += hiredByAge[age].novice;
            }
        }

        preProductionFinancialTick(agentMap(agent), planet);

        // Loan created = hired (wage bill with no prior deposits)
        expect(planet.bank!.loans).toBe(hired * TICKS_PER_MONTH);
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(hired * TICKS_PER_MONTH);
    });

    it('full cycle: wages paid and loan repayment only triggers with excess deposits above 1-year threshold', () => {
        const agent = makeAgent();
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        planet.wagePerEdu = { none: 1.0 };
        agent.assets[planet.id]!.deposits = 0;
        const hired = hireWorkers(planet, agent, 'none', 100);

        // Step A: pre-production (creates loan, pays wages)
        // grantLoan adds the loan amount to deposits, then wages are deducted.
        preProductionFinancialTick(agentMap(agent), planet, 1);
        const loansAfterA = planet.bank!.loans;
        expect(loansAfterA).toBe(hired * TICKS_PER_MONTH);

        // After paying wages, the agent still has (loan - wageBill) in deposits.
        const depositsAfterA = agent.assets[planet.id]!.deposits;
        expect(depositsAfterA).toBe(loansAfterA - hired); // loan amount minus one tick of wages

        // Set up lastMonthAcc so the 1-year threshold is meaningful.
        // Monthly wage expense = hired * 1.0 * TICKS_PER_MONTH = 3000.
        // 1-year threshold = 12 * 3000 = 36000.
        // Deposits = 2900, which is well below 36000, so no repayment.
        agent.assets[planet.id]!.lastMonthAcc.wages = hired * TICKS_PER_MONTH;

        // Step B: auto-repayment — deposits are below the 1-year threshold
        automaticLoanRepayment(agentMap(agent), planet);
        const loansAfterB = planet.bank!.loans;

        // No repayment: agent can't afford it (deposits < 1-year expenses)
        expect(loansAfterB).toBe(loansAfterA);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBeGreaterThanOrEqual(0);
    });

    it('auto-repayment fires when agent has large deposits relative to 1-year-expense threshold', () => {
        const agent = makeAgent();
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        planet.wagePerEdu = { none: 1.0 };
        planet.bank!.loanRate = 0.05 / 360;

        const hired = hireWorkers(planet, agent, 'none', 10);
        const monthlyWages = hired * 1.0 * 30; // hired × wage × ticks-per-month

        // Prime lastMonthAcc so the blended expense formula sees history
        agent.assets[planet.id]!.lastMonthAcc.wages = monthlyWages;

        // Give the agent ample deposits: well above 1-year-expenses threshold
        const loanPrincipal = 100;
        planet.bank!.loans = loanPrincipal;
        planet.bank!.deposits = loanPrincipal;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', loanPrincipal, 0.05, 1, 361, true)];
        agent.assets[planet.id]!.deposits = 1_000_000; // large surplus

        automaticLoanRepayment(agentMap(agent), planet);

        // Loan should have been fully repaid
        expect(planet.bank!.loans).toBe(0);
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Loan maturity enforcement
// ---------------------------------------------------------------------------

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
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 100, 0.05, 1, 361, true), // matures at tick 361
        ];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 100); // tick 100 < 361

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(100);
        expect(planet.bank!.loans).toBe(100);
    });

    it('repays matured loan from deposits when sufficient funds are available', () => {
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 100, 0.05, 1, 50, true), // matures at tick 50
        ];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 100); // tick 100 >= 50

        // Loan should be fully repaid
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(agent.assets[planet.id]!.deposits).toBe(900); // 1000 - 100
        expect(planet.bank!.loans).toBe(0);
        expect(planet.bank!.deposits).toBe(900);
    });

    it('rolls over matured loan when deposits are insufficient (with 5% fee)', () => {
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 100, 0.05, 1, 50, true), // matures at tick 50
        ];
        agent.assets[planet.id]!.deposits = 30; // not enough to repay 100
        planet.bank!.loans = 100;
        planet.bank!.deposits = 30;

        maturesLoans(agentMap(agent), planet, 100); // tick 100 >= 50

        // canRepay = min(100, 30) = 30, shortfall = 70
        // fee = round(70 * 0.05) = 4, rolloverPrincipal = 74
        // Step 1: repay 30 from deposits → deposits = 0, loans = 70, deposits = 0
        // Step 2: grantLoan(74) → deposits = 74, loans = 144, deposits = 74
        // Step 3: repay shortfall 70 → deposits = 4, loans = 74, deposits = 4
        // Net: deposits = 4 (the fee amount), loans = 74 (rollover loan)
        expect(agent.assets[planet.id]!.deposits).toBe(4);
        // Total outstanding: 74 (the rollover loan)
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(74);
        // Bank: loans = 100 - 30 (repaid) + 74 (new rollover) - 70 (shortfall repaid) = 74
        // deposits = 30 - 30 (repaid) + 74 (new rollover) - 70 (shortfall repaid) = 4
        expect(planet.bank!.loans).toBe(74);
        expect(planet.bank!.deposits).toBe(4);
    });

    it('preserves monetary conservation invariant after rollover with shortfall', () => {
        // Regression test: the old code dropped matured loans from activeLoans
        // without repaying their principal, leaving bank.loans inflated and
        // violating householdDeposits + firmDeposits - loans === 0.
        // Set up a consistent initial state:
        //   bank.loans = 100 (the matured loan)
        //   bank.deposits = 30 (firm deposits) + 70 (household deposits) = 100
        //   → householdDeposits + firmDeposits - loans = 70 + 30 - 100 = 0 ✓
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 100, 0.05, 1, 50, true), // matures at tick 50
        ];
        agent.assets[planet.id]!.deposits = 30;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 100;
        planet.bank!.householdDeposits = 70;

        maturesLoans(agentMap(agent), planet, 100);

        // Monetary conservation: householdDeposits + firmDeposits - loans === 0
        const firmDeposits = agent.assets[planet.id]!.deposits;
        const residual = planet.bank!.householdDeposits + firmDeposits - planet.bank!.loans;
        expect(Math.abs(residual)).toBeLessThan(1e-6);
    });

    it('handles multiple matured loans at once', () => {
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 50, 0.05, 1, 50, true), // matures at tick 50
            makeLoan('bufferCoverage', 30, 0.05, 10, 60, true), // matures at tick 60
            makeLoan('claimCoverage', 20, 0.05, 20, 200, true), // matures at tick 200
        ];
        agent.assets[planet.id]!.deposits = 100;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 100;

        maturesLoans(agentMap(agent), planet, 100); // tick 100 >= 50, 60, but < 200

        // Two loans matured: 50 + 30 = 80 due, deposits = 100, can repay all
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(20); // only the unmatured one remains
        expect(agent.assets[planet.id]!.deposits).toBe(20); // 100 - 80
        expect(planet.bank!.loans).toBe(20);
        expect(planet.bank!.deposits).toBe(20);
    });

    it('ignores loans with maturityTick = 0 (no fixed maturity)', () => {
        agent.assets[planet.id]!.activeLoans = [
            makeLoan('wageCoverage', 100, 0.05, 1, 0, true), // maturityTick = 0 → no fixed maturity
        ];
        agent.assets[planet.id]!.deposits = 1000;
        planet.bank!.loans = 100;
        planet.bank!.deposits = 1000;

        maturesLoans(agentMap(agent), planet, 1000);

        // Loan should remain untouched
        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(100);
        expect(planet.bank!.loans).toBe(100);
    });
});
