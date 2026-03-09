import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet, GameState } from '../planet/planet';
import { preProductionFinancialTick, postProductionFinancialTick } from './financialTick';
import { getAgentLoansForPlanet, setAgentDepositsForPlanet, setAgentLoansForPlanet } from './depositHelpers';
import { makeAgent, makePlanetWithPopulation, makeGameState as makeGS } from '../utils/testHelper';
import { hireFromPopulation } from '../workforce/populationBridge';

function makeGameState(planet: Planet, ...agents: Agent[]): GameState {
    return makeGS(planet, agents, 1);
}

describe('per-agent loan bookkeeping', () => {
    let agent: Agent;
    let gov: Agent;
    let planet: Planet;
    let gs: GameState;

    beforeEach(() => {
        agent = makeAgent();
        const result = makePlanetWithPopulation({ none: 1000 });
        planet = result.planet;
        gov = result.gov;
        planet.wagePerEdu = { none: 1.0 };
        gs = makeGameState(planet, gov, agent);
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

        preProductionFinancialTick(gs);

        const agentLoan = getAgentLoansForPlanet(agent, planet.id);
        expect(agentLoan).toBeCloseTo(count, 6);
        expect(planet.bank!.loans).toBeCloseTo(count, 6);
    });

    it('agent repays only their own loan', () => {
        // Set up an outstanding loan owned by the agent and matching deposits
        planet.bank!.loans = 50;
        planet.bank!.deposits = 50;
        setAgentDepositsForPlanet(agent, planet.id, 50);
        setAgentLoansForPlanet(agent, planet.id, 50);

        // postProduction should trigger repayment even when cNom == 0
        postProductionFinancialTick(gs);

        expect(getAgentLoansForPlanet(agent, planet.id)).toBe(0);
        expect(planet.bank!.loans).toBe(0);
        expect(agent.assets[planet.id]?.deposits ?? 0).toBe(0);
    });
});
