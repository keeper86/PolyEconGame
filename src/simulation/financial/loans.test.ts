import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { agentMap, makeAgent, makePlanetWithPopulation } from '../utils/testHelper';

import { TICKS_PER_MONTH } from '../constants';

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
