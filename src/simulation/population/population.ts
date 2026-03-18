import { stochasticRound } from '../utils/stochasticRound';
import { type WorkforceCohort } from '../workforce/workforce';
import type { EducationLevelType } from './education';
import { educationLevelKeys } from './education';
import type { Planet } from '../planet/planet';
import { mergeWealthInto, destroyWealthOnDeath } from '../financial/wealthOps';

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

export const OCCUPATIONS = ['education', 'employed', 'unoccupied', 'unableToWork'] as const;
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

export type PopulationCategoryIndex = {
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
    /**
     * Per-resource household inventory (total for this category, not per capita).
     * Keyed by resource name, e.g. `inventory['Agricultural Product']`.
     * Previously the single field `foodStock` lived here directly.
     */
    inventory: { [resourceName: string]: number };
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
    inventory: {},
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
    // Zero-sum wealth transfer: householdDeposits unchanged.
    mergeWealthInto(dst, src, count);
    for (const [resourceName, totalStock] of Object.entries(src.inventory)) {
        const srcStockPer = src.total > 0 ? stochasticRound(totalStock / src.total) : 0;
        dst.inventory[resourceName] = (dst.inventory[resourceName] ?? 0) + srcStockPer * count;
    }

    dst.total += count;
}

export type TransferResult = {
    /** Number of people actually moved (capped at source total). */
    count: number;
    inheritedWealth: number;
};

export const transferPopulation = (
    planet: Planet,
    from: PopulationCategoryIndex,
    to: PopulationCategoryIndex | undefined,
    count: number,
): TransferResult => {
    const population = planet.population;
    if (count <= 0) {
        return { count: 0, inheritedWealth: 0 };
    }
    const fromCategory = population.demography[from.age][from.occ][from.edu][from.skill];
    const toCategory = to ? population.demography[to.age][to.occ][to.edu][to.skill] : undefined;

    const transferMaximum = Math.min(fromCategory.total, count);
    if (transferMaximum <= 0) {
        return { count: 0, inheritedWealth: 0 };
    }

    let inheritedWealth = 0;
    if (toCategory && to) {
        // Zero-sum wealth transfer between cells — householdDeposits unchanged.
        mergeWealthInto(toCategory, fromCategory, transferMaximum);
        // Transfer proportional inventory of all resources
        for (const [resourceName, totalStock] of Object.entries(fromCategory.inventory)) {
            const inventoryTransfer =
                fromCategory.total > 0 ? stochasticRound((transferMaximum * totalStock) / fromCategory.total) : 0;
            toCategory.inventory[resourceName] = (toCategory.inventory[resourceName] ?? 0) + inventoryTransfer;
            fromCategory.inventory[resourceName] = totalStock - inventoryTransfer;
        }

        toCategory.total += transferMaximum;
        fromCategory.total -= transferMaximum;

        if (fromCategory.total === 0) {
            fromCategory.starvationLevel = 0;
            fromCategory.inventory = {};
            fromCategory.wealth = { mean: 0, variance: 0 };
        }
        population.summedPopulation[from.occ][from.edu][from.skill].total -= transferMaximum;
        population.summedPopulation[to.occ][to.edu][to.skill].total += transferMaximum;
    } else {
        // Death: decrement source and remove the wealth from this category,
        // returning the positive wealth available for inheritance redistribution
        // (handling negative-wealth cases inside destroyWealthOnDeath).
        inheritedWealth = destroyWealthOnDeath(fromCategory, transferMaximum);
        fromCategory.total -= transferMaximum;
        population.summedPopulation[from.occ][from.edu][from.skill].total -= transferMaximum;
        // Food stock of the dead is taken by "neighbors"
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

export const populationSumFunction = (a: PopulationCategory, b: PopulationCategory): PopulationCategory => {
    // Merge inventory: sum all resource quantities from both categories
    const inventory: { [resourceName: string]: number } = { ...a.inventory };
    for (const [name, qty] of Object.entries(b.inventory)) {
        inventory[name] = (inventory[name] ?? 0) + qty;
    }
    return {
        total: a.total + b.total,
        wealth: mergeGaussianMoments(a.total, a.wealth, b.total, b.wealth),
        inventory,
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
    };
};

export const forEachPopulationCohort = (
    cohort: Cohort<PopulationCategory>,
    forEachFunction: (category: PopulationCategory, occ: Occupation, edu: EducationLevelType, skill: Skill) => void,
): void => {
    for (const occ of OCCUPATIONS) {
        forEachOccupiedPopulation(cohort[occ], (category, edu, skill) => forEachFunction(category, occ, edu, skill));
    }
};
