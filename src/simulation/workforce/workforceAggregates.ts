import type { EducationLevelType } from '../population/education';
import type { WorkforceCohort, WorkforceCategory } from './workforce';

export function totalActiveForEdu(workforce: WorkforceCohort<WorkforceCategory>[], edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        total += workforce[age][edu].active;
    }
    return total;
}

export function totalDepartingForEdu(workforce: WorkforceCohort<WorkforceCategory>[], edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const d of workforce[age][edu].voluntaryDeparting) {
            total += d;
        }
        for (const d of workforce[age][edu].departingFired) {
            total += d;
        }
        for (const d of workforce[age][edu].departingRetired) {
            total += d;
        }
    }
    return total;
}

export function totalOnboardingForEdu(
    workforce: WorkforceCohort<WorkforceCategory>[],
    edu: EducationLevelType,
): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const d of workforce[age][edu].onboarding) {
            total += d;
        }
    }
    return total;
}
