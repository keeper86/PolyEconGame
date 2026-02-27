import { describe, it, expect, beforeEach } from 'vitest';

import { TICKS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_YEAR, isMonthBoundary, isYearBoundary } from './constants';
import {
    MAX_TENURE_YEARS,
    NOTICE_PERIOD_MONTHS,
    VOLUNTARY_QUIT_RATE_PER_TICK,
    createWorkforceDemography,
    emptyTenureCohort,
    experienceMultiplier,
    laborMarketMonthTick,
    laborMarketTick,
    laborMarketYearTick,
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
