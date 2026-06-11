import type { EducationLevelType } from '../population/education';
import type { WorkforceCohort, WorkforceCategory } from './workforce';
import { SKILL, type Skill } from '../population/population';

export function totalWorkingForEdu(workforce: WorkforceCohort<WorkforceCategory>[], edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            total += workforce[age][edu][skill].active;
            for (const d of workforce[age][edu][skill].onboarding) {
                total += d;
            }
        }
    }
    return total;
}

export function totalActiveForEduSkill(
    workforce: WorkforceCohort<WorkforceCategory>[],
    edu: EducationLevelType,
    skill: Skill,
): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        total += workforce[age][edu][skill].active;
    }
    return total;
}

export function totalDepartingForEdu(workforce: WorkforceCohort<WorkforceCategory>[], edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            for (const d of workforce[age][edu][skill].voluntaryDeparting) {
                total += d;
            }
            for (const d of workforce[age][edu][skill].departingFired) {
                total += d;
            }
            for (const d of workforce[age][edu][skill].departingRetired) {
                total += d;
            }
        }
    }
    return total;
}

export function totalOnboardingForEduSkill(
    workforce: WorkforceCohort<WorkforceCategory>[],
    edu: EducationLevelType,
    skill: Skill,
): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const d of workforce[age][edu][skill].onboarding) {
            total += d;
        }
    }
    return total;
}

export function totalDepartingForEduSkill(
    workforce: WorkforceCohort<WorkforceCategory>[],
    edu: EducationLevelType,
    skill: Skill,
): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const d of workforce[age][edu][skill].voluntaryDeparting) {
            total += d;
        }
        for (const d of workforce[age][edu][skill].departingFired) {
            total += d;
        }
        for (const d of workforce[age][edu][skill].departingRetired) {
            total += d;
        }
    }
    return total;
}
