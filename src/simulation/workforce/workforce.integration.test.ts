import { describe, it, expect } from 'vitest';

import { TICKS_PER_MONTH, MONTHS_PER_YEAR } from '../constants';
import type { Agent, EducationLevelType } from '../planet';

import { laborMarketTick } from './laborMarketTick';
import { laborMarketMonthTick } from './laborMarketMonthTick';
import { laborMarketYearTick } from './laborMarketYearTick';
import { syncWorkforceWithPopulation } from './workforceSync';
import { applyMortality } from '../population/mortality';
import { applyDisability } from '../population/disability';
import { applyRetirement } from '../population/retirement';
import { calculateDemographicStats } from '../population/demographics';
import { populationAdvanceYear } from '../population/aging';
import {
    makeAgent,
    makeStorageFacility,
    makePlanet,
    totalPopulation,
    sumWorkforceForEdu,
    assertTotalPopulationConserved,
    assertWorkforcePopulationConsistency,
    assertAllNonNegative,
} from './testHelpers';
import {
    createWorkforceDemography,
    NOTICE_PERIOD_MONTHS,
    totalActiveForEdu,
    ageMomentsForAge,
    emptyAgeMoments,
    mergeAgeMoments,
} from './workforceHelpers';

// ============================================================================
// Full tick cycle — month boundary
// ============================================================================

describe('full tick cycle — conservation across month boundary', () => {
    it('conserves population through 30 ticks + month tick', () => {
        const { planet } = makePlanet({ none: 20000, primary: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 2000;
        agent.assets.p.allocatedWorkers.primary = 500;

        const before = totalPopulation(planet);

        for (let t = 0; t < TICKS_PER_MONTH; t++) {
            laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            assertWorkforcePopulationConsistency(planet, [agent], `tick ${t}`);
        }
        laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertTotalPopulationConserved(planet, before, 'after month');
        assertWorkforcePopulationConsistency(planet, [agent], 'after month tick');
    });
});

// ============================================================================
// Full tick cycle — year boundary
// ============================================================================

describe('full tick cycle — conservation across year boundary', () => {
    it('conserves population through a full year of ticks + month ticks + year tick', () => {
        const { planet } = makePlanet({ none: 50000, primary: 20000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 3000;
        agent.assets.p.allocatedWorkers.primary = 800;

        const before = totalPopulation(planet);

        for (let month = 0; month < MONTHS_PER_YEAR; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            }
            laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            assertWorkforcePopulationConsistency(planet, [agent], `month ${month}`);
        }

        laborMarketYearTick(new Map([[agent.id, agent]]));

        assertTotalPopulationConserved(planet, before, 'after full year');
        assertWorkforcePopulationConsistency(planet, [agent], 'after year tick');
    });
});

// ============================================================================
// Full tick cycle — with retirement
// ============================================================================

describe('full tick cycle — conservation with retirement', () => {
    it('conserves population through year + months with retirement happening', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();

        agent.assets.p.allocatedWorkers.none = 1000;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        const afterHire = totalPopulation(planet);

        const wf = agent.assets.p.workforceDemography!;
        // Set workers' age to 65 (retirement-eligible) by replacing the moments
        const count = wf[0].active.none.count;
        wf[0].active.none = ageMomentsForAge(65, count);

        laborMarketYearTick(new Map([[agent.id, agent]]));

        for (let month = 0; month < MONTHS_PER_YEAR; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            }
            laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            assertTotalPopulationConserved(planet, afterHire, `month ${month}`);
            assertWorkforcePopulationConsistency(planet, [agent], `month ${month}`);
        }

        laborMarketYearTick(new Map([[agent.id, agent]]));

        for (let month = 0; month < MONTHS_PER_YEAR; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            }
            laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            assertTotalPopulationConserved(planet, afterHire, `year2 month ${month}`);
            assertWorkforcePopulationConsistency(planet, [agent], `year2 month ${month}`);
        }
    });
});

// ============================================================================
// Full tick cycle — hiring and firing
// ============================================================================

describe('full tick cycle — conservation with hiring and firing', () => {
    it('conserves population through cycles of over-staffing and under-staffing', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        const before = totalPopulation(planet);

        // Phase 1: hire 2000
        agent.assets.p.allocatedWorkers.none = 2000;
        for (let t = 0; t < TICKS_PER_MONTH; t++) {
            laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        }
        laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertTotalPopulationConserved(planet, before, 'after hire phase');
        assertWorkforcePopulationConsistency(planet, [agent], 'after hire phase');

        // Phase 2: move workers to fireable tenure and reduce target
        const wf = agent.assets.p.workforceDemography!;
        const activeInY0 = { ...wf[0].active.none };
        wf[3].active.none = mergeAgeMoments(wf[3].active.none, activeInY0);
        wf[0].active.none = emptyAgeMoments();

        agent.assets.p.allocatedWorkers.none = 500;
        for (let t = 0; t < TICKS_PER_MONTH; t++) {
            laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        }
        laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertTotalPopulationConserved(planet, before, 'after fire phase');
        assertWorkforcePopulationConsistency(planet, [agent], 'after fire phase');

        // Phase 3: wait for departing pipeline to empty over 12 months
        for (let month = 0; month < NOTICE_PERIOD_MONTHS; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            }
            laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            assertTotalPopulationConserved(planet, before, `drain month ${month}`);
            assertWorkforcePopulationConsistency(planet, [agent], `drain month ${month}`);
        }
    });
});

// ============================================================================
// Full tick cycle — multi-agent
// ============================================================================

describe('full tick cycle — multi-agent conservation', () => {
    it('conserves population with company + government agent through full year', () => {
        const { planet, gov } = makePlanet({ none: 50000, primary: 20000 });
        const agent = makeAgent();
        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                deposits: 0,
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 500, primary: 200, secondary: 0, tertiary: 0, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };
        agent.assets.p.allocatedWorkers.none = 2000;
        agent.assets.p.allocatedWorkers.primary = 800;

        const before = totalPopulation(planet);
        const agentsMap = new Map([
            [agent.id, agent],
            [gov.id, gov],
        ]);
        const planetsMap = new Map([[planet.id, planet]]);

        for (let month = 0; month < MONTHS_PER_YEAR; month++) {
            for (let t = 0; t < TICKS_PER_MONTH; t++) {
                laborMarketTick(agentsMap, planetsMap);
            }
            laborMarketMonthTick(agentsMap, planetsMap);
            assertWorkforcePopulationConsistency(planet, [agent, gov], `month ${month}`);
        }
        laborMarketYearTick(agentsMap);

        assertTotalPopulationConserved(planet, before, 'multi-agent year');
        assertWorkforcePopulationConsistency(planet, [agent, gov], 'after year tick');
    });
});

// ============================================================================
// Full tick cycle — 3 years
// ============================================================================

describe('full tick cycle — 3 years with all boundary types', () => {
    it('conserves population across 3 full years', () => {
        const { planet } = makePlanet({ none: 100000, primary: 50000, secondary: 20000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 5000;
        agent.assets.p.allocatedWorkers.primary = 2000;
        agent.assets.p.allocatedWorkers.secondary = 500;

        const before = totalPopulation(planet);

        for (let year = 0; year < 3; year++) {
            for (let month = 0; month < MONTHS_PER_YEAR; month++) {
                for (let t = 0; t < TICKS_PER_MONTH; t++) {
                    laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
                }
                laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            }
            laborMarketYearTick(new Map([[agent.id, agent]]));

            assertTotalPopulationConserved(planet, before, `year ${year}`);
            assertWorkforcePopulationConsistency(planet, [agent], `year ${year}`);
        }
    });
});

// ============================================================================
// Population ↔ Workforce accounting invariant (multi-tick)
// ============================================================================

describe('population ↔ workforce accounting invariant', () => {
    function sumPopulationOccupation(
        planet: Parameters<typeof totalPopulation>[0],
        edu: EducationLevelType,
        occupation: string,
    ): number {
        let total = 0;
        for (const cohort of planet.population.demography) {
            total += (cohort as Record<string, Record<string, number>>)[edu]?.[occupation] ?? 0;
        }
        return total;
    }

    function assertAccountingInvariant(planet: Parameters<typeof totalPopulation>[0], agents: Agent[]): void {
        const companyAgents = agents.filter((a) => a.id !== planet.governmentId);
        for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as EducationLevelType[]) {
            const popCompany = sumPopulationOccupation(planet, edu, 'company');
            let workforceCompany = 0;
            for (const agent of companyAgents) {
                workforceCompany += sumWorkforceForEdu(agent, planet.id, edu);
            }
            expect(workforceCompany, `workforce ↔ population mismatch for edu=${edu}`).toBe(popCompany);
        }
    }

    it('invariant holds after initial hire via laborMarketTick', () => {
        const { planet } = makePlanet({ none: 5000, primary: 2000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.allocatedWorkers.primary = 200;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds after hire + voluntary quits', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 10000;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertAccountingInvariant(planet, [agent]);

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds after firing (overstaffed → departing pipeline)', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 1000;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertAccountingInvariant(planet, [agent]);

        const wf = agent.assets.p.workforceDemography!;
        wf[3].active.none = { ...wf[0].active.none };
        wf[0].active.none = emptyAgeMoments();

        agent.assets.p.allocatedWorkers.none = 500;
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds after departing pipeline completes (month tick)', () => {
        const { planet } = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 1000;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertAccountingInvariant(planet, [agent]);

        const wf = agent.assets.p.workforceDemography!;
        const toDeparting = 50;
        const { count, sumAge, sumAgeSq } = wf[0].active.none;
        // Remove toDeparting workers from active and put them in departing[0]
        const meanAge = count > 0 ? sumAge / count : 30;
        const depMoments = ageMomentsForAge(meanAge, toDeparting);
        wf[0].active.none = {
            count: count - toDeparting,
            sumAge: sumAge - depMoments.sumAge,
            sumAgeSq: sumAgeSq - depMoments.sumAgeSq,
        };
        wf[0].departing.none[0] = depMoments;

        assertAccountingInvariant(planet, [agent]);

        laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds across a full multi-tick cycle (hire → quit → month → year)', () => {
        const { planet } = makePlanet({ none: 50000, primary: 20000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 2000;
        agent.assets.p.allocatedWorkers.primary = 500;

        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertAccountingInvariant(planet, [agent]);

        for (let t = 0; t < 29; t++) {
            laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            assertAccountingInvariant(planet, [agent]);
        }

        laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
        assertAccountingInvariant(planet, [agent]);

        for (let month = 1; month < 12; month++) {
            for (let t = 0; t < 30; t++) {
                laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            }
            laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            assertAccountingInvariant(planet, [agent]);
        }

        laborMarketYearTick(new Map([[agent.id, agent]]));
        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds with multiple agents on the same planet', () => {
        const { planet } = makePlanet({ none: 50000, primary: 20000 });
        const agent1 = makeAgent();
        const agent2 = makeAgent('agent-2');

        agent1.assets.p.allocatedWorkers.none = 1000;
        agent2.assets.p.allocatedWorkers.none = 500;
        agent2.assets.p.allocatedWorkers.primary = 300;

        laborMarketTick(
            new Map([
                [agent1.id, agent1],
                [agent2.id, agent2],
            ]),
            new Map([[planet.id, planet]]),
        );

        const companyAgents = [agent1, agent2];
        for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as EducationLevelType[]) {
            const popCompany = sumPopulationOccupation(planet, edu, 'company');
            let workforceCompany = 0;
            for (const a of companyAgents) {
                workforceCompany += sumWorkforceForEdu(a, planet.id, edu);
            }
            expect(workforceCompany, `multi-agent mismatch for edu=${edu}`).toBe(popCompany);
        }
    });
});

// ============================================================================
// Low-number edge cases
// ============================================================================

describe('low-number edge cases', () => {
    it('workers well above retirement age retire completely via applyRetirement + sync', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;

        // Place 10 workers at age 85 — well above the 100% annual retirement
        // threshold (age 82).  Running multiple ticks guarantees that the
        // per-tick stochastic rounding retires them all.
        planet.population.demography[85].none.company = 10;
        wf[1].active.none = ageMomentsForAge(85, 10);

        const agentsMap = new Map([[agent.id, agent]]);
        for (let tick = 0; tick < 360; tick++) {
            applyRetirement(planet.population);
            syncWorkforceWithPopulation(agentsMap, planet.id, planet.population, planet.environment, planet);
        }

        expect(planet.population.demography[85].none.company).toBe(0);
        expect(planet.population.demography[85].none.unableToWork).toBe(10);
        expect(wf[1].active.none.count).toBe(0);
    });

    it('single worker does NOT retire when below RETIREMENT_AGE', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;

        planet.population.demography[39].primary.company = 1;
        wf[10].active.primary = ageMomentsForAge(39, 1);

        const agentsMap = new Map([[agent.id, agent]]);
        for (let tick = 0; tick < 360; tick++) {
            applyRetirement(planet.population);
            syncWorkforceWithPopulation(agentsMap, planet.id, planet.population, planet.environment, planet);
        }

        expect(planet.population.demography[39].primary.company).toBe(1);
        expect(wf[10].active.primary.count).toBe(1);
    });

    it('three workers near retirement: some retire over multiple ticks', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;

        planet.population.demography[67].tertiary.company = 3;
        wf[30].active.tertiary = ageMomentsForAge(67, 3);

        const agentsMap = new Map([[agent.id, agent]]);
        for (let tick = 0; tick < 360; tick++) {
            applyRetirement(planet.population);
            syncWorkforceWithPopulation(agentsMap, planet.id, planet.population, planet.environment, planet);
        }

        const remaining = wf[30].active.tertiary.count;
        const retired = planet.population.demography[67].tertiary.unableToWork;

        expect(remaining + retired).toBe(3);
        expect(remaining).toBeGreaterThanOrEqual(0);
        expect(remaining).toBeLessThanOrEqual(3);
    });
});

// ============================================================================
// Edge cases — structural
// ============================================================================

describe('edge cases', () => {
    it('empty workforce demography does not cause crashes', () => {
        const { planet } = makePlanet();
        const agent = makeAgent();
        agent.assets.p.workforceDemography = undefined;

        expect(() => laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]))).not.toThrow();
        expect(() => laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]))).not.toThrow();
        expect(() => laborMarketYearTick(new Map([[agent.id, agent]]))).not.toThrow();
    });

    it('zero allocated workers does not hire or fire', () => {
        const { planet } = makePlanet({ none: 5000 });
        const agent = makeAgent();

        const before = totalPopulation(planet);
        laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));

        assertTotalPopulationConserved(planet, before);
        expect(totalActiveForEdu(agent.assets.p.workforceDemography!, 'none')).toBe(0);
    });
});

// ============================================================================
// Non-negative invariant — comprehensive
// ============================================================================

describe('non-negative invariant — all population slots', () => {
    it('no population slot goes negative through a full cycle', () => {
        const { planet } = makePlanet({ none: 10000, primary: 5000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 2000;
        agent.assets.p.allocatedWorkers.primary = 500;

        for (let year = 0; year < 2; year++) {
            for (let month = 0; month < MONTHS_PER_YEAR; month++) {
                for (let t = 0; t < TICKS_PER_MONTH; t++) {
                    laborMarketTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
                }
                laborMarketMonthTick(new Map([[agent.id, agent]]), new Map([[planet.id, planet]]));
            }
            laborMarketYearTick(new Map([[agent.id, agent]]));
        }

        assertAllNonNegative(planet, [agent]);
    });
});

// ============================================================================
// Workforce ↔ Population consistency with mortality and disability
// ============================================================================

describe('workforce ↔ population consistency under mortality/disability', () => {
    it('workforce active never exceeds population occupation count after sync', () => {
        // This test simulates the original bug scenario:
        // mortality removes people from population and then syncWorkforceWithPopulation
        // must remove the *exact* same count from workforce. If the workforce
        // age-weighted distribution overflows a cohort, the overflow must be
        // redistributed — otherwise workforce drifts above population.
        const { planet, gov } = makePlanet({ none: 20000, primary: 10000 });
        const agent = makeAgent();
        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                deposits: 0,
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 3000, primary: 1000, secondary: 0, tertiary: 0, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };
        agent.assets.p.allocatedWorkers.none = 5000;
        agent.assets.p.allocatedWorkers.primary = 2000;

        // Initial hiring
        const agentsMap = new Map([
            [agent.id, agent],
            [gov.id, gov],
        ]);
        laborMarketTick(agentsMap, new Map([[planet.id, planet]]));

        // Create variety in age distributions across tenure cohorts
        // to increase the chance of overflow during age-weighted removal
        const agentWf = agent.assets.p.workforceDemography!;
        if (agentWf[0].active.none.count > 100) {
            const moveCount = 100;
            const moved = ageMomentsForAge(75, moveCount);
            agentWf[5].active.none = mergeAgeMoments(agentWf[5].active.none, moved);
            agentWf[0].active.none = {
                count: agentWf[0].active.none.count - moveCount,
                sumAge: agentWf[0].active.none.sumAge - moved.sumAge,
                sumAgeSq: agentWf[0].active.none.sumAgeSq - moved.sumAgeSq,
            };
        }

        // Simulate many ticks of mortality + disability syncing
        for (let tick = 0; tick < 100; tick++) {
            const { totalInCohort } = calculateDemographicStats(planet.population);
            applyMortality(planet.population, planet.environment, totalInCohort);
            applyDisability(planet.population, planet.environment);
            syncWorkforceWithPopulation(agentsMap, planet.id, planet.population, planet.environment, planet);

            // After sync, active workforce for each edu×occ must NOT exceed population
            for (const edu of ['none', 'primary'] as const) {
                // Company (agent)
                let wfCompanyActive = 0;
                for (const cohort of agent.assets.p.workforceDemography!) {
                    wfCompanyActive += cohort.active[edu].count;
                }
                let popCompany = 0;
                for (const cohort of planet.population.demography) {
                    popCompany += cohort[edu].company;
                }
                expect(
                    wfCompanyActive,
                    `tick ${tick}: company workforce active (${wfCompanyActive}) > population company (${popCompany}) for edu=${edu}`,
                ).toBeLessThanOrEqual(popCompany);

                // Government (gov)
                let wfGovActive = 0;
                for (const cohort of gov.assets.p.workforceDemography!) {
                    wfGovActive += cohort.active[edu].count;
                }
                let popGov = 0;
                for (const cohort of planet.population.demography) {
                    popGov += cohort[edu].government;
                }
                expect(
                    wfGovActive,
                    `tick ${tick}: gov workforce active (${wfGovActive}) > population gov (${popGov}) for edu=${edu}`,
                ).toBeLessThanOrEqual(popGov);
            }
        }
    });
});

// ============================================================================
// Age drift — workforce mean age must track population employed mean age
// ============================================================================

describe('age drift — long-run consistency', () => {
    it('workforce mean age tracks population employed mean age over 20 simulated years', () => {
        // Use a broad age distribution so the population is realistic and
        // self-sustaining: workers across ages 18-64 with children & elderly.
        const { planet, gov } = makePlanet({ none: 50000, primary: 20000 });

        // Also seed some children (ages 0-17) and elderly to make fertility realistic
        for (let age = 0; age < 18; age++) {
            planet.population.demography[age].none.education = Math.floor(600 * (1 - age / 100));
        }
        for (let age = 65; age < 80; age++) {
            planet.population.demography[age].none.unableToWork = Math.floor(400 * (1 - (age - 65) / 30));
        }

        const agent = makeAgent();
        gov.assets = {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                deposits: 0,
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 1000, primary: 400, secondary: 0, tertiary: 0, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        };
        agent.assets.p.allocatedWorkers.none = 5000;
        agent.assets.p.allocatedWorkers.primary = 2000;

        const agentsMap = new Map([
            [agent.id, agent],
            [gov.id, gov],
        ]);
        const planetsMap = new Map([[planet.id, planet]]);

        // Initial hiring
        laborMarketTick(agentsMap, planetsMap);

        const YEARS = 20;

        for (let year = 0; year < YEARS; year++) {
            for (let month = 0; month < MONTHS_PER_YEAR; month++) {
                for (let t = 0; t < TICKS_PER_MONTH; t++) {
                    laborMarketTick(agentsMap, planetsMap);

                    // Apply population demographics
                    const { totalInCohort } = calculateDemographicStats(planet.population);
                    applyMortality(planet.population, planet.environment, totalInCohort);
                    applyDisability(planet.population, planet.environment);
                    applyRetirement(planet.population);
                    syncWorkforceWithPopulation(agentsMap, planet.id, planet.population, planet.environment, planet);
                }
                laborMarketMonthTick(agentsMap, planetsMap);
            }

            // Age population
            const { totalInCohort } = calculateDemographicStats(planet.population);
            populationAdvanceYear(planet.population, totalInCohort);

            laborMarketYearTick(agentsMap);

            // PRIMARY INVARIANT: no active cohort should have mean age 80+
            // (retirement clears workers by age 72 and the age distribution
            // should never accumulate workers that old in the workforce).
            for (const a of [agent, gov]) {
                const wf = a.assets.p?.workforceDemography;
                if (!wf) {
                    continue;
                }
                for (const cohort of wf) {
                    for (const edu of ['none', 'primary'] as const) {
                        if (cohort.active[edu].count > 0) {
                            const activeMean = cohort.active[edu].sumAge / cohort.active[edu].count;
                            expect(
                                activeMean,
                                `year ${year}: ${a.id} active cohort mean age ${activeMean.toFixed(1)} exceeds 80`,
                            ).toBeLessThan(80);
                        }
                    }
                }
            }
        }
    }, 60_000);
});
