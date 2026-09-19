import { TICKS_PER_MONTH } from '../../constants';
import { getStorageCapacityState, queryStorageFacility } from '../facility';
import type { ProductionFacility } from '../facility';
import type { AgentPlanetAssets } from '../planet';
import { getAllFacilities } from '../planet';
import { STORAGE_ERROR_ZOOM_MONTHS, STORAGE_TARGET_MONTHS, STORAGE_TREND_HORIZON_MONTHS } from './constants';
import { getStorageErrorZoomMonths, getStorageTargetMonths, getStorageTrendHorizonMonths } from './runtimeConfig';

export type FacilityStorageSignal = {
    maxError: number;
    minError: number;
};

export function computeFacilityStorageSignal(
    facility: ProductionFacility,
    assets: AgentPlanetAssets,
): FacilityStorageSignal {
    let maxError = Number.NEGATIVE_INFINITY;
    let minError = Number.POSITIVE_INFINITY;

    for (const output of facility.produces) {
        const inventory = queryStorageFacility(assets.storage, output.resource.name, false);
        const targetMonths = getStorageTargetMonths() ?? STORAGE_TARGET_MONTHS;
        const monthlyProduction = TICKS_PER_MONTH * facility.maxScale * output.quantity;
        const reachable = reachableTargetQuantity(assets.storage, output.resource, monthlyProduction);
        const target = Math.min(targetMonths * monthlyProduction, reachable);
        const zoomMonths = getStorageErrorZoomMonths() ?? STORAGE_ERROR_ZOOM_MONTHS;
        const zoom = zoomMonths * TICKS_PER_MONTH * facility.maxScale * output.quantity;
        const horizon = (getStorageTrendHorizonMonths() ?? STORAGE_TREND_HORIZON_MONTHS) * TICKS_PER_MONTH;
        const predicted = inventory + horizon * inventoryTrend(assets, output.resource.name);
        const error = (target - predicted) / Math.max(1e-9, zoom);
        maxError = Math.max(maxError, error);
        minError = Math.min(minError, error);
    }

    if (maxError === Number.NEGATIVE_INFINITY) {
        return { maxError: 0, minError: 0 };
    }

    return {
        maxError: softClip(maxError),
        minError: softClip(minError),
    };
}

export function inventoryTrend(assets: AgentPlanetAssets, resourceName: string): number {
    const offer = assets.market.sell[resourceName];
    const taken = offer?.smoothedSold ?? offer?.lastSold ?? 0;
    const depreciated = assets.lastDepreciatedPerTick[resourceName] ?? 0;
    let trend = -taken - depreciated;

    for (const facility of getAllFacilities(assets)) {
        trend -= facility.lastTickResults.lastConsumed[resourceName] ?? 0;
        if (facility.type !== 'ship_construction') {
            trend += facility.lastTickResults.lastProduced[resourceName] ?? 0;
        }
    }

    return trend;
}

export function reachableTargetQuantity(
    storage: AgentPlanetAssets['storage'],
    resource: ProductionFacility['produces'][number]['resource'],
    monthlyProduction: number,
): number {
    const capacity = getStorageCapacityState(storage, resource).capacity;
    const byVolume =
        resource.volumePerQuantity > 0 ? capacity.volume / resource.volumePerQuantity : Number.POSITIVE_INFINITY;
    const byMass = resource.massPerQuantity > 0 ? capacity.mass / resource.massPerQuantity : Number.POSITIVE_INFINITY;
    return Math.max(0, Math.min(byVolume, byMass) - monthlyProduction);
}

export function softClip(value: number): number {
    return Math.tanh(value);
}
