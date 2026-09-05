import {
    FACILITY_MAINTENANCE_DECREASE_PER_YEAR,
    FACILITY_MAINTENANCE_REPAIR_PER_TICK,
    MAINTENANCE_SERVICE_PER_STATUS_UNIT,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
    RESTORATION_COST_FACTOR_SIGMOID_STEEPNESS,
    TICKS_PER_YEAR,
} from '../constants';
import {
    calculateCostsForConstruction,
    getFacilityType,
    isFacilityOperating,
    queryStorageFacility,
    removeFromStorageFacility,
    type Facility,
} from './facility';
import type { AgentPlanetAssets, GameState, Planet } from './planet';
import { getAllFacilities } from './planet';
import { constructionServiceResourceType, maintenanceServiceResourceType } from './services';

export function computeOtherConstructionCosts(assets: AgentPlanetAssets, constructionServicePrice: number): number {
    return getAllFacilities(assets)
        .filter((f) => f.construction !== null)
        .reduce((sum, f) => {
            const remaining = f.construction!.totalConstructionServiceRequired - f.construction!.progress;
            return sum + Math.max(0, remaining) * constructionServicePrice;
        }, 0);
}

export function facilityUsageFactor(facility: Facility): number {
    return 0.5 + 1.5 * facility.lastTickResults.overallEfficiency * (facility.scale / facility.maxScale);
}

export function facilityMaintenanceConsumptionPerTick(facility: Facility): number {
    return (
        (facility.scale *
            facilityUsageFactor(facility) *
            FACILITY_MAINTENANCE_DECREASE_PER_YEAR *
            MAINTENANCE_SERVICE_PER_STATUS_UNIT) /
        TICKS_PER_YEAR
    );
}

export function facilityMaintenanceRepairNeedPerTick(facility: Facility): number {
    const degradation = (facilityUsageFactor(facility) * FACILITY_MAINTENANCE_DECREASE_PER_YEAR) / TICKS_PER_YEAR;
    const degradedStatus = Math.max(0, facility.maintenanceStatus - degradation);
    const repairCap = Math.max(0, facility.maxMaintenance - degradedStatus);
    const repairFraction = Math.min(FACILITY_MAINTENANCE_REPAIR_PER_TICK, repairCap);
    return repairFraction * MAINTENANCE_SERVICE_PER_STATUS_UNIT * facility.scale;
}

export const facilityFullRestoreCost = (facility: Facility): number =>
    calculateCostsForConstruction(getFacilityType(facility), 0, facility.maxScale).cost;

export function facilityRestorationCostFactor(maxMaintenance: number): number {
    const x = Math.max(0, Math.min(1, maxMaintenance));
    return 0.2 + 0.8 / (1 + Math.exp(RESTORATION_COST_FACTOR_SIGMOID_STEEPNESS * (x - 0.5)));
}

export const facilityRestorationCapacityPerTick = (facility: Facility): number => {
    const wanted = Math.min(1 - facility.maxMaintenance, MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE);
    return wanted * facilityFullRestoreCost(facility) * facilityRestorationCostFactor(facility.maxMaintenance);
};

export function facilityMaintenanceTick(gameState: GameState, planet: Planet): void {
    gameState.agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }
        for (const facility of getAllFacilities(assets)) {
            facility.lastTickMaintenanceConsumption = 0;
            facility.lastTickRestorationConsumption = 0;
            if (!isFacilityOperating(facility)) {
                continue;
            }
            applyFacilityMaintenance(facility, assets, planet);
            applyFacilityRestoration(facility, assets, planet);
        }
    });
}

function applyFacilityMaintenance(facility: Facility, assets: AgentPlanetAssets, planet: Planet): void {
    const usageFactor = facilityUsageFactor(facility);
    facility.maintenanceStatus = Math.max(
        0,
        facility.maintenanceStatus - (usageFactor * FACILITY_MAINTENANCE_DECREASE_PER_YEAR) / TICKS_PER_YEAR,
    );

    const repairCap = Math.max(0, facility.maxMaintenance - facility.maintenanceStatus);
    if (repairCap <= 0) {
        return;
    }

    const repairFraction = Math.min(FACILITY_MAINTENANCE_REPAIR_PER_TICK, repairCap);
    const consumed = removeFromStorageFacility(
        assets.storageFacility,
        maintenanceServiceResourceType.name,
        repairFraction * MAINTENANCE_SERVICE_PER_STATUS_UNIT * facility.scale,
    );
    facility.lastTickMaintenanceConsumption = consumed;
    if (consumed <= 0) {
        return;
    }

    const restoredFraction = consumed / (facility.scale * MAINTENANCE_SERVICE_PER_STATUS_UNIT);
    facility.maintenanceStatus = Math.min(facility.maxMaintenance, facility.maintenanceStatus + restoredFraction);

    const price = planet.marketPrices[maintenanceServiceResourceType.name] ?? 0;
    planet.consumedResources[maintenanceServiceResourceType.name] =
        (planet.consumedResources[maintenanceServiceResourceType.name] ?? 0) + consumed;
    assets.monthAcc.consumedResources[maintenanceServiceResourceType.name] = {
        quantity: (assets.monthAcc.consumedResources[maintenanceServiceResourceType.name]?.quantity ?? 0) + consumed,
        value: (assets.monthAcc.consumedResources[maintenanceServiceResourceType.name]?.value ?? 0) + consumed * price,
    };
    assets.monthAcc.consumptionValue += consumed * price;

    facility.cumulativeRepairAcc += restoredFraction;
    while (facility.cumulativeRepairAcc >= 1) {
        facility.cumulativeRepairAcc -= 1;
        facility.maxMaintenance = Math.max(0, facility.maxMaintenance - MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE);
    }
    facility.maintenanceStatus = Math.min(facility.maintenanceStatus, facility.maxMaintenance);
}

function applyFacilityRestoration(facility: Facility, assets: AgentPlanetAssets, planet: Planet): void {
    if (facility.maxMaintenance >= 1) {
        return;
    }

    const fullRestoreCost = facilityFullRestoreCost(facility);
    if (fullRestoreCost <= 0) {
        return;
    }

    const costFactor = facilityRestorationCostFactor(facility.maxMaintenance);
    const needed = facilityRestorationCapacityPerTick(facility);
    const available = queryStorageFacility(assets.storageFacility, constructionServiceResourceType.name);

    const toConsume = Math.min(needed, available);
    if (toConsume <= 0) {
        return;
    }

    const consumed = removeFromStorageFacility(assets.storageFacility, constructionServiceResourceType.name, toConsume);
    facility.lastTickRestorationConsumption = consumed;
    const restored = consumed / (fullRestoreCost * costFactor);
    facility.maxMaintenance = Math.min(1, facility.maxMaintenance + restored);
    facility.maintenanceStatus = Math.min(facility.maxMaintenance, facility.maintenanceStatus + restored);

    const price = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    planet.consumedResources[constructionServiceResourceType.name] =
        (planet.consumedResources[constructionServiceResourceType.name] ?? 0) + consumed;
    assets.monthAcc.consumedResources[constructionServiceResourceType.name] = {
        quantity: (assets.monthAcc.consumedResources[constructionServiceResourceType.name]?.quantity ?? 0) + consumed,
        value: (assets.monthAcc.consumedResources[constructionServiceResourceType.name]?.value ?? 0) + consumed * price,
    };
    assets.monthAcc.consumptionValue += consumed * price;
}
