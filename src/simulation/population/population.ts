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

export type ServiceState = {
    buffer: number;
    starvationLevel: number;
};

export type PopulationCategory = {
    total: number;
    // Gaussian moments of per-capita monetary wealth for this category
    wealth: GaussianMoments;

    services: {
        grocery: ServiceState;
        retail: ServiceState;
        logistics: ServiceState;
        healthcare: ServiceState;
        construction: ServiceState;
        administrative: ServiceState;
        education: ServiceState;
    };

    deaths: DeathStats;
    disabilities: DisabilityStats;
    retirements: RetirementStats;
};

export type ServiceName = keyof PopulationCategory['services'];

export type Cohort<T> = { [O in Occupation]: WorkforceCohort<T> };

export type Population = {
    demography: Cohort<PopulationCategory>[];
    summedPopulation: Cohort<PopulationCategory>;
    lastTransferMatrix: PopulationTransferMatrix;
    /** Total units consumed by the population per resource this tick (resource name → units). */
    lastConsumption: { [resourceName: string]: number };
};

// ---------------------------------------------------------------------------
// Population utilities
// ---------------------------------------------------------------------------
export const nullServicesState = () => ({
    grocery: { buffer: 0, starvationLevel: 0 },
    retail: { buffer: 0, starvationLevel: 0 },
    logistics: { buffer: 0, starvationLevel: 0 },
    healthcare: { buffer: 0, starvationLevel: 0 },
    construction: { buffer: 0, starvationLevel: 0 },
    administrative: { buffer: 0, starvationLevel: 0 },
    education: { buffer: 0, starvationLevel: 0 },
});
export const nullPopulationCategory = (): PopulationCategory => ({
    total: 0,
    wealth: { mean: 0, variance: 0 },
    services: nullServicesState(),
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

export function forEachServiceState(
    category: PopulationCategory,
    forEachFunction: (serviceName: ServiceName, state: ServiceState) => void,
): void {
    for (const [serviceName, state] of Object.entries(category.services)) {
        forEachFunction(serviceName as ServiceName, state);
    }
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

        // Transfer proportional service buffers.
        // `buffer` is "coverage ticks for the group" — a per-capita-equivalent metric
        // (analogous to wealth.mean).  Physical food per person is buffer × rate, so
        // when transferring people, the FROM group's coverage is unchanged and the TO
        // group receives a weighted average of its own buffer and the FROM buffer.
        const toCurrentTotal = toCategory.total;
        const toNewTotal = toCurrentTotal + transferMaximum;
        for (const serviceName of Object.keys(fromCategory.services) as ServiceName[]) {
            const fromService = fromCategory.services[serviceName];
            const toService = toCategory.services[serviceName];

            // Weighted average: each arriving person carries fromService.buffer ticks.
            toCategory.services[serviceName] = {
                buffer:
                    toNewTotal > 0
                        ? (toService.buffer * toCurrentTotal + fromService.buffer * transferMaximum) / toNewTotal
                        : fromService.buffer,
                starvationLevel: toService.starvationLevel,
            };
            // FROM buffer is unchanged — conservation holds because food per-capita
            // is preserved on both sides.
        }

        toCategory.total += transferMaximum;
        fromCategory.total -= transferMaximum;

        if (fromCategory.total === 0) {
            // Reset all service states when category becomes empty
            for (const serviceName of Object.keys(fromCategory.services) as ServiceName[]) {
                fromCategory.services[serviceName] = {
                    buffer: 0,
                    starvationLevel: 0,
                };
            }
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
        // Service buffers of the dead are lost (not transferred to neighbors)
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
    // Merge services: sum buffers and compute weighted average of starvation levels
    const services = { ...a.services };

    for (const serviceName of Object.keys(services) as ServiceName[]) {
        const serviceA = a.services[serviceName];
        const serviceB = b.services[serviceName];
        const totalPeople = a.total + b.total;

        if (totalPeople > 0) {
            // `buffer` is per-capita coverage ticks — use a population-weighted average.
            const weightedBuffer = (serviceA.buffer * a.total + serviceB.buffer * b.total) / totalPeople;

            // Weighted average of starvation levels
            const weightedStarvation =
                (a.total * serviceA.starvationLevel + b.total * serviceB.starvationLevel) / totalPeople;

            services[serviceName] = {
                buffer: weightedBuffer,
                starvationLevel: Math.min(1, weightedStarvation),
            };
        } else {
            services[serviceName] = {
                buffer: 0,
                starvationLevel: 0,
            };
        }
    }

    return {
        total: a.total + b.total,
        wealth: mergeGaussianMoments(a.total, a.wealth, b.total, b.wealth),
        services,
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
