import { TICKS_PER_YEAR } from '../constants';
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

/** Skill-aware transfer cohort: age → edu → occ → skill. */
export type SkillTransferCohort = {
    [L in EducationLevelType]: { [O in Occupation]: { [S in Skill]: number } };
};
/** Skill-aware transfer matrix (one entry per age). */
export type SkillTransferMatrix = SkillTransferCohort[];

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
    wealth: GaussianMoments;
    foodStock: number;
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
    lastTransferMatrix?: PopulationTransferMatrix;
    /** Kernel-based transfers (all support ties: peer, vertical, etc.) — skill-aware. */
    lastVerticalTransferMatrix?: SkillTransferMatrix;
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

// What happens with ppl dying? currently we reduce the count.
// we need to subtract wealth and food stock from the category,
// maybe we allow to here to be undefined and then we just "destroy the count and wealth and so on
// "

export const transferPopulation = (
    demography: Cohort<PopulationCategory>[],
    from: CategoryIndex,
    to: CategoryIndex | undefined,
    count: number,
): number => {
    if (count <= 0) {
        return 0;
    }
    const fromCategory = demography[from.age][from.occ][from.edu][from.skill];
    const toCategory = to ? demography[to.age][to.occ][to.edu][to.skill] : undefined;

    const transferMaximum = Math.min(fromCategory.total, count);
    const originalTotal = fromCategory.total;

    fromCategory.total -= transferMaximum;
    if (toCategory) {
        toCategory.total += transferMaximum;
    }

    // Shift wealth and foodStock proportionally to the transfer count.
    // We use the original total (before decrement) so the proportional
    // split is correct even when transferring all population out.
    const fraction = originalTotal > 0 ? transferMaximum / originalTotal : 0;

    // Wealth: the transferred group carries the same mean & variance as
    // the source (it's a random sub-sample).  After removing them, the
    // remaining group also keeps the original moments (no information
    // about sub-group differences).
    const wealthTransfer: GaussianMoments = { mean: fromCategory.wealth.mean, variance: fromCategory.wealth.variance };
    // Source wealth moments stay unchanged (same distribution, fewer people).
    // Destination gets the transferred wealth merged in.
    if (toCategory) {
        toCategory.wealth = mergeGaussianMoments(
            toCategory.total - transferMaximum, // dst count before this transfer
            toCategory.wealth,
            transferMaximum,
            wealthTransfer,
        );
    }

    const foodStockTransfer = fromCategory.foodStock * fraction;
    fromCategory.foodStock -= foodStockTransfer;
    if (toCategory) {
        toCategory.foodStock += foodStockTransfer;
    }
    return transferMaximum;
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
