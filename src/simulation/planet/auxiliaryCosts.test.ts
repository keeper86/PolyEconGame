import { describe, expect, it } from 'vitest';
import {
    FACILITY_MAINTENANCE_DECREASE_PER_YEAR,
    FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK,
    MAINTENANCE_SERVICE_PER_STATUS_UNIT,
    MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE,
    SERVICE_DEPRECIATION_COST_MULTIPLIER,
    SR_HOLDING_COST_PER_TON,
    STORAGE_MOVEMENT_FACTOR,
    TICKS_PER_MONTH,
    TICKS_PER_YEAR,
} from '../constants';
import { makePlanet, makeProductionFacility } from '../utils/testHelper';
import {
    facilityFullRestoreCost,
    facilityMaintenanceConsumptionPerTick,
    facilityMaintenanceMultiplier,
    facilityRestorationCostFactor,
    facilityUsageFactor,
} from './facilityMaintenance';
import {
    auxiliaryCostPerTick,
    auxiliaryCostRates,
    facilityThroughputMass,
    storageScaleForFacility,
} from './auxiliaryCosts';
import { waterFacility } from './productionFacilities';
import { waterResourceType } from './resources';
import {
    groceryServiceResourceType,
    constructionServiceResourceType,
    maintenanceServiceResourceType,
} from './services';
import {
    ESTIMATED_HR_OVERHEAD,
    PRODUCED_HR_QUANTITY,
    PRODUCED_STORAGE_QUANTITY,
    humanResourcesOfficeFacilityType,
    logisticsDepartmentFacilityType,
} from './specialFacilities';

describe('auxiliaryCostRates', () => {
    it('prices HR and storage overhead from the department operating costs', () => {
        const planet = makePlanet();
        const rates = auxiliaryCostRates(planet);

        const hrTemplate = humanResourcesOfficeFacilityType('catalog', 'preview');
        const storageTemplate = logisticsDepartmentFacilityType('catalog', 'preview');

        const adminPrice = (planet.marketPrices.Administration ?? 0) * SERVICE_DEPRECIATION_COST_MULTIPLIER;
        const logisticsPrice = (planet.marketPrices.Logistics ?? 0) * SERVICE_DEPRECIATION_COST_MULTIPLIER;
        const hrInputCost = hrTemplate.needs.reduce((sum, need) => sum + need.quantity * adminPrice, 0);
        const hrWageCost =
            (hrTemplate.workerRequirement.none ?? 0) * planet.wagePerEdu.none +
            (hrTemplate.workerRequirement.primary ?? 0) * planet.wagePerEdu.primary +
            (hrTemplate.workerRequirement.secondary ?? 0) * planet.wagePerEdu.secondary +
            (hrTemplate.workerRequirement.tertiary ?? 0) * planet.wagePerEdu.tertiary;

        const restorationDemand =
            (FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK / MAINTENANCE_SERVICE_PER_STATUS_UNIT) *
            MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE *
            facilityFullRestoreCost(hrTemplate) *
            facilityRestorationCostFactor(hrTemplate.maxMaintenance);
        const hrUpkeep =
            (rates.maintenanceCostPerScale + restorationDemand * rates.constructionServicePrice) *
            facilityMaintenanceMultiplier(hrTemplate);

        const expectedHrCostPerWorker =
            (ESTIMATED_HR_OVERHEAD * (hrInputCost + hrWageCost + hrUpkeep)) / PRODUCED_HR_QUANTITY;
        expect(rates.hrCostPerWorker).toBeCloseTo(expectedHrCostPerWorker, 10);

        const storageWorkerCount =
            (storageTemplate.workerRequirement.none ?? 0) +
            (storageTemplate.workerRequirement.primary ?? 0) +
            (storageTemplate.workerRequirement.secondary ?? 0) +
            (storageTemplate.workerRequirement.tertiary ?? 0);
        const storageInputCost =
            (storageTemplate.needs.find((need) => need.resource.name === 'Administration')?.quantity ?? 0) *
                adminPrice +
            (storageTemplate.needs.find((need) => need.resource.name === 'Logistics')?.quantity ?? 0) * logisticsPrice;
        const storageWageCost =
            (storageTemplate.workerRequirement.none ?? 0) * planet.wagePerEdu.none +
            (storageTemplate.workerRequirement.primary ?? 0) * planet.wagePerEdu.primary +
            (storageTemplate.workerRequirement.secondary ?? 0) * planet.wagePerEdu.secondary +
            (storageTemplate.workerRequirement.tertiary ?? 0) * planet.wagePerEdu.tertiary;

        const storageRestorationDemand =
            (FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK / MAINTENANCE_SERVICE_PER_STATUS_UNIT) *
            MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE *
            facilityFullRestoreCost(storageTemplate) *
            facilityRestorationCostFactor(storageTemplate.maxMaintenance);
        const storageUpkeep =
            (rates.maintenanceCostPerScale + storageRestorationDemand * rates.constructionServicePrice) *
            facilityMaintenanceMultiplier(storageTemplate);

        const expectedStorageCostPerScale =
            storageInputCost + storageWageCost + storageWorkerCount * expectedHrCostPerWorker + storageUpkeep;
        expect(rates.storageCostPerScale).toBeCloseTo(expectedStorageCostPerScale, 10);
    });

    it('does not divide the department cost by zero when service prices are missing', () => {
        const planet = makePlanet();
        planet.marketPrices = {};
        const rates = auxiliaryCostRates(planet);
        expect(Number.isFinite(rates.hrCostPerWorker)).toBe(true);
        expect(Number.isFinite(rates.storageCostPerScale)).toBe(true);
    });
});

describe('facilityThroughputMass', () => {
    it('counts produced and non-land-bound needs', () => {
        const water = waterFacility('catalog', 'preview');
        expect(facilityThroughputMass(water)).toBe(600);
    });

    it('is zero for massless service outputs', () => {
        const service = makeProductionFacility(
            {},
            { produces: [{ resource: groceryServiceResourceType, quantity: 100 }] },
        );
        expect(facilityThroughputMass(service)).toBe(0);
    });
});

describe('storageScaleForFacility', () => {
    it('includes movement and holding cost per throughput ton', () => {
        const facility = makeProductionFacility({}, { produces: [{ resource: waterResourceType, quantity: 100 }] });
        const expected =
            (STORAGE_MOVEMENT_FACTOR * 100 + 100 * TICKS_PER_MONTH * SR_HOLDING_COST_PER_TON) /
            PRODUCED_STORAGE_QUANTITY;
        expect(storageScaleForFacility(facility)).toBeCloseTo(expected, 10);
    });

    it('is zero for massless service outputs', () => {
        const service = makeProductionFacility(
            {},
            { produces: [{ resource: groceryServiceResourceType, quantity: 100 }] },
        );
        expect(storageScaleForFacility(service)).toBe(0);
    });
});

describe('auxiliaryCostPerTick', () => {
    it('is maintenance plus restoration for a worker-less massless facility', () => {
        const planet = makePlanet();
        const rates = auxiliaryCostRates(planet);
        const facility = makeProductionFacility(
            {},
            { produces: [{ resource: groceryServiceResourceType, quantity: 10 }] },
        );
        const restorationDemand =
            (FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK / MAINTENANCE_SERVICE_PER_STATUS_UNIT) *
            MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE *
            facilityFullRestoreCost(facility) *
            facilityRestorationCostFactor(facility.maxMaintenance);
        const expected =
            (rates.maintenanceCostPerScale + restorationDemand * rates.constructionServicePrice) *
            facilityMaintenanceMultiplier(facility);
        expect(auxiliaryCostPerTick(facility, rates)).toBeCloseTo(expected, 10);
    });

    it('matches the engine upkeep at the design point', () => {
        const planet = makePlanet();
        const rates = auxiliaryCostRates(planet);
        const facility = makeProductionFacility(
            {},
            { produces: [{ resource: groceryServiceResourceType, quantity: 10 }] },
        );
        facility.scale = 1;
        facility.maxScale = 1;
        facility.maxMaintenance = 0.99;
        facility.lastTickResults.overallEfficiency = 1;

        const maintenancePrice = planet.marketPrices[maintenanceServiceResourceType.name] ?? 0;
        const constructionPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;

        const actualMaintenanceCost = facilityMaintenanceConsumptionPerTick(facility) * maintenancePrice;
        const wearPerTick = (facilityUsageFactor(facility) * FACILITY_MAINTENANCE_DECREASE_PER_YEAR) / TICKS_PER_YEAR;
        const actualRestorationCost =
            wearPerTick *
            MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE *
            facilityFullRestoreCost(facility) *
            facilityRestorationCostFactor(facility.maxMaintenance) *
            constructionPrice;

        const engineUpkeep = (actualMaintenanceCost + actualRestorationCost) * SERVICE_DEPRECIATION_COST_MULTIPLIER;
        expect(auxiliaryCostPerTick(facility, rates)).toBeCloseTo(engineUpkeep, 10);
    });
});
