import { describe, it, expect } from 'vitest';

import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';

import { syncWorkforceWithPopulation } from './workforceSync';
import { laborMarketTick } from './laborMarketTick';
import { makeAgent, makePlanetWithPopulation, sumActiveForEdu, agentMap, planetMap } from '../utils/testHelper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set deaths.countThisTick on the employed population at a given (age, edu).
 * The sync function reads from `demography[age].employed[edu][skill].deaths.countThisTick`.
 * We place the count on novice skill since the exact distribution doesn't matter.
 */
function setDeathsAtAge(
    planet: ReturnType<typeof makePlanetWithPopulation>['planet'],
    age: number,
    edu: string,
    count: number,
): void {
    const cat = (
        planet.population.demography[age] as Record<
            string,
            Record<string, Record<string, { deaths: { countThisTick: number }; total: number }>>
        >
    ).employed[edu].novice;
    cat.deaths.countThisTick = count;
}

function setDisabilitiesAtAge(
    planet: ReturnType<typeof makePlanetWithPopulation>['planet'],
    age: number,
    edu: string,
    count: number,
): void {
    const cat = (
        planet.population.demography[age] as Record<
            string,
            Record<string, Record<string, { disabilities: { countThisTick: number }; total: number }>>
        >
    ).employed[edu].novice;
    cat.disabilities.countThisTick = count;
}

function setRetirementsAtAge(
    planet: ReturnType<typeof makePlanetWithPopulation>['planet'],
    age: number,
    edu: string,
    count: number,
): void {
    const cat = (
        planet.population.demography[age] as Record<
            string,
            Record<string, Record<string, { retirements: { countThisTick: number }; total: number }>>
        >
    ).employed[edu].novice;
    cat.retirements.countThisTick = count;
}

/** Sum active workers across all ages/skills for a given edu directly from workforce. */
function totalActiveForEdu(
    wf: NonNullable<ReturnType<typeof makeAgent>['assets']['p']['workforceDemography']>,
    edu: string,
): number {
    let total = 0;
    for (let age = 0; age < wf.length; age++) {
        for (const skill of SKILL) {
            total += (wf[age] as Record<string, Record<string, { active: number }>>)[edu][skill].active;
        }
    }
    return total;
}

// ---------------------------------------------------------------------------
// syncWorkforceWithPopulation -- conservation
// ---------------------------------------------------------------------------

describe('syncWorkforceWithPopulation -- conservation', () => {
    it('removes exactly the right number of deaths from workforce', () => {
        const { planet } = makePlanetWithPopulation({ none: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 500;
        laborMarketTick(agentMap(agent), planetMap(planet));

        const wfBefore = sumActiveForEdu(agent, 'p', 'none');

        // Set deaths at age 30 for employed/none/novice
        setDeathsAtAge(planet, 30, 'none', 10);

        syncWorkforceWithPopulation(agentMap(agent), planet.id, planet.population, planet.environment);

        const wfAfter = sumActiveForEdu(agent, 'p', 'none');
        expect(wfAfter).toBe(wfBefore - 10);
    });

    it('removes exactly the right number of disabilities from workforce', () => {
        const { planet } = makePlanetWithPopulation({ primary: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.primary = 300;
        laborMarketTick(agentMap(agent), planetMap(planet));

        const wfBefore = sumActiveForEdu(agent, 'p', 'primary');

        setDisabilitiesAtAge(planet, 30, 'primary', 5);

        syncWorkforceWithPopulation(agentMap(agent), planet.id, planet.population, planet.environment);

        const wfAfter = sumActiveForEdu(agent, 'p', 'primary');
        expect(wfAfter).toBe(wfBefore - 5);
    });

    it('distributes deaths across multiple agents proportionally', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000 });
        const agent1 = makeAgent('agent-1');
        const agent2 = makeAgent('agent-2');

        // Manually place workers at age 30 so deaths at age 30 can fully apply
        const wf1 = agent1.assets.p.workforceDemography!;
        const wf2 = agent2.assets.p.workforceDemography!;
        wf1[30].none.novice.active = 300;
        wf2[30].none.novice.active = 700;
        planet.population.demography[30].employed.none.novice.total = 1000;

        const wf1Before = totalActiveForEdu(wf1, 'none');
        const wf2Before = totalActiveForEdu(wf2, 'none');

        setDeathsAtAge(planet, 30, 'none', 100);

        const agents = new Map([
            [agent1.id, agent1],
            [agent2.id, agent2],
        ]);

        syncWorkforceWithPopulation(agents, planet.id, planet.population, planet.environment);

        const wf1After = totalActiveForEdu(wf1, 'none');
        const wf2After = totalActiveForEdu(wf2, 'none');

        expect(wf1Before - wf1After + (wf2Before - wf2After)).toBe(100);

        const agent1Share = (wf1Before - wf1After) / 100;
        expect(agent1Share).toBeGreaterThan(0.15);
        expect(agent1Share).toBeLessThan(0.45);
    });

    it('never makes workforce counts negative during sync', () => {
        const { planet } = makePlanetWithPopulation({ none: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 10;
        laborMarketTick(agentMap(agent), planetMap(planet));

        // Set more deaths than workers exist at age 30
        setDeathsAtAge(planet, 30, 'none', 100);

        syncWorkforceWithPopulation(agentMap(agent), planet.id, planet.population, planet.environment);

        const wf = agent.assets.p.workforceDemography!;
        for (let age = 0; age < wf.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    expect(wf[age][edu][skill].active).toBeGreaterThanOrEqual(0);
                }
            }
        }
    });

    it('redistributes overflow when a cohort cannot absorb all assigned deaths', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000 });
        const agent1 = makeAgent('agent-1');
        const agent2 = makeAgent('agent-2');

        // Manually place workers at age 30
        const wf1 = agent1.assets.p.workforceDemography!;
        const wf2 = agent2.assets.p.workforceDemography!;
        wf1[30].none.novice.active = 5;
        wf2[30].none.novice.active = 500;
        planet.population.demography[30].employed.none.novice.total = 505;

        const wf1Before = totalActiveForEdu(wf1, 'none');
        const wf2Before = totalActiveForEdu(wf2, 'none');

        // Report deaths much larger than agent1's workforce
        setDeathsAtAge(planet, 30, 'none', 100);

        const agents = new Map([
            [agent1.id, agent1],
            [agent2.id, agent2],
        ]);

        syncWorkforceWithPopulation(agents, planet.id, planet.population, planet.environment);

        const wf1After = totalActiveForEdu(wf1, 'none');
        const wf2After = totalActiveForEdu(wf2, 'none');

        // Total removed must equal 100 (all deaths accounted for)
        expect(wf1Before - wf1After + (wf2Before - wf2After)).toBe(100);
    });

    it('removes all deaths even when concentrated in a single age cohort', () => {
        const { planet } = makePlanetWithPopulation({ none: 5000 });
        const agent = makeAgent();

        // Manually place workers: 197 at age 30, 3 at age 50
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 197;
        wf[50].none.novice.active = 3;
        planet.population.demography[30].employed.none.novice.total = 197;
        planet.population.demography[50].employed.none.novice.total = 3;

        const totalBefore = totalActiveForEdu(wf, 'none');

        // Report 10 deaths at age 30
        setDeathsAtAge(planet, 30, 'none', 10);

        syncWorkforceWithPopulation(agentMap(agent), planet.id, planet.population, planet.environment);

        const totalAfter = totalActiveForEdu(wf, 'none');
        // Exactly 10 deaths should be removed
        expect(totalBefore - totalAfter).toBe(10);
    });

    it('distributes deaths correctly when agents have workers in different edu levels', () => {
        // Regression: totalWorkersAtAge used all-edu headcounts to distribute
        // per-edu deaths, causing misallocation to agents without workers in
        // that edu level and silent removal shortfalls.
        const { planet } = makePlanetWithPopulation({ none: 10000, secondary: 10000 });
        const agent1 = makeAgent('agent-1');
        const agent2 = makeAgent('agent-2');

        const wf1 = agent1.assets.p.workforceDemography!;
        const wf2 = agent2.assets.p.workforceDemography!;

        // Agent 1 has 100 "none" workers at age 30, 0 "secondary"
        wf1[30].none.novice.active = 100;
        // Agent 2 has 0 "none" workers at age 30, 100 "secondary"
        wf2[30].secondary.novice.active = 100;

        planet.population.demography[30].employed.none.novice.total = 100;
        planet.population.demography[30].employed.secondary.novice.total = 100;

        // 10 deaths in edu=none at age 30 — should all come from agent1
        setDeathsAtAge(planet, 30, 'none', 10);

        const agents = new Map([
            [agent1.id, agent1],
            [agent2.id, agent2],
        ]);

        syncWorkforceWithPopulation(agents, planet.id, planet.population, planet.environment);

        const wf1NoneAfter = totalActiveForEdu(wf1, 'none');
        const wf2NoneAfter = totalActiveForEdu(wf2, 'none');

        // All 10 deaths should be removed from agent1 (the only one with none workers)
        expect(100 - wf1NoneAfter).toBe(10);
        // Agent2 should be untouched (has no none workers)
        expect(wf2NoneAfter).toBe(0);
        // Total none workers removed must equal 10
        expect(100 - wf1NoneAfter + 0 - wf2NoneAfter).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// syncWorkforceWithPopulation -- demographic event tracking
// ---------------------------------------------------------------------------

describe('syncWorkforceWithPopulation -- event tracking', () => {
    it('tracks deathsThisMonth on agent assets', () => {
        const { planet } = makePlanetWithPopulation({ none: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 500;
        laborMarketTick(agentMap(agent), planetMap(planet));

        setDeathsAtAge(planet, 30, 'none', 7);
        syncWorkforceWithPopulation(agentMap(agent), planet.id, planet.population, planet.environment);

        expect(agent.assets.p.deaths?.thisMonth.none).toBe(7);
    });

    it('tracks disabilitiesThisMonth on agent assets', () => {
        const { planet } = makePlanetWithPopulation({ primary: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.primary = 300;
        laborMarketTick(agentMap(agent), planetMap(planet));

        setDisabilitiesAtAge(planet, 30, 'primary', 3);
        syncWorkforceWithPopulation(agentMap(agent), planet.id, planet.population, planet.environment);

        expect(agent.assets.p.disabilities?.thisMonth.primary).toBe(3);
    });

    it('tracks retirementsThisMonth on agent assets', () => {
        const { planet } = makePlanetWithPopulation({ none: 5000 });
        const agent = makeAgent();

        // Manually place workers at age 67 where retirement happens
        const wf = agent.assets.p.workforceDemography!;
        wf[67].none.novice.active = 400;
        planet.population.demography[67].employed.none.novice.total = 400;

        setRetirementsAtAge(planet, 67, 'none', 12);
        syncWorkforceWithPopulation(agentMap(agent), planet.id, planet.population, planet.environment);

        expect(agent.assets.p.retirements?.thisMonth.none).toBe(12);
    });

    it('accumulates across multiple calls within same month', () => {
        const { planet } = makePlanetWithPopulation({ none: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 500;
        laborMarketTick(agentMap(agent), planetMap(planet));

        // First tick: 5 deaths at age 30
        setDeathsAtAge(planet, 30, 'none', 5);
        syncWorkforceWithPopulation(agentMap(agent), planet.id, planet.population, planet.environment);

        // Reset countThisTick for second call, set at different age
        planet.population.demography[30].employed.none.novice.deaths.countThisTick = 0;
        setDeathsAtAge(planet, 40, 'none', 3);
        syncWorkforceWithPopulation(agentMap(agent), planet.id, planet.population, planet.environment);

        expect(agent.assets.p.deaths?.thisMonth.none).toBe(8);
    });
});
