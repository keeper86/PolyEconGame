import { describe, it, expect, beforeEach } from 'vitest';

import { TICKS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_YEAR, isMonthBoundary, isYearBoundary } from './constants';
import {
    MAX_TENURE_YEARS,
    NOTICE_PERIOD_MONTHS,
    VOLUNTARY_QUIT_RATE_PER_TICK,
    DEFAULT_HIRE_AGE_MEAN,
    createWorkforceDemography,
    emptyTenureCohort,
    experienceMultiplier,
    ageProductivityMultiplier,
    laborMarketMonthTick,
    laborMarketTick,
    laborMarketYearTick,
    workforceMortalityTick,
} from './workforce';
import type { Agent, Planet } from './planet';
import type { StorageFacility } from './facilities';
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
    it('has zeroed active and departing arrays for all education levels', () => {
        const cohort = emptyTenureCohort();
        for (const edu of ['none', 'primary', 'secondary', 'tertiary', 'quaternary'] as const) {
            expect(cohort.active[edu]).toBe(0);
            expect(cohort.departing[edu]).toHaveLength(NOTICE_PERIOD_MONTHS);
            expect(cohort.departing[edu].every((v) => v === 0)).toBe(true);
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

        // Should hire floor(500 * HIRING_RATE_PER_TICK) = floor(500/30) = 16, at least 1
        const workforce = agent.assets.p.workforceDemography!;
        const hired = workforce[0].active.primary;
        expect(hired).toBeGreaterThan(0);
        expect(hired).toBeLessThanOrEqual(500);
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

    it('fills positions gradually over multiple ticks', () => {
        planet = makePlanet({ primary: 100000 });
        agent.assets.p.allocatedWorkers.primary = 3000;

        // Run 30 ticks
        for (let i = 0; i < 30; i++) {
            laborMarketTick([agent], [planet]);
        }

        const workforce = agent.assets.p.workforceDemography!;
        const totalActive = workforce.reduce((sum, c) => sum + c.active.primary, 0);
        // Exponential convergence: after 30 ticks at rate 1/30, expect ~64% filled
        expect(totalActive).toBeGreaterThan(1800);
        expect(totalActive).toBeLessThanOrEqual(3000);

        // Run 90 more ticks (total 120 ≈ 4 months) — should be nearly full
        // (small shortfall possible due to voluntary quits running concurrently)
        for (let i = 0; i < 90; i++) {
            laborMarketTick([agent], [planet]);
        }
        const totalAfter120 = workforce.reduce((sum, c) => sum + c.active.primary, 0);
        expect(totalAfter120).toBeGreaterThan(2900);
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
        // Seed the pipeline: [5, 3, 1] (slot 0 = soonest to depart)
        workforce[0].departing.none = [5, 3, 1];

        laborMarketMonthTick([agent], [planet]);

        // Slot 0 workers (5) have departed; pipeline advances
        expect(workforce[0].departing.none[0]).toBe(3);
        expect(workforce[0].departing.none[1]).toBe(1);
        expect(workforce[0].departing.none[2]).toBe(0);
    });

    it('clears the last pipeline slot after advancing', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].departing.none = [0, 0, 7];

        laborMarketMonthTick([agent], [planet]);

        expect(workforce[0].departing.none[1]).toBe(7);
        expect(workforce[0].departing.none[2]).toBe(0);
    });

    it('returns departing workers to the unoccupied population pool', () => {
        // Put some company workers in population so returnToPopulation can find them
        planet = makePlanet();
        planet.population.demography[25].primary.company = 100;
        planet.population.demography[25].primary.unoccupied = 50;

        const workforce = agent.assets.p.workforceDemography!;
        // 10 workers departing at slot 0 (about to leave)
        workforce[0].departing.primary = [10, 0, 0];

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
