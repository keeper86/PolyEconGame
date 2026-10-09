import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    FIRE_RATE_LIMIT_PER_MONTH,
    WAGE_DURATION_DECAY,
    MIN_EMPLOYABLE_AGE,
    MIN_HIRES_PER_TICK,
    NOTICE_PERIOD_MONTHS,
    SEARCH_HORIZON_TICKS,
    TICKS_PER_MONTH,
} from '../constants';
import { type Agent, type Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';

import { assertTotalPopulationConserved, assertWorkforcePopulationConsistency } from '../utils/testAssertions';
import {
    agentMap,
    makeAgent,
    makeAgentPlanetAssets,
    makeAllocatedWorkers,
    makeHRFacility,
    makePlanet,
    makePlanetWithPopulation,
    makeProductionFacility,
    makeWorkforceDemography,
    sumPopOcc,
    totalPopulation,
} from '../utils/testHelper';
import {
    assertBackfillProgress,
    hireWorkforce,
    maxHiresPerTick,
    perTickLimit,
    setFireRateLimitPerMonth,
    setHireFlowMultiplier,
} from './hireWorkforce';
import { automaticWorkerAllocation } from './automaticWorkerAllocation';
import {
    acceptProbability,
    betterOfferMeanWage,
    computeLaborMarket,
    jobFindingProbability,
    outsideIncome,
    quitPropensity,
    QUIT_RATE_CAP,
    reservationWage,
} from './laborMarket';
import { workforceDemographicTick } from './workforceDemographicTick';
import {
    QUIT_FAIRNESS_SENSITIVITY,
    QUIT_JOB_FINDING_FLOOR,
    QUIT_OUTSIDE_SENSITIVITY,
    QUIT_OUTSIDE_WAGE_BIAS,
} from '../constants';

const BIASED_PARITY_WAGE = 100 / QUIT_OUTSIDE_WAGE_BIAS;

beforeEach(() => {
    setHireFlowMultiplier(Number.POSITIVE_INFINITY);
    setFireRateLimitPerMonth(Number.POSITIVE_INFINITY);
});

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

    it('outsideIncome floors the job-finding chance so unemployment cannot zero the outside option', () => {
        expect(jobFindingProbability(0)).toBe(0);
        expect(outsideIncome(0, 100)).toBeCloseTo(QUIT_JOB_FINDING_FLOOR * 100, 10);
        expect(outsideIncome(1, 100)).toBe(100);
        const floored =
            QUIT_JOB_FINDING_FLOOR + (1 - QUIT_JOB_FINDING_FLOOR) * (1 - Math.pow(0.99, SEARCH_HORIZON_TICKS));
        expect(outsideIncome(0.01, 100)).toBeCloseTo(floored * 100, 6);
    });

    it('caps the unemployment drag at half, so a comparable outside market is not a dead end', () => {
        expect(quitPropensity(100, 0, 100, 100)).toBe(0);
        expect(quitPropensity(100, 0, 100, 1000)).toBeGreaterThan(0);
        expect(quitPropensity(100, 0, 10, 1000)).toBeGreaterThan(0);
    });

    it('acceptProbability rises with wage and saturates at ACCEPT_BASE', () => {
        expect(acceptProbability(0, 100)).toBeLessThan(acceptProbability(100, 100));
        expect(acceptProbability(100, 100)).toBeCloseTo(0.025, 5);
        expect(acceptProbability(1_000_000, 100)).toBeCloseTo(0.05, 4);
    });

    it('quitPropensity quits only when a better offer outweighs the current pay, tilted by unfairness', () => {
        expect(quitPropensity(100, 0, 0, 100)).toBe(0);
        expect(quitPropensity(100, 0, 0, 250)).toBe(0);
        expect(quitPropensity(100, 1, 50, 100)).toBe(0);
        expect(quitPropensity(100, 1, 95, 100)).toBe(0);
        expect(quitPropensity(100, 1, 200, 100)).toBeGreaterThan(0);
        expect(quitPropensity(100, 1, 105, 1000)).toBeGreaterThan(0);
        expect(quitPropensity(100, 1, BIASED_PARITY_WAGE - 1, 100)).toBe(0);
        expect(quitPropensity(100, 1, 100000, 100)).toBeCloseTo(Math.min(QUIT_OUTSIDE_SENSITIVITY, QUIT_RATE_CAP), 10);
    });

    it('quitPropensity biases the outside wage so a parity offer is not a better offer', () => {
        expect(quitPropensity(100, 1, 100, 100)).toBe(0);
        expect(quitPropensity(100, 1, BIASED_PARITY_WAGE - 1, 100)).toBe(0);
        expect(quitPropensity(100, 1, BIASED_PARITY_WAGE + 1, 100)).toBeGreaterThan(0);
        expect(quitPropensity(100, 1, 130, 100)).toBeGreaterThan(0);
    });

    it('fairness outweighs the outside option, but only once the outside market has its floored chance', () => {
        const deadOutsideMarket = quitPropensity(100, 0, 0, 200);
        const flooredOutsideMarket = quitPropensity(100, 0, 100, 300);
        const liveOutsideMarket = quitPropensity(100, 1, 130, 300);

        expect(QUIT_FAIRNESS_SENSITIVITY).toBeGreaterThan(QUIT_OUTSIDE_SENSITIVITY);
        expect(deadOutsideMarket).toBe(0);
        expect(flooredOutsideMarket).toBeGreaterThan(0);
        expect(liveOutsideMarket).toBeGreaterThan(flooredOutsideMarket);
    });

    it('reservationWage anchors to the going tier rate and does NOT depend on cost of living', () => {
        const tight = reservationWage(1.0, 200);
        expect(tight).toBeCloseTo(0.8 * 200 * WAGE_DURATION_DECAY, 6);

        expect(reservationWage(1.0, 10000)).toBeGreaterThan(tight);
    });

    it('reservationWage erodes as jobs get harder to find, so protracted unemployment lowers the bar', () => {
        const instant = reservationWage(1.0, 100);
        const scarce = reservationWage(0.2, 100);
        expect(scarce).toBeLessThan(instant);

        expect(reservationWage(0, 100)).toBeLessThan(0.05);
        expect(acceptProbability(1, reservationWage(0, 100))).toBeGreaterThan(acceptProbability(1, 100));
    });

    it('a wage at the going tier rate is accepted in a tight market', () => {
        const threshold = reservationWage(1.0, 100);

        expect(acceptProbability(100, threshold)).toBeGreaterThan(0.04);
    });
});

describe('betterOfferMeanWage', () => {
    it('returns 0 when no vacancy pays above the current wage', () => {
        const steps = [
            { wage: 10, cumVacancy: 100, cumWage: 1000 },
            { wage: 12, cumVacancy: 200, cumWage: 3400 },
        ];
        expect(betterOfferMeanWage(steps, 12)).toBe(0);
        expect(betterOfferMeanWage(steps, 20)).toBe(0);
    });

    it('returns the vacancy-weighted mean of the offers above the current wage', () => {
        const steps = [
            { wage: 10, cumVacancy: 100, cumWage: 1000 },
            { wage: 20, cumVacancy: 300, cumWage: 5000 },
        ];
        expect(betterOfferMeanWage(steps, 10)).toBe(20);
        expect(betterOfferMeanWage(steps, 15)).toBe(20);
        expect(betterOfferMeanWage(steps, 8)).toBeCloseTo(5000 / 300, 10);
        expect(betterOfferMeanWage([], 10)).toBe(0);
    });
});

describe('computeLaborMarket — reachable outside options', () => {
    it('accumulates vacancies from all suitable job levels for each worker education', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000, primary: 2000, secondary: 3000, tertiary: 4000 });
        const agent = makeAgent();
        agent.assets.p.totalSlotCapacity = { none: 100, primary: 50, secondary: 0, tertiary: 0 };
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
        agent.assets.p.totalSlotCapacity = { none: 100, primary: 0, secondary: 0, tertiary: 0 };
        agent.assets.p.wagePerEdu = { none: 100, primary: 90, secondary: 80, tertiary: 10 };

        const market = computeLaborMarket(agentMap(agent), planet);

        expect(market.reachableVacancyWage.none).toBe(100);
        expect(market.reachableVacancyWage.tertiary).toBe(10);
        expect(market.reachableTightness.tertiary).toBeCloseTo(100 / 1000);
    });

    it('divides reachable vacancies by unemployed workers for tightness', () => {
        const { planet } = makePlanetWithPopulation({ none: 2000, tertiary: 4000 });
        const agent = makeAgent();
        agent.assets.p.totalSlotCapacity = { none: 200, primary: 0, secondary: 0, tertiary: 0 };

        const market = computeLaborMarket(agentMap(agent), planet);

        expect(market.reachableTightness.none).toBeCloseTo(200 / 2000);
        expect(market.reachableTightness.tertiary).toBeCloseTo(200 / 4000);
    });

    it('does not broaden the lowest education level', () => {
        const { planet } = makePlanetWithPopulation({ none: 1000 });
        const agent = makeAgent();
        agent.assets.p.totalSlotCapacity = { none: 10, primary: 20, secondary: 0, tertiary: 0 };

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

describe('perTickLimit', () => {
    it('spreads a monthly fraction evenly over the ticks', () => {
        expect(perTickLimit(600 * TICKS_PER_MONTH, 1)).toBe(600);
        expect(perTickLimit(500 * TICKS_PER_MONTH, 0.05)).toBe(25);
    });

    it('never rounds down to zero, so a tiny stock still moves one worker per tick', () => {
        expect(perTickLimit(30, 1)).toBe(1);
        expect(perTickLimit(0, 1)).toBe(1);
    });
});

describe('labour turnover rate limits', () => {
    it('sheds one tick worth of the idle gap instead of firing the whole gap at once', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.wagePerEdu.none = 1e9;
        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;
        for (let age = 0; age < wf.length; age++) {
            const cat = wf[age].none;
            cat.active += cat.onboarding[NOTICE_PERIOD_MONTHS - 1];
            cat.onboarding[NOTICE_PERIOD_MONTHS - 1] = 0;
        }
        const activeBefore = totalActiveForEdu(wf, 'none');
        expect(activeBefore).toBeGreaterThan(0);

        agent.assets.p.allocatedWorkers.none = activeBefore - 300;
        setFireRateLimitPerMonth(FIRE_RATE_LIMIT_PER_MONTH);
        hireWorkforce(agentMap(agent), planet);

        const fired = activeBefore - totalActiveForEdu(wf, 'none');
        expect(fired).toBeGreaterThan(0);
        expect(fired).toBeLessThanOrEqual(Math.ceil(perTickLimit(activeBefore, FIRE_RATE_LIMIT_PER_MONTH)));
        expect(fired).toBeLessThan(300);
    });
});

describe('HR hiring trickle', () => {
    it('never blocks hiring when the HR buffer is empty', () => {
        const { planet } = makePlanetWithPopulation({ none: 100_000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.wagePerEdu.none = 1e9;
        agent.assets.p.humanResourcesDepartment = makeHRFacility(undefined, { scale: 5, hrBuffer: 0 });

        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;
        expect(totalOnboardingForEdu(wf, 'none')).toBe(MIN_HIRES_PER_TICK);
    });

    it('floors a sub-trickle HR buffer up to the trickle', () => {
        const { planet } = makePlanetWithPopulation({ none: 100_000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.wagePerEdu.none = 1e9;
        agent.assets.p.humanResourcesDepartment = makeHRFacility(undefined, {
            scale: 5,
            hrBuffer: MIN_HIRES_PER_TICK - 2,
        });

        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;
        expect(totalOnboardingForEdu(wf, 'none')).toBe(MIN_HIRES_PER_TICK);
    });

    it('hires above the trickle once the HR buffer covers more', () => {
        const { planet } = makePlanetWithPopulation({ none: 100_000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.wagePerEdu.none = 1e9;
        agent.assets.p.humanResourcesDepartment = makeHRFacility(undefined, { scale: 5, hrBuffer: 5000 });
        setHireFlowMultiplier(1);

        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;
        expect(totalOnboardingForEdu(wf, 'none')).toBeGreaterThan(MIN_HIRES_PER_TICK);
    });

    it('maxHiresPerTick never falls below the trickle', () => {
        setHireFlowMultiplier(1);
        expect(maxHiresPerTick(makeAgentPlanetAssets('p'))).toBeGreaterThanOrEqual(MIN_HIRES_PER_TICK);
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

        expect(totalActiveForEdu(workforce, 'primary')).toBe(0);
        let onboardingTotal = 0;
        for (let age = 0; age < workforce.length; age++) {
            onboardingTotal += workforce[age].primary.onboarding[NOTICE_PERIOD_MONTHS - 1];
        }

        expect(onboardingTotal).toBe(500);

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

        expect(totalActiveForEdu(workforce, 'primary')).toBe(0);

        let onboardingTotal = 0;
        for (let age = 0; age < workforce.length; age++) {
            onboardingTotal += workforce[age].primary.onboarding[NOTICE_PERIOD_MONTHS - 1];
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
        regularAgent.assets.p.wagePerEdu.none = 1e9;

        hireWorkforce(agentMap(regularAgent), p);

        const wf = regularAgent.assets.p.workforceDemography!;

        expect(totalActiveForEdu(wf, 'none')).toBe(0);
        let onboardingTotal = 0;
        for (let age = 0; age < wf.length; age++) {
            onboardingTotal += wf[age].none.onboarding[NOTICE_PERIOD_MONTHS - 1];
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
    it('backfills a shortfall from a higher tier when the native pool is depleted', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 100_000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.wagePerEdu.none = 1e9;
        agent.assets.p.wagePerEdu.primary = 1e9;

        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;

        expect(sumPopOcc(planet, 'none', 'employed')).toBe(0);
        expect(totalOnboardingForEdu(wf, 'primary')).toBe(500);
    });

    it('firing one education level does not affect another', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000, primary: 10000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.allocatedWorkers.primary = 500;
        agent.assets.p.wagePerEdu.primary = 1e9;
        agent.assets.p.wagePerEdu.none = 1e9;
        hireWorkforce(agentMap(agent), planet);

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

        expect(totalActiveForEdu(wf, 'primary')).toBe(500);
    });
});

describe('voluntary quit rate', () => {
    it('does not quit without a reachable better offer', () => {
        const planet = makePlanet();
        const agent = makeAgent();

        planet.population.demography[14].unoccupied.none.total = 50000;
        agent.assets.p.allocatedWorkers.none = 50000;
        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;

        workforceDemographicTick(agentMap(agent), planet);

        let voluntaryDepartures = 0;
        for (let age = 0; age < wf.length; age++) {
            for (const m of wf[age].none.voluntaryDeparting) {
                voluntaryDepartures += m;
            }
        }

        expect(voluntaryDepartures).toBe(0);
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

describe('overqualified backfill substitution', () => {
    it('does not re-hire native none workers into none slots already filled by overqualified workers', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, secondary: 2000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });
        agent.assets.p.productionFacilities = [fac];
        agent.assets.p.totalSlotCapacity = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };

        fac.lastTickResults.totalUsedByEdu = { none: 0, primary: 0, secondary: 1000, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.overqualifiedWorkers = { none: { secondary: 1000 } };

        agent.assets.p.wagePerEdu.none = 1e9;
        agent.assets.p.wagePerEdu.secondary = 1e9;
        const wf = agent.assets.p.workforceDemography!;
        wf[30].secondary.active = 1000;
        planet.population.demography[30].employed.secondary.total = 1000;
        planet.population.demography[30].unoccupied.none.total = 500;

        const unoccNoneBefore = sumPopOcc(planet, 'none', 'unoccupied');

        automaticWorkerAllocation(agentMap(agent), planet);
        hireWorkforce(agentMap(agent), planet);

        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBe(unoccNoneBefore);
        expect(totalOnboardingForEdu(wf, 'none')).toBe(0);
        expect(totalActiveForEdu(wf, 'secondary')).toBe(1000);
    });

    it('hires native none workers first into none slots that are actually empty', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, secondary: 2000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });
        agent.assets.p.productionFacilities = [fac];
        agent.assets.p.totalSlotCapacity = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };

        fac.lastTickResults.totalUsedByEdu = { none: 0, primary: 0, secondary: 500, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.overqualifiedWorkers = { none: { secondary: 500 } };

        agent.assets.p.wagePerEdu.none = 1e9;
        const wf = agent.assets.p.workforceDemography!;
        wf[30].secondary.active = 500;
        planet.population.demography[30].employed.secondary.total = 500;
        planet.population.demography[30].unoccupied.none.total = 500;

        const unoccNoneBefore = sumPopOcc(planet, 'none', 'unoccupied');

        automaticWorkerAllocation(agentMap(agent), planet);
        hireWorkforce(agentMap(agent), planet);

        expect(sumPopOcc(planet, 'none', 'unoccupied')).toBeLessThan(unoccNoneBefore);
        expect(totalOnboardingForEdu(wf, 'none')).toBeGreaterThan(0);
    });

    it('only re-hires natives at the idle-buffer rate when slots are overqualified-filled but some natives remain', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, secondary: 2000 });
        const agent = makeAgent();
        const fac = makeProductionFacility({ none: 100 }, { scale: 10 });
        agent.assets.p.productionFacilities = [fac];
        agent.assets.p.totalSlotCapacity = { none: 1000, primary: 0, secondary: 0, tertiary: 0 };

        fac.lastTickResults.totalUsedByEdu = { none: 50, primary: 0, secondary: 950, tertiary: 0 };
        fac.lastTickResults.exactUsedByEdu = { none: 50, primary: 0, secondary: 0, tertiary: 0 };
        fac.lastTickResults.overqualifiedWorkers = { none: { secondary: 950 } };

        agent.assets.p.wagePerEdu.none = 1e9;
        const wf = agent.assets.p.workforceDemography!;
        wf[30].none.active = 50;
        wf[30].secondary.active = 950;
        planet.population.demography[30].employed.none.total = 50;
        planet.population.demography[30].employed.secondary.total = 950;
        planet.population.demography[30].unoccupied.none.total = 100;

        const unoccNoneBefore = sumPopOcc(planet, 'none', 'unoccupied');

        automaticWorkerAllocation(agentMap(agent), planet);
        hireWorkforce(agentMap(agent), planet);

        expect(unoccNoneBefore - sumPopOcc(planet, 'none', 'unoccupied')).toBeLessThanOrEqual(5);
        expect(totalActiveForEdu(wf, 'secondary')).toBe(950);
    });
});

describe('cross-tier backfill double-deduction', () => {
    it('keeps hiring native secondary workers after a lower-tier backfill consumed part of the pool', () => {
        const { planet } = makePlanetWithPopulation({ none: 0, primary: 0, secondary: 2000, tertiary: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers = makeAllocatedWorkers({ none: 100, secondary: 100 });
        agent.assets.p.wagePerEdu.secondary = 1e9;
        agent.assets.p.wagePerEdu.tertiary = 1e9;

        for (let tick = 0; tick < 3; tick++) {
            hireWorkforce(agentMap(agent), planet);
        }

        const wf = agent.assets.p.workforceDemography!;
        expect(totalOnboardingForEdu(wf, 'secondary')).toBeGreaterThan(190);
        expect(totalOnboardingForEdu(wf, 'tertiary')).toBeLessThan(10);
        expect(sumPopOcc(planet, 'secondary', 'unoccupied')).toBeLessThan(1810);
    });

    it('does not trigger the debug backfill-stall invariant under SIM_DEBUG', () => {
        process.env.SIM_DEBUG = '1';
        try {
            const { planet } = makePlanetWithPopulation({ none: 0, primary: 0, secondary: 2000, tertiary: 10000 });
            const agent = makeAgent();
            agent.assets.p.allocatedWorkers = makeAllocatedWorkers({ none: 100, secondary: 100 });
            agent.assets.p.wagePerEdu.secondary = 1e9;
            agent.assets.p.wagePerEdu.tertiary = 1e9;

            expect(() => hireWorkforce(agentMap(agent), planet)).not.toThrow();
        } finally {
            delete process.env.SIM_DEBUG;
        }
    });
});

describe('assertBackfillProgress debug invariant', () => {
    const saved = process.env.SIM_DEBUG;

    afterEach(() => {
        if (saved === undefined) {
            delete process.env.SIM_DEBUG;
        } else {
            process.env.SIM_DEBUG = saved;
        }
    });

    it('fires when the loop stalls with willing workers remaining', () => {
        process.env.SIM_DEBUG = '1';
        expect(() => assertBackfillProgress('secondary', 'secondary', 20, 10, 0)).toThrow(/backfill stall/);
    });

    it('stays silent while hires still make progress', () => {
        process.env.SIM_DEBUG = '1';
        expect(() => assertBackfillProgress('secondary', 'secondary', 20, 10, 10)).not.toThrow();
    });

    it('stays silent for fractional willing pools below one worker', () => {
        process.env.SIM_DEBUG = '1';
        expect(() => assertBackfillProgress('secondary', 'secondary', 20, 0.5, 0)).not.toThrow();
    });

    it('stays silent when no gap remains', () => {
        process.env.SIM_DEBUG = '1';
        expect(() => assertBackfillProgress('secondary', 'secondary', 0, 10, 0)).not.toThrow();
    });
});
