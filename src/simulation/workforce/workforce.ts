import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import type { Planet } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import type { PopulationCategoryIndex } from '../population/population';
import { SKILL, transferPopulation, type Skill } from '../population/population';
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
    [L in EducationLevelType]: {
        [S in Skill]: T;
    };
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
            for (const s of SKILL) {
                total[l][s] = workForceSumFunction(total[l][s], cohort[l][s]);
            }
        }
    }
    return total;
};

export const nullWorkforceCohortFactory = <T>(nullFactory: () => T): WorkforceCohort<T> => {
    const cohort = {} as WorkforceCohort<T>;
    for (const l of educationLevelKeys) {
        cohort[l] = {} as Record<Skill, T>;
        for (const s of SKILL) {
            cohort[l][s] = nullFactory();
        }
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
        for (const s of SKILL) {
            total = workForceSumFunction(total, cohort[l][s]);
        }
    }
    return total;
};

export const forEachWorkforceCohort = (
    cohort: WorkforceCohort<WorkforceCategory>,
    forEachFunction: (category: WorkforceCategory, edu: EducationLevelType, skill: Skill) => void,
): void => {
    for (const l of educationLevelKeys) {
        for (const s of SKILL) {
            forEachFunction(cohort[l][s], l, s);
        }
    }
};

export const XP_TO_PROFESSIONAL_THRESHOLD = 5;
// returns true if worker should gain skill === professional
export function subtractProportionalXP(category: WorkforceCategory, n: number, totalWorkersBefore: number): boolean {
    if (totalWorkersBefore <= 0 || n <= 0) {
        return false;
    }
    if (!Number.isFinite(category.workforceExperience)) {
        if (process.env.SIM_DEBUG === '1') {
            console.warn(
                `[subtractProportionalXP] workforceExperience is not finite (${category.workforceExperience}), resetting to 0`,
            );
        }
        category.workforceExperience = 0;
        return false;
    }
    const fraction = Math.min(n / totalWorkersBefore, 1);
    category.workforceExperience -= fraction * category.workforceExperience;
    console.log(category.workforceExperience);

    return category.workforceExperience > XP_TO_PROFESSIONAL_THRESHOLD;
}

export const totalOnboarding = (category: WorkforceCategory): number =>
    category.onboarding.reduce((sum, count) => sum + count, 0);

export const totalWorkersInCategory = (category: WorkforceCategory): number =>
    category.active + totalOnboarding(category) + totalDeparting(category);

const emptySkillCategory = (): Record<Skill, number> => ({
    novice: 0,
    professional: 0,
    expert: 0,
});

const emptySkillDemography: Record<Skill, number>[] = [];

export function hireFromPopulation(
    planet: Planet,
    edu: EducationLevelType,
    count: number,
): {
    count: number;
    hiredByAge: {
        [S in Skill]: number;
    }[];
} {
    if (count <= 0) {
        return { count: 0, hiredByAge: emptySkillDemography };
    }

    const demography = planet.population.demography;

    type Bucket = { age: number; skill: Skill; avail: number };
    const buckets: Bucket[] = [];
    let totalAvailable = 0;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        for (const skill of SKILL) {
            const avail = demography[age].unoccupied[edu][skill].total;
            if (avail > 0) {
                buckets.push({ age, skill, avail });
                totalAvailable += avail;
            }
        }
    }

    const toHire = Math.min(count, totalAvailable);
    if (toHire <= 0) {
        return { count: 0, hiredByAge: emptySkillDemography };
    }

    const allocatedBuckets = distributeProportionally(
        toHire,
        buckets.map((b) => b.avail),
    );

    const hiredByAge: {
        [S in Skill]: number;
    }[] = new Array(demography.length).fill(0).map(() => ({
        ...emptySkillCategory(),
    }));
    let hired = 0;

    for (let i = 0; i < buckets.length; i++) {
        const { age, skill } = buckets[i];
        const actual = allocatedBuckets[i];
        if (actual > 0) {
            transferPopulation(
                planet,
                { age, occ: 'unoccupied', edu, skill },
                { age, occ: 'employed', edu, skill },
                actual,
            );
            hiredByAge[age][skill] += actual;
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
