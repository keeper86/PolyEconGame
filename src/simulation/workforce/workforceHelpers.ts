/**
 * workforce/workforceHelpers.ts
 *
 * Foundational constants, data-structure factories, aggregation helpers,
 * math utilities, and productivity multipliers used across all workforce
 * modules.
 *
 * Age tracking uses **raw moments** (count, sumAge, sumAgeSq) so that
 * hiring, removal, and aging updates are exact arithmetic operations
 * with no Gaussian approximation drift.
 */

import { MIN_EMPLOYABLE_AGE } from '../constants';
import type { AgeMoments, EducationLevelType, TenureCohort, WorkforceDemography } from '../planet';
import { educationLevelKeys, maxAge } from '../planet';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Maximum tenure tracked (years). No worker hired at MIN_EMPLOYABLE_AGE can
 * accumulate more tenure than maxAge − MIN_EMPLOYABLE_AGE before dying.
 */
export const MAX_TENURE_YEARS = maxAge - MIN_EMPLOYABLE_AGE;

/**
 * Length of the departing notice pipeline in months.
 * Fired workers enter this pipeline and work at reduced efficiency
 * (DEPARTING_EFFICIENCY) for its duration before leaving entirely.
 * Voluntary quits also use this pipeline.
 */
export const NOTICE_PERIOD_MONTHS = 12;

/**
 * Fraction of active workers per tenure cohort per education level that
 * voluntarily quit each tick.
 */
export const VOLUNTARY_QUIT_RATE_PER_TICK = 0.0001;

/**
 * Minimum tenure year from which workers can be fired.  Workers in tenure
 * years 0 and 1 are in their probation period and are protected from
 * lay-offs (but can still quit voluntarily or retire).
 */
export const MIN_TENURE_FOR_FIRING = 1;

/**
 * Productivity multiplier for workers in the departing pipeline.
 * Fired/quitting workers still contribute to production but at reduced
 * efficiency during their notice period (1 year / 12 months).
 */
export const DEPARTING_EFFICIENCY = 0.5;

/**
 * Default mean age (years) used when no real age data is available for a
 * workforce cohort (e.g. freshly created demography or workers placed
 * directly without going through the hiring pipeline).
 */
export const DEFAULT_HIRE_AGE_MEAN = 30;

/**
 * Mean age (years) at which workers retire. At each year tick, workers in
 * cohorts whose ageMoments mean ≥ RETIREMENT_AGE are moved into the
 * retiring pipeline (similar to departing, but routed to 'unableToWork').
 */
export const RETIREMENT_AGE = 67;

/**
 * Fraction of total hired workforce that may remain idle after all
 * facilities have drawn workers, before the system starts reducing
 * hiring targets.  5 % = a small buffer so that a handful of unassigned
 * workers don't immediately trigger downsizing.
 */
export const ACCEPTABLE_IDLE_FRACTION = 0.05;

// ---------------------------------------------------------------------------
// Age-dependent productivity
// ---------------------------------------------------------------------------

/**
 * Returns a productivity multiplier [0.7, 1.0] based on the mean age of a
 * workforce cohort.  Productivity is highest for ages 30–50, gradually lower
 * for young (<30) and older (>50) workers.
 */
export const ageProductivityMultiplier = (ageMean: number): number => {
    if (ageMean <= 18) {
        return 0.8;
    }
    if (ageMean < 30) {
        return 0.8 + ((ageMean - 18) * 0.2) / 12;
    } // 0.80 → 1.00
    if (ageMean <= 50) {
        return 1.0;
    } // peak productivity
    if (ageMean < 65) {
        return 1.0 - ((ageMean - 50) * 0.15) / 15;
    } // 1.00 → 0.85
    return Math.max(0.7, 0.85 - ((ageMean - 65) * 0.15) / 15); // declining after 65
};

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
// Raw-moment helper functions
// ---------------------------------------------------------------------------

/** Compute the mean age from raw moments. Returns DEFAULT_HIRE_AGE_MEAN when count is 0. */
export function ageMean(m: AgeMoments): number {
    return m.count > 0 ? m.sumAge / m.count : DEFAULT_HIRE_AGE_MEAN;
}

/** Compute the population variance from raw moments. Returns 0 when count ≤ 1. */
export function ageVariance(m: AgeMoments): number {
    if (m.count <= 1) {
        return 0;
    }
    const mean = m.sumAge / m.count;
    return Math.max(0, m.sumAgeSq / m.count - mean * mean);
}

/** Create empty (zero) AgeMoments. */
export function emptyAgeMoments(): AgeMoments {
    return { count: 0, sumAge: 0, sumAgeSq: 0 };
}

/**
 * Create AgeMoments for `count` workers all at a single age.
 * Used when placing workers directly without going through the hiring pipeline.
 */
export function ageMomentsForAge(age: number, count: number): AgeMoments {
    return { count, sumAge: count * age, sumAgeSq: count * age * age };
}

/**
 * Merge two sets of raw age moments (e.g. when combining cohorts or adding hired workers).
 * Simply sums the raw components.
 */
export function mergeAgeMoments(a: AgeMoments, b: AgeMoments): AgeMoments {
    return {
        count: a.count + b.count,
        sumAge: a.sumAge + b.sumAge,
        sumAgeSq: a.sumAgeSq + b.sumAgeSq,
    };
}

/**
 * Remove `k` workers at exact `age` from the given raw moments.
 * The caller must ensure k ≤ m.count.
 */
export function removeFromAgeMoments(m: AgeMoments, age: number, k: number): AgeMoments {
    const newCount = m.count - k;
    if (newCount <= 0) {
        return emptyAgeMoments();
    }
    return {
        count: newCount,
        sumAge: m.sumAge - k * age,
        sumAgeSq: m.sumAgeSq - k * age * age,
    };
}

/**
 * Remove a **random sample** of `k` workers from the given raw moments.
 *
 * Unlike `removeFromAgeMoments` (which removes workers of a known exact
 * age), this function is used when the removed workers are a representative
 * random cross-section of the cohort — e.g. voluntary quits or firings
 * that are not age-selective.
 *
 * Mathematically: scaling all moments by (N-k)/N preserves both the mean
 * and the variance of the remaining population.  This avoids the variance-
 * inflation bug that occurs when removing at the mean age (which preserves
 * the mean but artificially increases variance by count/(count-k)).
 */
export function removeRandomSample(m: AgeMoments, k: number): AgeMoments {
    if (k <= 0) {
        return m;
    }
    const newCount = m.count - k;
    if (newCount <= 0) {
        return emptyAgeMoments();
    }
    const scale = newCount / m.count;
    return {
        count: newCount,
        sumAge: m.sumAge * scale,
        sumAgeSq: m.sumAgeSq * scale,
    };
}

/**
 * Extract a **random sample** of `k` workers from the given raw moments,
 * returning {remaining, sample} — the moments after extraction and the
 * moments of the extracted sample.
 *
 * Both pieces together sum back to the original moments (conservation).
 */
export function extractRandomSample(m: AgeMoments, k: number): { remaining: AgeMoments; sample: AgeMoments } {
    if (k <= 0) {
        return { remaining: m, sample: emptyAgeMoments() };
    }
    if (k >= m.count) {
        return { remaining: emptyAgeMoments(), sample: { ...m } };
    }
    const remaining = removeRandomSample(m, k);
    return {
        remaining,
        sample: {
            count: k,
            sumAge: m.sumAge - remaining.sumAge,
            sumAgeSq: m.sumAgeSq - remaining.sumAgeSq,
        },
    };
}

/**
 * Age all workers by one year: each worker's age increases by 1.
 *   Σage'  = Σage + N
 *   Σage²' = Σage² + 2·Σage + N
 */
export function ageAgeMomentsByOneYear(m: AgeMoments): AgeMoments {
    if (m.count === 0) {
        return m;
    }
    return {
        count: m.count,
        sumAge: m.sumAge + m.count,
        sumAgeSq: m.sumAgeSq + 2 * m.sumAge + m.count,
    };
}

// ---------------------------------------------------------------------------
// Gaussian CDF approximation (Abramowitz & Stegun 26.2.17, max error ~1.5e-7)
// ---------------------------------------------------------------------------

/**
 * Approximate the standard normal CDF Φ(x).
 * Kept for use in age-distribution visualization (workforce-summary).
 */
export function normalCdf(x: number): number {
    if (x < -8) {
        return 0;
    }
    if (x > 8) {
        return 1;
    }
    // Abramowitz & Stegun 26.2.17 approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const absX = Math.abs(x);
    // These coefficients approximate erfc(z) using exp(-z²), so map z = |x|/√2
    const z = absX / Math.SQRT2;
    const t = 1.0 / (1.0 + p * z);
    const erfcApprox = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    // Φ(x) = 0.5 * erfc(-x / √2)
    return x >= 0 ? 1 - 0.5 * erfcApprox : 0.5 * erfcApprox;
}

// ---------------------------------------------------------------------------
// Age-weighted expected rate
// ---------------------------------------------------------------------------

/**
 * Given the age distribution of a workforce cohort (as raw moments),
 * compute the expected value of an age-dependent `rateFn` over that
 * distribution.
 *
 * For a delta distribution (variance ≈ 0 or a single worker), the rate is
 * evaluated directly at the mean age.  Otherwise we sum `rateFn(age)` over
 * integer ages weighted by the Gaussian PDF, scanning ±3σ around the mean
 * (clamped to [MIN_EMPLOYABLE_AGE, maxAge]).
 *
 * @deprecated  Workforce removals should now use exact age-resolved events
 *              from the population pipeline instead of this Gaussian
 *              approximation.  Kept only for backward compatibility.
 */
export function expectedRateForMoments(moments: AgeMoments, rateFn: (age: number) => number): number {
    const mean = ageMean(moments);
    const variance = ageVariance(moments);

    // Delta distribution or single worker — evaluate at mean
    if (variance < 1) {
        return rateFn(Math.round(mean));
    }

    const stdDev = Math.sqrt(variance);
    const lo = Math.max(MIN_EMPLOYABLE_AGE, Math.floor(mean - 3 * stdDev));
    const hi = Math.min(maxAge, Math.ceil(mean + 3 * stdDev));

    let weightedSum = 0;
    let totalWeight = 0;
    for (let age = lo; age <= hi; age++) {
        const z = (age - mean) / stdDev;
        // Gaussian PDF weight (unnormalised — we normalise by totalWeight)
        const w = Math.exp(-0.5 * z * z);
        weightedSum += w * rateFn(age);
        totalWeight += w;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : rateFn(Math.round(mean));
}

// ---------------------------------------------------------------------------
// Data-structure factories
// ---------------------------------------------------------------------------

/** Create an empty TenureCohort with zeroed active moments and empty departing pipeline. */
export function emptyTenureCohort(): TenureCohort {
    const active = {} as Record<EducationLevelType, AgeMoments>;
    const departing = {} as Record<EducationLevelType, AgeMoments[]>;
    const departingFired = {} as Record<EducationLevelType, number[]>;
    for (const edu of educationLevelKeys) {
        active[edu] = emptyAgeMoments();
        departing[edu] = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => emptyAgeMoments());
        departingFired[edu] = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
    }
    return { active, departing, departingFired };
}

/** Create a fresh WorkforceDemography with MAX_TENURE_YEARS + 1 empty cohorts. */
export function createWorkforceDemography(): WorkforceDemography {
    return Array.from({ length: MAX_TENURE_YEARS + 1 }, () => emptyTenureCohort());
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/** Sum active workers for a given education level across all tenure cohorts. */
export function totalActiveForEdu(workforce: WorkforceDemography, edu: EducationLevelType): number {
    let total = 0;
    for (const cohort of workforce) {
        total += cohort.active[edu].count;
    }
    return total;
}

/** Sum departing (notice-period) workers for a given education level across all tenure cohorts and pipeline slots. */
export function totalDepartingForEdu(workforce: WorkforceDemography, edu: EducationLevelType): number {
    let total = 0;
    for (const cohort of workforce) {
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            total += cohort.departing[edu][m].count;
        }
    }
    return total;
}

/** Sum fired-departing workers for a given education level across all tenure cohorts and pipeline slots. */
export function totalDepartingFiredForEdu(workforce: WorkforceDemography, edu: EducationLevelType): number {
    let total = 0;
    for (const cohort of workforce) {
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            total += cohort.departingFired[edu][m];
        }
    }
    return total;
}
