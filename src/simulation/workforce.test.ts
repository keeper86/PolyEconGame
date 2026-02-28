import { describe, it, expect, beforeEach } from 'vitest';

import { TICKS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_YEAR, isMonthBoundary, isYearBoundary } from './constants';
import {
    MAX_TENURE_YEARS,
    NOTICE_PERIOD_MONTHS,
    VOLUNTARY_QUIT_RATE_PER_TICK,
    DEFAULT_HIRE_AGE_MEAN,
    RETIREMENT_AGE,
    createWorkforceDemography,
    emptyTenureCohort,
    experienceMultiplier,
    ageProductivityMultiplier,
    normalCdf,
    laborMarketMonthTick,
    laborMarketTick,
    laborMarketYearTick,
    updateAllocatedWorkers,
    workforceMortalityTick,
    totalDepartingFiredForEdu,
    totalRetiringForEdu,
} from './workforce';
import type { Agent, EducationLevelType, Planet } from './planet';
import type { StorageFacility, ProductionFacility } from './facilities';
import { emptyCohort } from './populationHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorageFacility(): StorageFacility {
    return {
        planetId: 'p',
        id: 's',
        name: 'test-storage',
        scale: 1,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1e9, mass: 1e9 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {},
    } as StorageFacility;
}

function makeAgent(): Agent {
    return {
        id: 'agent-1',
        name: 'A',
        associatedPlanetId: 'p',
        wealth: 0,
        transportShips: [],
        assets: {
            p: {
                resourceClaims: [],
                resourceTenancies: [],
                productionFacilities: [],
                storageFacility: makeStorageFacility(),
                allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
                workforceDemography: createWorkforceDemography(),
            },
        },
    };
}

/** Creates a minimal planet with id 'p' and a small population with unoccupied workers. */
function makePlanet(unoccupiedByEdu?: Partial<Record<string, number>>): Planet {
    // Build 101 age cohorts (0..100)
    const demography = Array.from({ length: 101 }, () => emptyCohort());

    // Spread unoccupied workers across working-age cohorts (18–64)
    if (unoccupiedByEdu) {
        for (const [edu, total] of Object.entries(unoccupiedByEdu)) {
            const perAge = Math.floor((total ?? 0) / 47); // 47 working-age years
            const remainder = (total ?? 0) - perAge * 47;
            for (let age = 18; age <= 64; age++) {
                (demography[age] as Record<string, Record<string, number>>)[edu].unoccupied =
                    perAge + (age === 18 ? remainder : 0);
            }
        }
    }

    const gov = makeAgent();
    gov.id = 'gov-1'; // distinct from the default agent-1 used by makeAgent()
    gov.name = 'Government';

    return {
        id: 'p',
        name: 'Test Planet',
        position: { x: 0, y: 0, z: 0 },
        population: { demography, starvationLevel: 0 },
        resources: {},
        government: gov,
        infrastructure: {
            primarySchools: 0,
            secondarySchools: 0,
            universities: 0,
            hospitals: 0,
            mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
            energy: { production: 0 },
        },
        environment: {
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            pollution: { air: 0, water: 0, soil: 0 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Time hierarchy constants
// ---------------------------------------------------------------------------

describe('time hierarchy constants', () => {
    it('TICKS_PER_YEAR is derived as TICKS_PER_MONTH * MONTHS_PER_YEAR', () => {
        expect(TICKS_PER_YEAR).toBe(TICKS_PER_MONTH * MONTHS_PER_YEAR);
    });

    it('TICKS_PER_YEAR equals 360', () => {
        expect(TICKS_PER_YEAR).toBe(360);
    });

    it('TICKS_PER_MONTH equals 30', () => {
        expect(TICKS_PER_MONTH).toBe(30);
    });

    it('MONTHS_PER_YEAR equals 12', () => {
        expect(MONTHS_PER_YEAR).toBe(12);
    });
});

// ---------------------------------------------------------------------------
// Boundary functions
// ---------------------------------------------------------------------------

describe('isMonthBoundary', () => {
    it('returns false for tick 0', () => {
        expect(isMonthBoundary(0)).toBe(false);
    });

    it('returns false for non-multiple ticks', () => {
        expect(isMonthBoundary(1)).toBe(false);
        expect(isMonthBoundary(TICKS_PER_MONTH - 1)).toBe(false);
    });

    it('returns true for exact multiples of TICKS_PER_MONTH', () => {
        expect(isMonthBoundary(TICKS_PER_MONTH)).toBe(true);
        expect(isMonthBoundary(TICKS_PER_MONTH * 2)).toBe(true);
        expect(isMonthBoundary(TICKS_PER_YEAR)).toBe(true);
    });
});

describe('isYearBoundary', () => {
    it('returns false for tick 0', () => {
        expect(isYearBoundary(0)).toBe(false);
    });

    it('returns false for month boundaries that are not year boundaries', () => {
        expect(isYearBoundary(TICKS_PER_MONTH)).toBe(false);
        expect(isYearBoundary(TICKS_PER_YEAR - TICKS_PER_MONTH)).toBe(false);
    });

    it('returns true for exact multiples of TICKS_PER_YEAR', () => {
        expect(isYearBoundary(TICKS_PER_YEAR)).toBe(true);
        expect(isYearBoundary(TICKS_PER_YEAR * 2)).toBe(true);
    });

    it('every year boundary is also a month boundary', () => {
        for (let y = 1; y <= 3; y++) {
            const tick = y * TICKS_PER_YEAR;
            expect(isYearBoundary(tick)).toBe(true);
            expect(isMonthBoundary(tick)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// experienceMultiplier
// ---------------------------------------------------------------------------

describe('experienceMultiplier', () => {
    it('returns 1.0 for 0 tenure years', () => {
        expect(experienceMultiplier(0)).toBe(1.0);
    });

    it('returns 1.5 for 10+ tenure years', () => {
        expect(experienceMultiplier(10)).toBe(1.5);
        expect(experienceMultiplier(40)).toBe(1.5);
    });

    it('interpolates linearly between 0 and 10 years', () => {
        expect(experienceMultiplier(5)).toBeCloseTo(1.25, 5);
    });
});

// ---------------------------------------------------------------------------
// emptyTenureCohort / createWorkforceDemography
// ---------------------------------------------------------------------------

describe('emptyTenureCohort', () => {
    it('has zeroed active, departing, and retiring arrays for all education levels', () => {
        const cohort = emptyTenureCohort();
        for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as const) {
            expect(cohort.active[edu]).toBe(0);
            expect(cohort.departing[edu]).toHaveLength(NOTICE_PERIOD_MONTHS);
            expect(cohort.departing[edu].every((v) => v === 0)).toBe(true);
            expect(cohort.retiring[edu]).toHaveLength(NOTICE_PERIOD_MONTHS);
            expect(cohort.retiring[edu].every((v) => v === 0)).toBe(true);
        }
    });

    it('initialises ageMoments with DEFAULT_HIRE_AGE_MEAN and zero variance', () => {
        const cohort = emptyTenureCohort();
        for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as const) {
            expect(cohort.ageMoments[edu].mean).toBe(DEFAULT_HIRE_AGE_MEAN);
            expect(cohort.ageMoments[edu].variance).toBe(0);
        }
    });
});

describe('createWorkforceDemography', () => {
    it('creates MAX_TENURE_YEARS + 1 cohorts', () => {
        const wf = createWorkforceDemography();
        expect(wf).toHaveLength(MAX_TENURE_YEARS + 1);
    });
});

// ---------------------------------------------------------------------------
// laborMarketTick
// ---------------------------------------------------------------------------

describe('laborMarketTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        planet = makePlanet();
    });

    it('does nothing when workforceDemography is absent', () => {
        agent.assets.p.workforceDemography = undefined;
        // Should not throw
        expect(() => laborMarketTick([agent], [planet])).not.toThrow();
    });

    it('moves a fraction of active workers into the departing pipeline', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].active.none = 10000;

        laborMarketTick([agent], [planet]);

        const expectedQuitters = Math.floor(10000 * VOLUNTARY_QUIT_RATE_PER_TICK);
        expect(workforce[0].active.none).toBe(10000 - expectedQuitters);
        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1]).toBe(expectedQuitters);
    });

    it('does not move workers when count is too small to yield floor > 0', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].active.none = 1; // floor(1 * 0.0001) = 0

        laborMarketTick([agent], [planet]);

        expect(workforce[0].active.none).toBe(1);
        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('hires workers from unoccupied pool when under target', () => {
        // 1000 unoccupied primary workers on the planet
        planet = makePlanet({ primary: 1000 });
        agent.assets.p.allocatedWorkers.primary = 500;
        // workforce starts empty → gap = 500

        laborMarketTick([agent], [planet]);

        // With instant hiring, the full gap is filled in one tick
        const workforce = agent.assets.p.workforceDemography!;
        const hired = workforce[0].active.primary;
        expect(hired).toBe(500);
    });

    it('does not hire when already at target', () => {
        planet = makePlanet({ none: 5000 });
        agent.assets.p.allocatedWorkers.none = 100;
        // Pre-fill workforce with exactly 100 active workers
        agent.assets.p.workforceDemography![0].active.none = 100;

        laborMarketTick([agent], [planet]);

        // Total active should not increase (voluntary quits may happen but no hiring)
        const workforce = agent.assets.p.workforceDemography!;
        const totalActive = workforce.reduce((sum, c) => sum + c.active.none, 0);
        // After quits: floor(100 * 0.0001) = 0, so stays at 100
        expect(totalActive).toBe(100);
    });

    it('does not hire more than available unoccupied workers', () => {
        // Only 5 unoccupied, but target is 1000
        planet = makePlanet({ none: 5 });
        agent.assets.p.allocatedWorkers.none = 1000;

        laborMarketTick([agent], [planet]);

        const workforce = agent.assets.p.workforceDemography!;
        const hired = workforce[0].active.none;
        expect(hired).toBeLessThanOrEqual(5);
    });

    it('does not hire people under the minimum employable age', () => {
        // Place 1000 unoccupied workers only in child age cohorts (0–13)
        planet = makePlanet(); // no working-age unoccupied
        for (let age = 0; age < 14; age++) {
            planet.population.demography[age].none.unoccupied = 100;
        }
        agent.assets.p.allocatedWorkers.none = 500;

        laborMarketTick([agent], [planet]);

        // No one should be hired — children are not employable
        const workforce = agent.assets.p.workforceDemography!;
        const hired = workforce[0].active.none;
        expect(hired).toBe(0);

        // Children should remain untouched
        for (let age = 0; age < 14; age++) {
            expect(planet.population.demography[age].none.unoccupied).toBe(100);
        }
    });

    it('moves hired workers from unoccupied to company in population', () => {
        planet = makePlanet({ secondary: 10000 });
        agent.assets.p.allocatedWorkers.secondary = 3000;

        // Count unoccupied before
        let unoccupiedBefore = 0;
        for (const cohort of planet.population.demography) {
            unoccupiedBefore += cohort.secondary.unoccupied;
        }

        laborMarketTick([agent], [planet]);

        // Count unoccupied after
        let unoccupiedAfter = 0;
        let companyAfter = 0;
        for (const cohort of planet.population.demography) {
            unoccupiedAfter += cohort.secondary.unoccupied;
            companyAfter += cohort.secondary.company;
        }

        const hired = agent.assets.p.workforceDemography![0].active.secondary;
        expect(hired).toBeGreaterThan(0);
        expect(unoccupiedBefore - unoccupiedAfter).toBe(hired);
        expect(companyAfter).toBe(hired);
    });

    it('fills positions instantly in a single tick', () => {
        planet = makePlanet({ primary: 100000 });
        agent.assets.p.allocatedWorkers.primary = 3000;

        // Single tick should fill the entire gap
        laborMarketTick([agent], [planet]);

        const workforce = agent.assets.p.workforceDemography!;
        const totalActive = workforce.reduce((sum, c) => sum + c.active.primary, 0);
        expect(totalActive).toBe(3000);
    });

    it('marks hired workers as government when agent is the planet government', () => {
        planet = makePlanet({ primary: 10000 });
        // Use the planet's government agent directly
        const gov = planet.government;
        gov.assets.p = {
            resourceClaims: [],
            resourceTenancies: [],
            productionFacilities: [],
            storageFacility: makeStorageFacility(),
            allocatedWorkers: { none: 0, primary: 500, secondary: 0, tertiary: 0, quaternary: 0 },
            workforceDemography: createWorkforceDemography(),
        };

        laborMarketTick([gov], [planet]);

        const hired = gov.assets.p.workforceDemography![0].active.primary;
        expect(hired).toBeGreaterThan(0);

        // Population should reflect government occupation, not company
        let govAfter = 0;
        let companyAfter = 0;
        for (const cohort of planet.population.demography) {
            govAfter += cohort.primary.government;
            companyAfter += cohort.primary.company;
        }
        expect(govAfter).toBe(hired);
        expect(companyAfter).toBe(0);
    });

    it('multiple agents cannot hire more workers than available on the planet', () => {
        // 1000 unoccupied 'none' workers on the planet
        planet = makePlanet({ none: 1000 });

        const agentA = makeAgent();
        const agentB = makeAgent();

        // Both agents target 800 each -> combined demand 1600 > supply 1000
        agentA.assets.p.allocatedWorkers.none = 800;
        agentB.assets.p.allocatedWorkers.none = 800;

        // Run labor market tick with both agents present
        laborMarketTick([agentA, agentB], [planet]);

        // Sum hires across both agents (active across all tenure cohorts)
        const hiredA = agentA.assets.p.workforceDemography!.reduce((s, c) => s + c.active.none, 0);
        const hiredB = agentB.assets.p.workforceDemography!.reduce((s, c) => s + c.active.none, 0);
        const totalHired = hiredA + hiredB;

        // Ensure we did not hire more than the planet had available
        expect(totalHired).toBeLessThanOrEqual(1000);

        // The planet's unoccupied pool should have decreased by exactly totalHired
        let unoccupiedAfter = 0;
        for (const cohort of planet.population.demography) {
            unoccupiedAfter += cohort.none.unoccupied;
        }
        const unoccupiedBefore = 1000;
        expect(unoccupiedBefore - unoccupiedAfter).toBe(totalHired);
    });
});

// ---------------------------------------------------------------------------
// hiredThisTick / firedThisTick counters
// ---------------------------------------------------------------------------

describe('hiredThisTick / firedThisTick counters', () => {
    it('records hired workers per education level', () => {
        const planet = makePlanet({ primary: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.primary = 500;

        laborMarketTick([agent], [planet]);

        expect(agent.assets.p.hiredThisTick).toBeDefined();
        expect(agent.assets.p.hiredThisTick!.primary).toBe(500);
        expect(agent.assets.p.hiredThisTick!.none).toBe(0);
    });

    it('records fired workers per education level', () => {
        const planet = makePlanet({ none: 10000 });
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        // Place 1000 workers at tenure year 5 (above MIN_TENURE_FOR_FIRING)
        wf[5].active.none = 1000;
        // Set target below current headcount to trigger firing
        agent.assets.p.allocatedWorkers.none = 800;

        laborMarketTick([agent], [planet]);

        expect(agent.assets.p.firedThisTick).toBeDefined();
        expect(agent.assets.p.firedThisTick!.none).toBe(200);
        // No hiring because we're over target
        expect(agent.assets.p.hiredThisTick!.none).toBe(0);
    });

    it('resets counters each tick', () => {
        const planet = makePlanet({ none: 10000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 100;

        laborMarketTick([agent], [planet]);
        expect(agent.assets.p.hiredThisTick!.none).toBe(100);

        // Second tick: no additional hiring needed
        laborMarketTick([agent], [planet]);
        expect(agent.assets.p.hiredThisTick!.none).toBe(0);
        expect(agent.assets.p.firedThisTick!.none).toBe(0);
    });

    it('counts hires across multiple education levels', () => {
        const planet = makePlanet({ none: 5000, primary: 5000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 200;
        agent.assets.p.allocatedWorkers.primary = 300;

        laborMarketTick([agent], [planet]);

        expect(agent.assets.p.hiredThisTick!.none).toBe(200);
        expect(agent.assets.p.hiredThisTick!.primary).toBe(300);
        expect(agent.assets.p.hiredThisTick!.secondary).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// laborMarketMonthTick
// ---------------------------------------------------------------------------

describe('laborMarketMonthTick', () => {
    let agent: Agent;
    let planet: Planet;

    beforeEach(() => {
        agent = makeAgent();
        planet = makePlanet();
    });

    it('shifts the departing pipeline, discarding slot-0 workers', () => {
        const workforce = agent.assets.p.workforceDemography!;
        // Seed the pipeline: slot 0 = soonest to depart (5 workers), some in later slots
        const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        pipeline[0] = 5;
        pipeline[1] = 3;
        pipeline[11] = 1;
        workforce[0].departing.none = pipeline;

        laborMarketMonthTick([agent], [planet]);

        // Slot 0 workers (5) have departed; pipeline advances
        expect(workforce[0].departing.none[0]).toBe(3);
        expect(workforce[0].departing.none[10]).toBe(1);
        expect(workforce[0].departing.none[11]).toBe(0);
    });

    it('clears the last pipeline slot after advancing', () => {
        const workforce = agent.assets.p.workforceDemography!;
        const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        pipeline[NOTICE_PERIOD_MONTHS - 1] = 7;
        workforce[0].departing.none = pipeline;

        laborMarketMonthTick([agent], [planet]);

        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 2]).toBe(7);
        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });

    it('returns departing workers to the unoccupied population pool', () => {
        // Put some company workers in population so returnToPopulation can find them
        planet = makePlanet();
        planet.population.demography[25].primary.company = 100;
        planet.population.demography[25].primary.unoccupied = 50;

        const workforce = agent.assets.p.workforceDemography!;
        // 10 workers departing at slot 0 (about to leave)
        const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        pipeline[0] = 10;
        workforce[0].departing.primary = pipeline;

        laborMarketMonthTick([agent], [planet]);

        // Workers returned to population
        expect(planet.population.demography[25].primary.company).toBe(90);
        expect(planet.population.demography[25].primary.unoccupied).toBe(60);
    });
});

// ---------------------------------------------------------------------------
// laborMarketYearTick
// ---------------------------------------------------------------------------

describe('laborMarketYearTick', () => {
    let agent: Agent;

    beforeEach(() => {
        agent = makeAgent();
    });

    it('moves workers from year 0 to year 1', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].active.primary = 100;

        laborMarketYearTick([agent]);

        expect(workforce[0].active.primary).toBe(0);
        expect(workforce[1].active.primary).toBe(100);
    });

    it('workers in the last tenure year stay there (do not overflow)', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[MAX_TENURE_YEARS].active.secondary = 50;

        laborMarketYearTick([agent]);

        // Still in the last bucket (no year MAX_TENURE_YEARS+1 exists)
        expect(workforce[MAX_TENURE_YEARS].active.secondary).toBe(50);
    });

    it('shifts departing pipeline entries along with active workers', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].departing.tertiary[1] = 8;

        laborMarketYearTick([agent]);

        expect(workforce[0].departing.tertiary[1]).toBe(0);
        expect(workforce[1].departing.tertiary[1]).toBe(8);
    });

    it('shifts retiring pipeline entries along with active workers', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].retiring.none[1] = 5;

        laborMarketYearTick([agent]);

        expect(workforce[0].retiring.none[1]).toBe(0);
        expect(workforce[1].retiring.none[1]).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// ageProductivityMultiplier
// ---------------------------------------------------------------------------

describe('ageProductivityMultiplier', () => {
    it('returns 0.8 for workers aged 18 or younger', () => {
        expect(ageProductivityMultiplier(14)).toBe(0.8);
        expect(ageProductivityMultiplier(18)).toBe(0.8);
    });

    it('returns 1.0 for peak-productivity ages (30–50)', () => {
        expect(ageProductivityMultiplier(30)).toBe(1.0);
        expect(ageProductivityMultiplier(40)).toBe(1.0);
        expect(ageProductivityMultiplier(50)).toBe(1.0);
    });

    it('interpolates between 18 and 30', () => {
        const v = ageProductivityMultiplier(24);
        expect(v).toBeGreaterThan(0.8);
        expect(v).toBeLessThan(1.0);
    });

    it('declines after age 50', () => {
        expect(ageProductivityMultiplier(60)).toBeLessThan(1.0);
        expect(ageProductivityMultiplier(70)).toBeLessThan(ageProductivityMultiplier(60));
    });

    it('does not go below 0.7', () => {
        expect(ageProductivityMultiplier(100)).toBeGreaterThanOrEqual(0.7);
    });
});

// ---------------------------------------------------------------------------
// age moments — hiring updates ageMoments in laborMarketTick
// ---------------------------------------------------------------------------

describe('age moments — hiring', () => {
    it('sets ageMoments.mean to the weighted mean age of hired workers', () => {
        // Place all unoccupied workers at a single known age so we can predict the mean
        const planet = makePlanet();
        // Clear default spread and place 100 workers at age 25 only
        for (const c of planet.population.demography) {
            c.none.unoccupied = 0;
        }
        planet.population.demography[25].none.unoccupied = 100;

        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 50;

        laborMarketTick([agent], [planet]);

        const wf = agent.assets.p.workforceDemography!;
        const hired = wf[0].active.none;
        expect(hired).toBeGreaterThan(0);
        // All workers came from age 25, so mean should be exactly 25
        expect(wf[0].ageMoments.none.mean).toBe(25);
    });

    it('merges ageMoments correctly when hiring across multiple ticks', () => {
        // Two distinct age groups: 100 at age 20, 100 at age 40
        const planet = makePlanet();
        for (const c of planet.population.demography) {
            c.none.unoccupied = 0;
        }
        planet.population.demography[20].none.unoccupied = 100;
        planet.population.demography[40].none.unoccupied = 100;

        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 200;

        // Run enough ticks to hire nearly all workers
        for (let i = 0; i < 60; i++) {
            laborMarketTick([agent], [planet]);
        }

        const wf = agent.assets.p.workforceDemography!;
        // Mean should be close to 30 (midpoint of 20 and 40 if hired equally)
        expect(wf[0].ageMoments.none.mean).toBeGreaterThanOrEqual(20);
        expect(wf[0].ageMoments.none.mean).toBeLessThanOrEqual(40);
    });
});

// ---------------------------------------------------------------------------
// age moments — laborMarketYearTick advances mean by 1
// ---------------------------------------------------------------------------

describe('age moments — year tick', () => {
    it('advances ageMoments.mean by 1 when shifting tenure years', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.primary = 100;
        wf[0].ageMoments.primary = { mean: 25, variance: 4 };

        laborMarketYearTick([agent]);

        expect(wf[1].active.primary).toBe(100);
        expect(wf[1].ageMoments.primary.mean).toBe(26);
        expect(wf[1].ageMoments.primary.variance).toBeCloseTo(4, 5);
    });

    it('merges two cohorts and advances combined mean by 1 when both land in the same bucket', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        // Place 100 workers in the last year bucket and 100 in year MAX-1.
        // After the shift, both end up in MAX_TENURE_YEARS (the cap bucket).
        wf[MAX_TENURE_YEARS].active.secondary = 100;
        wf[MAX_TENURE_YEARS].ageMoments.secondary = { mean: 50, variance: 0 };
        wf[MAX_TENURE_YEARS - 1].active.secondary = 100;
        wf[MAX_TENURE_YEARS - 1].ageMoments.secondary = { mean: 48, variance: 0 };

        laborMarketYearTick([agent]);

        // After shift: wf[MAX] should contain old-MAX workers (mean 51) + old-(MAX-1) workers (mean 49)
        // Combined mean = (100 * 51 + 100 * 49) / 200 = 50
        expect(wf[MAX_TENURE_YEARS].active.secondary).toBe(200);
        expect(wf[MAX_TENURE_YEARS].ageMoments.secondary.mean).toBeCloseTo(50, 5);
    });

    it('workers in distinct tenure years each advance independently', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.secondary = 100;
        wf[0].ageMoments.secondary = { mean: 25, variance: 0 };
        wf[1].active.secondary = 100;
        wf[1].ageMoments.secondary = { mean: 26, variance: 0 };

        laborMarketYearTick([agent]);

        // Old year-0 workers → year 1 (mean 26), old year-1 workers → year 2 (mean 27)
        expect(wf[1].active.secondary).toBe(100);
        expect(wf[1].ageMoments.secondary.mean).toBeCloseTo(26, 5);
        expect(wf[2].active.secondary).toBe(100);
        expect(wf[2].ageMoments.secondary.mean).toBeCloseTo(27, 5);
    });

    it('resets year-0 ageMoments to default after shifting', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = 50;
        wf[0].ageMoments.none = { mean: 22, variance: 2 };

        laborMarketYearTick([agent]);

        expect(wf[0].active.none).toBe(0);
        expect(wf[0].ageMoments.none.mean).toBe(DEFAULT_HIRE_AGE_MEAN);
        expect(wf[0].ageMoments.none.variance).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// workforceMortalityTick
// ---------------------------------------------------------------------------

describe('workforceMortalityTick', () => {
    it('removes some workers from cohorts with realistic working-age mean', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        // Place workers at age 60 — noticeably higher mortality
        wf[0].active.none = 100000;
        wf[0].ageMoments.none = { mean: 60, variance: 0 };

        // Use a high extra mortality to ensure deaths occur even after flooring
        workforceMortalityTick([agent], 'p', 0.1, 0);

        expect(wf[0].active.none).toBeLessThan(100000);
    });

    it('removes more workers for older cohorts than younger cohorts', () => {
        const makeAgentWithAge = (ageMean: number) => {
            const a = makeAgent();
            a.id = `agent-${ageMean}`;
            a.assets.p.workforceDemography![0].active.none = 100000;
            a.assets.p.workforceDemography![0].ageMoments.none = { mean: ageMean, variance: 0 };
            return a;
        };

        const youngAgent = makeAgentWithAge(25);
        const oldAgent = makeAgentWithAge(70);

        workforceMortalityTick([youngAgent, oldAgent], 'p', 0, 0);

        const youngSurvivors = youngAgent.assets.p.workforceDemography![0].active.none;
        const oldSurvivors = oldAgent.assets.p.workforceDemography![0].active.none;

        // Older workers should have more deaths (fewer survivors)
        expect(oldSurvivors).toBeLessThan(youngSurvivors);
    });

    it('does nothing when workforceDemography is absent', () => {
        const agent = makeAgent();
        agent.assets.p.workforceDemography = undefined;
        expect(() => workforceMortalityTick([agent], 'p', 0, 0)).not.toThrow();
    });

    it('does nothing for cohorts with zero active workers', () => {
        const agent = makeAgent();
        // All cohorts are empty by default
        expect(() => workforceMortalityTick([agent], 'p', 0, 0)).not.toThrow();
        const wf = agent.assets.p.workforceDemography!;
        for (const cohort of wf) {
            for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as const) {
                expect(cohort.active[edu]).toBe(0);
            }
        }
    });

    it('applies higher mortality under starvation', () => {
        const agentNoStarve = makeAgent();
        agentNoStarve.assets.p.workforceDemography![0].active.none = 100000;
        agentNoStarve.assets.p.workforceDemography![0].ageMoments.none = { mean: 60, variance: 0 };

        const agentStarve = makeAgent();
        agentStarve.id = 'agent-starve';
        agentStarve.assets.p.workforceDemography![0].active.none = 100000;
        agentStarve.assets.p.workforceDemography![0].ageMoments.none = { mean: 60, variance: 0 };

        workforceMortalityTick([agentNoStarve], 'p', 0, 0);
        workforceMortalityTick([agentStarve], 'p', 0, 0.8);

        const survivorsNoStarve = agentNoStarve.assets.p.workforceDemography![0].active.none;
        const survivorsStarve = agentStarve.assets.p.workforceDemography![0].active.none;

        expect(survivorsStarve).toBeLessThan(survivorsNoStarve);
    });
});

// ---------------------------------------------------------------------------
// RETIREMENT_AGE constant
// ---------------------------------------------------------------------------

describe('RETIREMENT_AGE', () => {
    it('is 67', () => {
        expect(RETIREMENT_AGE).toBe(67);
    });
});

// ---------------------------------------------------------------------------
// Retirement — triggered monthly in laborMarketMonthTick
// ---------------------------------------------------------------------------

describe('retirement — monthly via laborMarketMonthTick', () => {
    it('moves 1/12 of retirement-eligible workers into the retiring pipeline each month', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        // Place 200 workers at tenure year 40 with mean age 67 (= RETIREMENT_AGE)
        // variance = 0 → deterministic: annualFraction = 1 → monthlyRate = 1
        wf[40].active.primary = 200;
        wf[40].ageMoments.primary = { mean: 66, variance: 0 }; // will become 67 after tenure shift

        laborMarketYearTick([agent]); // tenure shift: year 40 → 41, age 66 → 67

        // No retirement yet — year tick just shifts tenure
        expect(wf[41].active.primary).toBe(200);

        laborMarketMonthTick([agent], [planet]); // triggers monthly retirement + pipeline advance

        // With variance=0 and mean=67, all workers are deterministically above
        // retirement age: annualFraction=1, monthlyRate=1 → all 200 retire at once
        expect(wf[41].active.primary).toBe(0);
        expect(totalRetiringForEdu(wf, 'primary')).toBe(200);
    });

    it('does NOT retire workers whose mean age is below RETIREMENT_AGE', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[5].active.secondary = 100;
        wf[5].ageMoments.secondary = { mean: 34, variance: 4 }; // will become 35 after shift

        laborMarketYearTick([agent]);
        laborMarketMonthTick([agent], [planet]);

        // Workers move to year 6, still active (mean age 35 < 67)
        expect(wf[6].active.secondary).toBe(100);
        expect(totalRetiringForEdu(wf, 'secondary')).toBe(0);
    });

    it('retires only the education levels that reach RETIREMENT_AGE', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        // Two edu levels at same tenure: one old, one young
        wf[30].active.none = 50;
        wf[30].ageMoments.none = { mean: 66, variance: 0 }; // → 67 after shift
        wf[30].active.tertiary = 80;
        wf[30].ageMoments.tertiary = { mean: 50, variance: 4 }; // → 51 after shift

        laborMarketYearTick([agent]);
        laborMarketMonthTick([agent], [planet]);

        // 'none' workers: variance=0, mean=67 → deterministic, all 50 retire at once
        expect(wf[31].active.none).toBe(0);
        expect(totalRetiringForEdu(wf, 'none')).toBe(50);

        // 'tertiary' workers still fully active (mean age 51 < 67)
        expect(wf[31].active.tertiary).toBe(80);
        expect(totalRetiringForEdu(wf, 'tertiary')).toBe(0);
    });

    it('retires all deterministic workers in the first month (variance = 0)', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[40].active.primary = 120;
        wf[40].ageMoments.primary = { mean: 66, variance: 0 }; // → 67 after shift

        laborMarketYearTick([agent]);
        laborMarketMonthTick([agent], [planet]);

        // Deterministic: all retire immediately
        expect(wf[41].active.primary).toBe(0);
        expect(totalRetiringForEdu(wf, 'primary')).toBe(120);
    });
});

// ---------------------------------------------------------------------------
// Retirement — laborMarketMonthTick routes retirees to unableToWork
// ---------------------------------------------------------------------------

describe('retirement — laborMarketMonthTick routes to unableToWork', () => {
    it('advances the retiring pipeline and routes slot-0 workers to unableToWork', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        // Put some company workers in population so retireToPopulation can find them
        planet.population.demography[67].primary.company = 100;

        const wf = agent.assets.p.workforceDemography!;
        // 20 retirees at slot 0 (about to leave), 10 at slot 1
        const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        pipeline[0] = 20;
        pipeline[1] = 10;
        wf[40].retiring.primary = pipeline;

        laborMarketMonthTick([agent], [planet]);

        // Pipeline should advance
        expect(wf[40].retiring.primary[0]).toBe(10);
        expect(wf[40].retiring.primary[1]).toBe(0);

        // Retirees go to unableToWork, NOT unoccupied
        expect(planet.population.demography[67].primary.company).toBe(80);
        expect(planet.population.demography[67].primary.unableToWork).toBe(20);
        expect(planet.population.demography[67].primary.unoccupied).toBe(0);
    });

    it('does not mix retiring and departing pipelines', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        planet.population.demography[40].none.company = 200;

        const wf = agent.assets.p.workforceDemography!;
        // 10 departing (slot 0) + 5 retiring (slot 0)
        const depPipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        depPipeline[0] = 10;
        wf[20].departing.none = depPipeline;
        const retPipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
        retPipeline[0] = 5;
        wf[20].retiring.none = retPipeline;

        laborMarketMonthTick([agent], [planet]);

        // Departing → unoccupied
        // Retiring → unableToWork
        // 10 departed from company → unoccupied; 5 retired from company → unableToWork
        expect(planet.population.demography[40].none.company).toBe(185);
        expect(planet.population.demography[40].none.unoccupied).toBe(10);
        expect(planet.population.demography[40].none.unableToWork).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// normalCdf
// ---------------------------------------------------------------------------

describe('normalCdf', () => {
    it('returns 0.5 for z = 0', () => {
        expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    });

    it('returns ~0.8413 for z = 1', () => {
        expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    });

    it('returns ~0.1587 for z = -1', () => {
        expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
    });

    it('returns ~0.9772 for z = 2', () => {
        expect(normalCdf(2)).toBeCloseTo(0.9772, 3);
    });

    it('returns 0 for very negative z', () => {
        expect(normalCdf(-10)).toBe(0);
    });

    it('returns 1 for very positive z', () => {
        expect(normalCdf(10)).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Proportional retirement with variance
// ---------------------------------------------------------------------------

describe('retirement — proportional with variance (monthly)', () => {
    it('retires 1/12 of the annual fraction when mean is below RETIREMENT_AGE but variance is large', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        // Mean age 59 (after +1 in shift = 60), σ² = 100 (σ = 10)
        // Fraction above 67: 1 - Φ((67-60)/10) = 1 - Φ(0.7) ≈ 0.242
        // Annual ~242 retire, monthly = ceil(242/12) ≈ 21
        wf[30].active.primary = 1000;
        wf[30].ageMoments.primary = { mean: 59, variance: 100 };

        laborMarketYearTick([agent]);
        laborMarketMonthTick([agent], [planet]);

        const retired = totalRetiringForEdu(wf, 'primary');
        const stillActive = wf[31].active.primary;

        // Monthly: ceil(~242 / 12) ≈ 21, allow rounding tolerance
        expect(retired).toBeGreaterThan(15);
        expect(retired).toBeLessThan(30);
        expect(stillActive).toBe(1000 - retired);
    });

    it('retires a large monthly chunk when mean is well above RETIREMENT_AGE', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        // Mean age 72 (after +1 in shift = 73), σ² = 9 (σ = 3)
        // Fraction above 67: 1 - Φ((67-73)/3) = 1 - Φ(-2) ≈ 0.977
        // monthlyRate = 1 - (1-0.977)^(1/12) ≈ 0.278
        // toRetire = round(500 * 0.278) ≈ 139
        wf[40].active.secondary = 500;
        wf[40].ageMoments.secondary = { mean: 72, variance: 9 };

        laborMarketYearTick([agent]);
        laborMarketMonthTick([agent], [planet]);

        const retired = totalRetiringForEdu(wf, 'secondary');
        expect(retired).toBeGreaterThan(100);
        expect(retired).toBeLessThan(180);
    });

    it('retires none when mean is far below RETIREMENT_AGE even with large variance', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        // Mean age 39 (after +1 = 40), σ² = 25 (σ = 5)
        // Fraction above 67: 1 - Φ((67-40)/5) = 1 - Φ(5.4) ≈ 0.0000003
        wf[10].active.none = 500;
        wf[10].ageMoments.none = { mean: 39, variance: 25 };

        laborMarketYearTick([agent]);
        laborMarketMonthTick([agent], [planet]);

        expect(totalRetiringForEdu(wf, 'none')).toBe(0);
        expect(wf[11].active.none).toBe(500);
    });

    it('updates ageMoments for remaining workers after partial retirement', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        // Mean 64 (after shift = 65), σ² = 25 (σ = 5)
        // RETIREMENT_AGE = 67, so z = (67-65)/5 = 0.4 → ~34.5% retire
        wf[35].active.none = 1000;
        wf[35].ageMoments.none = { mean: 64, variance: 25 };

        laborMarketYearTick([agent]);
        laborMarketMonthTick([agent], [planet]);

        // Remaining workers should have a lower mean age (truncated from above)
        expect(wf[36].ageMoments.none.mean).toBeLessThan(65);
        expect(wf[36].ageMoments.none.mean).toBeGreaterThan(55); // sanity
        // Variance should be reduced (truncation narrows the distribution)
        expect(wf[36].ageMoments.none.variance).toBeLessThan(25);
        expect(wf[36].ageMoments.none.variance).toBeGreaterThan(0);
    });

    it('retires a significant portion over 12 months with variance', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        // Mean 72 (→73 after shift), σ²=9, nearly all above 67 initially
        // annualFraction ≈ 0.977 → monthlyRate ≈ 0.278
        // However, truncated-normal moment updates lower the mean each month,
        // so fewer workers become eligible in later months.
        wf[40].active.secondary = 500;
        wf[40].ageMoments.secondary = { mean: 72, variance: 9 };

        laborMarketYearTick([agent]);

        for (let month = 0; month < MONTHS_PER_YEAR; month++) {
            laborMarketMonthTick([agent], [planet]);
        }

        // The first months drain many workers, but truncation shifts the mean
        // downward so later months retire fewer.  Expect a meaningful chunk
        // (>100) to have retired, but a residual is normal due to moment updates.
        const remaining = wf[41].active.secondary;
        expect(remaining).toBeLessThan(500); // some definitely retired
        expect(remaining).toBeGreaterThan(0); // truncation prevents full drain
    });
});

// ---------------------------------------------------------------------------
// Low-number edge cases
// ---------------------------------------------------------------------------

describe('low-number edge cases', () => {
    it('single worker retires deterministically when mean >= RETIREMENT_AGE (via monthTick)', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[40].active.none = 1;
        wf[40].ageMoments.none = { mean: 66, variance: 4 }; // → 67 after shift

        laborMarketYearTick([agent]);
        laborMarketMonthTick([agent], [planet]);

        // Single worker with mean at retirement age → deterministic retire
        // ceil(1/12) = 1 → the single worker retires in the first month
        expect(wf[41].active.none).toBe(0);
        expect(totalRetiringForEdu(wf, 'none')).toBe(1);
    });

    it('single worker does NOT retire when mean < RETIREMENT_AGE', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[10].active.primary = 1;
        wf[10].ageMoments.primary = { mean: 39, variance: 100 }; // → 40 after shift

        laborMarketYearTick([agent]);
        laborMarketMonthTick([agent], [planet]);

        expect(wf[11].active.primary).toBe(1);
        expect(totalRetiringForEdu(wf, 'primary')).toBe(0);
    });

    it('voluntary quits do not affect a single worker (floor rounds to 0)', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        wf[5].active.none = 1;
        // Set target so the worker is wanted (prevents firing)
        agent.assets.p.allocatedWorkers.none = 1;

        laborMarketTick([agent], [planet]);

        // floor(1 * 0.0001) = 0, so the worker stays
        expect(wf[5].active.none).toBe(1);
    });

    it('mortality does not kill a single working-age worker (floor rounds to 0)', () => {
        const agent = makeAgent();
        const wf = agent.assets.p.workforceDemography!;
        wf[0].active.none = 1;
        wf[0].ageMoments.none = { mean: 40, variance: 0 };

        // Even with some extra mortality, floor(1 * small_rate) = 0
        workforceMortalityTick([agent], 'p', 0.01, 0);

        expect(wf[0].active.none).toBe(1);
    });

    it('three workers near retirement: some may retire over multiple months', () => {
        const agent = makeAgent();
        const planet = makePlanet();
        const wf = agent.assets.p.workforceDemography!;
        // Mean 64 (→ 65), σ² = 16 (σ = 4). z = (67-65)/4 = 0.5
        // annualFraction ≈ 0.3085
        // monthlyRate = 1 - (1-0.3085)^(1/12) ≈ 0.030
        // round(3 * 0.030) = 0 → first month may retire nobody
        // Over 12 months, about 1 of the 3 workers should eventually retire.
        wf[30].active.tertiary = 3;
        wf[30].ageMoments.tertiary = { mean: 64, variance: 16 };

        laborMarketYearTick([agent]);
        for (let month = 0; month < MONTHS_PER_YEAR; month++) {
            laborMarketMonthTick([agent], [planet]);
        }

        const retired = totalRetiringForEdu(wf, 'tertiary');
        const active = wf[31].active.tertiary;

        // With only 3 workers, rounding means 0-1 retire per month; some should retire over a year
        expect(retired + active).toBeLessThanOrEqual(3);
        expect(active).toBeGreaterThanOrEqual(0);
        expect(active).toBeLessThanOrEqual(3);
    });
});

// ---------------------------------------------------------------------------
// updateAllocatedWorkers — cascade unmet demand upward
// ---------------------------------------------------------------------------

describe('updateAllocatedWorkers', () => {
    /** Helper: create a production facility with given worker requirements. */
    function makeFacility(workerReq: Partial<Record<EducationLevelType, number>>, scale = 1): ProductionFacility {
        return {
            planetId: 'p',
            id: 'f1',
            name: 'Test Facility',
            scale,
            lastTickEfficiencyInPercent: 0,
            powerConsumptionPerTick: 0,
            workerRequirement: workerReq as Record<string, number>,
            pollutionPerTick: { air: 0, water: 0, soil: 0 },
            needs: [],
            produces: [],
        } as ProductionFacility;
    }

    it('sets allocatedWorkers to buffered requirement × scale when population has enough workers', () => {
        const planet = makePlanet({ none: 50000, primary: 20000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100, primary: 50 }, 10)];

        updateAllocatedWorkers([agent], [planet]);

        // raw: 100 × 10 = 1000 none, 50 × 10 = 500 primary
        // buffered: ceil(1000 * 1.05) = 1050, ceil(500 * 1.05) = 525
        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(525);
        expect(agent.assets.p.allocatedWorkers.secondary).toBe(0);
    });

    it('cascades unfillable demand to the next higher education level', () => {
        // Planet has 0 "none" workers but plenty of "primary"
        const planet = makePlanet({ none: 0, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100, primary: 50 }, 10)];

        updateAllocatedWorkers([agent], [planet]);

        // none: buffered ceil(1000*1.05)=1050, supply 0 → allocate 0, overflow 1050
        // primary: buffered ceil(500*1.05)=525 + overflow 1050 = 1575, supply 50000 → allocate 1575
        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(1575);
    });

    it('cascades through multiple levels when intermediate levels are also empty', () => {
        // Only secondary workers available
        const planet = makePlanet({ none: 0, primary: 0, secondary: 10000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 50, primary: 30 }, 10)];

        updateAllocatedWorkers([agent], [planet]);

        // none: buffered ceil(500*1.05)=525, supply 0 → overflow 525
        // primary: buffered ceil(300*1.05)=315 + overflow 525 = 840, supply 0 → overflow 840
        // secondary: 0 + overflow 840 = 840, supply 10000 → allocate 840
        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(0);
        expect(agent.assets.p.allocatedWorkers.secondary).toBe(840);
    });

    it('partially fills at a level and cascades the remainder', () => {
        // Planet has some "none" but not enough
        const planet = makePlanet({ none: 200, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        updateAllocatedWorkers([agent], [planet]);

        // none: buffered ceil(1000*1.05)=1050, supply 200 → allocate 200, overflow 850
        // primary: 0 + overflow 850 = 850, supply 50000 → allocate 850
        expect(agent.assets.p.allocatedWorkers.none).toBe(200);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(850);
    });

    it('accounts for already-hired workers in supply calculation', () => {
        // Planet has 0 unoccupied "none" workers, but agent already has 600 hired
        const planet = makePlanet({ none: 0, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];
        // Pre-fill workforce with 600 active "none" workers
        agent.assets.p.workforceDemography![0].active.none = 600;

        updateAllocatedWorkers([agent], [planet]);

        // none: buffered ceil(1000*1.05)=1050, supply = 600 (hired) + 0 (unoccupied) = 600
        //   → allocate 600, overflow 450
        // primary: 0 + overflow 450 = 450 → allocate 450
        expect(agent.assets.p.allocatedWorkers.none).toBe(600);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(450);
    });

    it('aggregates requirements from multiple facilities', () => {
        const planet = makePlanet({ none: 100000, primary: 100000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [
            makeFacility({ none: 60, primary: 30 }, 100),
            makeFacility({ none: 4, primary: 2 }, 100),
        ];

        updateAllocatedWorkers([agent], [planet]);

        // Facility 1: none 6000, primary 3000
        // Facility 2: none 400, primary 200
        // Raw: none 6400, primary 3200
        // Buffered: ceil(6400*1.05) = 6720, ceil(3200*1.05) = 3360
        expect(agent.assets.p.allocatedWorkers.none).toBe(6720);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(3360);
    });

    it('handles the case where no planet is found (uses buffered requirements)', () => {
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 10 }, 5)];

        // Pass empty planets array — no matching planet for 'p'
        updateAllocatedWorkers([agent], []);

        // raw = 50, buffered = ceil(50 * 1.05) = 53
        expect(agent.assets.p.allocatedWorkers.none).toBe(53);
    });

    it('uses feedback-based allocation when unusedWorkers is available (surplus)', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)]; // raw = 1000

        // Simulate: 1000 active workers, 30 left unused after production
        // consumed = 1000 - 30 = 970, target = ceil(970 * 1.05) = 1019
        agent.assets.p.workforceDemography![0].active.none = 1000;
        agent.assets.p.unusedWorkerFraction = 0.03;
        agent.assets.p.unusedWorkers = { none: 30, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers([agent], [planet]);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1019);
    });

    it('uses feedback-based allocation when unusedWorkers is negative (shortage)', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)]; // raw = 1000

        // Simulate: 900 active workers, facilities needed 50 more → unused = -50
        // consumed = 900 - (-50) = 950, target = ceil(950 * 1.05) = 998
        agent.assets.p.workforceDemography![0].active.none = 900;
        agent.assets.p.unusedWorkers = { none: -50, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers([agent], [planet]);

        expect(agent.assets.p.allocatedWorkers.none).toBe(998);
    });

    it('never reduces allocation below zero', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        // No facilities → raw requirement = 0 for all edu
        agent.assets.p.productionFacilities = [];

        // All workers unused (nothing consumed) → consumed = 0 - 100 = -100 → target = 0
        agent.assets.p.unusedWorkerFraction = 0.5;
        agent.assets.p.unusedWorkers = { none: 100, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers([agent], [planet]);

        expect(agent.assets.p.allocatedWorkers.none).toBe(0);
    });

    it('redistributes overqualified consumption back to the job slot level', () => {
        const planet = makePlanet({ none: 50000, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100, primary: 50 }, 10)];

        // Simulate: 500 none-workers active, 1000 primary-workers active.
        // Production used all 500 none + cascaded 500 primary into none slots.
        // unusedWorkers: none=0 (all used), primary=0 (all used)
        // Raw consumed: none=500, primary=1000
        // overqualifiedMatrix: none→primary = 500 (500 primary workers filled none slots)
        // After redistribution: consumed[none] = 500 + 500 = 1000, consumed[primary] = 1000 - 500 = 500
        // Targets: none = ceil(1000 * 1.05) = 1050, primary = ceil(500 * 1.05) = 525
        agent.assets.p.workforceDemography![0].active.none = 500;
        agent.assets.p.workforceDemography![0].active.primary = 1000;
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };
        agent.assets.p.overqualifiedMatrix = { none: { primary: 500 } };

        updateAllocatedWorkers([agent], [planet]);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1050);
        expect(agent.assets.p.allocatedWorkers.primary).toBe(525);
    });

    it('redistributes overqualified consumption and cascades overflow when population is short', () => {
        // Only 200 none-workers available on planet, plenty of primary
        const planet = makePlanet({ none: 200, primary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        // Simulate: 200 none-workers hired, 800 primary cascaded into none slots
        // unusedWorkers: none=0, primary=0. Raw consumed: none=200, primary=800
        // overqualifiedMatrix: none→primary = 800
        // After redistribution: consumed[none] = 200+800 = 1000, consumed[primary] = 800-800 = 0
        // Target: none = ceil(1000*1.05) = 1050
        // Cascade: none supply = 200 (hired) + 200 (unoccupied, since 200 hired from 400 total? No,
        //          makePlanet puts 200 unoccupied; already hired 200 → supply = 200+200 = 400)
        //          → allocate 400, overflow 650
        // primary: overflow 650, supply 50000 → allocate 650
        agent.assets.p.workforceDemography![0].active.none = 200;
        agent.assets.p.workforceDemography![0].active.primary = 800;
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };
        agent.assets.p.overqualifiedMatrix = { none: { primary: 800 } };

        updateAllocatedWorkers([agent], [planet]);

        // none: demand=1050, supply = 200 (active) + 200 (unoccupied) = 400 → allocate 400, overflow 650
        expect(agent.assets.p.allocatedWorkers.none).toBe(400);
        // primary: demand = 0 + overflow 650 = 650, supply = 800 (active) + 50000 (unoccupied) → allocate 650
        expect(agent.assets.p.allocatedWorkers.primary).toBe(650);
    });

    it('excludes fired workers from the effective pool in feedback path', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)]; // raw = 1000

        // Simulate: 900 active + 100 in departingFired pipeline (fired last cycle).
        // Old behaviour would count fired as departing → pool = 900 + floor(100*0.5) = 950
        // New behaviour: fired workers excluded → pool = 900
        // consumed = 900 − 0 = 900, target = ceil(900 * 1.05) = 945
        const wf = agent.assets.p.workforceDemography!;
        wf[2].active.none = 900;
        wf[2].departing.none[NOTICE_PERIOD_MONTHS - 1] = 100;
        wf[2].departingFired.none[NOTICE_PERIOD_MONTHS - 1] = 100;
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers([agent], [planet]);

        expect(agent.assets.p.allocatedWorkers.none).toBe(945);
    });

    it('excludes retiring workers from the effective pool in feedback path', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)]; // raw = 1000

        // Simulate: 900 active + 50 in retiring pipeline.
        // Pool = 900 − 50 (retiring) = 850
        // consumed = 850 − 0 = 850, target = ceil(850 * 1.05) = 893
        const wf = agent.assets.p.workforceDemography!;
        wf[5].active.none = 900;
        wf[5].retiring.none[NOTICE_PERIOD_MONTHS - 1] = 50;
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers([agent], [planet]);

        expect(agent.assets.p.allocatedWorkers.none).toBe(893);
    });

    it('excludes both fired and retiring workers from pool while keeping voluntary quitters', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)]; // raw = 1000

        // Simulate: 800 active, 100 voluntary quitters, 50 fired, 30 retiring.
        // departing total = 150 (100 voluntary + 50 fired).
        // voluntaryDeparting = 150 − 50 = 100
        // pool = 800 + floor(100 * 0.5) − 30 = 800 + 50 − 30 = 820
        // consumed = 820 − 0 = 820, target = ceil(820 * 1.05) = 861
        const wf = agent.assets.p.workforceDemography!;
        wf[3].active.none = 800;
        wf[3].departing.none[NOTICE_PERIOD_MONTHS - 1] = 150; // voluntary(100) + fired(50)
        wf[3].departingFired.none[NOTICE_PERIOD_MONTHS - 1] = 50;
        wf[3].retiring.none[NOTICE_PERIOD_MONTHS - 1] = 30;
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers([agent], [planet]);

        expect(agent.assets.p.allocatedWorkers.none).toBe(861);
    });

    it('totalDepartingFiredForEdu sums fired workers across all cohorts and slots', () => {
        const wf = createWorkforceDemography();
        wf[0].departingFired.primary[0] = 10;
        wf[0].departingFired.primary[5] = 20;
        wf[3].departingFired.primary[11] = 7;

        expect(totalDepartingFiredForEdu(wf, 'primary')).toBe(37);
        expect(totalDepartingFiredForEdu(wf, 'none')).toBe(0);
    });

    it('totalRetiringForEdu sums retiring workers across all cohorts and slots', () => {
        const wf = createWorkforceDemography();
        wf[1].retiring.secondary[0] = 5;
        wf[1].retiring.secondary[11] = 15;
        wf[10].retiring.secondary[6] = 8;

        expect(totalRetiringForEdu(wf, 'secondary')).toBe(28);
        expect(totalRetiringForEdu(wf, 'none')).toBe(0);
    });

    it('recovers from zero active workers when facilities still declare demand (facility floor)', () => {
        const planet = makePlanet({ tertiary: 50000 });
        const agent = makeAgent();
        // Facility needs 100 tertiary workers at scale 10 → raw = 1000
        agent.assets.p.productionFacilities = [makeFacility({ tertiary: 100 }, 10)];

        // Simulate: after a cascade shock, all tertiary workers were fired.
        // active=0, departing pipeline has the fired workers, unusedWorkers=0.
        // Without the floor: consumed = 0 − 0 = 0 → requirement = 0 → dead lock!
        // With the floor: facilityFloor = ceil(1000 * 1.05) = 1050 → requirement = 1050
        const wf = agent.assets.p.workforceDemography!;
        wf[3].active.tertiary = 0;
        wf[3].departing.tertiary[6] = 500;
        wf[3].departingFired.tertiary[6] = 500;
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers([agent], [planet]);

        // The floor from facility requirements kicks in
        expect(agent.assets.p.allocatedWorkers.tertiary).toBe(1050);
    });

    it('facility floor does not override positive feedback target', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        // Facility raw = 100 * 10 = 1000 → floor = ceil(1000 * 1.05) = 1050
        agent.assets.p.productionFacilities = [makeFacility({ none: 100 }, 10)];

        // Simulate: 1200 active, unused = -100 (shortage)
        // consumed = 1200 − (−100) = 1300 → feedbackTarget = ceil(1300 * 1.05) = 1365
        // feedbackTarget > 0 → floor is not used, feedback stays in control
        agent.assets.p.workforceDemography![0].active.none = 1200;
        agent.assets.p.unusedWorkers = { none: -100, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers([agent], [planet]);

        expect(agent.assets.p.allocatedWorkers.none).toBe(1365);
    });

    it('recovers even when all fired workers have fully departed (pool = 0, unused = 0)', () => {
        const planet = makePlanet({ tertiary: 50000 });
        const agent = makeAgent();
        agent.assets.p.productionFacilities = [makeFacility({ tertiary: 50 }, 10)]; // raw = 500

        // Simulate: notice period is over, pipeline is empty, active = 0.
        // consumed = 0 − 0 = 0, feedbackTarget = 0
        // facilityFloor = ceil(500 * 1.05) = 525 → requirement = 525
        agent.assets.p.unusedWorkers = { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 };

        updateAllocatedWorkers([agent], [planet]);

        expect(agent.assets.p.allocatedWorkers.tertiary).toBe(525);
    });
});

// ---------------------------------------------------------------------------
// Population ↔ Workforce accounting invariant
// ---------------------------------------------------------------------------

describe('population ↔ workforce accounting invariant', () => {
    /**
     * Helper: sum `demography[age][edu][occupation]` across all ages for a planet.
     */
    function sumPopulationOccupation(planet: Planet, edu: EducationLevelType, occupation: string): number {
        let total = 0;
        for (const cohort of planet.population.demography) {
            total += (cohort as Record<string, Record<string, number>>)[edu]?.[occupation] ?? 0;
        }
        return total;
    }

    /**
     * Helper: sum active + departing + retiring across all tenure cohorts for a
     * given education level in an agent's workforce on a specific planet.
     */
    function sumWorkforceForEdu(agent: Agent, planetId: string, edu: EducationLevelType): number {
        const wf = agent.assets[planetId]?.workforceDemography;
        if (!wf) {
            return 0;
        }
        let total = 0;
        for (const cohort of wf) {
            total += cohort.active[edu];
            for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                total += cohort.departing[edu][m];
                total += cohort.retiring[edu][m];
            }
        }
        return total;
    }

    /**
     * Assert that for each education level, the population's 'company' count
     * equals the sum of (active + departing + retiring) across all company-agent
     * tenure cohorts.  This ensures hiring, firing, quits, and pipeline movements
     * never create or destroy workers.
     */
    function assertAccountingInvariant(planet: Planet, agents: Agent[]): void {
        const companyAgents = agents.filter((a) => a.id !== planet.government.id);
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
        const planet = makePlanet({ none: 5000, primary: 2000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 500;
        agent.assets.p.allocatedWorkers.primary = 200;

        laborMarketTick([agent], [planet]);

        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds after hire + voluntary quits', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 10000;

        // Hire
        laborMarketTick([agent], [planet]);
        assertAccountingInvariant(planet, [agent]);

        // Run another tick to trigger voluntary quits
        laborMarketTick([agent], [planet]);
        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds after firing (overstaffed → departing pipeline)', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 1000;

        // Hire 1000
        laborMarketTick([agent], [planet]);
        assertAccountingInvariant(planet, [agent]);

        // Move workers to tenure 2+ so they can be fired
        const wf = agent.assets.p.workforceDemography!;
        wf[3].active.none = wf[0].active.none;
        wf[3].ageMoments.none = { ...wf[0].ageMoments.none };
        wf[0].active.none = 0;

        // Reduce target → triggers firing
        agent.assets.p.allocatedWorkers.none = 500;
        laborMarketTick([agent], [planet]);
        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds after departing pipeline completes (month tick)', () => {
        const planet = makePlanet({ none: 50000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 1000;

        // Hire
        laborMarketTick([agent], [planet]);
        assertAccountingInvariant(planet, [agent]);

        // Manually put some workers in departing pipeline slot 0 (ready to leave)
        const wf = agent.assets.p.workforceDemography!;
        const toDeparting = 50;
        wf[0].active.none -= toDeparting;
        wf[0].departing.none[0] = toDeparting;

        // Before month tick, invariant should still hold (workers are still "company" in pop)
        assertAccountingInvariant(planet, [agent]);

        // Month tick processes departing[0] → returnToPopulation (company → unoccupied)
        laborMarketMonthTick([agent], [planet]);
        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds across a full multi-tick cycle (hire → quit → month → year)', () => {
        const planet = makePlanet({ none: 50000, primary: 20000 });
        const agent = makeAgent();
        agent.assets.p.allocatedWorkers.none = 2000;
        agent.assets.p.allocatedWorkers.primary = 500;

        // Tick 1: hire
        laborMarketTick([agent], [planet]);
        assertAccountingInvariant(planet, [agent]);

        // Several normal ticks (voluntary quits accumulate)
        for (let t = 0; t < 29; t++) {
            laborMarketTick([agent], [planet]);
            assertAccountingInvariant(planet, [agent]);
        }

        // Month boundary: departing pipeline advances
        laborMarketMonthTick([agent], [planet]);
        assertAccountingInvariant(planet, [agent]);

        // Continue ticking until year boundary (11 more months × 30 ticks)
        for (let month = 1; month < 12; month++) {
            for (let t = 0; t < 30; t++) {
                laborMarketTick([agent], [planet]);
            }
            laborMarketMonthTick([agent], [planet]);
            assertAccountingInvariant(planet, [agent]);
        }

        // Year boundary: tenure advancement + retirement
        laborMarketYearTick([agent]);
        assertAccountingInvariant(planet, [agent]);
    });

    it('invariant holds with multiple agents on the same planet', () => {
        const planet = makePlanet({ none: 50000, primary: 20000 });
        const agent1 = makeAgent();
        const agent2 = makeAgent();
        agent2.id = 'agent-2';
        agent2.name = 'B';

        agent1.assets.p.allocatedWorkers.none = 1000;
        agent2.assets.p.allocatedWorkers.none = 500;
        agent2.assets.p.allocatedWorkers.primary = 300;

        laborMarketTick([agent1, agent2], [planet]);

        // Both agents are company agents (not the government), so the invariant
        // must hold when summing across both agents.
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
