import { beforeEach, describe, expect, it } from 'vitest';

import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import { type Agent, type Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { SKILL } from '../population/population';

import { assertTotalPopulationConserved, assertWorkforcePopulationConsistency } from '../utils/testAssertions';
import {
    agentMap,
    makeAgent,
    makeAgentPlanetAssets,
    makeAllocatedWorkers,
    makePlanet,
    makePlanetWithPopulation,
    makeWorkforceDemography,
    sumPopOcc,
    totalPopulation,
} from '../utils/testHelper';
import { hireWorkforce } from './hireWorkforce';
import { VOLUNTARY_QUIT_RATE_PER_TICK, workforceDemographicTick } from './workforceDemographicTick';

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
        agent.assets.p.allocatedWorkers.none = 10000;

        hireWorkforce(agentMap(agent), planet);

        expect(workforce[30].none.novice.active).toBe(10000);
        expect(workforce[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('does not move workers when count is too small to yield floor > 0', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].none.novice.active = 1;
        agent.assets.p.allocatedWorkers.none = 1;

        hireWorkforce(agentMap(agent), planet);

        expect(workforce[30].none.novice.active).toBe(1);
        expect(workforce[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('hires workers from unoccupied pool when under target', () => {
        const { planet: p } = makePlanetWithPopulation({ primary: 1000 });
        agent.assets.p.allocatedWorkers.primary = 500;

        hireWorkforce(agentMap(agent), p);

        const workforce = agent.assets.p.workforceDemography!;
        // Workers go to onboarding pipeline, not active directly
        expect(totalActiveForEdu(workforce, 'primary')).toBe(0);
        let onboardingTotal = 0;
        for (let age = 0; age < workforce.length; age++) {
            for (const skill of SKILL) {
                onboardingTotal += workforce[age].primary[skill].onboarding[NOTICE_PERIOD_MONTHS - 1];
            }
        }
        expect(onboardingTotal).toBe(500);
        // Population should have been transferred from unoccupied to employed
        expect(sumPopOcc(p, 'primary', 'employed')).toBe(500);
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
        let onboardingTotal = 0;
        for (let age = 0; age < workforce.length; age++) {
            for (const skill of SKILL) {
                onboardingTotal += workforce[age].none[skill].onboarding[NOTICE_PERIOD_MONTHS - 1];
            }
        }
        expect(onboardingTotal).toBeLessThanOrEqual(5);
    });

    it('does not hire people under the minimum employable age', () => {
        const p = makePlanet();
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            p.population.demography[age].unoccupied.none.novice.total = 100;
        }
        agent.assets.p.allocatedWorkers.none = 500;

        hireWorkforce(agentMap(agent), planet);

        const workforce = agent.assets.p.workforceDemography!;
        let onboardingTotal = 0;
        for (let age = 0; age < workforce.length; age++) {
            for (const skill of SKILL) {
                onboardingTotal += workforce[age].none[skill].onboarding.reduce((s, n) => s + n, 0);
            }
        }
        expect(onboardingTotal).toBe(0);

        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            expect(p.population.demography[age].unoccupied.none.novice.total).toBe(100);
        }
    });

    it('fills positions in the onboarding pipeline', () => {
        const { planet: p } = makePlanetWithPopulation({ primary: 100000 });
        agent.assets.p.allocatedWorkers.primary = 3000;

        hireWorkforce(agentMap(agent), p);

        const workforce = agent.assets.p.workforceDemography!;
        // Workers go to the last onboarding slot, not directly to active
        expect(totalActiveForEdu(workforce, 'primary')).toBe(0);
        // Check the last onboarding slot has the workers
        let onboardingTotal = 0;
        for (let age = 0; age < workforce.length; age++) {
            for (const skill of SKILL) {
                onboardingTotal += workforce[age].primary[skill].onboarding[NOTICE_PERIOD_MONTHS - 1];
            }
        }
        expect(onboardingTotal).toBe(3000);
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

    it('skips agents with only a commercial license — arbitrage trader pattern', () => {
        const { planet: p } = makePlanetWithPopulation({ none: 10_000 });

        const arbAgent = makeAgent('arb-0', 'p', 'Arbitrage Trader', {
            agentRole: 'arbitrage_trader',
            assets: {
                p: makeAgentPlanetAssets('p', {
                    deposits: 250_000,

                    licenses: { commercial: { acquiredTick: 0, frozen: false } },
                    allocatedWorkers: makeAllocatedWorkers({ none: 500 }),
                }),
            },
        });

        hireWorkforce(agentMap(arbAgent), p);

        const hired = totalActiveForEdu(arbAgent.assets.p.workforceDemography!, 'none');
        expect(hired).toBe(0);

        expect(sumPopOcc(p, 'none', 'unoccupied')).toBe(10_000);
    });

    it('contrast: agent WITH a workforce license does hire workers into onboarding', () => {
        const { planet: p } = makePlanetWithPopulation({ none: 10_000 });

        const regularAgent = makeAgent();
        regularAgent.assets.p.allocatedWorkers.none = 500;

        hireWorkforce(agentMap(regularAgent), p);

        const wf = regularAgent.assets.p.workforceDemography!;
        // Workers go to onboarding pipeline, not active
        expect(totalActiveForEdu(wf, 'none')).toBe(0);
        let onboardingTotal = 0;
        for (let age = 0; age < wf.length; age++) {
            for (const skill of SKILL) {
                onboardingTotal += wf[age].none[skill].onboarding[NOTICE_PERIOD_MONTHS - 1];
            }
        }
        expect(onboardingTotal).toBe(500);
    });
});

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
            p: makeAgentPlanetAssets(planet.id, {
                workforceDemography: makeWorkforceDemography(),
                allocatedWorkers: makeAllocatedWorkers(),
            }),
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

        // After first hire, workers are in the last onboarding slot
        // Move them to active for the firing test
        const wf = agent.assets.p.workforceDemography!;
        for (let age = 0; age < wf.length; age++) {
            for (const skill of SKILL) {
                const cat = wf[age].none[skill];
                cat.active += cat.onboarding[NOTICE_PERIOD_MONTHS - 1];
                cat.onboarding[NOTICE_PERIOD_MONTHS - 1] = 0;
                const catPrimary = wf[age].primary[skill];
                catPrimary.active += catPrimary.onboarding[NOTICE_PERIOD_MONTHS - 1];
                catPrimary.onboarding[NOTICE_PERIOD_MONTHS - 1] = 0;
            }
        }

        agent.assets.p.allocatedWorkers.none = 200;
        agent.assets.p.allocatedWorkers.primary = 500;

        hireWorkforce(agentMap(agent), planet);

        expect(totalActiveForEdu(wf, 'primary')).toBe(500);
    });
});

describe('voluntary quit rate', () => {
    it('produces correct numbers with large workforce', () => {
        const planet = makePlanet();
        const agent = makeAgent();

        planet.population.demography[14].unoccupied.none.novice.total = 50000;
        agent.assets.p.allocatedWorkers.none = 50000;
        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;
        const activeAfterHire = totalActiveForEdu(wf, 'none');

        workforceDemographicTick(agentMap(agent), planet);

        const expectedQuits = Math.floor(activeAfterHire * VOLUNTARY_QUIT_RATE_PER_TICK);

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

        expect(Math.abs(allDeparting - expectedQuits)).toBeLessThanOrEqual(1);
    });

    it('does not affect a single worker (floor rounds to 0)', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.novice.active = 1;
        agent.assets.p.allocatedWorkers.none = 1;

        workforceDemographicTick(agentMap(agent), planet);

        expect(wf[30].none.novice.active).toBe(1);
    });
});
