import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import type { Planet } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import type { PopulationCategoryIndex } from '../population/population';
import { transferPopulation } from '../population/population';
import { distributeProportionally } from '../utils/distributeProportionally';

export const ONBOARDING_EFFICIENCY = 0.75;

export type WorkforceCategory = {
    active: number;
    onboarding: number[];
    voluntaryDeparting: number[];
    departingFired: number[];
    departingRetired: number[];
    workforceExperience: number;
};

export const totalDeparting = (category: WorkforceCategory): number =>
    category.voluntaryDeparting.reduce((sum, count) => sum + count, 0) +
    category.departingFired.reduce((sum, count) => sum + count, 0) +
    category.departingRetired.reduce((sum, count) => sum + count, 0);

export const nullWorkforceCategory = (): WorkforceCategory => ({
    active: 0,
    onboarding: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
    voluntaryDeparting: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
    departingFired: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
    departingRetired: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
    workforceExperience: 0,
});

export type WorkforceCohort<T> = {
    [L in EducationLevelType]: T;
};

export type WorkforceCategoryIndex = Omit<PopulationCategoryIndex, 'occ'>;

export type WorkforceDemography = WorkforceCohort<WorkforceCategory>[];

export type Workforce = {
    demography: WorkforceDemography;
    summedWorkforce: WorkforceCohort<WorkforceCategory>;
    count: number;
};

export const sumWorkForceCohort = (
    cohorts: WorkforceCohort<WorkforceCategory>[],
): WorkforceCohort<WorkforceCategory> => {
    const total = nullWorkforceCohort();
    for (const cohort of cohorts) {
        for (const l of educationLevelKeys) {
            total[l] = workForceSumFunction(total[l], cohort[l]);
        }
    }
    return total;
};

export const nullWorkforceCohortFactory = <T>(nullFactory: () => T): WorkforceCohort<T> => {
    const cohort = {} as WorkforceCohort<T>;
    for (const l of educationLevelKeys) {
        cohort[l] = nullFactory();
    }
    return cohort;
};

export const nullWorkforceCohort = (): WorkforceCohort<WorkforceCategory> =>
    nullWorkforceCohortFactory(nullWorkforceCategory);

export const workForceSumFunction = (a: WorkforceCategory, b: WorkforceCategory): WorkforceCategory => ({
    active: a.active + b.active,
    onboarding: a.onboarding.map((count, i) => count + (b.onboarding[i] ?? 0)),
    voluntaryDeparting: a.voluntaryDeparting.map((count, i) => count + (b.voluntaryDeparting[i] ?? 0)),
    departingFired: a.departingFired.map((count, i) => count + (b.departingFired[i] ?? 0)),
    departingRetired: a.departingRetired.map((count, i) => count + (b.departingRetired[i] ?? 0)),
    workforceExperience: a.workforceExperience + b.workforceExperience,
});

export const reduceWorkforceCohort = (cohort: WorkforceCohort<WorkforceCategory>): WorkforceCategory => {
    let total = nullWorkforceCategory();
    for (const l of educationLevelKeys) {
        total = workForceSumFunction(total, cohort[l]);
    }
    return total;
};

export const forEachWorkforceCohort = (
    cohort: WorkforceCohort<WorkforceCategory>,
    forEachFunction: (category: WorkforceCategory, edu: EducationLevelType) => void,
): void => {
    for (const l of educationLevelKeys) {
        forEachFunction(cohort[l], l);
    }
};

export function subtractProportionalXP(category: WorkforceCategory, n: number, totalWorkersBefore: number): void {
    if (totalWorkersBefore <= 0 || n <= 0) {
        return;
    }
    if (!Number.isFinite(category.workforceExperience)) {
        if (process.env.SIM_DEBUG === '1') {
            console.warn(
                `[subtractProportionalXP] workforceExperience is not finite (${category.workforceExperience}), resetting to 0`,
            );
        }
        category.workforceExperience = 0;
        return;
    }
    const fraction = Math.min(n / totalWorkersBefore, 1);
    category.workforceExperience -= fraction * category.workforceExperience;
}

export const totalOnboarding = (category: WorkforceCategory): number =>
    category.onboarding.reduce((sum, count) => sum + count, 0);

export const totalWorkersInCategory = (category: WorkforceCategory): number =>
    category.active + totalOnboarding(category) + totalDeparting(category);

export function hireFromPopulation(
    planet: Planet,
    edu: EducationLevelType,
    count: number,
): {
    count: number;
    hiredByAge: number[];
} {
    if (count <= 0) {
        return { count: 0, hiredByAge: [] };
    }

    const demography = planet.population.demography;

    type Bucket = { age: number; avail: number };
    const buckets: Bucket[] = [];
    let totalAvailable = 0;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        const avail = demography[age].unoccupied[edu].total;
        if (avail > 0) {
            buckets.push({ age, avail });
            totalAvailable += avail;
        }
    }

    const toHire = Math.min(count, totalAvailable);
    if (toHire <= 0) {
        return { count: 0, hiredByAge: [] };
    }

    const allocatedBuckets = distributeProportionally(
        toHire,
        buckets.map((b) => b.avail),
    );

    const hiredByAge: number[] = new Array(demography.length).fill(0);
    let hired = 0;

    for (let i = 0; i < buckets.length; i++) {
        const { age } = buckets[i];
        const actual = allocatedBuckets[i];
        if (actual > 0) {
            transferPopulation(planet, { age, occ: 'unoccupied', edu }, { age, occ: 'employed', edu }, actual);
            hiredByAge[age] += actual;
            hired += actual;
        }
    }
    return { count: hired, hiredByAge };
}

export const productivityFromXP = (xp: number): number => {
    const A = 1;
    const Y = 0.95;
    const T = 40;
    return A * (1 - Math.pow(1 - Y, xp / T)) + 1;
};
