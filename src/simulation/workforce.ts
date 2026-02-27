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

import type { Agent, AgeMoments, EducationLevelType, Occupation, Planet, TenureCohort, WorkforceDemography } from './planet';
import { educationLevelKeys, maxAge } from './planet';
import { MIN_EMPLOYABLE_AGE, TICKS_PER_YEAR } from './constants';
import { mortalityProbability } from './populationHelpers';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Maximum tenure tracked (years). Set to maxAge so the last bucket is
 * naturally empty — no worker hired at MIN_EMPLOYABLE_AGE can ever
 * accumulate enough tenure years to reach it before dying.
 */
export const MAX_TENURE_YEARS = maxAge;

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

/**
 * Default mean age (years) used when no real age data is available for a
 * workforce cohort (e.g. freshly created demography or workers placed
 * directly without going through the hiring pipeline).
 */
export const DEFAULT_HIRE_AGE_MEAN = 30;

// ---------------------------------------------------------------------------
// Age-dependent productivity
// ---------------------------------------------------------------------------

/**
 * Returns a productivity multiplier [0.7, 1.0] based on the mean age of a
 * workforce cohort.  Productivity is highest for ages 30–50, gradually lower
 * for young (<30) and older (>50) workers.
 */
export const ageProductivityMultiplier = (ageMean: number): number => {
    if (ageMean <= 18) return 0.8;
    if (ageMean < 30) return 0.8 + ((ageMean - 18) * 0.2) / 12; // 0.80 → 1.00
    if (ageMean <= 50) return 1.0; // peak productivity
    if (ageMean < 65) return 1.0 - ((ageMean - 50) * 0.15) / 15; // 1.00 → 0.85
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
// Helpers
// ---------------------------------------------------------------------------

/** Create an empty TenureCohort with zeroed active and departing arrays. */
export function emptyTenureCohort(): TenureCohort {
    const active = {} as Record<EducationLevelType, number>;
    const departing = {} as Record<EducationLevelType, number[]>;
    const ageMoments = {} as Record<EducationLevelType, AgeMoments>;
    for (const edu of educationLevelKeys) {
        active[edu] = 0;
        departing[edu] = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
        ageMoments[edu] = { mean: DEFAULT_HIRE_AGE_MEAN, variance: 0 };
    }
    return { active, departing, ageMoments };
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
                const result = hireFromPopulation(planet, edu, toHire, occupation);
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
                            // pooled variance: within-group variances + squared deviations from pooled mean
                            variance:
                                (existingCount * (em.variance + (em.mean - newMean) ** 2) +
                                    hired * (result.varAge + (result.meanAge - newMean) ** 2)) /
                                totalCount,
                        };
                    } else {
                        workforce[0].ageMoments[edu] = { mean: result.meanAge, variance: result.varAge };
                    }
                    // New hires enter tenure year 0
                    workforce[0].active[edu] += hired;
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
 * The last bucket (MAX_TENURE_YEARS = maxAge) is never reached in practice
 * because no worker can accumulate that much tenure before dying.
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
                                (srcCount *
                                    (src.ageMoments[edu].variance + (srcMeanAged - pooledMean) ** 2) +
                                    dstCount *
                                        (dst.ageMoments[edu].variance + (dstMeanAged - pooledMean) ** 2)) /
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
    if (annualRate >= 1) return 1;
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
