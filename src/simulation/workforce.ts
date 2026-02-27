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

import type { Agent, EducationLevelType, TenureCohort, WorkforceDemography } from './planet';
import { educationLevelKeys } from './planet';

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

// ---------------------------------------------------------------------------
// Experience multiplier
// ---------------------------------------------------------------------------

/**
 * Returns a productivity multiplier based on tenure years.
 * 0 years  → 1.0
 * 10+ years → 1.5  (linear interpolation in between)
 */
export const experienceMultiplier = (tenureYears: number): number => {
    if (tenureYears <= 0) {return 1.0;}
    if (tenureYears >= 10) {return 1.5;}
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

// ---------------------------------------------------------------------------
// Per-tick labor-market logic
// ---------------------------------------------------------------------------

/**
 * laborMarketTick — called every tick.
 *
 * Applies voluntary quits: a small fraction of active workers in each tenure
 * cohort enter the departing pipeline at the far (longest-notice) end.
 */
export function laborMarketTick(agents: Agent[]): void {
    for (const agent of agents) {
        for (const assets of Object.values(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }
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
 * their notice period and leave the workforce entirely.  All other slots
 * shift one position closer to departure.
 */
export function laborMarketMonthTick(agents: Agent[]): void {
    for (const agent of agents) {
        for (const assets of Object.values(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }
            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
                    // Slot 0 workers depart — shift the rest down.
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
