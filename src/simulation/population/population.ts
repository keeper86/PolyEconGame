import { TICKS_PER_YEAR } from '../constants';
import { stochasticRound } from '../utils/stochasticRound';
import type { EducationLevelType } from './education';
import { educationLevelKeys } from './education';

export { educationLevels } from './education';
export type { EducationLevelType } from './education';

export const MAX_AGE: number = 100;

export const OCCUPATIONS = ['unoccupied', 'employed', 'education', 'unableToWork'] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

export const SKILL = ['novice', 'professional', 'expert'] as const;
export type Skill = (typeof SKILL)[number];

export type PopulationTransferCohort = { [L in EducationLevelType]: { [O in Occupation]: number } };
export type PopulationTransferMatrix = PopulationTransferCohort[];

export type CategoryIndex = {
    age: number;
    occ: Occupation;
    edu: EducationLevelType;
    skill: Skill;
};

export type GaussianMoments = {
    mean: number;
    variance: number;
};

/**
 * Merge two Gaussian moment groups using the parallel-axis (pooled-variance) formula.
 *
 *   pooledMean = (nA * mA + nB * mB) / (nA + nB)
 *   pooledVar  = (nA*(vA + (mA−pooledMean)²) + nB*(vB + (mB−pooledMean)²)) / (nA+nB)
 */
export function mergeGaussianMoments(
    nA: number,
    wA: GaussianMoments,
    nB: number,
    wB: GaussianMoments,
): GaussianMoments {
    if (nA <= 0) {
        return { mean: wB.mean, variance: wB.variance };
    }
    if (nB <= 0) {
        return { mean: wA.mean, variance: wA.variance };
    }
    const n = nA + nB;
    const mean = (nA * wA.mean + nB * wB.mean) / n;
    const variance = (nA * (wA.variance + (wA.mean - mean) ** 2) + nB * (wB.variance + (wB.mean - mean) ** 2)) / n;
    return { mean, variance };
}

type DemographyStat = {
    countThisTick: number;
    countThisMonth: number;
    countLastMonth: number;
};
export type RetirementStats = DemographyStat & {
    type: 'retirement';
};
export type DeathStats = DemographyStat & {
    type: 'death';
};
export type DisabilityStats = DemographyStat & {
    type: 'disability';
};
export type DemographicEventType = RetirementStats['type'] | DeathStats['type'] | DisabilityStats['type'];

export type PopulationCategory = {
    total: number;
    // Gaussian moments of per-capita monetary wealth for this category
    wealth: GaussianMoments;
    // total food stock for this category (not per capita)
    foodStock: number;
    // category-bound starvation level (0 to 1)
    starvationLevel: number;
    deaths: DeathStats;
    disabilities: DisabilityStats;
    retirements: RetirementStats;
};

export type WorkforceCategory = {
    active: number;
    departing: number[];
    departingFired: number[];
};

export type CohortByOccupation<T> = { [L in EducationLevelType]: { [S in Skill]: T } };
export type Cohort<T> = { [O in Occupation]: CohortByOccupation<T> };

export type Population = {
    demography: Cohort<PopulationCategory>[];
    lastTransferMatrix: PopulationTransferMatrix;
};

// ---------------------------------------------------------------------------
// Population utilities
// ---------------------------------------------------------------------------

export const createEmptyCohort = <T>(nullFactory: () => T): Cohort<T> => {
    const cohort = {} as Cohort<T>;
    for (const o of OCCUPATIONS) {
        cohort[o] = {} as CohortByOccupation<T>;
        for (const l of educationLevelKeys) {
            cohort[o][l] = {} as Record<Skill, T>;
            for (const s of SKILL) {
                cohort[o][l][s] = nullFactory();
            }
        }
    }
    return cohort;
};

export const nullPopulationCategory = (): PopulationCategory => ({
    total: 0,
    wealth: { mean: 0, variance: 0 },
    foodStock: 0,
    starvationLevel: 0,
    deaths: { type: 'death', countThisTick: 0, countThisMonth: 0, countLastMonth: 0 },
    disabilities: { type: 'disability', countThisTick: 0, countThisMonth: 0, countLastMonth: 0 },
    retirements: { type: 'retirement', countThisTick: 0, countThisMonth: 0, countLastMonth: 0 },
});

export const createEmptyPopulationCohort = (): Cohort<PopulationCategory> => createEmptyCohort(nullPopulationCategory);

export const createEmptyWorkforceCohort = (): CohortByOccupation<WorkforceCategory> => {
    const cohort = {} as CohortByOccupation<WorkforceCategory>;
    for (const l of educationLevelKeys) {
        cohort[l] = {} as Record<Skill, WorkforceCategory>;
        for (const s of SKILL) {
            cohort[l][s] = nullWorkforceCategory();
        }
    }
    return cohort;
};

export const nullWorkforceCategory = (): WorkforceCategory => ({
    active: 0,
    departing: [],
    departingFired: [],
});

/**
 * Result of a population transfer, including any "orphaned" wealth
 * from people who were removed without a destination (deaths).
 */
export type TransferResult = {
    /** Number of people actually moved (capped at source total). */
    count: number;
    /**
     * Total wealth orphaned by this transfer (count × perCapitaMean).
     * Non-zero only when `to` is undefined (death / removal).
     * Callers should credit this amount to the planet's bank as
     * inheritance so that monetary wealth is conserved.
     */
    inheritedWealth: number;
};

// ---------------------------------------------------------------------------
// Merge helper — the shared building block
// ---------------------------------------------------------------------------

/**
 * Merge `count` people from a source PopulationCategory into a destination
 * by direct reference, pooling total, wealth (Gaussian moments), foodStock
 * and starvation.
 *
 * This is the low-level building block used by both `transferPopulation`
 * (for in-place indexed transfers) and `aging.ts` (for cross-demography
 * transfers when building a new demography array).
 *
 * Note: only the *destination* is mutated.  The caller is responsible for
 * decrementing the source's `total` and `foodStock` if needed (as
 * `transferPopulation` does).
 *
 * Demographic-event counters (deaths, disabilities, retirements) are
 * intentionally NOT merged — they are per-tick accumulators that should
 * be reset in newly created demography arrays.
 */
export function mergePopulationCategory(dst: PopulationCategory, src: PopulationCategory, count: number): void {
    if (count <= 0) {
        return;
    }
    dst.wealth = mergeGaussianMoments(dst.total, dst.wealth, count, src.wealth);
    const srcFoodPer = src.total > 0 ? stochasticRound(src.foodStock / src.total) : 0;
    dst.foodStock += srcFoodPer * count;

    //const totalAfter = dst.total + count;
    //if (totalAfter > 0) {
    //    dst.starvationLevel = (dst.total * dst.starvationLevel + count * src.starvationLevel) / totalAfter;
    //}
    dst.total += count;
}

/**
 * Transfer `count` people from one population cell to another.
 *
 * Both source and destination are identified by `CategoryIndex`
 * (age, occ, edu, skill) within the same `demography` array.
 *
 * When `to` is undefined the people are removed (death).  Their food
 * stock is destroyed (perishable) but their monetary wealth is returned
 * in `TransferResult.inheritedWealth` so the caller can route it to
 * the inheritance redistribution system.
 *
 * For normal transfers (to !== undefined) wealth moments, food stock,
 * and starvation level are moved proportionally via `mergePopulationCategory`.
 * The source's per-capita moments are unchanged (random sub-sample assumption).
 */
export const transferPopulation = (
    demography: Cohort<PopulationCategory>[],
    from: CategoryIndex,
    to: CategoryIndex | undefined,
    count: number,
): TransferResult => {
    if (count <= 0) {
        return { count: 0, inheritedWealth: 0 };
    }
    const fromCategory = demography[from.age][from.occ][from.edu][from.skill];
    const toCategory = to ? demography[to.age][to.occ][to.edu][to.skill] : undefined;

    const transferMaximum = Math.min(fromCategory.total, count);
    const originalTotal = fromCategory.total;
    const fraction = originalTotal > 0 ? transferMaximum / originalTotal : 0;

    let inheritedWealth = 0;
    if (toCategory) {
        // Merge into destination *before* decrementing source total so that
        // mergePopulationCategory sees the correct per-capita foodStock.
        mergePopulationCategory(toCategory, fromCategory, transferMaximum);
        fromCategory.total -= transferMaximum;
        // Subtract the food stock that was merged into the destination
        const foodStockTransfer = fromCategory.foodStock * fraction;
        fromCategory.foodStock -= foodStockTransfer;
    } else {
        // Death: decrement source and orphan the wealth for inheritance.
        fromCategory.total -= transferMaximum;
        const wealthTransfer: GaussianMoments = {
            mean: fromCategory.wealth.mean,
            variance: fromCategory.wealth.variance,
        };
        inheritedWealth = transferMaximum * Math.max(0, wealthTransfer.mean);
        // Food stock of the dead is destroyed (perishable).
        fromCategory.foodStock -= fromCategory.foodStock * fraction;
    }

    return { count: transferMaximum, inheritedWealth };
};

const reduceCohort = <T>(cohort: Cohort<T>, sumFunction: (categoryA: T, categoryB: T) => T, initialValue: T): T => {
    let total = initialValue;
    for (const o of OCCUPATIONS) {
        for (const l of educationLevelKeys) {
            for (const s of SKILL) {
                total = sumFunction(total, cohort[o][l][s]);
            }
        }
    }
    return total;
};

export const reducePopulationCohort = (cohort: Cohort<PopulationCategory>): PopulationCategory =>
    reduceCohort(
        cohort,
        (a, b) => ({
            total: a.total + b.total,
            wealth: mergeGaussianMoments(a.total, a.wealth, b.total, b.wealth),
            foodStock: a.foodStock + b.foodStock,
            starvationLevel: Math.min(
                1,
                (a.total * a.starvationLevel + b.total * b.starvationLevel) / (a.total + b.total),
            ),
            deaths: {
                type: 'death',
                countThisTick: a.deaths.countThisTick + b.deaths.countThisTick,
                countThisMonth: a.deaths.countThisMonth + b.deaths.countThisMonth,
                countLastMonth: a.deaths.countLastMonth + b.deaths.countLastMonth,
            },
            disabilities: {
                type: 'disability',
                countThisTick: a.disabilities.countThisTick + b.disabilities.countThisTick,
                countThisMonth: a.disabilities.countThisMonth + b.disabilities.countThisMonth,
                countLastMonth: a.disabilities.countLastMonth + b.disabilities.countLastMonth,
            },
            retirements: {
                type: 'retirement',
                countThisTick: a.retirements.countThisTick + b.retirements.countThisTick,
                countThisMonth: a.retirements.countThisMonth + b.retirements.countThisMonth,
                countLastMonth: a.retirements.countLastMonth + b.retirements.countLastMonth,
            },
        }),
        nullPopulationCategory(),
    );

export const workForceSumFunction = (a: WorkforceCategory, b: WorkforceCategory): WorkforceCategory => ({
    active: a.active + b.active,
    departing: a.departing.map((count, i) => count + (b.departing[i] ?? 0)),
    departingFired: a.departingFired.map((count, i) => count + (b.departingFired[i] ?? 0)),
});
export const reduceWorkforceCohort = (cohort: CohortByOccupation<WorkforceCategory>): WorkforceCategory => {
    let total = nullWorkforceCategory();
    for (const l of educationLevelKeys) {
        for (const s of SKILL) {
            total = workForceSumFunction(total, cohort[l][s]);
        }
    }
    return total;
};

const mapCohort = <T, U>(cohort: Cohort<T>, mapFunction: (category: T) => U): Cohort<U> => {
    const newCohort = {} as Cohort<U>;
    for (const o of OCCUPATIONS) {
        newCohort[o] = {} as CohortByOccupation<U>;
        for (const l of educationLevelKeys) {
            newCohort[o][l] = {} as Record<Skill, U>;
            for (const s of SKILL) {
                newCohort[o][l][s] = mapFunction(cohort[o][l][s]);
            }
        }
    }
    return newCohort;
};

export const mapPopulationCohort = (
    cohort: Cohort<PopulationCategory>,
    mapFunction: (category: PopulationCategory) => PopulationCategory,
): Cohort<PopulationCategory> => mapCohort(cohort, mapFunction);

export const mapWorkforceCohort = (
    cohort: Cohort<WorkforceCategory>,
    mapFunction: (category: WorkforceCategory) => WorkforceCategory,
): Cohort<WorkforceCategory> => mapCohort(cohort, mapFunction);

const forEachCohortByOccupation = <T>(
    cohort: CohortByOccupation<T>,
    forEachFunction: (category: T, edu: EducationLevelType, skill: Skill) => void,
): void => {
    for (const l of educationLevelKeys) {
        for (const s of SKILL) {
            forEachFunction(cohort[l][s], l, s);
        }
    }
};

export const forEachPopulationCohortWithOccupation = (
    cohort: Cohort<PopulationCategory>,
    forEachFunction: (category: PopulationCategory, occ: Occupation, edu: EducationLevelType, skill: Skill) => void,
): void => {
    for (const occ of OCCUPATIONS) {
        forEachCohortByOccupation(cohort[occ], (category, edu, skill) => forEachFunction(category, occ, edu, skill));
    }
};

const forEachCohort = <T>(
    cohort: Cohort<T>,
    forEachFunction: (category: T, occ: Occupation, edu: EducationLevelType, skill: Skill) => void,
): void => {
    for (const occ of OCCUPATIONS) {
        forEachCohortByOccupation(cohort[occ], (category, edu, skill) => forEachFunction(category, occ, edu, skill));
    }
};

export const forEachPopulationCohort = (
    cohort: Cohort<PopulationCategory>,
    forEachFunction: (category: PopulationCategory, occ: Occupation, edu: EducationLevelType, skill: Skill) => void,
): void => forEachCohort(cohort, forEachFunction);

export const forEachWorkforceCohort = (
    cohort: CohortByOccupation<WorkforceCategory>,
    forEachFunction: (category: WorkforceCategory, edu: EducationLevelType, skill: Skill) => void,
): void => forEachCohortByOccupation(cohort, (category, edu, skill) => forEachFunction(category, edu, skill));

/**
 * Convert an annual probability to its per-tick equivalent so that
 * compounding over `TICKS_PER_YEAR` ticks yields the same annual rate.
 *
 *   1 - (1 - annualRate)^(1 / TICKS_PER_YEAR)
 */
export const convertAnnualToPerTick = (annualRate: number): number => {
    if (annualRate >= 1) {
        return 1;
    }
    return 1 - Math.pow(1 - annualRate, 1 / TICKS_PER_YEAR);
};
