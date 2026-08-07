import { HR_BUFFER_CAPACITY_MULTIPLIER } from '../constants';
import type { StorageFacility } from '../planet/facility';
import { queryStorageFacility, removeFromStorageFacility } from '../planet/facility';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { humanResourcesServiceResourceType } from '../planet/services';
import { PRODUCED_QUANTITY } from '../planet/specialFacilities';

export const computeMaxDailyHROutput = (hrFacilityScale: number): number => PRODUCED_QUANTITY * hrFacilityScale;

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

export function hrBufferTick(agents: Map<string, Agent>, planet: Planet): void {
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
        const demand = assets.usedWorkers;
        assets.hrProductivityMultiplier = computeProductivityMultiplier(computeCoverageRatio(0, demand));
        return;
    }

    const producedHr = pullAllHrFromStorage(assets.storageFacility);
    const demand = assets.usedWorkers;
    const maxDailyHROutput = computeMaxDailyHROutput(hrDepartment.maxScale);
    if (demand > maxDailyHROutput) {
        console.warn(
            `Demand ${demand} exceeds max daily output ${maxDailyHROutput}, ratio ${demand / maxDailyHROutput}`,
        );
    }
    const pMax = computeBufferCapacity(maxDailyHROutput);
    const consumed = Math.min(hrDepartment.hrBuffer + producedHr, demand);
    hrDepartment.hrBuffer = updateHrBuffer(hrDepartment.hrBuffer, producedHr, demand, pMax);

    assets.hrProductivityMultiplier = computeProductivityMultiplier(computeCoverageRatio(consumed, demand));
    hrDepartment.hrBuffer = updateHrBuffer(hrDepartment.hrBuffer, 0, demand, pMax);
}

function pullAllHrFromStorage(storage: StorageFacility): number {
    const available = queryStorageFacility(storage, humanResourcesServiceResourceType.name);
    if (available <= 0) {
        return 0;
    }
    const removed = removeFromStorageFacility(storage, humanResourcesServiceResourceType.name, available);
    return removed;
}
