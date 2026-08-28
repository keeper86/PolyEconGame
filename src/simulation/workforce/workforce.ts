import { NOTICE_PERIOD_MONTHS } from '../constants';
import { educationLevelKeys, type EducationLevelType } from '../population/education';

export const ONBOARDING_EFFICIENCY = 0.75;

export type WorkforceCategory = {
    active: number;
    onboarding: number[];
    voluntaryDeparting: number[];
    departingFired: number[];
    departingRetired: number[];
    workforceExperience: number;
};

const totalDeparting = (category: WorkforceCategory): number =>
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

export type WorkforceDemography = WorkforceCohort<WorkforceCategory>[];

export const nullWorkforceCohortFactory = <T>(nullFactory: () => T): WorkforceCohort<T> => {
    const cohort = {} as WorkforceCohort<T>;
    for (const l of educationLevelKeys) {
        cohort[l] = nullFactory();
    }
    return cohort;
};

export const nullWorkforceCohort = (): WorkforceCohort<WorkforceCategory> =>
    nullWorkforceCohortFactory(nullWorkforceCategory);

const workForceSumFunction = (a: WorkforceCategory, b: WorkforceCategory): WorkforceCategory => ({
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

const totalOnboarding = (category: WorkforceCategory): number =>
    category.onboarding.reduce((sum, count) => sum + count, 0);

export const totalWorkersInCategory = (category: WorkforceCategory): number =>
    category.active + totalOnboarding(category) + totalDeparting(category);

export const productivityFromXP = (xp: number): number => {
    const A = 1;
    const Y = 0.95;
    const T = 40;
    return A * (1 - Math.pow(1 - Y, xp / T)) + 1;
};
