import { HR_BUFFER_CAPACITY_MULTIPLIER } from '../constants';
import type { StorageFacility } from '../planet/facility';
import { queryStorageFacility, removeFromStorageFacility } from '../planet/facility';
import type { AgentPlanetAssets, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { humanResourcesServiceResourceType } from '../planet/services';
import { ESTIMATED_HR_OVERHEAD, PRODUCED_QUANTITY } from '../planet/specialFacilities';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import type { WorkforceCohort, WorkforceCategory } from './workforce';
import { totalOnboarding, totalDeparting } from './workforce';

export const computeMaxDailyHROutput = (hrFacilityScale: number): number => PRODUCED_QUANTITY * hrFacilityScale;

// TODO: this should be somewhere already, dont re-caclulate
export const computeHrDemand = (workforce: WorkforceCohort<WorkforceCategory>[]): number => {
    let demand = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const edu of educationLevelKeys) {
            for (const skill of SKILL) {
                const category = workforce[age][edu][skill];
                demand += category.active + totalOnboarding(category) + totalDeparting(category);
            }
        }
    }
    return demand;
};

export const computeBufferCapacity = (maxDailyHROutput: number): number =>
    maxDailyHROutput * HR_BUFFER_CAPACITY_MULTIPLIER;

export const updateHrBuffer = (currentBuffer: number, producedHr: number, demand: number, pMax: number): number => {
    const updated = currentBuffer + producedHr - demand;
    return Math.min(pMax, Math.max(0, updated));
};

export const computeCoverageRatio = (buffer: number, demand: number): number => {
    if (demand <= 0) {
        return 1.0;
    }
    return buffer / demand;
};

export const computeProductivityMultiplier = (coverage: number): number => {
    if (coverage >= 1.0) {
        return 1.0;
    }
    if (coverage >= 0.3) {
        return 0.8 + 0.2 * coverage;
    }
    return 0.5 + 1.0 * coverage * coverage;
};

export type HrBufferStatus = 'optimal' | 'stable' | 'strained' | 'critical';

export const hrBufferStatus = (buffer: number, demand: number): HrBufferStatus => {
    const d = demand > 0 ? buffer / demand : Number.POSITIVE_INFINITY;
    if (d >= 2.5) {
        return 'optimal';
    }
    if (d >= 1.0) {
        return 'stable';
    }
    if (d >= 0.3) {
        return 'strained';
    }
    return 'critical';
};

export function hrBufferTick(agents: Map<string, import('../planet/planet').Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets || !hasActiveLicense(assets, 'workforce')) {
            continue;
        }
        processHrBufferForAssets(assets);
    }
}

export function processHrBufferForAssets(assets: AgentPlanetAssets): void {
    const hrDepartment = assets.humanResourcesDepartment;
    if (!hrDepartment) {
        assets.hrBuffer = 0;
        assets.hrProductivityMultiplier = 1;
        assets.hrDemand = 0;
        return;
    }

    const producedHr = pullAllHrFromStorage(assets.storageFacility);
    const demand = computeHrDemand(assets.workforceDemography);
    const maxDailyHROutput = computeMaxDailyHROutput(hrDepartment.maxScale);
    if (demand > maxDailyHROutput) {
        console.warn(
            `Demand ${demand} exceeds max daily output ${maxDailyHROutput}, ratio ${demand / maxDailyHROutput}`,
        );
    }
    const pMax = computeBufferCapacity(maxDailyHROutput);
    const newBuffer = updateHrBuffer(assets.hrBuffer, producedHr, demand, pMax);
    assets.hrDemand = demand;

    assets.hrProductivityMultiplier = computeProductivityMultiplier(computeCoverageRatio(assets.hrBuffer, demand));
    assets.hrBuffer = newBuffer;
}

function pullAllHrFromStorage(storage: StorageFacility): number {
    const available = queryStorageFacility(storage, humanResourcesServiceResourceType.name);
    if (available <= 0) {
        return 0;
    }
    const removed = removeFromStorageFacility(storage, humanResourcesServiceResourceType.name, available);
    return removed;
}
