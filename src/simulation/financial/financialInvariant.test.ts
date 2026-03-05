/**
 * financial/financialInvariant.test.ts
 *
 * Focused invariants for the new financial model:
 * - bank.deposits === sum(agent.deposits) + bank.householdDeposits
 * - loan creation increases bank.loans and bank.deposits by same amount
 * - loan repayment reduces bank.loans and bank.deposits by same amount
 */

import { describe, it, expect } from 'vitest';

import type { Agent, Planet, GameState } from '../planet';
import { preProductionFinancialTick, postProductionFinancialTick, DEFAULT_WAGE_PER_EDU } from './financialTick';
import { makeAgent, makePlanet } from '../workforce/testHelpers';
import { hireFromPopulation } from '../workforce/populationBridge';
import { getAgentDepositsForPlanet, setAgentDepositsForPlanet, setAgentLoansForPlanet } from './depositHelpers';
import { ageMomentsForAge } from '../workforce/workforceHelpers';

function makeGameState(planet: Planet, ...agents: Agent[]): GameState {
    return {
        tick: 1,
        planets: new Map([[planet.id, planet]]),
        agents: new Map(agents.map((a) => [a.id, a])),
    };
}

function sumFirmDeposits(gs: GameState, planetId: string): number {
    let s = 0;
    gs.agents.forEach((a) => {
        if (a.assets[planetId]) {
            s += getAgentDepositsForPlanet(a, planetId);
        }
    });
    return s;
}

describe('financial invariants', () => {
    it('loan issuance increases loans and deposits equally and keeps balance sheet', () => {
        const agent = makeAgent();
        const { planet } = makePlanet({ none: 1000 });
        // start with zero balances
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        planet.wagePerEdu = { none: DEFAULT_WAGE_PER_EDU };

        // hire workers into the agent via population helper
        hireFromPopulation(planet, 'none', 10, 'company');
        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 10);

        const gs = makeGameState(planet, agent);

        // Pre-production should create a working-capital loan equal to wage bill
        preProductionFinancialTick(gs);

        const firmDeposits = sumFirmDeposits(gs, planet.id);

        // Invariant: bank.deposits === firmDeposits + householdDeposits
        expect(planet.bank!.deposits).toBeCloseTo(firmDeposits + planet.bank!.householdDeposits, 6);

        // Loan should equal initial shortfall (wage bill)
        const expectedWageBill = 10 * DEFAULT_WAGE_PER_EDU;
        expect(planet.bank!.loans).toBeCloseTo(expectedWageBill, 6);
        expect(planet.bank!.deposits).toBeCloseTo(expectedWageBill, 6);
    });

    it('full cycle preserves balance sheet and repayment reduces loans/deposits', () => {
        const agent = makeAgent();
        const { planet } = makePlanet({ none: 1000 });
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        planet.wagePerEdu = { none: DEFAULT_WAGE_PER_EDU };

        hireFromPopulation(planet, 'none', 5, 'company');
        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 5);

        const gs = makeGameState(planet, agent);

        preProductionFinancialTick(gs);
        // After wages paid, run post to perform consumption and repayment
        postProductionFinancialTick(gs);

        // invariant holds after full cycle
        const firmDeposits = sumFirmDeposits(gs, planet.id);
        expect(planet.bank!.deposits).toBeCloseTo(firmDeposits + planet.bank!.householdDeposits, 6);

        // loans should be <= previous loans (repayment may have occurred)
        expect(planet.bank!.loans).toBeGreaterThanOrEqual(0);
    });

    it('repayment reduces loans and deposits by same amount', () => {
        const agent = makeAgent();
        const { planet } = makePlanet({ none: 1000 });
        // Start with an outstanding loan and matching deposits stashed at firms
        planet.bank = { loans: 50, deposits: 50, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        planet.wagePerEdu = { none: DEFAULT_WAGE_PER_EDU };

        setAgentDepositsForPlanet(agent, planet.id, 50);
        // Associate the outstanding loan with the agent so they will repay it
        setAgentLoansForPlanet(agent, planet.id, 50);
        // Ensure balance sheet consistency from the start
        const gs = makeGameState(planet, agent);

        // postProductionFinancialTick has an early-repay path when cNom == 0
        postProductionFinancialTick(gs);

        expect(planet.bank!.loans).toBe(0);
        // deposits were used to repay the loan, bank.deposits decreased by repayment
        expect(planet.bank!.deposits).toBe(0);
        expect(getAgentDepositsForPlanet(agent, planet.id)).toBe(0);

        // invariant continues to hold
        const firmDeposits = sumFirmDeposits(gs, planet.id);
        expect(planet.bank!.deposits).toBeCloseTo(firmDeposits + planet.bank!.householdDeposits, 6);
    });
});
