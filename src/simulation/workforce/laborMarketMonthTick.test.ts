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
    ageMomentsForAge,
    createWorkforceDemography,
    emptyAgeMoments,
    NOTICE_PERIOD_MONTHS,
    removeFromAgeMoments,
    totalDepartingForEdu,
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
        workforce[0].departing.none[0] = ageMomentsForAge(30, 5);
        workforce[0].departing.none[1] = ageMomentsForAge(30, 3);
        workforce[0].departing.none[11] = ageMomentsForAge(30, 1);

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(workforce[0].departing.none[0].count).toBe(3);
        expect(workforce[0].departing.none[10].count).toBe(1);
        expect(workforce[0].departing.none[11].count).toBe(0);
    });

    it('clears the last pipeline slot after advancing', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1] = ageMomentsForAge(30, 7);

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 2].count).toBe(7);
        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1].count).toBe(0);
    });

    it('returns departing workers to the unoccupied population pool', () => {
        ({ planet } = makePlanet());
        planet.population.demography[25].primary.company = 100;
        planet.population.demography[25].primary.unoccupied = 50;

        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].departing.primary[0] = ageMomentsForAge(25, 10);

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(planet.population.demography[25].primary.company).toBe(90);
        expect(planet.population.demography[25].primary.unoccupied).toBe(60);
    });
});

// ---------------------------------------------------------------------------
// Retirement is now handled population-side (applyRetirement + workforceSync).
// The retiring pipeline has been removed from TenureCohort.
// ---------------------------------------------------------------------------

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
        const activeCount = wf[0].active.none.count;
        const toDep = Math.min(50, activeCount);
        if (toDep > 0) {
            const depMoments = ageMomentsForAge(30, toDep);
            wf[0].active.none = removeFromAgeMoments(wf[0].active.none, 30, toDep);
            wf[0].departing.none[0] = depMoments;
        }

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        assertTotalPopulationConserved(planet, afterHire);
        assertWorkforcePopulationConsistency(planet, [agent], 'after month tick');
    });

    it('departure drain preserves workforce↔population consistency for government', () => {
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
        const activeCount = wf[0].active.none.count;
        const dep = Math.min(20, activeCount);
        if (dep > 0) {
            wf[0].active.none = removeFromAgeMoments(wf[0].active.none, 30, dep);
            wf[0].departing.none[0] = ageMomentsForAge(30, dep);
        }

        laborMarketMonthTick(agentMap(gov), planetMap(planet));

        assertTotalPopulationConserved(planet, afterHire);

        const govPop = sumPopOcc(planet, 'none', 'government');
        const govWf = sumWorkforceForEdu(gov, 'p', 'none');
        expect(govWf).toBe(govPop);
    });

    it('pipeline shift preserves total departing counts (no drop/gain)', () => {
        const agent = makeAgent();
        const { planet } = makePlanet({ none: 5000 });

        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = ageMomentsForAge(30, 100);

        let totalInPipeline = 0;
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            const count = m + 1;
            wf[0].departing.none[m] = ageMomentsForAge(30, count);
            totalInPipeline += count;
        }

        planet.population.demography[30].none.company = 100 + totalInPipeline;
        planet.population.demography[30].none.unoccupied = 5000;

        const popBefore = totalPopulation(planet);

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        assertTotalPopulationConserved(planet, popBefore);

        let pipelineAfter = 0;
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            pipelineAfter += wf[0].departing.none[m].count;
        }
        // slot-0 (count=1) was drained, so total drops by 1
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
        wf[5].active.none = ageMomentsForAge(30, 1000);
        agent.assets.p.allocatedWorkers.none = 500;

        laborMarketTick(agentMap(agent), planetMap(planet));

        for (const cohort of wf) {
            for (const edu of educationLevelKeys) {
                for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                    expect(
                        cohort.departingFired[edu][m],
                        `departingFired > departing at slot ${m} for ${edu}`,
                    ).toBeLessThanOrEqual(cohort.departing[edu][m].count);
                }
            }
        }
    });

    it('departingFired pipeline shifts in sync with departing pipeline during month tick', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();

        const wf = agent.assets.p.workforceDemography!;
        wf[3].departing.none[5] = ageMomentsForAge(30, 50);
        wf[3].departingFired.none[5] = 30;
        wf[3].active.none = ageMomentsForAge(30, 100);
        planet.population.demography[30].none.company = 200;

        laborMarketMonthTick(agentMap(agent), planetMap(planet));

        expect(wf[3].departing.none[4].count).toBe(50);
        expect(wf[3].departingFired.none[4]).toBe(30);
        expect(wf[3].departing.none[5].count).toBe(0);
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
        const activeMoments = wf[0].active.none;
        wf[0].active.none = emptyAgeMoments();
        wf[0].departing.none[NOTICE_PERIOD_MONTHS - 1] = activeMoments;

        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            laborMarketMonthTick(agentMap(agent), planetMap(planet));
        }

        expect(totalDepartingForEdu(wf, 'none')).toBe(0);
        assertTotalPopulationConserved(planet, before);
        expect(sumPopOcc(planet, 'none', 'company')).toBe(0);
    });
});
