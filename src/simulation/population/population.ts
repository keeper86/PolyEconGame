import { stochasticRound } from '../utils/stochasticRound';
import { type WorkforceCohort } from '../workforce/workforce';
import type { EducationLevelType } from './education';
import { educationLevelKeys } from './education';

export { educationLevels } from './education';
export const forEachOccupiedPopulation = <T>(
    cohort: WorkforceCohort<T>,
    forEachFunction: (category: T, edu: EducationLevelType, skill: Skill) => void,
): void => {
    for (const l of educationLevelKeys) {
        for (const s of SKILL) {
            forEachFunction(cohort[l][s], l, s);
        }
    }
};

export type { EducationLevelType } from './education';

export const MAX_AGE: number = 100;

export const OCCUPATIONS = ['unoccupied', 'employed', 'education', 'unableToWork'] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

export const SKILL = ['novice', 'professional', 'expert'] as const;
export type Skill = (typeof SKILL)[number];

export const emptySkillCategory: { [S in Skill]: number } = {
    novice: 0,
    professional: 0,
    expert: 0,
};
export const emptySkillDemography: { [S in Skill]: number }[] = Array.from({ length: MAX_AGE + 1 }, () => ({
    ...emptySkillCategory,
}));

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

export type Cohort<T> = { [O in Occupation]: WorkforceCohort<T> };

export type Population = {
    demography: Cohort<PopulationCategory>[];
    summedPopulation: Cohort<PopulationCategory>;
    lastTransferMatrix: PopulationTransferMatrix;
};

// ---------------------------------------------------------------------------
// Population utilities
// ---------------------------------------------------------------------------
export const nullPopulationCategory = (): PopulationCategory => ({
    total: 0,
    wealth: { mean: 0, variance: 0 },
    foodStock: 0,
    starvationLevel: 0,
    deaths: { type: 'death', countThisTick: 0, countThisMonth: 0, countLastMonth: 0 },
    disabilities: { type: 'disability', countThisTick: 0, countThisMonth: 0, countLastMonth: 0 },
    retirements: { type: 'retirement', countThisTick: 0, countThisMonth: 0, countLastMonth: 0 },
});

export const createEmptyPopulationCohort = (overrides?: Partial<PopulationCategory>): Cohort<PopulationCategory> => {
    const cohort = {} as Cohort<PopulationCategory>;
    for (const o of OCCUPATIONS) {
        cohort[o] = {} as WorkforceCohort<PopulationCategory>;
        for (const l of educationLevelKeys) {
            cohort[o][l] = {} as Record<Skill, PopulationCategory>;
            for (const s of SKILL) {
                cohort[o][l][s] = { ...nullPopulationCategory(), ...overrides };
            }
        }
    }
    return cohort;
};

export const sumPopulationCohort = (cohorts: Cohort<PopulationCategory>[]): Cohort<PopulationCategory> => {
    const total = createEmptyPopulationCohort();
    for (const cohort of cohorts) {
        for (const o of OCCUPATIONS) {
            for (const l of educationLevelKeys) {
                for (const s of SKILL) {
                    total[o][l][s] = populationSumFunction(total[o][l][s], cohort[o][l][s]);
                }
            }
        }
    }
    return total;
};

export function mergePopulationCategory(dst: PopulationCategory, src: PopulationCategory, count: number): void {
    if (count <= 0) {
        return;
    }
    dst.wealth = mergeGaussianMoments(dst.total, dst.wealth, count, src.wealth);
    const srcFoodPer = src.total > 0 ? stochasticRound(src.foodStock / src.total) : 0;
    dst.foodStock += srcFoodPer * count;

    dst.total += count;
}

export type TransferResult = {
    /** Number of people actually moved (capped at source total). */
    count: number;
    inheritedWealth: number;
};

export const transferPopulation = (
    population: Population,
    from: CategoryIndex,
    to: CategoryIndex | undefined,
    count: number,
): TransferResult => {
    if (count <= 0) {
        return { count: 0, inheritedWealth: 0 };
    }
    const fromCategory = population.demography[from.age][from.occ][from.edu][from.skill];
    const toCategory = to ? population.demography[to.age][to.occ][to.edu][to.skill] : undefined;

    const transferMaximum = Math.min(fromCategory.total, count);
    if (transferMaximum <= 0) {
        return { count: 0, inheritedWealth: 0 };
    }
    const fraction = transferMaximum / fromCategory.total;

    let inheritedWealth = 0;
    if (toCategory && to) {
        toCategory.wealth = mergeGaussianMoments(
            toCategory.total,
            toCategory.wealth,
            transferMaximum,
            fromCategory.wealth,
        );
        const srcFoodPer = fromCategory.total > 0 ? stochasticRound(fromCategory.foodStock / fromCategory.total) : 0;
        toCategory.foodStock += srcFoodPer * transferMaximum;

        toCategory.total += transferMaximum;
        fromCategory.total -= transferMaximum;
        population.summedPopulation[from.occ][from.edu][from.skill].total -= transferMaximum;
        population.summedPopulation[to.occ][to.edu][to.skill].total += transferMaximum;

        const foodStockTransfer = fromCategory.foodStock * fraction;
        fromCategory.foodStock -= foodStockTransfer;
    } else {
        // Death: decrement source and orphan the wealth for inheritance.
        fromCategory.total -= transferMaximum;
        population.summedPopulation[from.occ][from.edu][from.skill].total -= transferMaximum;

        inheritedWealth = transferMaximum * Math.max(0, fromCategory.wealth.mean);
        // Food stock of the dead is destroyed (perishable).
        fromCategory.foodStock -= fromCategory.foodStock * fraction;
    }

    return { count: transferMaximum, inheritedWealth };
};

export const reducePopulationCohort = (cohort: Cohort<PopulationCategory>): PopulationCategory => {
    let total = nullPopulationCategory();
    for (const o of OCCUPATIONS) {
        for (const l of educationLevelKeys) {
            for (const s of SKILL) {
                total = populationSumFunction(total, cohort[o][l][s]);
            }
        }
    }
    return total;
};

export const populationSumFunction = (a: PopulationCategory, b: PopulationCategory): PopulationCategory => ({
    total: a.total + b.total,
    wealth: mergeGaussianMoments(a.total, a.wealth, b.total, b.wealth),
    foodStock: a.foodStock + b.foodStock,
    starvationLevel: Math.min(1, (a.total * a.starvationLevel + b.total * b.starvationLevel) / (a.total + b.total)),
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
});

export const forEachPopulationCohort = (
    cohort: Cohort<PopulationCategory>,
    forEachFunction: (category: PopulationCategory, occ: Occupation, edu: EducationLevelType, skill: Skill) => void,
): void => {
    for (const occ of OCCUPATIONS) {
        forEachOccupiedPopulation(cohort[occ], (category, edu, skill) => forEachFunction(category, occ, edu, skill));
    }
};

export const forEachPopulationCohortWithOccupation = (
    cohort: Cohort<PopulationCategory>,
    forEachFunction: (category: PopulationCategory, occ: Occupation, edu: EducationLevelType, skill: Skill) => void,
): void => {
    for (const occ of OCCUPATIONS) {
        forEachOccupiedPopulation(cohort[occ], (category, edu, skill) => forEachFunction(category, occ, edu, skill));
    }
};
