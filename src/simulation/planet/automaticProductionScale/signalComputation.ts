import { TICKS_PER_MONTH } from '../../constants';
import { queryStorageFacility } from '../facility';
import type { ProductionFacility } from '../facility';
import type { AgentPlanetAssets } from '../planet';
import { STORAGE_ERROR_ZOOM_MONTHS, STORAGE_TARGET_MONTHS } from './constants';
import { getStorageErrorZoomMonths, getStorageTargetMonths } from './runtimeConfig';

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
        const target = targetMonths * TICKS_PER_MONTH * facility.maxScale * output.quantity;
        const zoomMonths = getStorageErrorZoomMonths() ?? STORAGE_ERROR_ZOOM_MONTHS;
        const zoom = zoomMonths * TICKS_PER_MONTH * facility.maxScale * output.quantity;
        const error = (target - inventory) / Math.max(1e-9, zoom);
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

export function softClip(value: number): number {
    return Math.tanh(value);
}
