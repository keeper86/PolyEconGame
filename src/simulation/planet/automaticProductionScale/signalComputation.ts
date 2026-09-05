import { TICKS_PER_MONTH } from '../../constants';
import type { ProductionFacility } from '../facility';
import type { AgentPlanetAssets } from '../planet';
import { STORAGE_TARGET_MONTHS } from './constants';
import { getStorageTargetMonths } from './runtimeConfig';

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
        const inventory = assets.storageFacility?.currentInStorage[output.resource.name]?.quantity ?? 0;
        const targetMonths = getStorageTargetMonths() ?? STORAGE_TARGET_MONTHS;
        const target = targetMonths * TICKS_PER_MONTH * facility.maxScale * output.quantity;
        const error = (target - inventory) / Math.max(1e-9, target);
        maxError = Math.max(maxError, error);
        minError = Math.min(minError, error);
    }

    if (maxError === Number.NEGATIVE_INFINITY) {
        return { maxError: 0, minError: 0 };
    }

    return {
        maxError: Math.max(-1, Math.min(1, maxError)),
        minError: Math.max(-1, Math.min(1, minError)),
    };
}
