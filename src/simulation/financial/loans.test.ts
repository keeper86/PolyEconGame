import { beforeEach, describe, expect, it } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { agentMap, makeAgent, makePlanetWithPopulation } from '../utils/testHelper';
import { hireFromPopulation } from '../workforce/populationBridge';

import { postProductionFinancialTick, preProductionFinancialTick } from './financialTick';

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
        const { count, hiredByAge } = hireFromPopulation(planet, 'none', 'novice', 10);

        // Reflect hires in agent workforce demography
        const wf = agent.assets[planet.id].workforceDemography!;
        for (let age = 0; age < hiredByAge.length; age++) {
            if (hiredByAge[age] > 0) {
                wf[age].none.novice.active += hiredByAge[age];
            }
        }

        preProductionFinancialTick(agentMap(agent), planet);

        const agentLoan = agent.assets[planet.id]!.loans ?? 0;
        expect(agentLoan).toBeCloseTo(count, 6);
        expect(planet.bank!.loans).toBeCloseTo(count, 6);
    });

    it('agent repays only their own loan', () => {
        // Set up an outstanding loan owned by the agent and matching deposits
        planet.bank!.loans = 50;
        planet.bank!.deposits = 50;
        agent.assets[planet.id]!.deposits = 50;
        agent.assets[planet.id]!.loans = 50;

        // postProduction should trigger repayment even when cNom == 0
        postProductionFinancialTick(agentMap(agent), planet);

        expect(agent.assets[planet.id]?.loans).toBe(0);
        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
    });
});
