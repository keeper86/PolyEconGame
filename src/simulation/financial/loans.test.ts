import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { agentMap, makeAgent, makePlanetWithPopulation } from '../utils/testHelper';

import { TICKS_PER_MONTH } from '../constants';
import { hireFromPopulation } from '../workforce/workforce';
import { automaticLoanRepayment, preProductionFinancialTick } from './financialTick';
import { makeLoan, totalOutstandingLoans } from './loanTypes';

describe('per-agent loan bookkeeping', () => {
    let agent: Agent;

    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        planet = makePlanetWithPopulation({ none: 1000 }).planet;
        planet.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
        agent.assets[planet.id]!.wagePerEdu = { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 };
    });

    it('records per-agent loan on issuance', () => {
        const { count, hiredByAge } = hireFromPopulation(planet, 'none', 10);

        const wf = agent.assets[planet.id].workforceDemography!;
        for (let age = 0; age < hiredByAge.length; age++) {
            if (hiredByAge[age].novice > 0) {
                wf[age].none.novice.active += hiredByAge[age].novice;
            }
        }

        preProductionFinancialTick(agentMap(agent), planet);

        const agentLoan = totalOutstandingLoans(agent.assets[planet.id]!.activeLoans);
        expect(agentLoan).toBeCloseTo(6 * count * TICKS_PER_MONTH, 6);
        expect(planet.bank!.loans).toBeCloseTo(6 * count * TICKS_PER_MONTH, 6);
    });

    it('agent repays only their own loan', () => {
        planet.bank!.loans = 50;
        planet.bank!.deposits = 10_050;
        agent.assets[planet.id]!.deposits = 10_050;
        agent.assets[planet.id]!.activeLoans = [makeLoan('wageCoverage', 50, 0, 1, 361, true)];
        agent.assets[planet.id]!.lastMonthAcc.wages = 1;

        automaticLoanRepayment(agentMap(agent), planet);

        expect(totalOutstandingLoans(agent.assets[planet.id]!.activeLoans)).toBe(0);
        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(10_000);
    });
});
