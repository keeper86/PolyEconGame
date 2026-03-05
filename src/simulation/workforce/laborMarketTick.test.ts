import { describe, it, expect, beforeEach } from 'vitest';

import { MIN_EMPLOYABLE_AGE } from '../constants';
import type { Agent, Planet } from '../planet';

import { laborMarketTick } from './laborMarketTick';
import {
    makeAgent,
    makeStorageFacility,
    makePlanet,
    totalPopulation,
    sumPopOcc,
    assertTotalPopulationConserved,
    assertWorkforcePopulationConsistency,
} from './testHelpers';
import {
    createWorkforceDemography,
    VOLUNTARY_QUIT_RATE_PER_TICK,
    NOTICE_PERIOD_MONTHS,
    totalActiveForEdu,
    totalDepartingForEdu,
    ageMomentsForAge,
    emptyAgeMoments,
} from './workforceHelpers';

// ---------------------------------------------------------------------------
// laborMarketTick — basic behaviour
// ---------------------------------------------------------------------------

describe('laborMarketTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanet());
    });

    it('does nothing when workforceDemography is absent', () => {
        agent.assets.p.workforceDemography = undefined;
        expect(() => laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]))).not.toThrow();
    });

    it('moves a fraction of active workers into the departing pipeline', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].active.none = ageMomentsForAge(30, 10000);

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const expectedQuitters = Math.floor(10000 * VOLUNTARY_QUIT_RATE_PER_TICK);
        expect(workforce[0].active.none.count).toBe(10000 - expectedQuitters);
        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1].count).toBe(expectedQuitters);
    });

    it('does not move workers when count is too small to yield floor > 0', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].active.none = ageMomentsForAge(30, 1); // floor(1 * 0.0001) = 0

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        expect(workforce[0].active.none.count).toBe(1);
        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1].count).toBe(0);
    });

    it('hires workers from unoccupied pool when under target', () => {
        ({ planet } = makePlanet({ primary: 1000 }));
        agent.assets.p.allocatedWorkers.primary = 500;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const workforce = agent.assets.p.workforceDemography!;
        const hired = workforce[0].active.primary.count;
        expect(hired).toBe(500);
    });

    it('does not hire when already at target', () => {
        ({ planet } = makePlanet({ none: 5000 }));
        agent.assets.p.allocatedWorkers.none = 100;
        agent.assets.p.workforceDemography![0].active.none = ageMomentsForAge(30, 100);

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const workforce = agent.assets.p.workforceDemography!;
        const totalActive = workforce.reduce((sum, c) => sum + c.active.none.count, 0);
        expect(totalActive).toBe(100);
    });

    it('does not hire more than available unoccupied workers', () => {
        ({ planet } = makePlanet({ none: 5 }));
        agent.assets.p.allocatedWorkers.none = 1000;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const workforce = agent.assets.p.workforceDemography!;
        const hired = workforce[0].active.none.count;
        expect(hired).toBeLessThanOrEqual(5);
    });

    it('does not hire people under the minimum employable age', () => {
        ({ planet } = makePlanet());
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            planet.population.demography[age].none.unoccupied = 100;
        }
        agent.assets.p.allocatedWorkers.none = 500;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const workforce = agent.assets.p.workforceDemography!;
        const hired = workforce[0].active.none.count;
        expect(hired).toBe(0);

        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            expect(planet.population.demography[age].none.unoccupied).toBe(100);
        }
    });

    it('fills positions instantly in a single tick', () => {
        ({ planet } = makePlanet({ primary: 100000 }));
        agent.assets.p.allocatedWorkers.primary = 3000;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const workforce = agent.assets.p.workforceDemography!;
        const totalActive = workforce.reduce((sum, c) => sum + c.active.primary.count, 0);
        expect(totalActive).toBe(3000);
    });

    it('multiple agents cannot hire more workers than available on the planet', () => {
        ({ planet } = makePlanet({ none: 1000 }));

        const agentA = makeAgent();
        const agentB = makeAgent('agent-2');

        agentA.assets.p.allocatedWorkers.none = 800;
        agentB.assets.p.allocatedWorkers.none = 800;

        laborMarketTick(
            new Map([
                [agentA.id, agentA],
                [agentB.id, agentB],
            ]),
            new Map([[planet.id, planet]]),
        );

        const hiredA = agentA.assets.p.workforceDemography!.reduce((s, c) => s + c.active.none.count, 0);
        const hiredB = agentB.assets.p.workforceDemography!.reduce((s, c) => s + c.active.none.count, 0);
        const totalHired = hiredA + hiredB;

        expect(totalHired).toBeLessThanOrEqual(1000);

        let unoccupiedAfter = 0;
        for (const cohort of planet.population.demography) {
            unoccupiedAfter += cohort.none.unoccupied;
        }
        expect(1000 - unoccupiedAfter).toBe(totalHired);
    });
});

// ---------------------------------------------------------------------------
// hiredThisTick / firedThisTick counters
// ---------------------------------------------------------------------------

describe('hiredThisTick / firedThisTick counters', () => {
    it('records hired workers per education level', () => {
        const { planet } = makePlanet({ primary: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.primary = 500;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        expect(agent.assets.p.hiredThisTick).toBeDefined();
        expect(agent.assets.p.hiredThisTick!.primary).toBe(500);
        expect(agent.assets.p.hiredThisTick!.none).toBe(0);
    });

    it('records fired workers per education level', () => {
        const { planet } = makePlanet({ none: 10000 });
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[5].active.none = ageMomentsForAge(30, 1000);
        agent.assets.p.allocatedWorkers.none = 800;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        expect(agent.assets.p.firedThisTick).toBeDefined();
        expect(agent.assets.p.firedThisTick!.none).toBe(200);
        expect(agent.assets.p.hiredThisTick!.none).toBe(0);
    });

    it('resets counters each tick', () => {
        const { planet } = makePlanet({ none: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 100;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        expect(agent.assets.p.hiredThisTick!.none).toBe(100);

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        expect(agent.assets.p.hiredThisTick!.none).toBe(0);
        expect(agent.assets.p.firedThisTick!.none).toBe(0);
    });

    it('counts hires across multiple education levels', () => {
        const { planet } = makePlanet({ none: 5000, primary: 5000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 200;
        agent.assets.p.allocatedWorkers.primary = 300;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        expect(agent.assets.p.hiredThisTick!.none).toBe(200);
        expect(agent.assets.p.hiredThisTick!.primary).toBe(300);
        expect(agent.assets.p.hiredThisTick!.secondary).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Population conservation
// ---------------------------------------------------------------------------

describe('laborMarketTick — population conservation', () => {
    let agent: Agent;
    let planet: Planet;
    let gov: Agent;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet, gov } = makePlanet({ none: 10000, primary: 5000 }));
    });

    it('conserves total population after hiring', () => {
        const before = totalPopulation(planet);
        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.allocatedWorkers.primary = 200;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        assertTotalPopulationConserved(planet, before);
        assertWorkforcePopulationConsistency(planet, [agent], 'after hire');
    });

    it('conserves total population after voluntary quits', () => {
        agent.assets.p.allocatedWorkers.none = 10000;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        const afterHire = totalPopulation(planet);

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        assertTotalPopulationConserved(planet, afterHire);
        assertWorkforcePopulationConsistency(planet, [agent], 'after quits');
    });

    it('conserves total population after firing', () => {
        agent.assets.p.allocatedWorkers.none = 1000;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        const afterHire = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        wf[3].active.none = { ...wf[0].active.none };
        wf[0].active.none = emptyAgeMoments();

        agent.assets.p.allocatedWorkers.none = 500;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        assertTotalPopulationConserved(planet, afterHire);
        assertWorkforcePopulationConsistency(planet, [agent], 'after firing');
    });

    it('workforce ↔ population consistency with government agent', () => {
        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                deposits: 0,
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 0, primary: 300, secondary: 0, tertiary: 0, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };

        const before = totalPopulation(planet);
        agent.assets.p.allocatedWorkers.none = 500;

        laborMarketTick(
            new Map([
                [agent.id, agent],
                [gov.id, gov],
            ]),
            new Map([[planet.id, planet]]),
        );

        assertTotalPopulationConserved(planet, before);
        assertWorkforcePopulationConsistency(planet, [agent, gov], 'company + gov');

        expect(sumPopOcc(planet, 'primary', 'government')).toBe(300);
    });

    it('two agents competing for the same pool still conserve population', () => {
        const agent2 = makeAgent('agent-2');

        agent.assets.p.allocatedWorkers.none = 8000;
        agent2.assets.p.allocatedWorkers.none = 8000;

        const before = totalPopulation(planet);
        laborMarketTick(
            new Map([
                [agent.id, agent],
                [agent2.id, agent2],
            ]),
            new Map([[planet.id, planet]]),
        );

        assertTotalPopulationConserved(planet, before);

        const hired1 = totalActiveForEdu(agent.assets.p.workforceDemography!, 'none');
        const hired2 = totalActiveForEdu(agent2.assets.p.workforceDemography!, 'none');
        expect(hired1 + hired2).toBeLessThanOrEqual(10000);
    });
});

// ---------------------------------------------------------------------------
// Per-education level isolation
// ---------------------------------------------------------------------------

describe('per-education level isolation', () => {
    it('hiring one education level does not affect another', () => {
        const { planet } = makePlanet({ none: 5000, primary: 3000, secondary: 2000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.primary = 500;

        const noneBefore = sumPopOcc(planet, 'none', 'unoccupied');
        const secBefore = sumPopOcc(planet, 'secondary', 'unoccupied');

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(noneBefore);
        expect(sumPopOcc(planet, 'secondary', 'unoccupied')).toBe(secBefore);
    });

    it('firing one education level does not affect another', () => {
        const { planet } = makePlanet({ none: 10000, primary: 10000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.allocatedWorkers.primary = 500;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const wf = agent.assets.p.workforceDemography!;
        wf[3].active.none = { ...wf[0].active.none };
        wf[0].active.none = emptyAgeMoments();
        wf[3].active.primary = { ...wf[0].active.primary };
        wf[0].active.primary = emptyAgeMoments();

        agent.assets.p.allocatedWorkers.none = 200;
        agent.assets.p.allocatedWorkers.primary = 500;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        expect(totalActiveForEdu(wf, 'primary')).toBe(500);
    });
});

// ---------------------------------------------------------------------------
// Firing tenure protection
// ---------------------------------------------------------------------------

describe('firing tenure protection', () => {
    it('firing only targets workers at MIN_TENURE_FOR_FIRING and above', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();

        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = ageMomentsForAge(30, 100); // tenure 0 — protected
        wf[1].active.none = ageMomentsForAge(30, 100); // tenure 1 — fireable
        wf[5].active.none = ageMomentsForAge(30, 100); // tenure 5 — fireable

        agent.assets.p.allocatedWorkers.none = 100;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        // Year-0 workers protected from firing (voluntary quits: floor(100 * 0.0001) = 0)
        expect(wf[0].active.none.count).toBe(100);
    });
});

// ---------------------------------------------------------------------------
// Voluntary quit rate
// ---------------------------------------------------------------------------

describe('voluntary quit rate', () => {
    it('produces correct numbers with large workforce', () => {
        const { planet } = makePlanet({ none: 100000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 50000;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const wf = agent.assets.p.workforceDemography!;
        const activeAfterHire = totalActiveForEdu(wf, 'none');

        agent.assets.p.allocatedWorkers.none = 100000;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        const expectedQuits = Math.floor(activeAfterHire * VOLUNTARY_QUIT_RATE_PER_TICK);
        const departingNow = totalDepartingForEdu(wf, 'none');

        expect(departingNow).toBeGreaterThanOrEqual(expectedQuits);
    });

    it('does not affect a single worker (floor rounds to 0)', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[5].active.none = ageMomentsForAge(30, 1);
        agent.assets.p.allocatedWorkers.none = 1;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        expect(wf[5].active.none.count).toBe(1);
    });
});
