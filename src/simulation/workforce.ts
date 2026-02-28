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

import { MIN_EMPLOYABLE_AGE, MONTHS_PER_YEAR, TICKS_PER_YEAR } from './constants';
import type {
    AgeMoments,
    Agent,
    EducationLevelType,
    Occupation,
    Planet,
    TenureCohort,
    WorkforceDemography,
} from './planet';
import { educationLevelKeys, maxAge } from './planet';
import { mortalityProbability } from './populationHelpers';

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
// Gaussian CDF approximation (Abramowitz & Stegun 26.2.17, max error ~1.5e-7)
// ---------------------------------------------------------------------------

/**
 * Approximate the standard normal CDF Φ(x).
 * Used to estimate the fraction of a workforce cohort above RETIREMENT_AGE
 * given the cohort's (mean, variance) moments.
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
// Helpers
// ---------------------------------------------------------------------------

/** Create an empty TenureCohort with zeroed active, departing, and retiring arrays. */
export function emptyTenureCohort(): TenureCohort {
    const active = {} as Record<EducationLevelType, number>;
    const departing = {} as Record<EducationLevelType, number[]>;
    const departingFired = {} as Record<EducationLevelType, number[]>;
    const retiring = {} as Record<EducationLevelType, number[]>;
    const ageMoments = {} as Record<EducationLevelType, AgeMoments>;
    for (const edu of educationLevelKeys) {
        active[edu] = 0;
        departing[edu] = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
        departingFired[edu] = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
        retiring[edu] = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
        ageMoments[edu] = { mean: DEFAULT_HIRE_AGE_MEAN, variance: 0 };
    }
    return { active, departing, departingFired, retiring, ageMoments };
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

/** Sum departing (notice-period) workers for a given education level across all tenure cohorts and pipeline slots. */
export function totalDepartingForEdu(workforce: WorkforceDemography, edu: EducationLevelType): number {
    let total = 0;
    for (const cohort of workforce) {
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            total += cohort.departing[edu][m];
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

/** Sum retiring (notice-period) workers for a given education level across all tenure cohorts and pipeline slots. */
export function totalRetiringForEdu(workforce: WorkforceDemography, edu: EducationLevelType): number {
    let total = 0;
    for (const cohort of workforce) {
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            total += cohort.retiring[edu][m];
        }
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
 * Returns the number actually hired (may be less than `count` if supply is short)
 * together with the mean age and age variance of the hired workers.
 */
function hireFromPopulation(
    planet: Planet,
    edu: EducationLevelType,
    count: number,
    occupation: Occupation,
): { count: number; meanAge: number; varAge: number } {
    if (count <= 0) {
        return { count: 0, meanAge: DEFAULT_HIRE_AGE_MEAN, varAge: 0 };
    }

    const demography = planet.population.demography;
    const available = totalUnoccupiedForEdu(planet, edu);
    const toHire = Math.min(count, available);
    if (toHire <= 0) {
        return { count: 0, meanAge: DEFAULT_HIRE_AGE_MEAN, varAge: 0 };
    }

    // Distribute hires proportionally across employable age cohorts
    let hired = 0;
    let sumAges = 0;
    let sumAgesSq = 0;
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
        sumAges += actual * age;
        sumAgesSq += actual * age * age;
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
                sumAges += take * age;
                sumAgesSq += take * age * age;
            }
        }
    }

    const meanAge = hired > 0 ? sumAges / hired : DEFAULT_HIRE_AGE_MEAN;
    // Population variance: E[age²] - E[age]²
    const varAge = hired > 0 ? Math.max(0, sumAgesSq / hired - meanAge * meanAge) : 0;
    return { count: hired, meanAge, varAge };
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

/**
 * Retire `count` workers of the given education level into the planet's
 * population as 'unableToWork', moving them from the specified occupation.
 * Unlike `returnToPopulation` which routes to 'unoccupied', this function
 * routes workers to 'unableToWork' to represent retirement.
 */
function retireToPopulation(planet: Planet, edu: EducationLevelType, count: number, occupation: Occupation): void {
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
            cohort[edu].unableToWork += give;
            remaining -= give;
        }
    }
    // Edge case: if we couldn't find enough workers in that occupation,
    // add the remainder as unableToWork to the oldest age cohort.
    if (remaining > 0 && demography.length > 0) {
        demography[demography.length - 1][edu].unableToWork += remaining;
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
 *    If understaffed, hires the full gap instantly from the planet's unoccupied pool.
 * 3. Firing: if overstaffed, fires excess workers starting from the lowest eligible
 *    tenure (least senior first). Workers in tenure years 0 and 1 are protected from
 *    lay-offs.  Fired workers enter the departing pipeline (12-month notice).
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

            // Reset per-tick hiring / firing counters so the UI always
            // reflects only the most recent tick's activity.
            const hiredThisTick = {} as Record<EducationLevelType, number>;
            const firedThisTick = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                hiredThisTick[edu] = 0;
                firedThisTick[edu] = 0;
            }
            assets.hiredThisTick = hiredThisTick;
            assets.firedThisTick = firedThisTick;

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

            // --- Hiring & Firing ---
            const planet = planetMap.get(planetId);
            if (!planet) {
                continue;
            }

            const occupation: Occupation = planet.government.id === agent.id ? 'government' : 'company';

            for (const edu of educationLevelKeys) {
                const target = assets.allocatedWorkers[edu] ?? 0;
                const currentActive = totalActiveForEdu(workforce, edu);
                const gap = target - currentActive;

                if (gap > 0) {
                    // --- Hire the full gap instantly ---
                    const result = hireFromPopulation(planet, edu, gap, occupation);
                    const hired = result.count;

                    if (hired > 0) {
                        // Merge age moments for the newly hired workers into tenure year 0
                        const existingCount = workforce[0].active[edu];
                        const totalCount = existingCount + hired;
                        if (existingCount > 0) {
                            const em = workforce[0].ageMoments[edu];
                            const newMean = (existingCount * em.mean + hired * result.meanAge) / totalCount;
                            workforce[0].ageMoments[edu] = {
                                mean: newMean,
                                variance:
                                    (existingCount * (em.variance + (em.mean - newMean) ** 2) +
                                        hired * (result.varAge + (result.meanAge - newMean) ** 2)) /
                                    totalCount,
                            };
                        } else {
                            workforce[0].ageMoments[edu] = { mean: result.meanAge, variance: result.varAge };
                        }
                        workforce[0].active[edu] += hired;
                        hiredThisTick[edu] += hired;
                    }
                } else if (gap < 0) {
                    // --- Fire excess workers (lowest tenure first, skip tenure 0 & 1) ---
                    let toFire = -gap;
                    for (let year = MIN_TENURE_FOR_FIRING; year <= MAX_TENURE_YEARS && toFire > 0; year++) {
                        const cohort = workforce[year];
                        const available = cohort.active[edu];
                        const fire = Math.min(toFire, available);
                        if (fire > 0) {
                            cohort.active[edu] -= fire;
                            cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] += fire;
                            cohort.departingFired[edu][NOTICE_PERIOD_MONTHS - 1] += fire;
                            firedThisTick[edu] += fire;
                            toFire -= fire;
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Allocated-worker target computation
// ---------------------------------------------------------------------------

/**
 * updateAllocatedWorkers — recomputes the hiring targets for every agent
 * on every planet using a **feedback-based** approach.
 *
 * After the first tick, the production system stores per-education
 * `unusedWorkers` counts (which can be negative when demand exceeds supply).
 * This function uses those values to derive how many workers were actually
 * consumed by production facilities:
 *
 *   consumed[edu] = currentPool[edu] − unusedWorkers[edu]
 *
 * where `currentPool` is the effective hired workforce, computed as:
 *
 *   currentPool = active
 *               + floor(voluntaryDeparting × DEPARTING_EFFICIENCY)
 *               − retiring
 *
 * Only voluntary quitters (departing minus departingFired) contribute at
 * reduced efficiency.  Fired workers and retiring workers are excluded
 * entirely because they are already committed to leaving the workforce.
 * Without this correction the pool would be inflated by soon-to-leave
 * workers, causing the hiring target to overshoot the intended 5 % buffer.
 *
 * A negative `unusedWorkers` value means facilities needed *more* workers
 * than were available, so `consumed` exceeds the pool.
 *
 * **Overqualified-worker correction:**  The production cascade allows
 * higher-educated workers to fill lower-level slots.  The aggregated
 * `overqualifiedMatrix[jobEdu][workerEdu]` tells how many `workerEdu`
 * workers were used for `jobEdu` slots.  This function redistributes
 * that consumption back to the *job* level: it subtracts the count from
 * `workerEdu`'s consumed tally and adds it to `jobEdu`'s.  This ensures
 * the hiring system targets the education level the facilities actually
 * need, rather than perpetually chasing the higher-educated substitutes.
 *
 * **Facility-based floor:**  When the feedback-derived target for an
 * education level drops to zero but facilities still declare non-zero
 * `workerRequirement` for that level, the system falls back to the raw
 * facility requirement (workerRequirement × scale × buffer).  This
 * prevents a dead-lock where a cascade shock fires all workers of an
 * education level, consumed drops to 0, and the system never requests
 * new hires.  When feedback is positive it remains fully in control,
 * allowing the system to rightfully lower targets below the raw facility
 * requirement (e.g. due to age-productivity gains).
 *
 * The hiring target is therefore:
 *   - feedback > 0:  ceil(consumed × 1.05)
 *   - feedback = 0 but facilities need workers:  ceil(facilityFloor × 1.05)
 *   - otherwise: 0
 *
 * On the very first tick (no `unusedWorkers` data yet), the function falls
 * back to summing `workerRequirement × scale` from all facilities with the
 * same 5 % buffer.
 *
 * After computing raw targets, unmet demand is cascaded upward through higher
 * education levels (mirroring the cascade in `productionTick`).
 *
 * Call this once per tick **before** `laborMarketTick` so that the hiring
 * logic always chases up-to-date requirements.
 */
export function updateAllocatedWorkers(agents: Agent[], planets: Planet[]): void {
    // Index planets for fast lookup
    const planetMap = new Map<string, Planet>();
    for (const planet of planets) {
        planetMap.set(planet.id, planet);
    }

    for (const agent of agents) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            // 1. Determine per-edu requirement: feedback-based or bootstrap.
            const requirement = {} as Record<EducationLevelType, number>;

            const hasUsageData = assets.unusedWorkers !== undefined;

            if (hasUsageData) {
                // Feedback path: derive consumed workers from last production tick.
                // consumed = currentPool − unusedWorkers  (negative unused → excess demand)
                //
                // Fired and retiring workers are already committed to leaving, so we
                // subtract them from the pool.  Only voluntary quitters (departing −
                // departingFired) still count at reduced efficiency.  This prevents
                // the hiring target from being inflated by workers that are on their
                // way out.
                const workforce = assets.workforceDemography;
                const consumed = {} as Record<EducationLevelType, number>;
                for (const edu of educationLevelKeys) {
                    const active = workforce ? totalActiveForEdu(workforce, edu) : 0;
                    const departing = workforce ? totalDepartingForEdu(workforce, edu) : 0;
                    const departingFired = workforce ? totalDepartingFiredForEdu(workforce, edu) : 0;
                    const retiringTotal = workforce ? totalRetiringForEdu(workforce, edu) : 0;
                    // Only voluntary quitters contribute at reduced efficiency;
                    // fired and retiring workers are excluded from the pool.
                    const voluntaryDeparting = departing - departingFired;
                    const currentPool = active + Math.floor(voluntaryDeparting * DEPARTING_EFFICIENCY) - retiringTotal;
                    const unused = assets.unusedWorkers![edu] ?? 0;
                    consumed[edu] = currentPool - unused; // unused < 0 → consumed > pool
                }

                // Redistribute overqualified consumption back to the job slot
                // level that actually needed those workers.  Without this step
                // the hiring loop would keep chasing *primary* hires because
                // they were consumed, even though the real shortage is *none*.
                //
                // overqualifiedMatrix[jobEdu][workerEdu] = count of workerEdu
                // workers filling jobEdu slots.  We move that count from
                // workerEdu's consumed tally to jobEdu's.
                const oq = assets.overqualifiedMatrix;
                if (oq) {
                    for (const [jobEdu, breakdown] of Object.entries(oq)) {
                        if (!breakdown) {
                            continue;
                        }
                        const je = jobEdu as EducationLevelType;
                        for (const [workerEdu, count] of Object.entries(breakdown)) {
                            if (!count || count <= 0) {
                                continue;
                            }
                            const we = workerEdu as EducationLevelType;
                            // Shift demand from the worker's edu to the job's edu
                            consumed[we] -= count;
                            consumed[je] += count;
                        }
                    }
                }

                // Compute a facility-based floor to prevent a dead-lock where
                // a cascade shock drives active workers to 0, yielding
                // consumed=0 → requirement=0, and the system can never recover
                // because zero workers → zero consumed → zero target.
                //
                // The floor only kicks in when the feedback target would be 0
                // for an education level that facilities actually declare demand
                // for.  When feedback is positive it remains fully in control,
                // allowing the system to rightfully lower targets below the raw
                // facility requirement (e.g. due to age-productivity gains).
                const facilityFloor = {} as Record<EducationLevelType, number>;
                for (const edu of educationLevelKeys) {
                    facilityFloor[edu] = 0;
                }
                for (const facility of assets.productionFacilities) {
                    for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                        if (!req || req <= 0) {
                            continue;
                        }
                        const edu = eduLevel as EducationLevelType;
                        facilityFloor[edu] += Math.ceil(req * facility.scale);
                    }
                }

                for (const edu of educationLevelKeys) {
                    const feedbackTarget =
                        consumed[edu] > 0 ? Math.ceil(consumed[edu] * (1 + ACCEPTABLE_IDLE_FRACTION)) : 0;
                    if (feedbackTarget > 0) {
                        requirement[edu] = feedbackTarget;
                    } else if (facilityFloor[edu] > 0) {
                        // Feedback says 0 but facilities need workers → use floor to recover
                        requirement[edu] = Math.ceil(facilityFloor[edu] * (1 + ACCEPTABLE_IDLE_FRACTION));
                    } else {
                        requirement[edu] = 0;
                    }
                }
            } else {
                // Bootstrap path (first tick): use raw facility requirements.
                for (const edu of educationLevelKeys) {
                    requirement[edu] = 0;
                }
                for (const facility of assets.productionFacilities) {
                    for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                        if (!req || req <= 0) {
                            continue;
                        }
                        const edu = eduLevel as EducationLevelType;
                        requirement[edu] += Math.ceil(req * facility.scale);
                    }
                }
                for (const edu of educationLevelKeys) {
                    if (requirement[edu] > 0) {
                        requirement[edu] = Math.ceil(requirement[edu] * (1 + ACCEPTABLE_IDLE_FRACTION));
                    }
                }
            }

            // 2. Cascade unmet demand upward through the education hierarchy.
            //    For each edu level, check how many unoccupied workers the planet
            //    has *minus* what is already hired by this agent.  Any shortfall
            //    is forwarded to the next higher edu level.
            const planet = planetMap.get(planetId);
            for (const edu of educationLevelKeys) {
                assets.allocatedWorkers[edu] = 0;
            }

            if (!planet) {
                // No planet context — just use requirements as-is
                for (const edu of educationLevelKeys) {
                    assets.allocatedWorkers[edu] = requirement[edu];
                }
                continue;
            }

            // Walk from lowest to highest education level
            let overflow = 0;
            for (let i = 0; i < educationLevelKeys.length; i++) {
                const edu = educationLevelKeys[i];
                const demand = requirement[edu] + overflow;
                const alreadyHired = assets.workforceDemography
                    ? totalActiveForEdu(assets.workforceDemography, edu)
                    : 0;
                const unoccupied = totalUnoccupiedForEdu(planet, edu);
                // Total supply this agent could potentially draw from
                const supply = alreadyHired + unoccupied;

                if (supply >= demand) {
                    // Enough workers at this level — absorb all demand here
                    assets.allocatedWorkers[edu] = demand;
                    overflow = 0;
                } else {
                    // Fill what we can, push the rest to the next level up
                    assets.allocatedWorkers[edu] = supply;
                    overflow = demand - supply;
                }
            }
            // If there's still overflow after the highest edu level, add it there
            // (the hiring system will simply be unable to fill it — that's expected)
            if (overflow > 0) {
                const lastEdu = educationLevelKeys[educationLevelKeys.length - 1];
                assets.allocatedWorkers[lastEdu] += overflow;
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
 * 1. **Monthly retirement trigger:** For each (tenure × edu) cohort, estimates
 *    the fraction of workers above RETIREMENT_AGE using the age moments and
 *    retires 1/MONTHS_PER_YEAR of that annual fraction.  This spreads
 *    retirements evenly across the year instead of a single annual spike.
 *
 * 2. Advances the departing pipeline by one slot: workers at slot 0 complete
 *    their notice period and leave the workforce entirely, returning to the
 *    planet's unoccupied population pool.
 *
 * 3. Advances the retiring pipeline: workers at slot 0 complete their
 *    notice period and are moved to 'unableToWork' in the population demography.
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

            // --- Snapshot active workers at month start ---
            // Taken before any monthly processing (retirement, pipeline
            // advancement) so the UI can show "Δ month" = current − snapshot.
            const snapshot = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                snapshot[edu] = totalActiveForEdu(workforce, edu);
            }
            assets.activeAtMonthStart = snapshot;

            const planet = planetMap.get(planetId);
            const occupation: Occupation = planet && planet.government.id === agent.id ? 'government' : 'company';

            // --- Monthly retirement trigger (proportional, spread over 12 months) ---
            // For each (tenure × edu) cell, compute the fraction of workers
            // above RETIREMENT_AGE using the Gaussian approximation of the age
            // distribution.  To spread retirements evenly we convert the annual
            // fraction into a monthly rate:
            //   monthlyRate = 1 − (1 − annualFraction)^(1/12)
            // so that after 12 applications the total retired matches the annual
            // target without draining too early or leaving a residual.
            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
                    const active = cohort.active[edu];
                    if (active <= 0) {
                        continue;
                    }

                    const { mean, variance } = cohort.ageMoments[edu];

                    let annualFraction: number;
                    if (variance < 1 || active <= 1) {
                        // Delta distribution or single worker — deterministic
                        annualFraction = mean >= RETIREMENT_AGE ? 1 : 0;
                    } else {
                        const stdDev = Math.sqrt(variance);
                        const z = (RETIREMENT_AGE - mean) / stdDev;
                        annualFraction = 1 - normalCdf(z);
                    }

                    if (annualFraction <= 0) {
                        continue;
                    }

                    // Convert annual fraction to a monthly rate
                    const monthlyRate = annualFraction >= 1 ? 1 : 1 - Math.pow(1 - annualFraction, 1 / MONTHS_PER_YEAR);
                    let toRetire = Math.round(active * monthlyRate);
                    if (toRetire > 0) {
                        toRetire = Math.min(toRetire, active);
                        cohort.active[edu] -= toRetire;
                        cohort.retiring[edu][NOTICE_PERIOD_MONTHS - 1] += toRetire;

                        // Update age moments: retirees are the upper tail of the
                        // distribution; the remaining workers form a truncated normal.
                        const remaining = cohort.active[edu];
                        if (remaining > 0 && variance >= 1) {
                            const stdDev = Math.sqrt(variance);
                            const z = (RETIREMENT_AGE - mean) / stdDev;
                            const phiZ = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
                            const PhiZ = normalCdf(z);
                            if (PhiZ > 1e-8) {
                                const lambda = phiZ / PhiZ;
                                cohort.ageMoments[edu] = {
                                    mean: mean - stdDev * lambda,
                                    variance: Math.max(0, variance * (1 - z * lambda - lambda * lambda)),
                                };
                            }
                        } else if (remaining === 0) {
                            cohort.ageMoments[edu] = { mean: DEFAULT_HIRE_AGE_MEAN, variance: 0 };
                        }
                    }
                }
            }

            // --- Pipeline advancement ---
            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
                    // --- Departing pipeline: route to 'unoccupied' ---
                    const departing = cohort.departing[edu][0];
                    if (departing > 0 && planet) {
                        returnToPopulation(planet, edu, departing, occupation);
                    }

                    // Shift departing + departingFired pipelines down
                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        cohort.departing[edu][i] = cohort.departing[edu][i + 1];
                        cohort.departingFired[edu][i] = cohort.departingFired[edu][i + 1];
                    }
                    cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] = 0;
                    cohort.departingFired[edu][NOTICE_PERIOD_MONTHS - 1] = 0;

                    // --- Retiring pipeline: route to 'unableToWork' ---
                    const retirees = cohort.retiring[edu][0];
                    if (retirees > 0 && planet) {
                        retireToPopulation(planet, edu, retirees, occupation);
                    }

                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        cohort.retiring[edu][i] = cohort.retiring[edu][i + 1];
                    }
                    cohort.retiring[edu][NOTICE_PERIOD_MONTHS - 1] = 0;
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
 * and retiring pipelines, shifting every cohort from year N-1 into year N.
 * Age moments are aged +1 during the shift.
 *
 * Retirement is handled monthly in `laborMarketMonthTick` to avoid a
 * single annual spike.
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
                    const srcCount = src.active[edu];
                    const dstCount = dst.active[edu];

                    if (srcCount > 0 && dstCount > 0) {
                        // Both cohorts have workers — both age 1 year; pool into dst using the
                        // parallel-axis (pooled variance) formula to combine the two distributions.
                        const srcMeanAged = src.ageMoments[edu].mean + 1;
                        const dstMeanAged = dst.ageMoments[edu].mean + 1;
                        const totalCount = srcCount + dstCount;
                        const pooledMean = (srcCount * srcMeanAged + dstCount * dstMeanAged) / totalCount;
                        dst.ageMoments[edu] = {
                            mean: pooledMean,
                            // pooled variance = weighted sum of within-group variances +
                            // weighted sum of squared deviations from the pooled mean
                            variance:
                                (srcCount * (src.ageMoments[edu].variance + (srcMeanAged - pooledMean) ** 2) +
                                    dstCount * (dst.ageMoments[edu].variance + (dstMeanAged - pooledMean) ** 2)) /
                                totalCount,
                        };
                    } else if (srcCount > 0) {
                        // Only src workers are being transferred; carry their moments (aged +1) to dst.
                        dst.ageMoments[edu] = {
                            mean: src.ageMoments[edu].mean + 1,
                            variance: src.ageMoments[edu].variance,
                        };
                    } else if (dstCount > 0) {
                        // Only dst workers remain in place; advance their mean by 1 year.
                        dst.ageMoments[edu] = {
                            mean: dst.ageMoments[edu].mean + 1,
                            variance: dst.ageMoments[edu].variance,
                        };
                    }

                    dst.active[edu] += srcCount;
                    src.active[edu] = 0;
                    // Reset src moments to default after clearing
                    src.ageMoments[edu] = { mean: DEFAULT_HIRE_AGE_MEAN, variance: 0 };

                    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                        dst.departing[edu][m] += src.departing[edu][m];
                        src.departing[edu][m] = 0;
                        dst.departingFired[edu][m] += src.departingFired[edu][m];
                        src.departingFired[edu][m] = 0;
                        dst.retiring[edu][m] += src.retiring[edu][m];
                        src.retiring[edu][m] = 0;
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Workforce mortality (age-dependent, moment-based)
// ---------------------------------------------------------------------------

/** Convert an annual mortality rate to a per-tick rate. */
const annualToPerTick = (annualRate: number): number => {
    if (annualRate >= 1) {
        return 1;
    }
    return 1 - Math.pow(1 - annualRate, 1 / TICKS_PER_YEAR);
};

/**
 * Compute the effective annual mortality for a cohort described by age
 * moments (mean, variance) using 3-point Gauss-Hermite quadrature:
 *   E[h(age)] ≈ (1/6)·h(μ − √3·σ) + (4/6)·h(μ) + (1/6)·h(μ + √3·σ)
 */
function momentBasedAnnualMortality(
    mean: number,
    variance: number,
    starvationLevel: number,
    extraMortalityPerYear: number,
): number {
    const stdDev = Math.sqrt(variance);
    const sqrt3 = Math.sqrt(3);
    const nodes = [mean - sqrt3 * stdDev, mean, mean + sqrt3 * stdDev];
    const weights = [1 / 6, 4 / 6, 1 / 6];

    let effective = 0;
    for (let i = 0; i < 3; i++) {
        const age = Math.max(0, Math.round(nodes[i]));
        const baseMort = mortalityProbability(age) * (1 + Math.pow(starvationLevel, 6) * 99);
        effective += weights[i] * Math.min(1, baseMort + extraMortalityPerYear);
    }
    return Math.min(1, effective);
}

/**
 * workforceMortalityTick — removes workers who die from workforce cohorts.
 *
 * Called during populationTick after computing the planet-level mortality
 * rates.  Uses moment-based hazard integration to estimate the mortality
 * rate for each (tenure × education) cohort from its age moments.
 *
 * The removed workers are already accounted for in the population mortality
 * pass; this step keeps WorkforceDemography consistent with the population.
 *
 * @param agents            All agents whose workforce should be updated.
 * @param planetId          The planet for which mortality is being applied.
 * @param extraMortalityPerYear  Annual extra mortality from pollution / disasters.
 * @param starvationLevel   Current starvation level for the planet (0..1).
 */
export function workforceMortalityTick(
    agents: Agent[],
    planetId: string,
    extraMortalityPerYear: number,
    starvationLevel: number,
): void {
    for (const agent of agents) {
        const workforce = agent.assets[planetId]?.workforceDemography;
        if (!workforce) {
            continue;
        }

        for (const cohort of workforce) {
            for (const edu of educationLevelKeys) {
                const active = cohort.active[edu];
                if (active === 0) {
                    continue;
                }
                const { mean, variance } = cohort.ageMoments[edu];
                const annualMort = momentBasedAnnualMortality(mean, variance, starvationLevel, extraMortalityPerYear);
                const perTickMort = annualToPerTick(annualMort);
                const deaths = Math.floor(active * perTickMort);
                if (deaths > 0) {
                    cohort.active[edu] -= deaths;
                }
            }
        }
    }
}

/**
 * applyPopulationDeathsToWorkforce — apply exact death tallies computed by the
 * population mortality pass to agents' WorkforceDemography so both
 * representations remain consistent.  The function removes the exact integer
 * number of deaths for each (education, occupation) by distributing removals
 * first across agents (proportional to their active counts) and then across
 * tenure cohorts within each agent (again proportionally).  The allocation
 * uses the largest-remainder (Hamilton) method to ensure the integer totals
 * match the requested deaths.
 */
export function applyPopulationDeathsToWorkforce(
    agents: Agent[],
    planetId: string,
    deathsByEduOcc: Record<EducationLevelType, Record<Occupation, number>>,
): void {
    // Only occupations that map to workforce active buckets are relevant here.
    const relevantOccs: Occupation[] = ['company', 'government'];

    for (const edu of educationLevelKeys) {
        for (const occ of relevantOccs) {
            const deaths = deathsByEduOcc[edu]?.[occ] ?? 0;
            if (!deaths || deaths <= 0) {
                continue;
            }

            // Gather per-agent active counts for this edu/occ on the planet
            const agentActive: { agent: Agent; active: number }[] = [];
            let totalActive = 0;
            for (const agent of agents) {
                const wf = agent.assets[planetId]?.workforceDemography;
                if (!wf) {
                    continue;
                }
                let sum = 0;
                for (const cohort of wf) {
                    sum += cohort.active[edu];
                }
                if (sum > 0) {
                    agentActive.push({ agent, active: sum });
                    totalActive += sum;
                }
            }

            if (totalActive === 0) {
                // No workforce to remove from (rare). Nothing to do.
                continue;
            }

            // Allocate integer removals to agents using largest-remainder method
            const quotas = agentActive.map((a) => (a.active / totalActive) * deaths);
            const floors = quotas.map((q) => Math.floor(q));
            const fractions = quotas.map((q, i) => ({ idx: i, frac: q - Math.floor(q) }));
            const allocated = floors.reduce((s, v) => s + v, 0);
            const remaining = deaths - allocated;
            fractions.sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : a.idx - b.idx));
            const agentRemovals = floors.slice();
            for (const f of fractions.slice(0, Math.max(0, remaining))) {
                agentRemovals[f.idx] += 1;
            }

            // Now apply removals within each agent, distributing across tenure cohorts
            for (let i = 0; i < agentActive.length; i++) {
                const { agent } = agentActive[i];
                const toRemoveForAgent = agentRemovals[i] ?? 0;
                if (!toRemoveForAgent) {
                    continue;
                }

                const wf = agent.assets[planetId]?.workforceDemography;
                if (!wf) {
                    continue;
                }
                // Build cohort-level counts
                const cohortCounts = wf.map((c) => c.active[edu]);
                const cohortTotal = cohortCounts.reduce((s, v) => s + v, 0);
                if (cohortTotal === 0) {
                    continue;
                }

                // Allocate removals across cohorts (largest-remainder)
                const cq = cohortCounts.map((c) => (c / cohortTotal) * toRemoveForAgent);
                const cfloors = cq.map((q) => Math.floor(q));
                const cfract = cq.map((q, idx) => ({ idx, frac: q - Math.floor(q) }));
                const callocated = cfloors.reduce((s, v) => s + v, 0);
                const cremaining = toRemoveForAgent - callocated;
                cfract.sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : a.idx - b.idx));
                const cohortRemovals = cfloors.slice();
                for (const f of cfract.slice(0, Math.max(0, cremaining))) {
                    cohortRemovals[f.idx] += 1;
                }

                // Apply cohort removals
                for (let ci = 0; ci < wf.length; ci++) {
                    const rem = Math.min(cohortRemovals[ci] ?? 0, wf[ci].active[edu]);
                    if (rem <= 0) {
                        continue;
                    }
                    wf[ci].active[edu] -= rem;
                    // If cohort emptied for this edu, reset moments to defaults
                    if (wf[ci].active[edu] === 0) {
                        wf[ci].ageMoments[edu] = { mean: DEFAULT_HIRE_AGE_MEAN, variance: 0 };
                    }
                }
            }
        }
    }
}
