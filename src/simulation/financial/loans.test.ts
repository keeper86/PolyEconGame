import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet, GameState } from '../planet';
import { preProductionFinancialTick, postProductionFinancialTick } from './financialTick';
import { makeAgent, makePlanet } from '../workforce/testHelpers';
import { getAgentLoansForPlanet, setAgentDepositsForPlanet, setAgentLoansForPlanet } from './depositHelpers';

function makeGameState(planet: Planet, ...agents: Agent[]): GameState {
    return {
        tick: 1,
        planets: new Map([[planet.id, planet]]),
        agents: new Map(agents.map((a) => [a.id, a])),
    };
}

describe('per-agent loan bookkeeping', () => {
    let agent: Agent;
    let planet: Planet;
    let gs: GameState;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanet({ none: 1000 }));
        planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
        gs = makeGameState(planet, agent);
    });

    it('records per-agent loan on issuance', () => {
        // hire 10 workers -> wage bill = 10 * default wage (1.0)
        agent.assets.p.workforceDemography![0].active.none = 10;

        preProductionFinancialTick(gs);

        const agentLoan = getAgentLoansForPlanet(agent, planet.id);
        expect(agentLoan).toBeCloseTo(10, 6);
        expect(planet.bank!.loans).toBeCloseTo(10, 6);
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
