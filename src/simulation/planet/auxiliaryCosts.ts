import {
    FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK,
    JOINT_DEMAND_WEIGHT_EXPONENT,
    JOINT_DEMAND_WEIGHT_MAX,
    JOINT_DEMAND_WEIGHT_MIN,
    MAINTENANCE_SERVICE_PER_STATUS_UNIT,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
    SERVICE_DEPRECIATION_COST_MULTIPLIER,
    SR_HOLDING_COST_PER_TON,
    STORAGE_MOVEMENT_FACTOR,
    TICKS_PER_MONTH,
} from '../constants';
import { initialMarketPrices } from '../initialUniverse/initialMarketPrices';
import { educationLevelKeys } from '../population/education';
import type { Facility, ManagementFacility, ProductionFacility } from './facility';
import { facilityFullRestoreCost, facilityRestorationCostFactor } from './facilityMaintenance';
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

const hrTemplate = humanResourcesOfficeFacilityType(CATALOG_PLANET, CATALOG_ID);
const storageTemplate = logisticsDepartmentFacilityType(CATALOG_PLANET, CATALOG_ID);

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
): number => rates.maintenanceCostPerScale + restorationDemandPerTick(facility) * rates.constructionServicePrice;

export const auxiliaryCostRates = (planet: Planet): AuxiliaryCostRates => {
    const maintenanceCostPerScale =
        FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK *
        (planet.marketPrices[maintenanceServiceResourceType.name] ?? 0) *
        SERVICE_DEPRECIATION_COST_MULTIPLIER;
    const constructionServicePrice =
        (planet.marketPrices[constructionServiceResourceType.name] ?? 0) * SERVICE_DEPRECIATION_COST_MULTIPLIER;
    const upkeepRates = { maintenanceCostPerScale, constructionServicePrice };

    const hrDepartmentCost =
        facilityInputCostPerTick(hrTemplate, planet) +
        facilityWageCostPerTick(hrTemplate, planet) +
        facilityUpkeepCostPerTick(hrTemplate, upkeepRates);
    const hrCostPerWorker = (ESTIMATED_HR_OVERHEAD * hrDepartmentCost) / PRODUCED_HR_QUANTITY;

    const storageCostPerScale =
        facilityInputCostPerTick(storageTemplate, planet) +
        facilityWageCostPerTick(storageTemplate, planet) +
        facilityWorkerCount(storageTemplate) * hrCostPerWorker +
        facilityUpkeepCostPerTick(storageTemplate, upkeepRates);

    return { hrCostPerWorker, storageCostPerScale, maintenanceCostPerScale, constructionServicePrice };
};

export const auxiliaryCostPerTick = (facility: ProductionFacility, rates: AuxiliaryCostRates): number =>
    facilityWorkerCount(facility) * rates.hrCostPerWorker +
    storageScaleForFacility(facility) * rates.storageCostPerScale +
    facilityUpkeepCostPerTick(facility, rates);

const clampJointDemandRatio = (ratio: number): number =>
    Math.max(JOINT_DEMAND_WEIGHT_MIN, Math.min(JOINT_DEMAND_WEIGHT_MAX, ratio));

export const jointOutputCostShares = (
    facility: ProductionFacility,
    planet: Planet,
    outputAccum: Map<string, number>,
    exponent: number = JOINT_DEMAND_WEIGHT_EXPONENT,
): Map<string, number> => {
    const outputs = facility.produces.filter((output) => output.quantity > 0);
    const totalQty = outputs.reduce((sum, output) => sum + output.quantity, 0);
    if (outputs.length === 0 || totalQty <= 0) {
        return new Map();
    }

    let kappaMean = 0;
    const kappa = new Map<string, number>();
    for (const output of outputs) {
        const q = outputAccum.get(output.resource.name) ?? output.quantity;
        const demand = planet.avgMarketResult[output.resource.name]?.totalDemand ?? 0;
        const k = q > 0 && demand > 0 ? demand / q : 1;
        kappa.set(output.resource.name, k);
        kappaMean += k;
    }
    kappaMean /= outputs.length;

    let totalWeighted = 0;
    const rawWeight = new Map<string, number>();
    for (const output of outputs) {
        const refPrice = initialMarketPrices[output.resource.name] ?? 0;
        const ratio = kappaMean > 0 ? clampJointDemandRatio((kappa.get(output.resource.name) ?? 1) / kappaMean) : 1;
        const weight = refPrice * Math.pow(ratio, exponent);
        rawWeight.set(output.resource.name, weight);
        totalWeighted += output.quantity * weight;
    }

    const shares = new Map<string, number>();
    if (totalWeighted > 0) {
        for (const output of outputs) {
            shares.set(
                output.resource.name,
                (output.quantity * (rawWeight.get(output.resource.name) ?? 0)) / totalWeighted,
            );
        }
    } else {
        for (const output of outputs) {
            shares.set(output.resource.name, output.quantity / totalQty);
        }
    }
    return shares;
};
