import { describe, it, expect, beforeEach } from 'vitest';

import {
    TICKS_PER_MONTH,
    MONTHS_PER_YEAR,
    TICKS_PER_YEAR,
    isMonthBoundary,
    isYearBoundary,
} from './constants';
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
import type { Agent } from './planet';
import type { StorageFacility } from './facilities';

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

    beforeEach(() => {
        agent = makeAgent();
    });

    it('does nothing when workforceDemography is absent', () => {
        agent.assets.p.workforceDemography = undefined;
        // Should not throw
        expect(() => laborMarketTick([agent])).not.toThrow();
    });

    it('moves a fraction of active workers into the departing pipeline', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].active.none = 10000;

        laborMarketTick([agent]);

        const expectedQuitters = Math.floor(10000 * VOLUNTARY_QUIT_RATE_PER_TICK);
        expect(workforce[0].active.none).toBe(10000 - expectedQuitters);
        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1]).toBe(expectedQuitters);
    });

    it('does not move workers when count is too small to yield floor > 0', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].active.none = 1; // floor(1 * 0.0001) = 0

        laborMarketTick([agent]);

        expect(workforce[0].active.none).toBe(1);
        expect(workforce[0].departing.none[NOTICE_PERIOD_MONTHS - 1]).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// laborMarketMonthTick
// ---------------------------------------------------------------------------

describe('laborMarketMonthTick', () => {
    let agent: Agent;

    beforeEach(() => {
        agent = makeAgent();
    });

    it('shifts the departing pipeline, discarding slot-0 workers', () => {
        const workforce = agent.assets.p.workforceDemography!;
        // Seed the pipeline: [5, 3, 1] (slot 0 = soonest to depart)
        workforce[0].departing.none = [5, 3, 1];

        laborMarketMonthTick([agent]);

        // Slot 0 workers (5) have departed; pipeline advances
        expect(workforce[0].departing.none[0]).toBe(3);
        expect(workforce[0].departing.none[1]).toBe(1);
        expect(workforce[0].departing.none[2]).toBe(0);
    });

    it('clears the last pipeline slot after advancing', () => {
        const workforce = agent.assets.p.workforceDemography!;
        workforce[0].departing.none = [0, 0, 7];

        laborMarketMonthTick([agent]);

        expect(workforce[0].departing.none[1]).toBe(7);
        expect(workforce[0].departing.none[2]).toBe(0);
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
