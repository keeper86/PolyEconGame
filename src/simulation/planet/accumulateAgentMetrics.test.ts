import { beforeEach, describe, expect, it } from 'vitest';

import { TICKS_PER_MONTH } from '../constants';
import { makeAgent, makePlanet, makeProductionFacility } from '../utils/testHelper';
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

    it('skips automated agents', () => {
        agent.automated = true;
        agent.assets[planet.id]!.lastWageBill = 500;
        accumulateAgentMetrics(agents, planet, 2);
        expect(agent.assets[planet.id]!.monthAcc.wagesBill).toBe(0);
    });

    it('skips agents with no assets on the planet', () => {
        const other = nonAutomatedAgent('other-planet');
        const map = new Map([[other.id, other]]);
        // Should not throw and planet assets are unaffected
        expect(() => accumulateAgentMetrics(map, planet, 2)).not.toThrow();
    });

    it('accumulates wages from lastWageBill each tick', () => {
        agent.assets[planet.id]!.lastWageBill = 100;
        accumulateAgentMetrics(agents, planet, 2);
        accumulateAgentMetrics(agents, planet, 3);
        expect(agent.assets[planet.id]!.monthAcc.wagesBill).toBeCloseTo(200);
    });

    it('accumulates revenue from sell offers each tick', () => {
        agent.assets[planet.id]!.market = {
            sell: {
                wheat: {
                    resource: { name: 'wheat', form: 'solid', level: 'raw', volumePerQuantity: 1, massPerQuantity: 1 },
                    lastRevenue: 300,
                },
            },
            buy: {},
        };
        accumulateAgentMetrics(agents, planet, 2);
        expect(agent.assets[planet.id]!.monthAcc.revenueValue).toBeCloseTo(300);
    });

    it('accumulates production value using market prices', () => {
        planet.marketPrices.iron = 10;
        const facility = makeProductionFacility();
        facility.lastTickResults = { lastProduced: { iron: 50 } } as never;
        agent.assets[planet.id]!.productionFacilities = [facility];

        accumulateAgentMetrics(agents, planet, 2);
        expect(agent.assets[planet.id]!.monthAcc.productionValue).toBeCloseTo(500);
    });

    it('uses price 0 for unknown resources in production value', () => {
        const facility = makeProductionFacility();
        facility.lastTickResults = { lastProduced: { exotic: 100 } } as never;
        agent.assets[planet.id]!.productionFacilities = [facility];

        accumulateAgentMetrics(agents, planet, 2);
        expect(agent.assets[planet.id]!.monthAcc.productionValue).toBe(0);
    });

    it('snapshots monthAcc into lastMonthAcc at month boundary (tick % TICKS_PER_MONTH === 1)', () => {
        agent.assets[planet.id]!.monthAcc = {
            depositsAtMonthStart: 0,
            productionValue: 400,
            wagesBill: 200,
            revenueValue: 600,
            totalWorkersTicks: 0,
        };

        accumulateAgentMetrics(agents, planet, TICKS_PER_MONTH + 1);

        const last = agent.assets[planet.id]!.lastMonthAcc;
        expect(last.productionValue).toBeCloseTo(400);
        expect(last.wagesBill).toBeCloseTo(200);
        expect(last.revenueValue).toBeCloseTo(600);
    });

    it('resets monthAcc to zero at month boundary, snapshotting depositsAtMonthStart', () => {
        agent.assets[planet.id]!.deposits = 1000;
        agent.assets[planet.id]!.monthAcc = {
            depositsAtMonthStart: 0,
            productionValue: 999,
            wagesBill: 999,
            revenueValue: 999,
            totalWorkersTicks: 0,
        };

        accumulateAgentMetrics(agents, planet, TICKS_PER_MONTH + 1);

        const acc = agent.assets[planet.id]!.monthAcc;
        expect(acc.productionValue).toBeCloseTo(0);
        expect(acc.wagesBill).toBeCloseTo(0);
        expect(acc.revenueValue).toBeCloseTo(0);
        expect(acc.depositsAtMonthStart).toBeCloseTo(1000);
    });

    it('still accumulates wages/revenue in the same tick as the month reset', () => {
        agent.assets[planet.id]!.lastWageBill = 50;
        agent.assets[planet.id]!.market = {
            sell: {
                wheat: {
                    resource: { name: 'wheat', form: 'solid', level: 'raw', volumePerQuantity: 1, massPerQuantity: 1 },
                    lastRevenue: 80,
                },
            },
            buy: {},
        };

        accumulateAgentMetrics(agents, planet, TICKS_PER_MONTH + 1);

        const acc = agent.assets[planet.id]!.monthAcc;
        expect(acc.wagesBill).toBeCloseTo(50);
        expect(acc.revenueValue).toBeCloseTo(80);
    });

    it('accumulates across multiple ticks within a month', () => {
        agent.assets[planet.id]!.lastWageBill = 10;

        for (let t = 2; t <= 5; t++) {
            accumulateAgentMetrics(agents, planet, t);
        }

        expect(agent.assets[planet.id]!.monthAcc.wagesBill).toBeCloseTo(40);
    });
});
