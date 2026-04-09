import { beforeEach, describe, expect, it } from 'vitest';

import { TICKS_PER_MONTH } from '../constants';
import { makeAgent, makePlanet } from '../utils/testHelper';
import type { Agent, Planet } from './planet';
import { accumulateAgentMetrics } from './planet';

function nonAutomatedAgent(planetId = 'p'): Agent {
    return makeAgent('a1', planetId, 'Player', { automated: false, automateWorkerAllocation: false });
}

describe('accumulateAgentMetrics', () => {
    let planet: Planet;
    let agent: Agent;
    let agents: Map<string, Agent>;

    beforeEach(() => {
        planet = makePlanet();
        agent = nonAutomatedAgent(planet.id);
        agents = new Map([[agent.id, agent]]);
    });

    it('skips agents with no assets on the planet', () => {
        const other = nonAutomatedAgent('other-planet');
        const map = new Map([[other.id, other]]);
        expect(() => accumulateAgentMetrics(map, planet, 2)).not.toThrow();
    });

    it('snapshots monthAcc into lastMonthAcc at month boundary (tick % TICKS_PER_MONTH === 1)', () => {
        agent.assets[planet.id]!.monthAcc = {
            depositsAtMonthStart: 0,
            productionValue: 400,
            consumptionValue: 100,
            wages: 200,
            revenue: 600,
            purchases: 50,
            claimPayments: 30,
            totalWorkersTicks: 0,
        };

        accumulateAgentMetrics(agents, planet, TICKS_PER_MONTH + 1);

        const last = agent.assets[planet.id]!.lastMonthAcc;
        expect(last.productionValue).toBeCloseTo(400);
        expect(last.consumptionValue).toBeCloseTo(100);
        expect(last.wages).toBeCloseTo(200);
        expect(last.revenue).toBeCloseTo(600);
        expect(last.purchases).toBeCloseTo(50);
        expect(last.claimPayments).toBeCloseTo(30);
    });

    it('resets monthAcc to zero at month boundary, snapshotting depositsAtMonthStart', () => {
        agent.assets[planet.id]!.deposits = 1000;
        agent.assets[planet.id]!.monthAcc = {
            depositsAtMonthStart: 0,
            productionValue: 999,
            consumptionValue: 500,
            wages: 999,
            revenue: 999,
            purchases: 999,
            claimPayments: 999,
            totalWorkersTicks: 0,
        };

        accumulateAgentMetrics(agents, planet, TICKS_PER_MONTH + 1);

        const acc = agent.assets[planet.id]!.monthAcc;
        expect(acc.productionValue).toBeCloseTo(0);
        expect(acc.consumptionValue).toBeCloseTo(0);
        expect(acc.wages).toBeCloseTo(0);
        expect(acc.revenue).toBeCloseTo(0);
        expect(acc.purchases).toBeCloseTo(0);
        expect(acc.claimPayments).toBeCloseTo(0);
        expect(acc.depositsAtMonthStart).toBeCloseTo(1000);
    });
});
