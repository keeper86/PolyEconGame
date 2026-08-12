import {
    FACILITY_MAINTENANCE_DECREASE_PER_YEAR,
    FACILITY_MAINTENANCE_REPAIR_PER_TICK,
    FACILITY_RESTORATION_PER_TICK,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
    TICKS_PER_YEAR,
} from '../constants';
import {
    calculateCostsForConstruction,
    getFacilityType,
    queryStorageFacility,
    removeFromStorageFacility,
    type Facility,
} from './facility';
import type { AgentPlanetAssets, GameState, Planet } from './planet';
import { constructionServiceResourceType, maintenanceServiceResourceType } from './services';

export function collectAgentFacilities(assets: AgentPlanetAssets): Facility[] {
    const facilities: Facility[] = [...assets.productionFacilities, ...assets.shipConstructionFacilities];
    if (assets.storageFacility.department) {
        facilities.push(assets.storageFacility.department);
    }
    if (assets.humanResourcesDepartment) {
        facilities.push(assets.humanResourcesDepartment);
    }
    return facilities;
}

export function facilityMaintenanceTick(gameState: GameState, planet: Planet): void {
    gameState.agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }
        for (const facility of collectAgentFacilities(assets)) {
            if (facility.construction !== null) {
                continue;
            }
            applyFacilityMaintenance(facility, assets, planet);
            applyFacilityRestoration(facility, assets, planet);
        }
    });
}

function applyFacilityMaintenance(facility: Facility, assets: AgentPlanetAssets, planet: Planet): void {
    facility.maintenanceStatus = Math.max(
        0,
        facility.maintenanceStatus - FACILITY_MAINTENANCE_DECREASE_PER_YEAR / TICKS_PER_YEAR,
    );

    const repairCap = Math.max(0, facility.maxMaintenance - facility.maintenanceStatus);
    if (repairCap <= 0) {
        return;
    }

    const needed = Math.min(FACILITY_MAINTENANCE_REPAIR_PER_TICK, repairCap);
    const consumed = removeFromStorageFacility(assets.storageFacility, maintenanceServiceResourceType.name, needed);
    if (consumed <= 0) {
        return;
    }

    facility.maintenanceStatus = Math.min(facility.maxMaintenance, facility.maintenanceStatus + consumed);
    assets.monthAcc.consumptionValue += consumed * (planet.marketPrices[maintenanceServiceResourceType.name] ?? 0);

    facility.cumulativeRepairAcc += consumed;
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

    const fullRestoreCost = calculateCostsForConstruction(getFacilityType(facility), 0, facility.maxScale).cost;
    if (fullRestoreCost <= 0) {
        return;
    }

    const wanted = Math.min(1 - facility.maxMaintenance, FACILITY_RESTORATION_PER_TICK);
    const needed = wanted * fullRestoreCost;
    const available = queryStorageFacility(assets.storageFacility, constructionServiceResourceType.name);

    const toConsume = Math.min(needed, available);
    if (toConsume <= 0) {
        return;
    }

    const consumed = removeFromStorageFacility(assets.storageFacility, constructionServiceResourceType.name, toConsume);
    const restored = consumed / fullRestoreCost;
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
