import { MIN_EMPLOYABLE_AGE } from '../../constants';
import { educationLevelKeys, type EducationLevelType } from '../../population/education';
import type { ResourceQuantity } from '../claims';
import type { Facility, FacilityBase, ManagementFacility, ProductionFacility } from '../facility';
import { calculateCostsForConstruction, getFacilityType } from '../facility';
import type { AgentPlanetAssets, Planet } from '../planet';
import {
    DYNAMIC_EXPANSION_CAP_FRACTION,
    EXPANSION_WORKER_RESERVE_MARGIN,
    MAX_SCALE_EXPAND_FRACTION,
} from './constants';
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

const OVER_SHARE_FACTOR = 1.2;

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
    resourceTotalMaxCapacity: Map<string, number>,
    resourceTotalMaxNeeded: Map<string, number>,
    hasOwnConstruction: boolean,
    constructionBudget: number,
): number {
    let maxDemandScale = facility.maxScale;

    for (const output of facility.produces) {
        const lastResult = planet.avgMarketResult[output.resource.name];
        if (!lastResult || lastResult.unfilledDemand <= 0) {
            continue;
        }

        const totalCapacity = resourceTotalMaxCapacity.get(output.resource.name) ?? 0;
        const totalNeeded = resourceTotalMaxNeeded.get(output.resource.name) ?? 0;
        const estimateOfDemand = 0.5 * (Math.max(0, totalNeeded - totalCapacity) + lastResult.unfilledDemand);
        const ownCapacity = output.quantity * facility.maxScale;
        const capacityShare = totalCapacity > 0 ? ownCapacity / totalCapacity : 1;
        const targetNewProductionDueUnfilledDemand = estimateOfDemand * capacityShare * OVER_SHARE_FACTOR;

        const scaleForDemand = Math.ceil(targetNewProductionDueUnfilledDemand / output.quantity);

        maxDemandScale = Math.max(maxDemandScale, facility.maxScale + scaleForDemand);
    }

    const absoluteCap = facility.maxScale + Math.max(1, Math.ceil(facility.maxScale * DYNAMIC_EXPANSION_CAP_FRACTION));
    let targetMax = Math.min(maxDemandScale, absoluteCap);

    const demography = planet.population.demography;
    const unemployedByEdu: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        for (const edu of educationLevelKeys) {
            unemployedByEdu[edu] += demography[age].unoccupied[edu].total;
        }
    }

    for (let eduIndex = 0; eduIndex < educationLevelKeys.length; eduIndex++) {
        const edu = educationLevelKeys[eduIndex];
        const reqPerScale = facility.workerRequirement[edu] ?? 0;
        if (reqPerScale <= 0) {
            continue;
        }

        let availableForJobTier = 0;
        for (let i = eduIndex; i < educationLevelKeys.length; i++) {
            availableForJobTier += unemployedByEdu[educationLevelKeys[i]];
        }

        const usableForEdu = availableForJobTier / (1 + EXPANSION_WORKER_RESERVE_MARGIN);
        const maxScaleFromLabor = facility.maxScale + Math.floor(usableForEdu / reqPerScale);
        targetMax = Math.min(targetMax, maxScaleFromLabor);
    }

    if (!hasOwnConstruction) {
        targetMax = findMaxAffordableScale(facility, assets, planet, facility.maxScale, targetMax);
        targetMax = findMaxScaleForCSBudget(facility, facility.maxScale, targetMax, constructionBudget);
    }

    targetMax = findMaxScaleForLandboundResources(facility, planet, targetMax);

    return targetMax;
}
