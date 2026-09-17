import { HR_BUFFER_CAPACITY_MULTIPLIER, SS_RELAXATION_RATE } from '../constants';
import type { Storage } from '../planet/facility';
import { queryStorageFacility, removeFromStorageFacility } from '../planet/facility';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { humanResourcesServiceResourceType } from '../planet/services';
import { PRODUCED_HR_QUANTITY } from '../planet/specialFacilities';

export const computeMaxDailyHROutput = (hrFacilityScale: number): number => PRODUCED_HR_QUANTITY * hrFacilityScale;

export const computeBufferCapacity = (maxDailyHROutput: number): number =>
    maxDailyHROutput * HR_BUFFER_CAPACITY_MULTIPLIER;

/**
 * HR hardship is a state, mirroring `settleBuffer` on the storage side: excited only while the
 * buffer is short, and otherwise decaying by SS_RELAXATION_RATE. A single dry tick therefore costs
 * almost nothing, while a sustained shortfall still builds to full starvation. The multiplier is a
 * smooth knee over it rather than a piecewise map on an instantaneous ratio (which had a 0.06 cliff
 * at coverage 1 and dropped straight to 0.5 on any tick where nothing was delivered).
 */
export const relaxHrStarvation = (current: number, deficitRatio: number): number =>
    Math.max(0, Math.min(1, current + (deficitRatio - current) * (1 - SS_RELAXATION_RATE)));

export const computeProductivityMultiplier = (starvation: number): number =>
    1 - 0.5 * Math.pow(Math.max(0, Math.min(1, starvation)), 6);

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
        assets.hrProductivityMultiplier = computeProductivityMultiplier(1);
        return;
    }

    const producedHr = pullAllHrFromStorage(assets.storage);
    const demand = assets.usedWorkers;
    const maxDailyHROutput = computeMaxDailyHROutput(hrDepartment.maxScale);
    if (demand > maxDailyHROutput * 2.5) {
        console.warn(
            `HR Demand ${demand} exceeds max daily output ${maxDailyHROutput}, ratio ${demand / maxDailyHROutput}`,
        );
    }
    const pMax = computeBufferCapacity(maxDailyHROutput);

    let buffer = hrDepartment.hrBuffer + producedHr - demand;
    let starvation = hrDepartment.hrStarvation;
    if (buffer < 0) {
        starvation = relaxHrStarvation(starvation, Math.min(1, -buffer / Math.max(1, demand)));
        buffer = 0;
    } else {
        starvation *= SS_RELAXATION_RATE;
    }

    hrDepartment.hrBuffer = Math.max(0, Math.min(pMax, buffer));
    hrDepartment.hrStarvation = Math.max(0, Math.min(1, starvation));
    assets.hrProductivityMultiplier = computeProductivityMultiplier(hrDepartment.hrStarvation);
}

function pullAllHrFromStorage(storage: Storage): number {
    const available = queryStorageFacility(storage, humanResourcesServiceResourceType.name);
    if (available <= 0) {
        return 0;
    }
    const removed = removeFromStorageFacility(storage, humanResourcesServiceResourceType.name, available);
    return removed;
}
