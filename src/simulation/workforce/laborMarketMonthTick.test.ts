import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import type { EducationLevelType } from '../population/education';
import { SKILL } from '../population/population';

import { postProductionLaborMarketTick } from './laborMarketMonthTick';
import { hireWorkforce } from './hireWorkforce';
import { makeAgent, makePlanetWithPopulation, totalPopulation, sumPopOcc, agentMap } from '../utils/testHelper';
import { assertTotalPopulationConserved } from '../utils/testAssertions';
import type { makeWorkforceDemography } from '../utils/testHelper';
import { NOTICE_PERIOD_MONTHS } from '../constants';

function totalDepartingForEdu(workforce: ReturnType<typeof makeWorkforceDemography>, edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            for (const dep of workforce[age][edu][skill].voluntaryDeparting) {
                total += dep;
            }
        }
    }
    return total;
}

describe('postProductionLaborMarketTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        ({ planet } = makePlanetWithPopulation({}));
    });

    it('shifts the departing pipeline down by one slot', () => {
        const workforce = agent.assets.p.workforceDemography!;

        workforce[30].none.novice.voluntaryDeparting[1] = 5;
        workforce[30].none.novice.voluntaryDeparting[2] = 3;

        planet.population.demography[30].employed.none.novice.total = 100;

        postProductionLaborMarketTick(agentMap(agent), planet);

        expect(workforce[30].none.novice.voluntaryDeparting[0]).toBe(5);
        expect(workforce[30].none.novice.voluntaryDeparting[1]).toBe(3);
        expect(workforce[30].none.novice.voluntaryDeparting[2]).toBe(0);
    });

    it('drains slot-0 workers back to the unoccupied population', () => {
        const workforce = agent.assets.p.workforceDemography!;

        workforce[25].primary.novice.voluntaryDeparting[0] = 10;

        planet.population.demography[25].employed.primary.novice.total = 20;
        planet.population.demography[25].unoccupied.primary.novice.total = 50;

        postProductionLaborMarketTick(agentMap(agent), planet);

        expect(planet.population.demography[25].employed.primary.novice.total).toBe(10);
        expect(planet.population.demography[25].unoccupied.primary.novice.total).toBe(60);
    });

    it('clears the last pipeline slot after advancing', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1] = 7;

        postProductionLaborMarketTick(agentMap(agent), planet);

        expect(workforce[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 2]).toBe(7);
        expect(workforce[30].none.novice.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('does nothing when workforceDemography is absent', () => {
        agent.assets.p.workforceDemography = undefined as never;
        expect(() => postProductionLaborMarketTick(agentMap(agent), planet)).not.toThrow();
    });

    it('resets death, disability, and retirement counters', () => {
        const zero = { none: 0, primary: 0, secondary: 0, tertiary: 0 };

        agent.assets.p.deaths = {
            thisMonth: { none: 5, primary: 0, secondary: 0, tertiary: 0 },
            prevMonth: { ...zero },
        };
        agent.assets.p.disabilities = {
            thisMonth: { none: 3, primary: 0, secondary: 0, tertiary: 0 },
            prevMonth: { ...zero },
        };

        postProductionLaborMarketTick(agentMap(agent), planet);

        expect(agent.assets.p.deaths!.prevMonth.none).toBe(5);
        expect(agent.assets.p.disabilities!.prevMonth.none).toBe(3);

        expect(agent.assets.p.deaths!.thisMonth.none).toBe(0);
        expect(agent.assets.p.disabilities!.thisMonth.none).toBe(0);
    });
});

describe('postProductionLaborMarketTick — population conservation', () => {
    it('conserves total population when departing pipeline completes', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 1000;

        hireWorkforce(agentMap(agent), planet);
        const afterHire = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        let movedToDeparting = 0;
        for (let age = 0; age < wf.length && movedToDeparting < 50; age++) {
            for (const skill of SKILL) {
                const cat = wf[age].none[skill];
                const take = Math.min(cat.active, 50 - movedToDeparting);
                if (take > 0) {
                    cat.active -= take;
                    cat.voluntaryDeparting[0] = take;
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

        wf[30].none.novice.active = 100;
        agent.assets.p.allocatedWorkers.none = 100;

        let totalInPipeline = 0;
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            const count = (m + 1) * 10;
            wf[30].none.novice.voluntaryDeparting[m] = count;
            totalInPipeline += count;
        }

        planet.population.demography[30].employed.none.novice.total = 100 + totalInPipeline;

        const popBefore = totalPopulation(planet);

        postProductionLaborMarketTick(agentMap(agent), planet);

        let pipelineAfter = 0;
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            pipelineAfter += wf[30].none.novice.voluntaryDeparting[m];
        }

        expect(pipelineAfter).toBe(totalInPipeline - 10);

        assertTotalPopulationConserved(planet, popBefore);
    });
});

describe('departingFired pipeline — consistency', () => {
    it('fired workers go into the departingFired pipeline, not voluntaryDeparting', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();

        const wf = agent.assets.p.workforceDemography!;

        wf[30].none.novice.active = 1000;

        planet.population.demography[30].employed.none.novice.total = 1000;
        agent.assets.p.allocatedWorkers.none = 500;

        hireWorkforce(agentMap(agent), planet);

        let totalFired = 0;
        let totalVoluntary = 0;
        for (let age = 0; age < wf.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = wf[age][edu][skill];
                    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                        totalFired += cat.departingFired[m];
                        totalVoluntary += cat.voluntaryDeparting[m];
                    }
                }
            }
        }

        expect(totalFired).toBe(500);

        expect(totalVoluntary).toBe(0);
    });

    it('departingFired pipeline shifts in sync with departing pipeline during month tick', () => {
        const { planet } = makePlanetWithPopulation({ none: 50000 });
        const agent = makeAgent();

        const wf = agent.assets.p.workforceDemography!;

        wf[30].none.novice.voluntaryDeparting[2] = 50;
        wf[30].none.novice.departingFired[2] = 30;
        wf[30].none.novice.active = 100;
        agent.assets.p.allocatedWorkers.none = 100;

        planet.population.demography[30].employed.none.novice.total = 200;

        postProductionLaborMarketTick(agentMap(agent), planet);

        expect(wf[30].none.novice.voluntaryDeparting[1]).toBe(50);
        expect(wf[30].none.novice.departingFired[1]).toBe(30);

        expect(wf[30].none.novice.voluntaryDeparting[2]).toBe(0);
        expect(wf[30].none.novice.departingFired[2]).toBe(0);
    });
});

describe('pipeline drain edge cases', () => {
    it('departing pipeline fully drains after NOTICE_PERIOD_MONTHS month ticks', () => {
        const { planet } = makePlanetWithPopulation({ none: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 500;

        hireWorkforce(agentMap(agent), planet);
        const before = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        for (let age = 0; age < wf.length; age++) {
            for (const skill of SKILL) {
                const cat = wf[age].none[skill];
                if (cat.active > 0) {
                    cat.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1] += cat.active;
                    cat.active = 0;
                }
            }
        }

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

        hireWorkforce(agentMap(agent), planet);

        const wf = agent.assets.p.workforceDemography!;
        const primaryBefore = totalDepartingForEdu(wf, 'primary');

        let placed = 0;
        for (let age = 0; age < wf.length && placed < 10; age++) {
            for (const skill of SKILL) {
                const cat = wf[age].none[skill];
                if (cat.active > 0) {
                    const take = Math.min(cat.active, 10 - placed);
                    cat.active -= take;
                    cat.voluntaryDeparting[0] += take;
                    placed += take;
                }
                if (placed >= 10) {
                    break;
                }
            }
        }

        const before = totalPopulation(planet);
        postProductionLaborMarketTick(agentMap(agent), planet);

        expect(totalDepartingForEdu(wf, 'primary')).toBe(primaryBefore);

        assertTotalPopulationConserved(planet, before);
    });
});
