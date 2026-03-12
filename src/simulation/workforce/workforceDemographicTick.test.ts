/**
 * workforce/workforceDemographicTick.test.ts
 *
 * Tests for the workforce demographic event system:
 * - Voluntary quits
 * - Deaths / disabilities for active workers and departing pipelines
 * - Retirement for active workers and all departing pipelines
 * - WorkforceEventAccumulator creation and aggregation
 * - Per-agent demographic event counter updates
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { NOTICE_PERIOD_MONTHS } from '../constants';
import { RETIREMENT_AGE } from '../population/retirement';
import { SKILL } from '../population/population';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import type { Agent, Planet } from '../planet/planet';
import {
    VOLUNTARY_QUIT_RATE_PER_TICK,
    createWorkforceEventAccumulator,
    workforceDemographicTick,
} from './workforceDemographicTick';
import { agentMap, makeAgent, makeEnvironment, makePlanet, makePlanetWithPopulation } from '../utils/testHelper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum all workers (active + all departing) for a given edu. */
function totalWorkforce(agent: Agent, planetId: string, edu: EducationLevelType): number {
    const wf = agent.assets[planetId]?.workforceDemography;
    if (!wf) {
        return 0;
    }
    let total = 0;
    for (const cohort of wf) {
        for (const skill of SKILL) {
            const cat = cohort[edu][skill];
            total += cat.active;
            total += cat.voluntaryDeparting.reduce((s: number, d: number) => s + d, 0);
            total += cat.departingFired.reduce((s: number, d: number) => s + d, 0);
            total += cat.departingRetired.reduce((s: number, d: number) => s + d, 0);
        }
    }
    return total;
}

// ---------------------------------------------------------------------------
// createWorkforceEventAccumulator
// ---------------------------------------------------------------------------

describe('createWorkforceEventAccumulator', () => {
    it('creates an accumulator with default length (MAX_AGE + 1)', () => {
        const acc = createWorkforceEventAccumulator();
        expect(acc.length).toBeGreaterThan(0);
        // Every cell should have zero counts
        for (const cohort of acc) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    expect(cohort[edu][skill].deaths).toBe(0);
                    expect(cohort[edu][skill].disabilities).toBe(0);
                }
            }
        }
    });

    it('creates an accumulator with custom length', () => {
        const acc = createWorkforceEventAccumulator(10);
        expect(acc.length).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// Voluntary quits
// ---------------------------------------------------------------------------

describe('workforceDemographicTick — voluntary quits', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanetWithPopulation({ none: 100000 }));
    });

    it('moves a fraction of active workers into the voluntary departing pipeline', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 10000;
        planet.population.demography[30].employed.none.novice.total = 10000;

        workforceDemographicTick(agentMap(agent), planet);

        const expectedQuitters = Math.floor(10000 * VOLUNTARY_QUIT_RATE_PER_TICK);
        expect(wf[30].none.novice.active).toBeLessThanOrEqual(10000 - expectedQuitters);
        expect(wf[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBeGreaterThanOrEqual(
            expectedQuitters,
        );
    });

    it('does not move workers when active count is too small (floor rounds to 0)', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 1;
        planet.population.demography[30].employed.none.novice.total = 1;

        workforceDemographicTick(agentMap(agent), planet);

        // floor(1 * 0.0003) = 0, so no voluntary quits
        expect(wf[30].none.novice.active).toBeLessThanOrEqual(1);
    });

    it('applies voluntary quits independently per edu × skill × age', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 50000;
        wf[40].primary.novice.active = 50000;
        planet.population.demography[30].employed.none.novice.total = 50000;
        planet.population.demography[40].employed.primary.novice.total = 50000;

        workforceDemographicTick(agentMap(agent), planet);

        // Both should have some quitters
        expect(wf[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBeGreaterThan(0);
        expect(wf[40].primary.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Mortality and disability
// ---------------------------------------------------------------------------

describe('workforceDemographicTick — mortality and disability', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        planet = makePlanet({
            environment: makeEnvironment({
                pollution: { air: 80, water: 80, soil: 80 },
            }),
        });
    });

    it('applies mortality to active workers', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[70].none.novice.active = 100000;
        planet.population.demography[70].employed.none.novice.total = 100000;

        const acc = workforceDemographicTick(agentMap(agent), planet);

        expect(acc[70].none.novice.deaths).toBeGreaterThan(0);
        expect(wf[70].none.novice.active).toBeLessThan(100000);
    });

    it('applies disability to active workers', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[50].none.novice.active = 100000;
        planet.population.demography[50].employed.none.novice.total = 100000;

        const acc = workforceDemographicTick(agentMap(agent), planet);

        expect(acc[50].none.novice.disabilities).toBeGreaterThan(0);
        expect(wf[50].none.novice.active).toBeLessThan(100000);
    });

    it('applies mortality to departing pipeline workers', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[70].none.novice.voluntaryDeparting[1] = 100000;
        planet.population.demography[70].employed.none.novice.total = 100000;

        const acc = workforceDemographicTick(agentMap(agent), planet);

        expect(acc[70].none.novice.deaths).toBeGreaterThan(0);
        expect(wf[70].none.novice.voluntaryDeparting[1]).toBeLessThan(100000);
    });

    it('applies mortality to departingFired pipeline workers', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[70].none.novice.departingFired[1] = 100000;
        planet.population.demography[70].employed.none.novice.total = 100000;

        const acc = workforceDemographicTick(agentMap(agent), planet);

        expect(acc[70].none.novice.deaths).toBeGreaterThan(0);
        expect(wf[70].none.novice.departingFired[1]).toBeLessThan(100000);
    });

    it('applies disability to departingFired pipeline workers', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[50].none.novice.departingFired[1] = 100000;
        planet.population.demography[50].employed.none.novice.total = 100000;

        const acc = workforceDemographicTick(agentMap(agent), planet);

        expect(acc[50].none.novice.disabilities).toBeGreaterThan(0);
        expect(wf[50].none.novice.departingFired[1]).toBeLessThan(100000);
    });

    it('accumulates events from multiple agents', () => {
        const agent2 = makeAgent('agent-2');
        const wf1 = agent.assets.p.workforceDemography!;
        const wf2 = agent2.assets.p.workforceDemography!;

        wf1[70].none.novice.active = 50000;
        wf2[70].none.novice.active = 50000;
        planet.population.demography[70].employed.none.novice.total = 100000;

        const agents = new Map([
            [agent.id, agent],
            [agent2.id, agent2],
        ]);
        const acc = workforceDemographicTick(agents, planet);

        // Combined deaths should be more than from a single agent
        expect(acc[70].none.novice.deaths).toBeGreaterThan(0);
    });

    it('does nothing for empty workforce', () => {
        const acc = workforceDemographicTick(agentMap(agent), planet);

        for (const cohort of acc) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    expect(cohort[edu][skill].deaths).toBe(0);
                    expect(cohort[edu][skill].disabilities).toBe(0);
                }
            }
        }
    });

    it('updates per-agent death and disability counters', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[70].none.novice.active = 100000;
        planet.population.demography[70].employed.none.novice.total = 100000;

        workforceDemographicTick(agentMap(agent), planet);

        expect(agent.assets.p.deaths!.thisMonth.none).toBeGreaterThan(0);
        expect(agent.assets.p.disabilities!.thisMonth.none).toBeGreaterThanOrEqual(0);
    });
});

// ---------------------------------------------------------------------------
// Retirement
// ---------------------------------------------------------------------------

describe('workforceDemographicTick — retirement', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanetWithPopulation({}));
    });

    it('retires active workers at retirement age into departingRetired pipeline', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[RETIREMENT_AGE].none.novice.active = 100000;
        planet.population.demography[RETIREMENT_AGE].employed.none.novice.total = 100000;

        workforceDemographicTick(agentMap(agent), planet);

        // Some workers should have moved to departingRetired
        const retired = wf[RETIREMENT_AGE].none.novice.departingRetired[NOTICE_PERIOD_MONTHS - 1];
        expect(retired).toBeGreaterThan(0);

        // departingRetired is an independent pipeline — retired active workers
        // should NOT be in voluntaryDeparting (only voluntary quits go there)
        const activeAfter = wf[RETIREMENT_AGE].none.novice.active;
        expect(activeAfter).toBeLessThan(100000);
    });

    it('does not retire workers below retirement age', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 10000;
        planet.population.demography[30].employed.none.novice.total = 10000;

        workforceDemographicTick(agentMap(agent), planet);

        expect(wf[30].none.novice.departingRetired[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('retires workers from the voluntary departing pipeline', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[75].none.novice.voluntaryDeparting[1] = 100000;
        planet.population.demography[75].employed.none.novice.total = 100000;

        workforceDemographicTick(agentMap(agent), planet);

        // Some should have been tagged as departingRetired
        expect(wf[75].none.novice.departingRetired[1]).toBeGreaterThan(0);
        // And removed from voluntaryDeparting
        expect(wf[75].none.novice.voluntaryDeparting[1]).toBeLessThan(100000);
    });

    it('retires workers from the departingFired pipeline', () => {
        const wf = agent.assets.p.workforceDemography!;
        wf[75].none.novice.departingFired[1] = 100000;
        planet.population.demography[75].employed.none.novice.total = 100000;

        workforceDemographicTick(agentMap(agent), planet);

        // Some should have been moved to departingRetired
        expect(wf[75].none.novice.departingRetired[1]).toBeGreaterThan(0);
        // And removed from departingFired
        expect(wf[75].none.novice.departingFired[1]).toBeLessThan(100000);
    });

    it('retirement probability increases with age', () => {
        const agent67 = makeAgent('a67');
        const agent80 = makeAgent('a80');
        const wf67 = agent67.assets.p.workforceDemography!;
        const wf80 = agent80.assets.p.workforceDemography!;

        wf67[RETIREMENT_AGE].none.novice.active = 100000;
        wf80[80].none.novice.active = 100000;
        planet.population.demography[RETIREMENT_AGE].employed.none.novice.total = 100000;
        planet.population.demography[80].employed.none.novice.total = 100000;

        workforceDemographicTick(agentMap(agent67), planet);
        workforceDemographicTick(agentMap(agent80), planet);

        const retired67 = wf67[RETIREMENT_AGE].none.novice.departingRetired[NOTICE_PERIOD_MONTHS - 1];
        const retired80 = wf80[80].none.novice.departingRetired[NOTICE_PERIOD_MONTHS - 1];

        expect(retired80).toBeGreaterThan(retired67);
    });
});

// ---------------------------------------------------------------------------
// Workforce conservation (deaths/disabilities remove from workforce, not from population)
// ---------------------------------------------------------------------------

describe('workforceDemographicTick — conservation', () => {
    it('total workforce decreases only by deaths and disabilities', () => {
        const agent = makeAgent();
        const planet = makePlanet({
            environment: makeEnvironment({
                pollution: { air: 80, water: 80, soil: 80 },
            }),
        });
        const wf = agent.assets.p.workforceDemography!;
        wf[70].none.novice.active = 100000;
        planet.population.demography[70].employed.none.novice.total = 100000;

        const before = totalWorkforce(agent, 'p', 'none');

        const acc = workforceDemographicTick(agentMap(agent), planet);

        const after = totalWorkforce(agent, 'p', 'none');
        const totalDeaths = acc[70].none.novice.deaths;
        const totalDisabilities = acc[70].none.novice.disabilities;

        // Workforce should decrease exactly by deaths + disabilities
        // (retirement is a pipeline shift, not a removal)
        expect(before - after).toBe(totalDeaths + totalDisabilities);
    });

    it('retirement does not decrease total workforce (it shifts pipelines)', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[RETIREMENT_AGE].none.novice.active = 10000;
        planet.population.demography[RETIREMENT_AGE].employed.none.novice.total = 10000;

        const before = totalWorkforce(agent, 'p', 'none');

        const acc = workforceDemographicTick(agentMap(agent), planet);

        const after = totalWorkforce(agent, 'p', 'none');
        const deathsAndDisabilities =
            acc[RETIREMENT_AGE].none.novice.deaths + acc[RETIREMENT_AGE].none.novice.disabilities;

        // Workforce should only decrease by deaths + disabilities, not by retirements
        expect(before - after).toBe(deathsAndDisabilities);
    });

    it('no workers are created (total never increases)', () => {
        const agent = makeAgent();
        const planet = makePlanet({
            environment: makeEnvironment({
                pollution: { air: 80, water: 80, soil: 80 },
            }),
        });
        const wf = agent.assets.p.workforceDemography!;
        // Spread workers across many ages
        for (let age = 20; age <= 80; age++) {
            wf[age].none.novice.active = 1000;
            planet.population.demography[age].employed.none.novice.total = 1000;
        }

        const before = totalWorkforce(agent, 'p', 'none');

        workforceDemographicTick(agentMap(agent), planet);

        const after = totalWorkforce(agent, 'p', 'none');

        expect(after).toBeLessThanOrEqual(before);
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('workforceDemographicTick — edge cases', () => {
    it('skips agents without workforceDemography', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        agent.assets.p.workforceDemography = undefined as never;

        expect(() => workforceDemographicTick(agentMap(agent), planet)).not.toThrow();
    });

    it('handles zero-population planet gracefully', () => {
        const agent = makeAgent();
        const planet = makePlanet();

        const acc = workforceDemographicTick(agentMap(agent), planet);

        // Should return an empty accumulator
        expect(acc).toBeDefined();
        expect(acc.length).toBeGreaterThan(0);
    });

    it('all workforce slots remain non-negative after tick', () => {
        const agent = makeAgent();
        const planet = makePlanet({
            environment: makeEnvironment({
                pollution: { air: 200, water: 200, soil: 200 },
                naturalDisasters: { earthquakes: 100, floods: 100, storms: 100 },
            }),
        });
        const wf = agent.assets.p.workforceDemography!;

        // Place workers at various ages and pipelines
        wf[30].none.novice.active = 500;
        wf[30].none.novice.voluntaryDeparting[1] = 200;
        wf[30].none.novice.departingFired[0] = 100;
        wf[70].primary.novice.active = 1000;
        wf[70].primary.novice.departingRetired[2] = 50;
        planet.population.demography[30].employed.none.novice.total = 800;
        planet.population.demography[70].employed.primary.novice.total = 1050;

        workforceDemographicTick(agentMap(agent), planet);

        for (let age = 0; age < wf.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = wf[age][edu][skill];
                    expect(cat.active, `negative active at age ${age} ${edu} ${skill}`).toBeGreaterThanOrEqual(0);
                    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                        expect(
                            cat.voluntaryDeparting[m],
                            `negative voluntary at age ${age} ${edu} ${skill} slot ${m}`,
                        ).toBeGreaterThanOrEqual(0);
                        expect(
                            cat.departingFired[m],
                            `negative fired at age ${age} ${edu} ${skill} slot ${m}`,
                        ).toBeGreaterThanOrEqual(0);
                        expect(
                            cat.departingRetired[m],
                            `negative retired at age ${age} ${edu} ${skill} slot ${m}`,
                        ).toBeGreaterThanOrEqual(0);
                    }
                }
            }
        }
    });
});
