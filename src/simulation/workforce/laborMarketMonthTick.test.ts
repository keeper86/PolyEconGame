import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet } from '../planet';
import { educationLevelKeys } from '../planet';

import { laborMarketMonthTick } from './laborMarketMonthTick';
import { laborMarketTick } from './laborMarketTick';
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
// Retirement is now handled population-side (applyRetirement + workforceSync).
// laborMarketMonthTick only drains the legacy retiring pipeline back to active.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Retiring pipeline — drains back to active (legacy compatibility)
// ---------------------------------------------------------------------------

describe('retiring pipeline — drains back to active (legacy)', () => {
    it('returns slot-0 retirees to active and shifts the pipeline', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();

        const wf = agent.assets.p.workforceDemography!;
        const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        pipeline[0] = 20;
        pipeline[1] = 10;
        wf[40].retiring.primary = pipeline;
        wf[40].active.primary = 50;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        // slot-0 retirees drained to active
        expect(wf[40].active.primary).toBe(70); // 50 + 20
        // pipeline shifted: slot[1]→slot[0]
        expect(wf[40].retiring.primary[0]).toBe(10);
        expect(wf[40].retiring.primary[1]).toBe(0);
    });

    it('does not mix retiring and departing pipelines', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        planet.population.demography[30].none.company = 200;

        const wf = agent.assets.p.workforceDemography!;
        const depPipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        depPipeline[0] = 10;
        wf[20].departing.none = depPipeline;
        const retPipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        retPipeline[0] = 5;
        wf[20].retiring.none = retPipeline;
        wf[20].active.none = 100;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        // Departing goes to unoccupied (via returnToPopulation)
        // Retiring drains to active (legacy compatibility)
        expect(wf[20].active.none).toBe(105); // 100 + 5 from retiring
        // Departing pipeline advanced
        expect(wf[20].departing.none[0]).toBe(0);
    });
});

// (Gaussian variance-based retirement tests removed — retirement is now population-driven)

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

    it('conserves total population when retiring pipeline drains to active', () => {
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

        // Retiring pipeline drains to active (legacy compatibility)
        // so total population and workforce↔population consistency hold
        assertTotalPopulationConserved(planet, afterHire);
        assertWorkforcePopulationConsistency(planet, [agent], 'after retiring drain');
    });

    it('departure and retirement drain preserve workforce↔population consistency for government', () => {
        const { planet, gov } = makePlanet({ none: 5000 });
        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                deposits: 0,
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 500, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };

        laborMarketTick(agentMap(gov), planetMap(planet));
        const afterHire = totalPopulation(planet);

        const wf = gov.assets.p.workforceDemography!;
        const dep = Math.min(20, wf[0].active.none);
        // Retiring pipeline drains to active, so just test departing
        wf[0].active.none -= dep;
        wf[0].departing.none[0] = dep;

        laborMarketMonthTick(agentMap(gov), planetMap(planet));

        assertTotalPopulationConserved(planet, afterHire);

        const govPop = sumPopOcc(planet, 'none', 'government');
        const govWf = sumWorkforceForEdu(gov, 'p', 'none');
        expect(govWf).toBe(govPop);
    });

    // (Gaussian retirement trigger conservation tests removed — retirement is now population-driven)

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

    it('retiring pipeline fully drains back to active after NOTICE_PERIOD_MONTHS month ticks', () => {
        const { planet } = makePlanet({ primary: 10000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.primary = 300;
        laborMarketTick(agentMap(agent), planetMap(planet));

        const wf = agent.assets.p.workforceDemography!;
        const active = wf[0].active.primary;
        wf[0].active.primary = 0;
        wf[0].retiring.primary[NOTICE_PERIOD_MONTHS - 1] = active;

        const before = totalPopulation(planet);

        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            laborMarketMonthTick(agentMap(agent), planetMap(planet));
        }

        // Legacy retiring pipeline drains back to active (not to unableToWork)
        expect(totalRetiringForEdu(wf, 'primary')).toBe(0);
        expect(wf[0].active.primary).toBe(active);
        assertTotalPopulationConserved(planet, before);
        assertWorkforcePopulationConsistency(planet, [agent], 'after retiring drain');
    });
});
