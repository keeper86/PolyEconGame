import { beforeEach, describe, expect, it } from 'vitest';

import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import { createEmptyDemographicEventCounters, type Agent, type Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { SKILL } from '../population/population';

import { assertTotalPopulationConserved, assertWorkforcePopulationConsistency } from '../utils/testAssertions';
import {
    agentMap,
    makeAgent,
    makeAllocatedWorkers,
    makePlanet,
    makePlanetWithPopulation,
    makeStorageFacility,
    makeWorkforceDemography,
    sumPopOcc,
    totalPopulation,
} from '../utils/testHelper';
import { hireWorkforce } from './hireWorkforce';
import { VOLUNTARY_QUIT_RATE_PER_TICK, workforceDemographicTick } from './workforceDemographicTick';

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

describe('hireWorkforce', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanetWithPopulation({}));
    });

    it('does nothing when workforceDemography is absent', () => {
        agent.assets.p.workforceDemography = undefined as never;
        expect(() => hireWorkforce(agentMap(agent), planet)).not.toThrow();
    });

    it('does not apply voluntary quits (those are handled by workforceDemographicTick)', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].none.novice.active = 10000;
        agent.assets.p.allocatedWorkers.none = 10000; // match target so firing doesn't trigger

        hireWorkforce(agentMap(agent), planet);

        // hireToTagetTick no longer applies voluntary quits — that's in workforceDemographicTick
        expect(workforce[30].none.novice.active).toBe(10000);
        expect(workforce[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('does not move workers when count is too small to yield floor > 0', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].none.novice.active = 1; // floor(1 * 0.0001) = 0
        agent.assets.p.allocatedWorkers.none = 1; // match target so firing doesn't trigger

        hireWorkforce(agentMap(agent), planet);

        expect(workforce[30].none.novice.active).toBe(1);
        expect(workforce[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('hires workers from unoccupied pool when under target', () => {
        const { planet: p } = makePlanetWithPopulation({ primary: 1000 });
        agent.assets.p.allocatedWorkers.primary = 500;

        hireWorkforce(agentMap(agent), p);

        const workforce = agent.assets.p.workforceDemography!;
        const hired = totalActiveForEdu(workforce, 'primary');
        expect(hired).toBe(500);
    });

    it('does not hire when already at target', () => {
        const { planet: p } = makePlanetWithPopulation({ none: 5000 });
        agent.assets.p.allocatedWorkers.none = 100;
        agent.assets.p.workforceDemography![30].none.novice.active = 100;

        hireWorkforce(agentMap(agent), p);

        const workforce = agent.assets.p.workforceDemography!;
        const totalActive = totalActiveForEdu(workforce, 'none');
        expect(totalActive).toBe(100);
    });

    it('does not hire more than available unoccupied workers', () => {
        const { planet: p } = makePlanetWithPopulation({ none: 5 });
        agent.assets.p.allocatedWorkers.none = 1000;

        hireWorkforce(agentMap(agent), p);

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

        hireWorkforce(agentMap(agent), planet);

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

        hireWorkforce(agentMap(agent), p);

        const workforce = agent.assets.p.workforceDemography!;
        expect(totalActiveForEdu(workforce, 'primary')).toBe(3000);
    });

    it('multiple agents cannot hire more workers than available on the planet', () => {
        const { planet: p } = makePlanetWithPopulation({ none: 1000 });

        const agentA = makeAgent();
        const agentB = makeAgent('agent-2');

        agentA.assets.p.allocatedWorkers.none = 800;
        agentB.assets.p.allocatedWorkers.none = 800;

        hireWorkforce(
            new Map([
                [agentA.id, agentA],
                [agentB.id, agentB],
            ]),
            planet,
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

describe('preProductionLaborMarketTick — population conservation', () => {
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

        hireWorkforce(agentMap(agent), planet);

        assertTotalPopulationConserved(planet, before);
        assertWorkforcePopulationConsistency(planet, [agent], 'after hire');
    });

    it('conserves total population after voluntary quits', () => {
        agent.assets.p.allocatedWorkers.none = 10000;
        hireWorkforce(agentMap(agent), planet);
        const afterHire = totalPopulation(planet);

        hireWorkforce(agentMap(agent), planet);

        assertTotalPopulationConserved(planet, afterHire);
        assertWorkforcePopulationConsistency(planet, [agent], 'after quits');
    });

    it('conserves total population after firing', () => {
        agent.assets.p.allocatedWorkers.none = 1000;
        hireWorkforce(agentMap(agent), planet);
        const afterHire = totalPopulation(planet);

        agent.assets.p.allocatedWorkers.none = 500;
        hireWorkforce(agentMap(agent), planet);

        assertTotalPopulationConserved(planet, afterHire);
        assertWorkforcePopulationConsistency(planet, [agent], 'after firing');
    });

    it('workforce ↔ population consistency with government agent', () => {
        gov.assets = {
            p: {
                productionFacilities: [],
                deposits: 0,
                depositHold: 0,
                loans: 0,
                storageFacility: makeStorageFacility(),
                allocatedWorkers: makeAllocatedWorkers({ primary: 300 }),
                workforceDemography: makeWorkforceDemography(),
                deaths: createEmptyDemographicEventCounters(),
                disabilities: createEmptyDemographicEventCounters(),
                monthAcc: { depositsAtMonthStart: 0, productionValue: 0, wagesBill: 0, revenueValue: 0 },
                lastMonthAcc: { productionValue: 0, wagesBill: 0, revenueValue: 0 },
            },
        };

        const before = totalPopulation(planet);
        agent.assets.p.allocatedWorkers.none = 500;

        hireWorkforce(
            new Map([
                [agent.id, agent],
                [gov.id, gov],
            ]),
            planet,
        );

        assertTotalPopulationConserved(planet, before);
        assertWorkforcePopulationConsistency(planet, [agent, gov], 'company + gov');
    });

    it('two agents competing for the same pool still conserve population', () => {
        const agent2 = makeAgent('agent-2');

        agent.assets.p.allocatedWorkers.none = 8000;
        agent2.assets.p.allocatedWorkers.none = 8000;

        const before = totalPopulation(planet);
        hireWorkforce(
            new Map([
                [agent.id, agent],
                [agent2.id, agent2],
            ]),
            planet,
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

        hireWorkforce(agentMap(agent), planet);

        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(noneBefore);
        expect(sumPopOcc(planet, 'secondary', 'unoccupied')).toBe(secBefore);
    });

    it('firing one education level does not affect another', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000, primary: 10000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.allocatedWorkers.primary = 500;
        hireWorkforce(agentMap(agent), planet);

        agent.assets.p.allocatedWorkers.none = 200;
        agent.assets.p.allocatedWorkers.primary = 500;

        hireWorkforce(agentMap(agent), planet);

        expect(totalActiveForEdu(agent.assets.p.workforceDemography!, 'primary')).toBe(500);
    });
});

// ---------------------------------------------------------------------------
// Voluntary quit rate
// ---------------------------------------------------------------------------

describe('voluntary quit rate', () => {
    it('produces correct numbers with large workforce', () => {
        // Use a clean environment so that mortality/disability are minimal
        const planet = makePlanet();
        const agent = makeAgent();

        planet.population.demography[14].unoccupied.none.novice.total = 50000;
        agent.assets.p.allocatedWorkers.none = 50000;
        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;
        const activeAfterHire = totalActiveForEdu(wf, 'none');

        // Voluntary quits are now applied by workforceDemographicTick
        workforceDemographicTick(agentMap(agent), planet);

        const expectedQuits = Math.floor(activeAfterHire * VOLUNTARY_QUIT_RATE_PER_TICK);
        // After the demographic tick, some voluntary departing workers may
        // have died. The departing count should be approximately the expected
        // quits — allow for a small margin of loss due to mortality.
        let allDeparting = 0;
        for (let age = 0; age < wf.length; age++) {
            for (const skill of SKILL) {
                const cat = wf[age].none[skill];
                for (let m = 0; m < cat.voluntaryDeparting.length; m++) {
                    allDeparting += cat.voluntaryDeparting[m];
                    allDeparting += cat.departingRetired[m];
                }
            }
        }

        // Allow loss from mortality on the same tick
        expect(Math.abs(allDeparting - expectedQuits)).toBeLessThanOrEqual(1);
    });

    it('does not affect a single worker (floor rounds to 0)', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 1;
        agent.assets.p.allocatedWorkers.none = 1;

        // Voluntary quits are applied by workforceDemographicTick
        workforceDemographicTick(agentMap(agent), planet);

        expect(wf[30].none.novice.active).toBe(1);
    });
});
