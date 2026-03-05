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
import { createWorkforceDemography, NOTICE_PERIOD_MONTHS, totalActiveForEdu } from './workforceHelpers';

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
        wf[0].ageMoments.none = { mean: 65, variance: 9 };

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
        const activeInY0 = wf[0].active.none;
        wf[3].active.none += activeInY0;
        wf[3].ageMoments.none = { ...wf[0].ageMoments.none };
        wf[0].active.none = 0;

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
        wf[3].active.none = wf[0].active.none;
        wf[3].ageMoments.none = { ...wf[0].ageMoments.none };
        wf[0].active.none = 0;

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
        wf[0].active.none -= toDeparting;
        wf[0].departing.none[0] = toDeparting;

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
    it('single worker retires via population-driven retirement (applyRetirement + sync)', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;

        // Place 1 worker at age 72 (well above RETIREMENT_AGE) in population.
        // At age 72 the annual retirement probability is 1.0, so the per-tick
        // rate equals 1.0 and the worker retires on the very first tick.
        planet.population.demography[72].none.company = 1;
        wf[1].active.none = 1;
        wf[1].ageMoments.none = { mean: 72, variance: 0 };

        const agentsMap = new Map([[agent.id, agent]]);
        applyRetirement(planet.population);
        syncWorkforceWithPopulation(agentsMap, planet.id, planet.population, planet.environment, planet);

        // Worker should be retired after a single tick at age 72
        expect(planet.population.demography[72].none.unableToWork).toBe(1);
        expect(planet.population.demography[72].none.company).toBe(0);
        expect(wf[1].active.none).toBe(0);
    });

    it('single worker does NOT retire when below RETIREMENT_AGE', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;

        // Place 1 worker at age 39 — well below retirement age
        planet.population.demography[39].primary.company = 1;
        wf[10].active.primary = 1;
        wf[10].ageMoments.primary = { mean: 39, variance: 0 };

        const agentsMap = new Map([[agent.id, agent]]);
        for (let tick = 0; tick < 360; tick++) {
            applyRetirement(planet.population);
            syncWorkforceWithPopulation(agentsMap, planet.id, planet.population, planet.environment, planet);
        }

        // No retirement should have occurred
        expect(planet.population.demography[39].primary.company).toBe(1);
        expect(wf[10].active.primary).toBe(1);
    });

    it('three workers near retirement: some retire over multiple ticks', () => {
        const agent = makeAgent();
        const { planet } = makePlanet();
        const wf = agent.assets.p.workforceDemography!;

        // Place 3 workers at age 67 (right at RETIREMENT_AGE)
        planet.population.demography[67].tertiary.company = 3;
        wf[30].active.tertiary = 3;
        wf[30].ageMoments.tertiary = { mean: 67, variance: 0 };

        const agentsMap = new Map([[agent.id, agent]]);
        for (let tick = 0; tick < 360; tick++) {
            applyRetirement(planet.population);
            syncWorkforceWithPopulation(agentsMap, planet.id, planet.population, planet.environment, planet);
        }

        const remaining = wf[30].active.tertiary;
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
        if (agentWf[0].active.none > 100) {
            const moveCount = 100;
            agentWf[5].active.none += moveCount;
            agentWf[5].ageMoments.none = { mean: 75, variance: 25 };
            agentWf[0].active.none -= moveCount;
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
                    wfCompanyActive += cohort.active[edu];
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
                    wfGovActive += cohort.active[edu];
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
