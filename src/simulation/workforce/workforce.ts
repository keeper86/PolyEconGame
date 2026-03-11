import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import type { Planet } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import {
    emptySkillCategory,
    emptySkillDemography,
    SKILL,
    transferPopulation,
    type Skill,
} from '../population/population';
import { distributeProportionally } from '../utils/distributeProportionally';

export type WorkforceCategory = {
    active: number;
    departing: number[];
    departingFired: number[];
};

export const nullWorkforceCategory = (): WorkforceCategory => ({
    active: 0,
    departing: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
    departingFired: Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0),
});

export type WorkforceCohort<T> = {
    [L in EducationLevelType]: {
        [S in Skill]: T;
    };
};

export type WorkforceDemography = WorkforceCohort<WorkforceCategory>[];

export type Workforce = {
    demography: WorkforceDemography[];
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

export const nullWorkforceCohort = (): WorkforceCohort<WorkforceCategory> => {
    const cohort = {} as WorkforceCohort<WorkforceCategory>;
    for (const l of educationLevelKeys) {
        cohort[l] = {} as Record<Skill, WorkforceCategory>;
        for (const s of SKILL) {
            cohort[l][s] = nullWorkforceCategory();
        }
    }
    return cohort;
};

export const workForceSumFunction = (a: WorkforceCategory, b: WorkforceCategory): WorkforceCategory => ({
    active: a.active + b.active,
    departing: a.departing.map((count, i) => count + (b.departing[i] ?? 0)),
    departingFired: a.departingFired.map((count, i) => count + (b.departingFired[i] ?? 0)),
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

    // Apply moves and collect per-age hire counts
    const hiredByAge: {
        [S in Skill]: number;
    }[] = new Array(demography.length).fill(0).map(() => ({
        ...emptySkillCategory,
    }));
    let hired = 0;

    for (let i = 0; i < buckets.length; i++) {
        const { age, skill } = buckets[i];
        const actual = allocatedBuckets[i];
        if (actual > 0) {
            transferPopulation(
                planet.population,
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
