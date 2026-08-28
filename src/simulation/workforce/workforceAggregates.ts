import type { Facility } from '../planet/facility';
import type { AgentPlanetAssets } from '../planet/planet';
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
    const allFacilities = allWorkforceFacilities(assets);
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

function allWorkforceFacilities(assets: AgentPlanetAssets): Facility[] {
    return [
        ...assets.productionFacilities,
        ...(assets.humanResourcesDepartment ? [assets.humanResourcesDepartment] : []),
        ...(assets.storageFacility.department ? [assets.storageFacility.department] : []),
        ...assets.shipConstructionFacilities,
    ];
}

export function sumSlotFillByEdu(assets: AgentPlanetAssets): Record<EducationLevelType, number> {
    const allFacilities = allWorkforceFacilities(assets);
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
