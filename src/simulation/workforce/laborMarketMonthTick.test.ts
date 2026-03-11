import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import type { EducationLevelType } from '../population/education';
import { SKILL } from '../population/population';

import { postProductionLaborMarketTick } from './laborMarketMonthTick';
import { preProductionLaborMarketTick, NOTICE_PERIOD_MONTHS } from './laborMarketTick';
import { makeAgent, makePlanetWithPopulation, totalPopulation, sumPopOcc, agentMap } from '../utils/testHelper';
import { assertTotalPopulationConserved } from '../utils/testAssertions';
import type { makeWorkforceDemography } from '../utils/testHelper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum all departing workers across all ages, skill levels, and pipeline slots for a given edu. */
function totalDepartingForEdu(workforce: ReturnType<typeof makeWorkforceDemography>, edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            for (const dep of workforce[age][edu][skill].departing) {
                total += dep;
            }
        }
    }
    return total;
}

// ---------------------------------------------------------------------------
// postProductionLaborMarketTick — basic pipeline behaviour
// ---------------------------------------------------------------------------

describe('postProductionLaborMarketTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanetWithPopulation({}));
    });

    it('shifts the departing pipeline down by one slot', () => {
        const workforce = agent.assets.p.workforceDemography!;
        // Place departing workers at different pipeline slots for age=30, none/novice
        workforce[30].none.novice.departing[1] = 5;
        workforce[30].none.novice.departing[2] = 3;

        // Need employed population at age 30 so returnToPopulationAtAge can move them
        planet.population.demography[30].employed.none.novice.total = 100;

        postProductionLaborMarketTick(agentMap(agent), planet);

        // Pipeline shifted: slot[1]->slot[0], slot[2]->slot[1], last slot cleared
        expect(workforce[30].none.novice.departing[0]).toBe(5);
        expect(workforce[30].none.novice.departing[1]).toBe(3);
        expect(workforce[30].none.novice.departing[2]).toBe(0);
    });

    it('drains slot-0 workers back to the unoccupied population', () => {
        const workforce = agent.assets.p.workforceDemography!;
        // Place 10 departing workers at slot 0 for age=25, primary/novice
        workforce[25].primary.novice.departing[0] = 10;

        // Ensure employed population at age 25 has at least 10 workers
        planet.population.demography[25].employed.primary.novice.total = 20;
        planet.population.demography[25].unoccupied.primary.novice.total = 50;

        postProductionLaborMarketTick(agentMap(agent), planet);

        // Workers moved from employed to unoccupied at age 25
        expect(planet.population.demography[25].employed.primary.novice.total).toBe(10);
        expect(planet.population.demography[25].unoccupied.primary.novice.total).toBe(60);
    });

    it('clears the last pipeline slot after advancing', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].none.novice.departing[NOTICE_PERIOD_MONTHS - 1] = 7;

        postProductionLaborMarketTick(agentMap(agent), planet);

        expect(workforce[30].none.novice.departing[NOTICE_PERIOD_MONTHS - 2]).toBe(7);
        expect(workforce[30].none.novice.departing[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('does nothing when workforceDemography is absent', () => {
        agent.assets.p.workforceDemography = undefined as never;
        expect(() => postProductionLaborMarketTick(agentMap(agent), planet)).not.toThrow();
    });

    it('resets death, disability, and retirement counters', () => {
        const zero = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
        // Set "this month" counters via new sub-objects
        agent.assets.p.deaths = {
            thisMonth: { none: 5, primary: 0, secondary: 0, tertiary: 0 },
            prevMonth: { ...zero },
        };
        agent.assets.p.disabilities = {
            thisMonth: { none: 3, primary: 0, secondary: 0, tertiary: 0 },
            prevMonth: { ...zero },
        };
        agent.assets.p.retirements = {
            thisMonth: { none: 2, primary: 0, secondary: 0, tertiary: 0 },
            prevMonth: { ...zero },
        };

        postProductionLaborMarketTick(agentMap(agent), planet);

        // "this month" rotated into "prev month"
        expect(agent.assets.p.deaths!.prevMonth.none).toBe(5);
        expect(agent.assets.p.disabilities!.prevMonth.none).toBe(3);
        expect(agent.assets.p.retirements!.prevMonth.none).toBe(2);

        // "this month" reset to 0
        expect(agent.assets.p.deaths!.thisMonth.none).toBe(0);
        expect(agent.assets.p.disabilities!.thisMonth.none).toBe(0);
        expect(agent.assets.p.retirements!.thisMonth.none).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Population conservation — month tick
// ---------------------------------------------------------------------------

describe('postProductionLaborMarketTick — population conservation', () => {
    it('conserves total population when departing pipeline completes', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 1000;

        // Hire workers via preProductionLaborMarketTick
        preProductionLaborMarketTick(agentMap(agent), planet);
        const afterHire = totalPopulation(planet);

        // Manually move some active workers into the departing pipeline
        const wf = agent.assets.p.workforceDemography!;
        let movedToDeparting = 0;
        for (let age = 0; age < wf.length && movedToDeparting < 50; age++) {
            for (const skill of SKILL) {
                const cat = wf[age].none[skill];
                const take = Math.min(cat.active, 50 - movedToDeparting);
                if (take > 0) {
                    cat.active -= take;
                    cat.departing[0] = take;
                    movedToDeparting += take;
                }
                if (movedToDeparting >= 50) {
                    break;
                }
            }
        }

        postProductionLaborMarketTick(agentMap(agent), planet);

        assertTotalPopulationConserved(planet, afterHire);
    });

    it('pipeline shift preserves total departing counts minus drained slot', () => {
        const { planet } = makePlanetWithPopulation({ none: 5000 });
        const agent = makeAgent();

        const wf = agent.assets.p.workforceDemography!;
        // Place 100 active workers at age 30, none/novice
        wf[30].none.novice.active = 100;
        agent.assets.p.allocatedWorkers.none = 100;

        // Fill the departing pipeline
        let totalInPipeline = 0;
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            const count = (m + 1) * 10;
            wf[30].none.novice.departing[m] = count;
            totalInPipeline += count;
        }

        // Ensure enough employed population at age 30 for the drain
        planet.population.demography[30].employed.none.novice.total = 100 + totalInPipeline;

        const popBefore = totalPopulation(planet);

        postProductionLaborMarketTick(agentMap(agent), planet);

        // After month tick: slot[0] was drained, rest shifted down
        let pipelineAfter = 0;
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            pipelineAfter += wf[30].none.novice.departing[m];
        }
        // slot-0 had (0+1)*10=10, so total drops by 10
        expect(pipelineAfter).toBe(totalInPipeline - 10);

        assertTotalPopulationConserved(planet, popBefore);
    });
});

// ---------------------------------------------------------------------------
// departingFired pipeline — consistency
// ---------------------------------------------------------------------------

describe('departingFired pipeline — consistency', () => {
    it('departingFired never exceeds departing at any pipeline slot', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();

        const wf = agent.assets.p.workforceDemography!;
        // Place 1000 workers, but only allocate 500 -> 500 will be fired
        wf[30].none.novice.active = 1000;
        agent.assets.p.allocatedWorkers.none = 500;

        preProductionLaborMarketTick(agentMap(agent), planet);

        for (let age = 0; age < wf.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = wf[age][edu][skill];
                    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                        expect(
                            cat.departingFired[m],
                            `departingFired > departing at slot ${m} for ${edu}.${skill} age=${age}`,
                        ).toBeLessThanOrEqual(cat.departing[m]);
                    }
                }
            }
        }
    });

    it('departingFired pipeline shifts in sync with departing pipeline during month tick', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();

        const wf = agent.assets.p.workforceDemography!;
        // Place values directly in the departing + departingFired pipelines
        wf[30].none.novice.departing[2] = 50;
        wf[30].none.novice.departingFired[2] = 30;
        wf[30].none.novice.active = 100;
        agent.assets.p.allocatedWorkers.none = 100;

        // Ensure employed population at age 30 for drain
        planet.population.demography[30].employed.none.novice.total = 200;

        postProductionLaborMarketTick(agentMap(agent), planet);

        // Slot 2 -> slot 1 after shift
        expect(wf[30].none.novice.departing[1]).toBe(50);
        expect(wf[30].none.novice.departingFired[1]).toBe(30);
        // Last slot cleared
        expect(wf[30].none.novice.departing[2]).toBe(0);
        expect(wf[30].none.novice.departingFired[2]).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Pipeline drain edge cases
// ---------------------------------------------------------------------------

describe('pipeline drain edge cases', () => {
    it('departing pipeline fully drains after NOTICE_PERIOD_MONTHS month ticks', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 500;

        // Hire, then move all active into the departing pipeline
        preProductionLaborMarketTick(agentMap(agent), planet);
        const before = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        for (let age = 0; age < wf.length; age++) {
            for (const skill of SKILL) {
                const cat = wf[age].none[skill];
                if (cat.active > 0) {
                    cat.departing[NOTICE_PERIOD_MONTHS - 1] += cat.active;
                    cat.active = 0;
                }
            }
        }
        // Set allocatedWorkers to 0 so no re-hiring occurs
        agent.assets.p.allocatedWorkers.none = 0;

        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            postProductionLaborMarketTick(agentMap(agent), planet);
        }

        expect(totalDepartingForEdu(wf, 'none')).toBe(0);
        assertTotalPopulationConserved(planet, before);
        expect(sumPopOcc(planet, 'none', 'employed')).toBe(0);
    });

    it('handles multiple education levels independently', () => {
        const { planet } = makePlanetWithPopulation({ none: 5000, primary: 3000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 100;
        agent.assets.p.allocatedWorkers.primary = 50;

        preProductionLaborMarketTick(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;
        const primaryBefore = totalDepartingForEdu(wf, 'primary');

        // Place some departing workers in slot 0 for none only
        let placed = 0;
        for (let age = 0; age < wf.length && placed < 10; age++) {
            for (const skill of SKILL) {
                const cat = wf[age].none[skill];
                if (cat.active > 0) {
                    const take = Math.min(cat.active, 10 - placed);
                    cat.active -= take;
                    cat.departing[0] += take;
                    placed += take;
                }
                if (placed >= 10) {
                    break;
                }
            }
        }

        const before = totalPopulation(planet);
        postProductionLaborMarketTick(agentMap(agent), planet);

        // Primary departing should be unchanged (still whatever voluntary quits placed)
        expect(totalDepartingForEdu(wf, 'primary')).toBe(primaryBefore);

        assertTotalPopulationConserved(planet, before);
    });
});
