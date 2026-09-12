import type { AgentPlanetAssets } from '../planet/planet';
import { getAllFacilities } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
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

export function sumTotalUsedByEdu(assets: AgentPlanetAssets): Record<EducationLevelType, number> {
    const allFacilities = getAllFacilities(assets);
    const totalUsed: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (const facility of allFacilities) {
        const tick = facility.lastTickResults;
        if (!tick) {
            continue;
        }
        for (const edu of educationLevelKeys) {
            totalUsed[edu] += tick.totalUsedByEdu[edu] ?? 0;
        }
    }
    return totalUsed;
}

export function sumSlotFillByEdu(assets: AgentPlanetAssets): Record<EducationLevelType, number> {
    const allFacilities = getAllFacilities(assets, true);
    const slotFill: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (const facility of allFacilities) {
        const tick = facility.lastTickResults;
        if (!tick) {
            continue;
        }
        for (const jobEdu of educationLevelKeys) {
            const exact = tick.exactUsedByEdu?.[jobEdu] ?? 0;
            const overqualified = tick.overqualifiedWorkers?.[jobEdu];
            let filled = exact;
            if (overqualified) {
                for (const count of Object.values(overqualified)) {
                    filled += count ?? 0;
                }
            }
            slotFill[jobEdu] += filled;
        }
    }
    return slotFill;
}
