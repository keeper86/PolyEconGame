import {
    FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK,
    MAINTENANCE_SERVICE_PER_STATUS_UNIT,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
    SERVICE_DEPRECIATION_COST_MULTIPLIER,
    SR_HOLDING_COST_PER_TON,
    STORAGE_MOVEMENT_FACTOR,
    TICKS_PER_MONTH,
} from '../constants';
import { educationLevelKeys } from '../population/education';
import type { Facility, ManagementFacility, ProductionFacility } from './facility';
import {
    facilityFullRestoreCost,
    facilityMaintenanceMultiplier,
    facilityRestorationCostFactor,
} from './facilityMaintenance';
import type { Planet } from './planet';
import { constructionServiceResourceType, maintenanceServiceResourceType } from './services';
import {
    ESTIMATED_HR_OVERHEAD,
    PRODUCED_HR_QUANTITY,
    PRODUCED_STORAGE_QUANTITY,
    humanResourcesOfficeFacilityType,
    logisticsDepartmentFacilityType,
} from './specialFacilities';

const CATALOG_PLANET = 'catalog';
const CATALOG_ID = 'preview';

export const hrCostTemplate = humanResourcesOfficeFacilityType(CATALOG_PLANET, CATALOG_ID);
export const storageCostTemplate = logisticsDepartmentFacilityType(CATALOG_PLANET, CATALOG_ID);

const facilityWorkerCount = (facility: ManagementFacility | ProductionFacility): number =>
    (facility.workerRequirement.none ?? 0) +
    (facility.workerRequirement.primary ?? 0) +
    (facility.workerRequirement.secondary ?? 0) +
    (facility.workerRequirement.tertiary ?? 0);

export const facilityInputCostPerTick = (facility: ManagementFacility | ProductionFacility, planet: Planet): number => {
    let inputCost = 0;
    for (const need of facility.needs) {
        const pricePerUnit =
            need.resource.form === 'landBoundResource'
                ? (planet.landBoundCostPerUnit[need.resource.name] ?? 0)
                : need.resource.form === 'services'
                  ? (planet.marketPrices[need.resource.name] ?? 0) * SERVICE_DEPRECIATION_COST_MULTIPLIER
                  : (planet.marketPrices[need.resource.name] ?? 0);
        inputCost += need.quantity * pricePerUnit;
    }
    return inputCost;
};

export const facilityWageCostPerTick = (facility: ManagementFacility | ProductionFacility, planet: Planet): number => {
    let wageCost = 0;
    for (const edu of educationLevelKeys) {
        const req = facility.workerRequirement[edu] ?? 0;
        if (req > 0) {
            wageCost += req * planet.wagePerEdu[edu];
        }
    }
    return wageCost;
};

export const facilityThroughputMass = (facility: ProductionFacility): number => {
    let throughput = 0;
    for (const p of facility.produces) {
        throughput += p.quantity * p.resource.massPerQuantity;
    }
    for (const n of facility.needs) {
        if (n.resource.form === 'landBoundResource') {
            continue;
        }
        throughput += n.quantity * n.resource.massPerQuantity;
    }
    return throughput;
};

export const storageScaleForFacility = (facility: ProductionFacility): number => {
    const mass = facilityThroughputMass(facility);
    const movement = STORAGE_MOVEMENT_FACTOR * mass;
    const holding = mass * TICKS_PER_MONTH * SR_HOLDING_COST_PER_TON;
    return (movement + holding) / PRODUCED_STORAGE_QUANTITY;
};

const restorationDemandPerTick = (facility: Facility): number => {
    const degradationRate =
        (FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK / MAINTENANCE_SERVICE_PER_STATUS_UNIT) *
        MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE;
    return degradationRate * facilityFullRestoreCost(facility) * facilityRestorationCostFactor(facility.maxMaintenance);
};

export type AuxiliaryCostRates = {
    hrCostPerWorker: number;
    storageCostPerScale: number;
    maintenanceCostPerScale: number;
    constructionServicePrice: number;
};

const facilityUpkeepCostPerTick = (
    facility: Facility,
    rates: Pick<AuxiliaryCostRates, 'maintenanceCostPerScale' | 'constructionServicePrice'>,
): number =>
    (rates.maintenanceCostPerScale + restorationDemandPerTick(facility) * rates.constructionServicePrice) *
    facilityMaintenanceMultiplier(facility);

export const auxiliaryCostRates = (planet: Planet): AuxiliaryCostRates => {
    const maintenanceCostPerScale =
        FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK *
        (planet.marketPrices[maintenanceServiceResourceType.name] ?? 0) *
        SERVICE_DEPRECIATION_COST_MULTIPLIER;
    const constructionServicePrice =
        (planet.marketPrices[constructionServiceResourceType.name] ?? 0) * SERVICE_DEPRECIATION_COST_MULTIPLIER;
    const upkeepRates = { maintenanceCostPerScale, constructionServicePrice };

    const hrDepartmentCost =
        facilityInputCostPerTick(hrCostTemplate, planet) +
        facilityWageCostPerTick(hrCostTemplate, planet) +
        facilityUpkeepCostPerTick(hrCostTemplate, upkeepRates);
    const hrCostPerWorker = (ESTIMATED_HR_OVERHEAD * hrDepartmentCost) / PRODUCED_HR_QUANTITY;

    const storageCostPerScale =
        facilityInputCostPerTick(storageCostTemplate, planet) +
        facilityWageCostPerTick(storageCostTemplate, planet) +
        facilityWorkerCount(storageCostTemplate) * hrCostPerWorker +
        facilityUpkeepCostPerTick(storageCostTemplate, upkeepRates);

    return { hrCostPerWorker, storageCostPerScale, maintenanceCostPerScale, constructionServicePrice };
};

export const auxiliaryCostPerTick = (facility: ProductionFacility, rates: AuxiliaryCostRates): number =>
    facilityWorkerCount(facility) * rates.hrCostPerWorker +
    storageScaleForFacility(facility) * rates.storageCostPerScale +
    facilityUpkeepCostPerTick(facility, rates);
