import { TICKS_PER_MONTH } from '../../constants';
import { queryStorageFacility } from '../facility';
import type { ProductionFacility } from '../facility';
import type { AgentPlanetAssets } from '../planet';
import { STORAGE_TARGET_MONTHS } from './constants';
import { getStorageTargetMonths, getStorageTargetScaleAnchored } from './runtimeConfig';

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
        const anchor = (getStorageTargetScaleAnchored() ?? false) ? facility.scale : facility.maxScale;
        const target = targetMonths * TICKS_PER_MONTH * anchor * output.quantity;
        const error = (target - inventory) / Math.max(1e-9, target);
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

/**
 * Soft counterpart of the hard `max(minScale, scale + delta)` clamp. Above the floor this is
 * the identity, so normal operation is unchanged. Below it, the excess is squashed through a
 * tanh instead of being discarded, which keeps the contracting direction responsive: a
 * stronger negative command still produces a lower scale all the way to zero, rather than
 * being clipped away at the boundary. That is what removes the sawtooth whose amplitude is
 * set by 1/MIN_SCALE_FRACTION.
 */
export function applySoftScaleFloor(scale: number, floor: number, range: number): number {
    if (scale >= floor) {
        return scale;
    }
    const excess = floor - scale;
    return floor - range * softClip(excess / range);
}
