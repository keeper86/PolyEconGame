import { STORAGE_BUFFER_CAPACITY_MULTIPLIER } from '../../constants';
import type { StorageDepartment } from '../facility';
import { PRODUCED_STORAGE_QUANTITY } from '../specialFacilities';
import type { AgentPlanetAssets, Planet } from '../planet';
import { DYNAMIC_EXPANSION_CAP_FRACTION, MAX_SCALE_EXPAND_FRACTION } from './constants';
import { findMaxAffordableScale, findMaxScaleForCSBudget } from './expansionTarget';

export const STORAGE_TARGET_FILL_RATE = 0.85;

let storageExpansionProfitBypass = false;

export function setStorageExpansionProfitBypass(enabled: boolean): void {
    storageExpansionProfitBypass = enabled;
}

export function computeStorageSignal(storageDepartment: StorageDepartment): number {
    const maxBuffer = storageDepartment.scale * PRODUCED_STORAGE_QUANTITY * STORAGE_BUFFER_CAPACITY_MULTIPLIER;
    const fillRate = maxBuffer > 0 ? storageDepartment.storageBuffer / maxBuffer : 0;
    return Math.max(-1, Math.min(1, (STORAGE_TARGET_FILL_RATE - fillRate) / STORAGE_TARGET_FILL_RATE));
}

export function computeStorageExpansionTarget(
    storageDepartment: StorageDepartment,
    assets: AgentPlanetAssets,
    planet: Planet,
    hasOwnConstruction: boolean,
    constructionBudget: number,
): number {
    const currentMax = storageDepartment.maxScale;
    const maxBuffer = currentMax * PRODUCED_STORAGE_QUANTITY * STORAGE_BUFFER_CAPACITY_MULTIPLIER;
    const currentBuffer = storageDepartment.storageBuffer;
    const fillRate = maxBuffer > 0 ? currentBuffer / maxBuffer : 1;

    if (fillRate >= STORAGE_TARGET_FILL_RATE) {
        return Math.max(Math.ceil(currentMax * (1 + MAX_SCALE_EXPAND_FRACTION)), currentMax + 1);
    }

    const bufferDeficit = Math.max(0, maxBuffer * STORAGE_TARGET_FILL_RATE - currentBuffer);
    const scalePerBufferUnit = 1 / (PRODUCED_STORAGE_QUANTITY * STORAGE_BUFFER_CAPACITY_MULTIPLIER);
    const additionalScale = Math.ceil(bufferDeficit * scalePerBufferUnit);
    const desiredTarget = currentMax + Math.max(1, additionalScale);

    const absoluteCap = currentMax + Math.max(1, Math.ceil(currentMax * DYNAMIC_EXPANSION_CAP_FRACTION));
    let targetMax = Math.min(desiredTarget, absoluteCap);

    if (!hasOwnConstruction) {
        if (!storageExpansionProfitBypass) {
            targetMax = findMaxAffordableScale(storageDepartment, assets, planet, currentMax, targetMax);
        }
        targetMax = findMaxScaleForCSBudget(storageDepartment, currentMax, targetMax, constructionBudget);
    }

    return targetMax;
}
