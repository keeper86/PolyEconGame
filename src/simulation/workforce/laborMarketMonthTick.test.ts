import { describe, it, expect, beforeEach } from 'vitest';

import { MONTHS_PER_YEAR } from '../constants';
import type { Agent, Planet } from '../planet';
import { educationLevelKeys } from '../planet';

import { laborMarketMonthTick } from './laborMarketMonthTick';
import { laborMarketTick } from './laborMarketTick';
import { laborMarketYearTick } from './laborMarketYearTick';
import {
    makeAgent,
    makeStorageFacility,
    makePlanet,
    totalPopulation,
    sumPopOcc,
    sumWorkforceForEdu,
    assertTotalPopulationConserved,
    assertWorkforcePopulationConsistency,
    agentMap,
    planetMap,
} from './testHelpers';
import {
    createWorkforceDemography,
    NOTICE_PERIOD_MONTHS,
    RETIREMENT_AGE,
    totalActiveForEdu,
    totalDepartingForEdu,
    totalRetiringForEdu,
} from './workforceHelpers';

// ---------------------------------------------------------------------------
// laborMarketMonthTick — basic pipeline behaviour
// ---------------------------------------------------------------------------

describe('laborMarketMonthTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanet());
    });

    it('shifts the departing pipeline, discarding slot-0 workers', () => {
        const workforce = agent.assets.p.workforceDemography!;
        const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        pipeline[0] = 5;
        pipeline[1] = 3;
        pipeline[11] = 1;
        workforce[0].departing.none = pipeline;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(workforce[0].departing.none[0]).toBe(3);
        expect(workforce[0].departing.none[10]).toBe(1);
        expect(workforce[0].departing.none[11]).toBe(0);
    });

    it('clears the last pipeline slot after advancing', () => {
        const workforce = agent.assets.p.workforceDemography!;
        const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        pipeline[NOTICE_PERIOD_MONTHS - 1] = 7;
        workforce[0].departing.none = pipeline;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 2]).toBe(7);
        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('returns departing workers to the unoccupied population pool', () => {
        ({ planet } = makePlanet());
        planet.population.demography[25].primary.company = 100;
        planet.population.demography[25].primary.unoccupied = 50;

        const workforce = agent.assets.p.workforceDemography!;
        const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        pipeline[0] = 10;
        workforce[0].departing.primary = pipeline;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(planet.population.demography[25].primary.company).toBe(90);
        expect(planet.population.demography[25].primary.unoccupied).toBe(60);
    });
});

// ---------------------------------------------------------------------------
// Retirement — monthly trigger
// ---------------------------------------------------------------------------

describe('retirement — monthly via laborMarketMonthTick', () => {
    it('moves all deterministic retirement-eligible workers into the retiring pipeline', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[40].active.primary = 200;
        wf[40].ageMoments.primary = { mean: 66, variance: 0 };

        laborMarketYearTick(agentMap(agent)); // tenure shift: 40→41, age 66→67
        expect(wf[41].active.primary).toBe(200);

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(wf[41].active.primary).toBe(0);
        expect(totalRetiringForEdu(wf, 'primary')).toBe(200);
    });

    it('does NOT retire workers whose mean age is below RETIREMENT_AGE', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[5].active.secondary = 100;
        wf[5].ageMoments.secondary = { mean: 34, variance: 4 };

        laborMarketYearTick(agentMap(agent));
        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(wf[6].active.secondary).toBe(100);
        expect(totalRetiringForEdu(wf, 'secondary')).toBe(0);
    });

    it('retires only the education levels that reach RETIREMENT_AGE', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[30].active.none = 50;
        wf[30].ageMoments.none = { mean: 66, variance: 0 };
        wf[30].active.tertiary = 80;
        wf[30].ageMoments.tertiary = { mean: 50, variance: 4 };

        laborMarketYearTick(agentMap(agent));
        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(wf[31].active.none).toBe(0);
        expect(totalRetiringForEdu(wf, 'none')).toBe(50);

        expect(wf[31].active.tertiary).toBe(80);
        expect(totalRetiringForEdu(wf, 'tertiary')).toBe(0);
    });

    it('retires all deterministic workers in the first month (variance = 0)', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[40].active.primary = 120;
        wf[40].ageMoments.primary = { mean: 66, variance: 0 };

        laborMarketYearTick(agentMap(agent));
        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(wf[41].active.primary).toBe(0);
        expect(totalRetiringForEdu(wf, 'primary')).toBe(120);
    });
});

// ---------------------------------------------------------------------------
// Retirement — routes retirees to unableToWork
// ---------------------------------------------------------------------------

describe('retirement — laborMarketMonthTick routes to unableToWork', () => {
    it('advances the retiring pipeline and routes slot-0 workers to unableToWork', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        planet.population.demography[67].primary.company = 100;

        const wf = agent.assets.p.workforceDemography!;
        const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        pipeline[0] = 20;
        pipeline[1] = 10;
        wf[40].retiring.primary = pipeline;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(wf[40].retiring.primary[0]).toBe(10);
        expect(wf[40].retiring.primary[1]).toBe(0);

        expect(planet.population.demography[67].primary.company).toBe(80);
        expect(planet.population.demography[67].primary.unableToWork).toBe(20);
        expect(planet.population.demography[67].primary.unoccupied).toBe(0);
    });

    it('does not mix retiring and departing pipelines', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        planet.population.demography[40].none.company = 200;

        const wf = agent.assets.p.workforceDemography!;
        const depPipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        depPipeline[0] = 10;
        wf[20].departing.none = depPipeline;
        const retPipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        retPipeline[0] = 5;
        wf[20].retiring.none = retPipeline;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(planet.population.demography[40].none.company).toBe(185);
        expect(planet.population.demography[40].none.unoccupied).toBe(10);
        expect(planet.population.demography[40].none.unableToWork).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// Proportional retirement with variance
// ---------------------------------------------------------------------------

describe('retirement — proportional with variance (monthly)', () => {
    it('retires a fraction when mean is below RETIREMENT_AGE but variance is large', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[30].active.primary = 1000;
        wf[30].ageMoments.primary = { mean: 59, variance: 100 };

        laborMarketYearTick(agentMap(agent));
        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        const retired = totalRetiringForEdu(wf, 'primary');
        const stillActive = wf[31].active.primary;

        expect(retired).toBeGreaterThan(15);
        expect(retired).toBeLessThan(30);
        expect(stillActive).toBe(1000 - retired);
    });

    it('retires a large monthly chunk when mean is well above RETIREMENT_AGE', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[40].active.secondary = 500;
        wf[40].ageMoments.secondary = { mean: 72, variance: 9 };

        laborMarketYearTick(agentMap(agent));
        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        const retired = totalRetiringForEdu(wf, 'secondary');
        expect(retired).toBeGreaterThan(100);
        expect(retired).toBeLessThan(180);
    });

    it('retires none when mean is far below RETIREMENT_AGE even with large variance', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[10].active.none = 500;
        wf[10].ageMoments.none = { mean: 39, variance: 25 };

        laborMarketYearTick(agentMap(agent));
        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(totalRetiringForEdu(wf, 'none')).toBe(0);
        expect(wf[11].active.none).toBe(500);
    });

    it('updates ageMoments for remaining workers after partial retirement', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[35].active.none = 1000;
        wf[35].ageMoments.none = { mean: 64, variance: 25 };

        laborMarketYearTick(agentMap(agent));
        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(wf[36].ageMoments.none.mean).toBeLessThan(65);
        expect(wf[36].ageMoments.none.mean).toBeGreaterThan(55);
        expect(wf[36].ageMoments.none.variance).toBeLessThan(25);
        expect(wf[36].ageMoments.none.variance).toBeGreaterThan(0);
    });

    it('retires a significant portion over 12 months with variance', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[40].active.secondary = 500;
        wf[40].ageMoments.secondary = { mean: 72, variance: 9 };

        laborMarketYearTick(agentMap(agent));

        for (let month = 0; month < MONTHS_PER_YEAR; month++) {
            laborMarketMonthTick(agentMap(agent), planetMap(planet));
        }

        const remaining = wf[41].active.secondary;
        expect(remaining).toBeLessThan(500);
        expect(remaining).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Population conservation — month tick
// ---------------------------------------------------------------------------

describe('laborMarketMonthTick — population conservation', () => {
    it('conserves total population when departing pipeline completes', () => {
        const { planet } = makePlanet({ none: 10000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 1000;
        laborMarketTick(agentMap(agent), planetMap(planet));
        const afterHire = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        const toDep = Math.min(50, wf[0].active.none);
        wf[0].active.none -= toDep;
        wf[0].departing.none[0] = toDep;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        assertTotalPopulationConserved(planet, afterHire);
        assertWorkforcePopulationConsistency(planet, [agent], 'after month tick');
    });

    it('conserves total population when retiring pipeline completes', () => {
        const { planet } = makePlanet({ primary: 10000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.primary = 500;
        laborMarketTick(agentMap(agent), planetMap(planet));
        const afterHire = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        const toRetire = Math.min(30, wf[0].active.primary);
        wf[0].active.primary -= toRetire;
        wf[0].retiring.primary[0] = toRetire;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        assertTotalPopulationConserved(planet, afterHire);
        expect(sumPopOcc(planet, 'primary', 'unableToWork')).toBe(toRetire);
    });

    it('departure and retirement happen to correct occupations for government', () => {
        const { planet, gov } = makePlanet({ none: 5000 });
        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 500, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };

        laborMarketTick(agentMap(gov), planetMap(planet));
        const afterHire = totalPopulation(planet);

        const wf = gov.assets.p.workforceDemography!;
        const dep = Math.min(20, wf[0].active.none);
        const ret = Math.min(10, wf[0].active.none - dep);
        wf[0].active.none -= dep + ret;
        wf[0].departing.none[0] = dep;
        wf[0].retiring.none[0] = ret;

        laborMarketMonthTick(agentMap(gov), planetMap(planet));

        assertTotalPopulationConserved(planet, afterHire);

        const govPop = sumPopOcc(planet, 'none', 'government');
        const govWf = sumWorkforceForEdu(gov, 'p', 'none');
        expect(govWf).toBe(govPop);
    });

    it('monthly retirement trigger conserves people (deterministic case)', () => {
        const { planet } = makePlanet({ none: 5000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 200;
        laborMarketTick(agentMap(agent), planetMap(planet));
        const afterHire = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        wf[0].ageMoments.none = { mean: RETIREMENT_AGE, variance: 0 };

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        assertTotalPopulationConserved(planet, afterHire);
        const active = totalActiveForEdu(wf, 'none');
        const retiring = totalRetiringForEdu(wf, 'none');
        expect(active + retiring).toBe(200);
    });

    it('monthly retirement trigger conserves people (variance case)', () => {
        const { planet } = makePlanet({ primary: 20000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.primary = 1000;
        laborMarketTick(agentMap(agent), planetMap(planet));
        const afterHire = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        wf[0].ageMoments.primary = { mean: 64, variance: 25 };

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        assertTotalPopulationConserved(planet, afterHire);
        assertWorkforcePopulationConsistency(planet, [agent], 'after variance retirement');

        const active = totalActiveForEdu(wf, 'primary');
        const retiring = totalRetiringForEdu(wf, 'primary');
        expect(active).toBeGreaterThan(0);
        expect(active).toBeLessThan(1000);
        expect(active + retiring).toBe(1000);
    });

    it('pipeline shift preserves total departing/retiring counts (no drop/gain)', () => {
        const agent = makeAgent();
        const { planet } = makePlanet({ none: 5000 });

        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = 100;

        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            wf[0].departing.none[m] = m + 1;
        }
        const totalInPipeline = (NOTICE_PERIOD_MONTHS * (NOTICE_PERIOD_MONTHS + 1)) / 2;

        planet.population.demography[30].none.company = 100 + totalInPipeline;
        planet.population.demography[30].none.unoccupied = 5000;

        const popBefore = totalPopulation(planet);

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        assertTotalPopulationConserved(planet, popBefore);

        let pipelineAfter = 0;
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            pipelineAfter += wf[0].departing.none[m];
        }
        expect(pipelineAfter).toBe(totalInPipeline - 1);
    });
});

// ---------------------------------------------------------------------------
// departingFired pipeline — consistency
// ---------------------------------------------------------------------------

describe('departingFired pipeline — consistency', () => {
    it('departingFired never exceeds departing at any pipeline slot', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();

        const wf = agent.assets.p.workforceDemography!;
        wf[5].active.none = 1000;
        agent.assets.p.allocatedWorkers.none = 500;

        laborMarketTick(agentMap(agent), planetMap(planet));

        for (const cohort of wf) {
            for (const edu of educationLevelKeys) {
                for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                    expect(
                        cohort.departingFired[edu][m],
                        `departingFired > departing at slot ${m} for ${edu}`,
                    ).toBeLessThanOrEqual(cohort.departing[edu][m]);
                }
            }
        }
    });

    it('departingFired pipeline shifts in sync with departing pipeline during month tick', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();

        const wf = agent.assets.p.workforceDemography!;
        wf[3].departing.none[5] = 50;
        wf[3].departingFired.none[5] = 30;
        wf[3].active.none = 100;
        planet.population.demography[30].none.company = 200;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(wf[3].departing.none[4]).toBe(50);
        expect(wf[3].departingFired.none[4]).toBe(30);
        expect(wf[3].departing.none[5]).toBe(0);
        expect(wf[3].departingFired.none[5]).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Pipeline drain edge cases
// ---------------------------------------------------------------------------

describe('pipeline drain edge cases', () => {
    it('departing pipeline fully drains after NOTICE_PERIOD_MONTHS month ticks', () => {
        const { planet } = makePlanet({ none: 10000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 500;
        laborMarketTick(agentMap(agent), planetMap(planet));

        const before = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        const active = wf[0].active.none;
        wf[0].active.none = 0;
        wf[0].departing.none[NOTICE_PERIOD_MONTHS - 1] = active;

        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            laborMarketMonthTick(agentMap(agent), planetMap(planet));
        }

        expect(totalDepartingForEdu(wf, 'none')).toBe(0);
        assertTotalPopulationConserved(planet, before);
        expect(sumPopOcc(planet, 'none', 'company')).toBe(0);
    });

    it('retiring pipeline fully drains after NOTICE_PERIOD_MONTHS month ticks', () => {
        const { planet } = makePlanet({ primary: 10000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.primary = 300;
        laborMarketTick(agentMap(agent), planetMap(planet));

        const before = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        const active = wf[0].active.primary;
        wf[0].active.primary = 0;
        wf[0].retiring.primary[NOTICE_PERIOD_MONTHS - 1] = active;

        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            laborMarketMonthTick(agentMap(agent), planetMap(planet));
        }

        expect(totalRetiringForEdu(wf, 'primary')).toBe(0);
        assertTotalPopulationConserved(planet, before);
        expect(sumPopOcc(planet, 'primary', 'company')).toBe(0);
        expect(sumPopOcc(planet, 'primary', 'unableToWork')).toBe(active);
    });
});
