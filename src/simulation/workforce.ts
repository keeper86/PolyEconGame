/**
 * workforce.ts
 *
 * Workforce demography system: tenure tracking, experience multipliers, and
 * a unified departing pipeline for fired and quitting workers.
 *
 * Data model
 * ----------
 * WorkforceDemography is an array of TenureCohort indexed by tenure year.
 * Each TenureCohort tracks:
 *   - active:    workers currently employed at that tenure level, keyed by education
 *   - departing: notice-period pipeline.  departing[edu][0] = workers whose notice
 *                expires this month; departing[edu][NOTICE_PERIOD_MONTHS-1] = newest
 *                entries to the pipeline.
 */

import type { Agent, EducationLevelType, Occupation, Planet, TenureCohort, WorkforceDemography } from './planet';
import { educationLevelKeys } from './planet';
import { MIN_EMPLOYABLE_AGE } from './constants';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum tenure tracked (years). Workers stay in the last bucket beyond this. */
export const MAX_TENURE_YEARS = 40;

/**
 * Length of the departing notice pipeline in months.
 * Firing and voluntary quits both enter this pipeline.
 */
export const NOTICE_PERIOD_MONTHS = 3;

/**
 * Fraction of active workers per tenure cohort per education level that
 * voluntarily quit each tick.
 */
export const VOLUNTARY_QUIT_RATE_PER_TICK = 0.0001;

/**
 * Maximum fraction of the vacancy gap that can be filled per tick.
 * At 1/30, a fully vacant position fills in ~30 ticks ≈ 1 month.
 */
export const HIRING_RATE_PER_TICK = 1 / 30;

// ---------------------------------------------------------------------------
// Experience multiplier
// ---------------------------------------------------------------------------

/**
 * Returns a productivity multiplier based on tenure years.
 * 0 years  → 1.0
 * 10+ years → 1.5  (linear interpolation in between)
 */
export const experienceMultiplier = (tenureYears: number): number => {
    if (tenureYears <= 0) {
        return 1.0;
    }
    if (tenureYears >= 10) {
        return 1.5;
    }
    return 1.0 + (tenureYears / 10) * 0.5;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an empty TenureCohort with zeroed active and departing arrays. */
export function emptyTenureCohort(): TenureCohort {
    const active = {} as Record<EducationLevelType, number>;
    const departing = {} as Record<EducationLevelType, number[]>;
    for (const edu of educationLevelKeys) {
        active[edu] = 0;
        departing[edu] = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
    }
    return { active, departing };
}

/** Create a fresh WorkforceDemography with MAX_TENURE_YEARS + 1 empty cohorts. */
export function createWorkforceDemography(): WorkforceDemography {
    return Array.from({ length: MAX_TENURE_YEARS + 1 }, () => emptyTenureCohort());
}

/** Sum active workers for a given education level across all tenure cohorts. */
export function totalActiveForEdu(workforce: WorkforceDemography, edu: EducationLevelType): number {
    let total = 0;
    for (const cohort of workforce) {
        total += cohort.active[edu];
    }
    return total;
}

/**
 * Count total unoccupied people for a given education level across all
 * employable ages (≥ MIN_EMPLOYABLE_AGE) in a planet's population.
 */
function totalUnoccupiedForEdu(planet: Planet, edu: EducationLevelType): number {
    let total = 0;
    const demography = planet.population.demography;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        total += demography[age][edu]?.unoccupied ?? 0;
    }
    return total;
}

/**
 * Remove `count` unoccupied workers of the given education level from the
 * planet's population, spreading removals proportionally across age cohorts.
 * Workers are moved from 'unoccupied' to the specified occupation.
 * Returns the number actually hired (may be less than `count` if supply is short).
 */
function hireFromPopulation(planet: Planet, edu: EducationLevelType, count: number, occupation: Occupation): number {
    if (count <= 0) {
        return 0;
    }

    const demography = planet.population.demography;
    const available = totalUnoccupiedForEdu(planet, edu);
    const toHire = Math.min(count, available);
    if (toHire <= 0) {
        return 0;
    }

    // Distribute hires proportionally across employable age cohorts
    let hired = 0;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        const cohort = demography[age];
        const cohortUnoccupied = cohort[edu]?.unoccupied ?? 0;
        if (cohortUnoccupied <= 0) {
            continue;
        }
        const share = Math.floor((cohortUnoccupied / available) * toHire);
        const actual = Math.min(share, cohortUnoccupied);
        cohort[edu].unoccupied -= actual;
        cohort[edu][occupation] += actual;
        hired += actual;
    }

    // Handle rounding remainder: pick from youngest employable available
    let remainder = toHire - hired;
    if (remainder > 0) {
        for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
            if (remainder <= 0) {
                break;
            }
            const cohort = demography[age];
            const cohortUnoccupied = cohort[edu]?.unoccupied ?? 0;
            const take = Math.min(remainder, cohortUnoccupied);
            if (take > 0) {
                cohort[edu].unoccupied -= take;
                cohort[edu][occupation] += take;
                hired += take;
                remainder -= take;
            }
        }
    }

    return hired;
}

/**
 * Return `count` workers of the given education level back to the planet's
 * unoccupied population pool, moving them from the specified occupation.
 */
function returnToPopulation(planet: Planet, edu: EducationLevelType, count: number, occupation: Occupation): void {
    if (count <= 0) {
        return;
    }
    const demography = planet.population.demography;
    let remaining = count;
    for (const cohort of demography) {
        if (remaining <= 0) {
            break;
        }
        const employed = cohort[edu]?.[occupation] ?? 0;
        const give = Math.min(remaining, employed);
        if (give > 0) {
            cohort[edu][occupation] -= give;
            cohort[edu].unoccupied += give;
            remaining -= give;
        }
    }
    // If we couldn't find enough workers in that occupation (edge case), just add
    // the remainder as unoccupied to the first employable-age cohort.
    if (remaining > 0 && demography.length > MIN_EMPLOYABLE_AGE) {
        demography[MIN_EMPLOYABLE_AGE][edu].unoccupied += remaining;
    }
}

// ---------------------------------------------------------------------------
// Per-tick labor-market logic
// ---------------------------------------------------------------------------

/**
 * laborMarketTick — called every tick.
 *
 * 1. Voluntary quits: a small fraction of active workers enter the departing pipeline.
 * 2. Hiring: compares active headcount vs allocatedWorkers target per education level.
 *    If understaffed, hires from the planet's unoccupied population pool into tenure year 0.
 */
export function laborMarketTick(agents: Agent[], planets: Planet[]): void {
    // Index planets by id for fast lookup
    const planetMap = new Map<string, Planet>();
    for (const planet of planets) {
        planetMap.set(planet.id, planet);
    }

    for (const agent of agents) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            // --- Voluntary quits ---
            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
                    const activeCount = cohort.active[edu];
                    if (activeCount === 0) {
                        continue;
                    }
                    const voluntaryQuitters = Math.floor(activeCount * VOLUNTARY_QUIT_RATE_PER_TICK);
                    if (voluntaryQuitters > 0) {
                        cohort.active[edu] -= voluntaryQuitters;
                        cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] += voluntaryQuitters;
                    }
                }
            }

            // --- Hiring ---
            const planet = planetMap.get(planetId);
            if (!planet) {
                continue;
            }

            const occupation: Occupation = planet.government.id === agent.id ? 'government' : 'company';

            for (const edu of educationLevelKeys) {
                const target = assets.allocatedWorkers[edu] ?? 0;
                const currentActive = totalActiveForEdu(workforce, edu);
                const gap = target - currentActive;
                if (gap <= 0) {
                    continue;
                }

                // Hire a fraction of the gap each tick (ramp-up, not instant)
                const toHire = Math.max(1, Math.floor(gap * HIRING_RATE_PER_TICK));
                const hired = hireFromPopulation(planet, edu, toHire, occupation);

                // New hires enter tenure year 0
                workforce[0].active[edu] += hired;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Per-month labor-market logic
// ---------------------------------------------------------------------------

/**
 * laborMarketMonthTick — called every month boundary.
 *
 * Advances the departing pipeline by one slot: workers at slot 0 complete
 * their notice period and leave the workforce entirely, returning to the
 * planet's unoccupied population pool.
 */
export function laborMarketMonthTick(agents: Agent[], planets: Planet[]): void {
    const planetMap = new Map<string, Planet>();
    for (const planet of planets) {
        planetMap.set(planet.id, planet);
    }

    for (const agent of agents) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            const planet = planetMap.get(planetId);
            const occupation: Occupation = planet && planet.government.id === agent.id ? 'government' : 'company';

            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
                    // Workers at slot 0 depart
                    const departing = cohort.departing[edu][0];
                    if (departing > 0 && planet) {
                        returnToPopulation(planet, edu, departing, occupation);
                    }

                    // Shift the rest down
                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        cohort.departing[edu][i] = cohort.departing[edu][i + 1];
                    }
                    cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] = 0;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Per-year labor-market logic
// ---------------------------------------------------------------------------

/**
 * laborMarketYearTick — called every year boundary.
 *
 * Advances tenure by one year for all active workers and their departing
 * pipelines, shifting every cohort from year N-1 into year N.
 * Workers already in the last bucket (MAX_TENURE_YEARS) stay there.
 */
export function laborMarketYearTick(agents: Agent[]): void {
    for (const agent of agents) {
        for (const assets of Object.values(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }
            // Shift from highest tenure down to avoid double-counting.
            for (let year = MAX_TENURE_YEARS; year > 0; year--) {
                const src = workforce[year - 1];
                const dst = workforce[year];
                for (const edu of educationLevelKeys) {
                    dst.active[edu] += src.active[edu];
                    src.active[edu] = 0;
                    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                        dst.departing[edu][m] += src.departing[edu][m];
                        src.departing[edu][m] = 0;
                    }
                }
            }
        }
    }
}
