import { beforeEach, describe, expect, it } from 'vitest';

import { NOTICE_PERIOD_MONTHS, TICKS_PER_MONTH } from '../constants';
import { seedRng } from '../engine';
import type { Agent, Planet } from '../planet/planet';
import { populationTick } from '../population/populationTick';
import { RETIREMENT_AGE } from '../population/retirement';
import { assertAllNonNegative, assertWorkforcePopulationConsistency } from '../utils/testAssertions';
import { agentMap, makeAgent, makeEnvironment, makePlanet, sumPopOcc, sumWorkforceForEdu } from '../utils/testHelper';
import { postProductionLaborMarketTick } from './laborMarketMonthTick';
import { workforceDemographicTick } from './workforceDemographicTick';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run one full simulation tick (demographic events + population application). */
function runOneTick(agents: Map<string, Agent>, planet: Planet): void {
    const workforceEvents = workforceDemographicTick(agents, planet);
    populationTick(planet, workforceEvents);
}

/** Run one month boundary: drain pipeline slot 0 and shift pipelines. */
function runMonthBoundary(agents: Map<string, Agent>, planet: Planet): void {
    postProductionLaborMarketTick(agents, planet);
}

/**
 * Place `count` employed workers at a given age for one agent.
 * Sets both the workforce (active) and the population (employed) in sync.
 */
function placeEmployedWorkers(
    agent: Agent,
    planet: Planet,
    age: number,
    count: number,
    edu: 'none' | 'primary' | 'secondary' | 'tertiary' = 'none',
    skill: 'novice' | 'professional' | 'expert' = 'novice',
): void {
    agent.assets[planet.id].workforceDemography![age][edu][skill].active = count;
    planet.population.demography[age].employed[edu][skill].total = count;
}

// ---------------------------------------------------------------------------
// Single-tick consistency: workforce demographic tick + population tick
// ---------------------------------------------------------------------------

describe('workforceDemographicTick + populationTick — single tick consistency', () => {
    let agent: Agent;
    let planet: Planet;
    let agents: Map<string, Agent>;

    beforeEach(() => {
        seedRng(42);
        agent = makeAgent();
        planet = makePlanet();
        agents = agentMap(agent);
    });

    it('maintains consistency for young workers (no retirement)', () => {
        placeEmployedWorkers(agent, planet, 30, 10000);

        runOneTick(agents, planet);

        assertWorkforcePopulationConsistency(planet, [agent], 'after 1 tick, age 30');
    });

    it('maintains consistency for workers at retirement age', () => {
        placeEmployedWorkers(agent, planet, RETIREMENT_AGE, 10000);

        runOneTick(agents, planet);

        assertWorkforcePopulationConsistency(planet, [agent], 'after 1 tick, retirement age');
    });

    it('maintains consistency for very old workers (age 83)', () => {
        placeEmployedWorkers(agent, planet, 83, 10000);

        runOneTick(agents, planet);

        assertWorkforcePopulationConsistency(planet, [agent], 'after 1 tick, age 83');
    });

    it('maintains consistency for very old workers over 10 ticks', () => {
        placeEmployedWorkers(agent, planet, 83, 10000);

        for (let t = 0; t < 10; t++) {
            runOneTick(agents, planet);
            assertWorkforcePopulationConsistency(planet, [agent], `tick ${t + 1}, age 83`);
        }
    });

    it('maintains consistency for workers at extreme age (95) over 10 ticks', () => {
        placeEmployedWorkers(agent, planet, 95, 5000);

        for (let t = 0; t < 10; t++) {
            runOneTick(agents, planet);
            assertWorkforcePopulationConsistency(planet, [agent], `tick ${t + 1}, age 95`);
        }
    });
});

// ---------------------------------------------------------------------------
// Multi-tick consistency with month boundaries
// ---------------------------------------------------------------------------

describe('workforceDemographicTick + populationTick + postProductionLaborMarketTick — month boundary', () => {
    let agent: Agent;
    let planet: Planet;
    let agents: Map<string, Agent>;

    beforeEach(() => {
        seedRng(42);
        agent = makeAgent();
        planet = makePlanet();
        agents = agentMap(agent);
    });

    it('maintains consistency through one full month + boundary for age 83 workers', () => {
        placeEmployedWorkers(agent, planet, 83, 10000);

        // Run TICKS_PER_MONTH ticks
        for (let t = 0; t < TICKS_PER_MONTH; t++) {
            runOneTick(agents, planet);
            assertWorkforcePopulationConsistency(planet, [agent], `tick ${t + 1} before month boundary`);
        }

        // Month boundary
        runMonthBoundary(agents, planet);
        assertWorkforcePopulationConsistency(planet, [agent], 'after 1st month boundary');
        assertAllNonNegative(planet, [agent]);
    });

    it('maintains consistency through 3 months + boundaries for age 83 workers', () => {
        placeEmployedWorkers(agent, planet, 83, 10000);

        for (let month = 0; month < 3; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                runOneTick(agents, planet);
                assertWorkforcePopulationConsistency(planet, [agent], `month ${month}, tick ${t + 1}`);
            }
            runMonthBoundary(agents, planet);
            assertWorkforcePopulationConsistency(planet, [agent], `after month ${month} boundary`);
            assertAllNonNegative(planet, [agent]);
        }
    });

    it('maintains consistency through NOTICE_PERIOD_MONTHS+1 months for age 83 workers', () => {
        // This is critical: departingRetired[2] workers need to drain
        // through slot 0 after NOTICE_PERIOD_MONTHS shifts.
        placeEmployedWorkers(agent, planet, 83, 10000);

        for (let month = 0; month < NOTICE_PERIOD_MONTHS + 1; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                runOneTick(agents, planet);
                assertWorkforcePopulationConsistency(planet, [agent], `month ${month}, tick ${t + 1}`);
            }
            runMonthBoundary(agents, planet);
            assertWorkforcePopulationConsistency(planet, [agent], `after month ${month} boundary`);
        }
    });

    it('departingRetired[0] drains correctly for age 80 workers with high pollution', () => {
        // High pollution → more deaths/disabilities → more chance of mismatch
        planet = makePlanet({
            environment: makeEnvironment({
                pollution: { air: 80, water: 80, soil: 80 },
            }),
        });
        agents = agentMap(agent);
        placeEmployedWorkers(agent, planet, 80, 50000, 'secondary');

        for (let month = 0; month < NOTICE_PERIOD_MONTHS + 1; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                runOneTick(agents, planet);
                assertWorkforcePopulationConsistency(
                    planet,
                    [agent],
                    `month ${month}, tick ${t + 1}, secondary age 80 high pollution`,
                );
            }
            runMonthBoundary(agents, planet);
            assertWorkforcePopulationConsistency(
                planet,
                [agent],
                `after month ${month} boundary, secondary age 80 high pollution`,
            );
        }
    });

    it('multiple education levels at various ages maintain consistency', () => {
        placeEmployedWorkers(agent, planet, 70, 5000, 'none');
        placeEmployedWorkers(agent, planet, 75, 5000, 'primary');
        placeEmployedWorkers(agent, planet, 80, 5000, 'secondary');
        placeEmployedWorkers(agent, planet, 85, 5000, 'tertiary');

        for (let month = 0; month < NOTICE_PERIOD_MONTHS + 1; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                runOneTick(agents, planet);
                assertWorkforcePopulationConsistency(planet, [agent], `month ${month}, tick ${t + 1}, multi-edu`);
            }
            runMonthBoundary(agents, planet);
            assertWorkforcePopulationConsistency(planet, [agent], `after month ${month} boundary, multi-edu`);
        }
    });

    it('two agents sharing workforce maintain consistency with month boundaries', () => {
        const agent2 = makeAgent('agent-2');
        agents = new Map([
            [agent.id, agent],
            [agent2.id, agent2],
        ]);

        // Both agents have workers at age 83
        agent.assets.p.workforceDemography![83].secondary.novice.active = 5000;
        agent2.assets.p.workforceDemography![83].secondary.novice.active = 5000;
        planet.population.demography[83].employed.secondary.novice.total = 10000;

        for (let month = 0; month < NOTICE_PERIOD_MONTHS + 1; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                runOneTick(agents, planet);
                assertWorkforcePopulationConsistency(
                    planet,
                    [agent, agent2],
                    `month ${month}, tick ${t + 1}, two agents`,
                );
            }
            runMonthBoundary(agents, planet);
            assertWorkforcePopulationConsistency(planet, [agent, agent2], `after month ${month} boundary, two agents`);
        }
    });
});

// ---------------------------------------------------------------------------
// Targeted retirement pipeline drain test
// ---------------------------------------------------------------------------

describe('workforceDemographicTick — retirement pipeline drain verification', () => {
    it('departingRetired[0] never exceeds population employed at drain time', () => {
        seedRng(42);
        const agent = makeAgent();
        const planet = makePlanet();
        const agents = agentMap(agent);

        placeEmployedWorkers(agent, planet, 83, 10000);

        for (let month = 0; month < NOTICE_PERIOD_MONTHS + 2; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                runOneTick(agents, planet);
            }

            const popEmployed = sumPopOcc(planet, 'none', 'employed');
            const wfTotal = sumWorkforceForEdu(agent, 'p', 'none');

            // Workforce should match population before drain
            expect(wfTotal).toBe(popEmployed);

            runMonthBoundary(agents, planet);
            assertWorkforcePopulationConsistency(planet, [agent], `after month ${month} boundary`);
        }
    });
});
