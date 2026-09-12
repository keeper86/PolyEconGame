import { TICKS_PER_MONTH } from '../../constants';
import type { ResourceQuantity } from '../claims';
import type { Facility, FacilityBase, ManagementFacility, ProductionFacility } from '../facility';
import { calculateCostsForConstruction, getFacilityType, queryStorageFacility } from '../facility';
import type { AgentPlanetAssets, Planet } from '../planet';
import { DYNAMIC_EXPANSION_CAP_FRACTION, MAX_SCALE_EXPAND_FRACTION, STORAGE_TARGET_MONTHS } from './constants';
import { getStorageTargetMonths } from './runtimeConfig';
import { checkExpansionFunds } from './expansionUtils';

export function calculateExpansionParams(facility: FacilityBase): { targetMax: number; cost: number; time: number } {
    const currentMax = facility.maxScale;
    const targetMax = Math.max(Math.ceil(currentMax * (1 + MAX_SCALE_EXPAND_FRACTION)), currentMax + 1);
    const facilityType = getFacilityType(facility as Facility);
    const { cost, time } = calculateCostsForConstruction(facilityType, currentMax, targetMax);
    return { targetMax, cost, time };
}

export function findMaxAffordableScale(
    facility: ManagementFacility | ProductionFacility,
    assets: AgentPlanetAssets,
    planet: Planet,
    currentMax: number,
    maxDesiredScale: number,
): number {
    if (maxDesiredScale <= currentMax) {
        return currentMax;
    }
    const facilityType = getFacilityType(facility);
    let low = currentMax + 1;
    let high = maxDesiredScale;
    let best = currentMax;

    while (low <= high) {
        const candidateMax = Math.floor((low + high) / 2);
        const { cost, time } = calculateCostsForConstruction(facilityType, currentMax, candidateMax);
        const { hasSufficientFunds } = checkExpansionFunds(facility, assets, planet, cost, time);
        if (hasSufficientFunds) {
            best = candidateMax;
            low = candidateMax + 1;
        } else {
            high = candidateMax - 1;
        }
    }
    return best;
}

// TODO: choose a better scale cost function that is easily invertible
export function findMaxScaleForCSBudget(
    facility: FacilityBase,
    currentMax: number,
    maxDesiredScale: number,
    availableCSBudget: number,
): number {
    if (maxDesiredScale <= currentMax || availableCSBudget <= 0) {
        return currentMax;
    }
    const facilityType = getFacilityType(facility as Facility);
    let low = currentMax + 1;
    let high = maxDesiredScale;
    let best = currentMax;

    const getCsPerTick = (scale: number) => {
        const { cost, time } = calculateCostsForConstruction(facilityType, currentMax, scale);
        return time > 0 ? cost / time : Infinity;
    };

    if (getCsPerTick(maxDesiredScale) <= availableCSBudget) {
        return maxDesiredScale;
    }

    while (low <= high) {
        const candidateMax = Math.floor((low + high) / 2);
        if (getCsPerTick(candidateMax) <= availableCSBudget) {
            best = candidateMax;
            low = candidateMax + 1;
        } else {
            high = candidateMax - 1;
        }
    }
    return best;
}

export function findMaxScaleForLandboundResources(
    facility: { maxScale: number; needs: ResourceQuantity[] },
    planet: Planet,
    desiredScale: number,
): number {
    if (desiredScale <= facility.maxScale) {
        return desiredScale;
    }
    let cap = desiredScale;
    for (const need of facility.needs) {
        if (need.resource.form !== 'landBoundResource') {
            continue;
        }
        const poolQuantity = planet.resources[need.resource.name]?.pool?.quantity ?? 0;
        cap = Math.min(cap, facility.maxScale + Math.floor(poolQuantity / need.quantity));
    }
    return cap;
}

export function computeDynamicExpansionTarget(
    facility: ProductionFacility,
    assets: AgentPlanetAssets,
    planet: Planet,
    hasOwnConstruction: boolean,
    constructionBudget: number,
): number {
    let maxDemandScale = facility.maxScale;

    for (const output of facility.produces) {
        const inventory = queryStorageFacility(assets.storage, output.resource.name, false);
        const targetMonths = getStorageTargetMonths() ?? STORAGE_TARGET_MONTHS;
        const target = targetMonths * TICKS_PER_MONTH * facility.maxScale * output.quantity;
        const deficit = Math.max(0, target - inventory);
        const scaleForDemand = Math.ceil(deficit / output.quantity);

        maxDemandScale = Math.max(maxDemandScale, facility.maxScale + scaleForDemand);
    }

    const absoluteCap = facility.maxScale + Math.max(1, Math.ceil(facility.maxScale * DYNAMIC_EXPANSION_CAP_FRACTION));
    let targetMax = Math.min(maxDemandScale, absoluteCap);

    if (!hasOwnConstruction) {
        targetMax = findMaxAffordableScale(facility, assets, planet, facility.maxScale, targetMax);
        targetMax = findMaxScaleForCSBudget(facility, facility.maxScale, targetMax, constructionBudget);
    }

    targetMax = findMaxScaleForLandboundResources(facility, planet, targetMax);

    return targetMax;
}
