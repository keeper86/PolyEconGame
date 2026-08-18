import { beforeEach, describe, expect, it } from 'vitest';

import { BASE_QUIT_RATE, MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS, SEARCH_HORIZON_TICKS } from '../constants';
import { type Agent, type Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';

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
import {
    acceptProbability,
    computeLaborMarket,
    jobFindingProbability,
    moraleDeficit,
    outsideIncome,
    quitPropensity,
} from './laborMarket';
import { workforceDemographicTick } from './workforceDemographicTick';

function totalActiveForEdu(workforce: ReturnType<typeof makeWorkforceDemography>, edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        total += workforce[age][edu].active;
    }
    return total;
}

function totalOnboardingForEdu(workforce: ReturnType<typeof makeWorkforceDemography>, edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        total += workforce[age][edu].onboarding[NOTICE_PERIOD_MONTHS - 1];
    }
    return total;
}

describe('labor market helpers', () => {
    it('jobFindingProbability is the exact multi-draw probability over the search horizon', () => {
        expect(jobFindingProbability(0)).toBe(0);
        expect(jobFindingProbability(1)).toBe(1);
        expect(jobFindingProbability(0.01)).toBeCloseTo(1 - Math.pow(0.99, SEARCH_HORIZON_TICKS), 10);
    });

    it('outsideIncome equals the job-finding probability times the vacancy wage', () => {
        expect(outsideIncome(0, 100)).toBe(0);
        expect(outsideIncome(1, 100)).toBe(100);
        expect(outsideIncome(0.01, 100)).toBeCloseTo((1 - Math.pow(0.99, SEARCH_HORIZON_TICKS)) * 100, 6);
    });

    it('acceptProbability rises with wage and saturates at ACCEPT_BASE', () => {
        expect(acceptProbability(0, 100)).toBeLessThan(acceptProbability(100, 100));
        expect(acceptProbability(100, 100)).toBeCloseTo(0.025, 5);
        expect(acceptProbability(1_000_000, 100)).toBeCloseTo(0.05, 4);
    });

    it('moraleDeficit is zero when unprofitable and grows as profit share grows', () => {
        expect(moraleDeficit(100, 0)).toBe(0);
        expect(moraleDeficit(100, 100)).toBe(0);
        expect(moraleDeficit(100, 300)).toBeGreaterThan(0);
    });

    it('quitPropensity starts at the base rate and rises with a better outside option', () => {
        expect(quitPropensity(100, 0, 0, 0)).toBe(BASE_QUIT_RATE);
        expect(quitPropensity(100, 0, 1, 200)).toBeGreaterThan(quitPropensity(100, 0, 0, 0));
    });
});

describe('computeLaborMarket — reachable outside options', () => {
    it('accumulates vacancies from all suitable job levels for each worker education', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000, primary: 2000, secondary: 3000, tertiary: 4000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers = makeAllocatedWorkers({ none: 100, primary: 50, secondary: 0, tertiary: 0 });
        agent.assets.p.wagePerEdu = { none: 10, primary: 20, secondary: 30, tertiary: 40 };

        const market = computeLaborMarket(agentMap(agent), planet);

        expect(market.reachableVacancies.none).toBe(100);
        expect(market.reachableVacancies.primary).toBe(150);
        expect(market.reachableVacancies.secondary).toBe(150);
        expect(market.reachableVacancies.tertiary).toBe(150);
    });

    it('values reachable vacancies at the worker own education wage, not the job wage', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 0, secondary: 0, tertiary: 1000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers = makeAllocatedWorkers({ none: 100 });
        agent.assets.p.wagePerEdu = { none: 100, primary: 90, secondary: 80, tertiary: 10 };

        const market = computeLaborMarket(agentMap(agent), planet);

        expect(market.reachableVacancyWage.none).toBe(100);
        expect(market.reachableVacancyWage.tertiary).toBe(10);
        expect(market.reachableTightness.tertiary).toBeCloseTo(100 / 1000);
    });

    it('divides reachable vacancies by unemployed workers for tightness', () => {
        const { planet } = makePlanetWithPopulation({ none: 2000, tertiary: 4000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers = makeAllocatedWorkers({ none: 200 });

        const market = computeLaborMarket(agentMap(agent), planet);

        expect(market.reachableTightness.none).toBeCloseTo(200 / 2000);
        expect(market.reachableTightness.tertiary).toBeCloseTo(200 / 4000);
    });

    it('does not broaden the lowest education level', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers = makeAllocatedWorkers({ none: 10, primary: 20 });

        const market = computeLaborMarket(agentMap(agent), planet);

        expect(market.reachableVacancies.none).toBe(10);
        expect(market.reachableVacancies.primary).toBe(30);
    });

    it('yields zero reachable vacancy wage when no suitable vacancies exist', () => {
        const { planet } = makePlanetWithPopulation({ tertiary: 1000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers = makeAllocatedWorkers({});

        const market = computeLaborMarket(agentMap(agent), planet);

        expect(market.reachableVacancies.tertiary).toBe(0);
        expect(market.reachableVacancyWage.tertiary).toBe(0);
    });
});

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
        workforce[30].none.active = 10000;
        agent.assets.p.allocatedWorkers.none = 10000;

        hireWorkforce(agentMap(agent), planet);

        expect(workforce[30].none.active).toBe(10000);
        expect(workforce[30].none.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('does not move workers when count is too small to yield floor > 0', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].none.active = 1;
        agent.assets.p.allocatedWorkers.none = 1;

        hireWorkforce(agentMap(agent), planet);

        expect(workforce[30].none.active).toBe(1);
        expect(workforce[30].none.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('hires workers from unoccupied pool when under target', () => {
        const { planet: p } = makePlanetWithPopulation({ primary: 100_000 });
        agent.assets.p.allocatedWorkers.primary = 500;
        agent.assets.p.wagePerEdu.primary = 1e9;

        hireWorkforce(agentMap(agent), p);

        const workforce = agent.assets.p.workforceDemography!;
        // Workers go to onboarding pipeline, not active directly
        expect(totalActiveForEdu(workforce, 'primary')).toBe(0);
        let onboardingTotal = 0;
        for (let age = 0; age < workforce.length; age++) {
            onboardingTotal += workforce[age].primary.onboarding[NOTICE_PERIOD_MONTHS - 1];
        }
        // The wage dominates the outside option, so workers accept at the base rate and the full target is filled.
        expect(onboardingTotal).toBe(500);
        // Population should have been transferred from unoccupied to employed
        expect(sumPopOcc(p, 'primary', 'employed')).toBe(500);
    });

    it('hires fewer workers when other vacancies offer a higher wage', () => {
        const { planet: p } = makePlanetWithPopulation({ primary: 100_000 });
        const lowWageAgent = makeAgent();
        lowWageAgent.assets.p.allocatedWorkers.primary = 500;
        lowWageAgent.assets.p.wagePerEdu.primary = 10;

        const highWageAgent = makeAgent();
        highWageAgent.assets.p.allocatedWorkers.primary = 500;
        highWageAgent.assets.p.wagePerEdu.primary = 1e9;

        hireWorkforce(agentMap(lowWageAgent, highWageAgent), p);

        expect(totalOnboardingForEdu(lowWageAgent.assets.p.workforceDemography!, 'primary')).toBeLessThan(
            totalOnboardingForEdu(highWageAgent.assets.p.workforceDemography!, 'primary'),
        );
    });

    it('does not hire when already at target', () => {
        const { planet: p } = makePlanetWithPopulation({ none: 5000 });
        agent.assets.p.allocatedWorkers.none = 100;
        agent.assets.p.workforceDemography![30].none.active = 100;

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
            onboardingTotal += workforce[age].none.onboarding[NOTICE_PERIOD_MONTHS - 1];
        }
        expect(onboardingTotal).toBeLessThanOrEqual(5);
    });

    it('does not hire people under the minimum employable age', () => {
        const p = makePlanet();
        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            p.population.demography[age].unoccupied.none.total = 100;
        }
        agent.assets.p.allocatedWorkers.none = 500;

        hireWorkforce(agentMap(agent), planet);

        const workforce = agent.assets.p.workforceDemography!;
        let onboardingTotal = 0;
        for (let age = 0; age < workforce.length; age++) {
            onboardingTotal += workforce[age].none.onboarding.reduce((s, n) => s + n, 0);
        }
        expect(onboardingTotal).toBe(0);

        for (let age = 0; age < MIN_EMPLOYABLE_AGE; age++) {
            expect(p.population.demography[age].unoccupied.none.total).toBe(100);
        }
    });

    it('fills positions in the onboarding pipeline', () => {
        const { planet: p } = makePlanetWithPopulation({ primary: 100000 });
        agent.assets.p.allocatedWorkers.primary = 3000;
        agent.assets.p.wagePerEdu.primary = 1e9;

        hireWorkforce(agentMap(agent), p);

        const workforce = agent.assets.p.workforceDemography!;
        // Workers go to the last onboarding slot, not directly to active
        expect(totalActiveForEdu(workforce, 'primary')).toBe(0);
        // Check the last onboarding slot has the workers
        let onboardingTotal = 0;
        for (let age = 0; age < workforce.length; age++) {
            onboardingTotal += workforce[age].primary.onboarding[NOTICE_PERIOD_MONTHS - 1];
        }
        // With probToAccept ≈ 0.05, totalWilling = 100000 * 0.05 = 5000
        // Cap: Math.floor(min(3000, 5000)) = 3000
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
        regularAgent.assets.p.wagePerEdu.none = 1e9;

        hireWorkforce(agentMap(regularAgent), p);

        const wf = regularAgent.assets.p.workforceDemography!;
        // Workers go to onboarding pipeline, not active
        expect(totalActiveForEdu(wf, 'none')).toBe(0);
        let onboardingTotal = 0;
        for (let age = 0; age < wf.length; age++) {
            onboardingTotal += wf[age].none.onboarding[NOTICE_PERIOD_MONTHS - 1];
        }
        // With probToAccept ≈ 0.05, totalWilling = 10000 * 0.05 = 500
        // Cap: Math.floor(min(500, 500)) = 500
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
        agent.assets.p.wagePerEdu.primary = 1e9;
        agent.assets.p.wagePerEdu.none = 1e9;
        hireWorkforce(agentMap(agent), planet);

        // After first hire, workers are in the last onboarding slot
        // Move them to active for the firing test
        const wf = agent.assets.p.workforceDemography!;
        for (let age = 0; age < wf.length; age++) {
            const cat = wf[age].none;
            cat.active += cat.onboarding[NOTICE_PERIOD_MONTHS - 1];
            cat.onboarding[NOTICE_PERIOD_MONTHS - 1] = 0;
            const catPrimary = wf[age].primary;
            catPrimary.active += catPrimary.onboarding[NOTICE_PERIOD_MONTHS - 1];
            catPrimary.onboarding[NOTICE_PERIOD_MONTHS - 1] = 0;
        }

        agent.assets.p.allocatedWorkers.none = 200;
        agent.assets.p.allocatedWorkers.primary = 500;

        hireWorkforce(agentMap(agent), planet);

        // With probToAccept ≈ 0.05, totalWilling = 10000 * 0.05 = 500
        // Cap: Math.floor(min(500, 500)) = 500
        expect(totalActiveForEdu(wf, 'primary')).toBe(500);
    });
});

describe('voluntary quit rate', () => {
    it('produces correct numbers with large workforce', () => {
        const planet = makePlanet();
        const agent = makeAgent();

        planet.population.demography[14].unoccupied.none.total = 50000;
        agent.assets.p.allocatedWorkers.none = 50000;
        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;
        const activeAfterHire = totalActiveForEdu(wf, 'none');

        workforceDemographicTick(agentMap(agent), planet);

        const expectedQuits = Math.floor(activeAfterHire * BASE_QUIT_RATE);

        let allDeparting = 0;
        for (let age = 0; age < wf.length; age++) {
            const cat = wf[age].none;
            for (let m = 0; m < cat.voluntaryDeparting.length; m++) {
                allDeparting += cat.voluntaryDeparting[m];
                allDeparting += cat.departingRetired[m];
            }
        }

        expect(Math.abs(allDeparting - expectedQuits)).toBeLessThanOrEqual(1);
    });

    it('does not affect a single worker (floor rounds to 0)', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.active = 1;
        agent.assets.p.allocatedWorkers.none = 1;

        workforceDemographicTick(agentMap(agent), planet);

        expect(wf[30].none.active).toBe(1);
    });
});
