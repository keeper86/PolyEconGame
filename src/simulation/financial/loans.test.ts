import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { agentMap, makeAgent, makePlanetWithPopulation } from '../utils/testHelper';

import { automaticLoanRepayment, preProductionFinancialTick } from './financialTick';
import { hireFromPopulation } from '../workforce/workforce';
import { makeLoan, totalOutstandingLoans } from './loanTypes';

describe('per-agent loan bookkeeping', () => {
    let agent: Agent;

    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        planet = makePlanetWithPopulation({ none: 1000 }).planet;
        planet.wagePerEdu = { none: 1.0 };
    });

    it('records per-agent loan on issuance', () => {
        // Hire 10 workers → wage bill = 10 * default wage (1.0)
        const { count, hiredByAge } = hireFromPopulation(planet, 'none', 10);

        // Reflect hires in agent workforce demography
        const wf = agent.assets[planet.id].workforceDemography!;
        for (let age = 0; age < hiredByAge.length; age++) {
            if (hiredByAge[age].novice > 0) {
                wf[age].none.novice.active += hiredByAge[age].novice;
            }
        }

        preProductionFinancialTick(agentMap(agent), planet);

        const agentLoan = totalOutstandingLoans(agent.assets[planet.id]!.activeLoans);
        expect(agentLoan).toBeCloseTo(count, 6);
        expect(planet.bank!.loans).toBeCloseTo(count, 6);
    });

    it('agent repays only their own loan', () => {
        // Set up an outstanding loan owned by the agent and matching deposits
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        // postProduction should trigger repayment even when cNom == 0
        automaticLoanRepayment(agentMap(agent), planet);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(10_000);
    });
});
