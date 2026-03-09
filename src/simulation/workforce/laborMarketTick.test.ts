import { describe, it, expect, beforeEach } from 'vitest';

import { MIN_EMPLOYABLE_AGE } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { SKILL } from '../population/population';

import { laborMarketTick, VOLUNTARY_QUIT_RATE_PER_MONTH, NOTICE_PERIOD_MONTHS } from './laborMarketTick';
import {
    makeAgent,
    makeStorageFacility,
    makePlanetWithPopulation,
    makePlanet,
    makeWorkforceDemography,
    makeAllocatedWorkers,
    totalPopulation,
    sumPopOcc,
    agentMap,
    planetMap,
} from '../utils/testHelper';
import { assertTotalPopulationConserved, assertWorkforcePopulationConsistency } from '../utils/testAssertions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum active workers across all ages and skill levels for a given edu. */
function totalActiveForEdu(workforce: ReturnType<typeof makeWorkforceDemography>, edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            total += workforce[age][edu][skill].active;
        }
    }
    return total;
}

/** Sum all departing across all ages, skill levels, and pipeline slots for a given edu. */
function totalDepartingForEdu(workforce: ReturnType<typeof makeWorkforceDemography>, edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            for (const d of workforce[age][edu][skill].departing) {
                total += d;
            }
        }
    }
    return total;
}

// ---------------------------------------------------------------------------
// laborMarketTick — basic behaviour
// ---------------------------------------------------------------------------

describe('laborMarketTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanetWithPopulation({}));
    });

    it('does nothing when workforceDemography is absent', () => {
        agent.assets.p.workforceDemography = undefined as never;
        expect(() => laborMarketTick(agentMap(agent), planetMap(planet))).not.toThrow();
    });

    it('moves a fraction of active workers into the departing pipeline', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].none.novice.active = 10000;
        agent.assets.p.allocatedWorkers.none = 10000; // match target so firing doesn't trigger

        laborMarketTick(agentMap(agent), planetMap(planet));

        const expectedQuitters = Math.floor(10000 * VOLUNTARY_QUIT_RATE_PER_MONTH);
        expect(workforce[30].none.novice.active).toBe(10000 - expectedQuitters);
        expect(workforce[30].none.novice.departing[NOTICE_PERIOD_MONTHS - 1]).toBe(expectedQuitters);
    });

    it('does not move workers when count is too small to yield floor > 0', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].none.novice.active = 1; // floor(1 * 0.0001) = 0
        agent.assets.p.allocatedWorkers.none = 1; // match target so firing doesn't trigger

        laborMarketTick(agentMap(agent), planetMap(planet));

        expect(workforce[30].none.novice.active).toBe(1);
        expect(workforce[30].none.novice.departing[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('hires workers from unoccupied pool when under target', () => {
        const { planet: p } = makePlanetWithPopulation({ primary: 1000 });
        agent.assets.p.allocatedWorkers.primary = 500;

        laborMarketTick(agentMap(agent), planetMap(p));

        const workforce = agent.assets.p.workforceDemography!;
        const hired = totalActiveForEdu(workforce, 'primary');
        expect(hired).toBe(500);
    });

    it('does not hire when already at target', () => {
        const { planet: p } = makePlanetWithPopulation({ none: 5000 });
        agent.assets.p.allocatedWorkers.none = 100;
        agent.assets.p.workforceDemography![30].none.novice.active = 100;

        laborMarketTick(agentMap(agent), planetMap(p));

        const workforce = agent.assets.p.workforceDemography!;
        const totalActive = totalActiveForEdu(workforce, 'none');
        expect(totalActive).toBe(100);
    });

    it('does not hire more than available unoccupied workers', () => {
        const { planet: p } = makePlanetWithPopulation({ none: 5 });
        agent.assets.p.allocatedWorkers.none = 1000;

        laborMarketTick(agentMap(agent), planetMap(p));

        const workforce = agent.assets.p.workforceDemography!;
        const hired = totalActiveForEdu(workforce, 'none');
        expect(hired).toBeLessThanOrEqual(5);
    });

    it('does not hire people under the minimum employable age', () => {
        const p = makePlanet();
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            p.population.demography[age].unoccupied.none.novice.total = 100;
        }
        agent.assets.p.allocatedWorkers.none = 500;

        laborMarketTick(agentMap(agent), planetMap(p));

        const workforce = agent.assets.p.workforceDemography!;
        const hired = totalActiveForEdu(workforce, 'none');
        expect(hired).toBe(0);

        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            expect(p.population.demography[age].unoccupied.none.novice.total).toBe(100);
        }
    });

    it('fills positions instantly in a single tick', () => {
        const { planet: p } = makePlanetWithPopulation({ primary: 100000 });
        agent.assets.p.allocatedWorkers.primary = 3000;

        laborMarketTick(agentMap(agent), planetMap(p));

        const workforce = agent.assets.p.workforceDemography!;
        expect(totalActiveForEdu(workforce, 'primary')).toBe(3000);
    });

    it('multiple agents cannot hire more workers than available on the planet', () => {
        const { planet: p } = makePlanetWithPopulation({ none: 1000 });

        const agentA = makeAgent();
        const agentB = makeAgent('agent-2');

        agentA.assets.p.allocatedWorkers.none = 800;
        agentB.assets.p.allocatedWorkers.none = 800;

        laborMarketTick(
            new Map([
                [agentA.id, agentA],
                [agentB.id, agentB],
            ]),
            planetMap(p),
        );

        const hiredA = totalActiveForEdu(agentA.assets.p.workforceDemography!, 'none');
        const hiredB = totalActiveForEdu(agentB.assets.p.workforceDemography!, 'none');
        const totalHired = hiredA + hiredB;

        expect(totalHired).toBeLessThanOrEqual(1000);

        const unoccupiedAfter = sumPopOcc(p, 'none', 'unoccupied');
        expect(1000 - unoccupiedAfter).toBe(totalHired);
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
        ({ planet, gov } = makePlanetWithPopulation({ none: 10000, primary: 5000 }));
    });

    it('conserves total population after hiring', () => {
        const before = totalPopulation(planet);
        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.allocatedWorkers.primary = 200;

        laborMarketTick(agentMap(agent), planetMap(planet));

        assertTotalPopulationConserved(planet, before);
        assertWorkforcePopulationConsistency(planet, [agent], 'after hire');
    });

    it('conserves total population after voluntary quits', () => {
        agent.assets.p.allocatedWorkers.none = 10000;
        laborMarketTick(agentMap(agent), planetMap(planet));
        const afterHire = totalPopulation(planet);

        laborMarketTick(agentMap(agent), planetMap(planet));

        assertTotalPopulationConserved(planet, afterHire);
        assertWorkforcePopulationConsistency(planet, [agent], 'after quits');
    });

    it('conserves total population after firing', () => {
        agent.assets.p.allocatedWorkers.none = 1000;
        laborMarketTick(agentMap(agent), planetMap(planet));
        const afterHire = totalPopulation(planet);

        agent.assets.p.allocatedWorkers.none = 500;
        laborMarketTick(agentMap(agent), planetMap(planet));

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
                allocatedWorkers: makeAllocatedWorkers({ primary: 300 }),
                workforceDemography: makeWorkforceDemography(),
            },
        };

        const before = totalPopulation(planet);
        agent.assets.p.allocatedWorkers.none = 500;

        laborMarketTick(
            new Map([
                [agent.id, agent],
                [gov.id, gov],
            ]),
            planetMap(planet),
        );

        assertTotalPopulationConserved(planet, before);
        assertWorkforcePopulationConsistency(planet, [agent, gov], 'company + gov');
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
            planetMap(planet),
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
        const { planet } = makePlanetWithPopulation({ none: 5000, primary: 3000, secondary: 2000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.primary = 500;

        const noneBefore = sumPopOcc(planet, 'none', 'unoccupied');
        const secBefore = sumPopOcc(planet, 'secondary', 'unoccupied');

        laborMarketTick(agentMap(agent), planetMap(planet));

        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(noneBefore);
        expect(sumPopOcc(planet, 'secondary', 'unoccupied')).toBe(secBefore);
    });

    it('firing one education level does not affect another', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000, primary: 10000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.allocatedWorkers.primary = 500;
        laborMarketTick(agentMap(agent), planetMap(planet));

        agent.assets.p.allocatedWorkers.none = 200;
        agent.assets.p.allocatedWorkers.primary = 500;

        laborMarketTick(agentMap(agent), planetMap(planet));

        expect(totalActiveForEdu(agent.assets.p.workforceDemography!, 'primary')).toBe(500);
    });
});

// ---------------------------------------------------------------------------
// Voluntary quit rate
// ---------------------------------------------------------------------------

describe('voluntary quit rate', () => {
    it('produces correct numbers with large workforce', () => {
        const { planet } = makePlanetWithPopulation({ none: 100000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 50000;
        laborMarketTick(agentMap(agent), planetMap(planet));

        const wf = agent.assets.p.workforceDemography!;
        const activeAfterHire = totalActiveForEdu(wf, 'none');

        agent.assets.p.allocatedWorkers.none = 100000;
        laborMarketTick(agentMap(agent), planetMap(planet));

        const expectedQuits = Math.floor(activeAfterHire * VOLUNTARY_QUIT_RATE_PER_MONTH);
        const departingNow = totalDepartingForEdu(wf, 'none');

        expect(departingNow).toBeGreaterThanOrEqual(expectedQuits);
    });

    it('does not affect a single worker (floor rounds to 0)', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 1;
        agent.assets.p.allocatedWorkers.none = 1;

        laborMarketTick(agentMap(agent), planetMap(planet));

        expect(wf[30].none.novice.active).toBe(1);
    });
});
