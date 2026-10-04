import { SR_HOLDING_COST_PER_TON } from '../constants';
import type {
    HRFacility,
    LastManagementTickResults,
    ManagementFacility,
    ShipConstructionFacility,
    StorageDepartment,
    TrainingsDepartment,
} from './facility';
import { nullWagePidState, STORAGE_SHELL_CAPACITY, storageFormKeys } from './facility';
import { withDerivedWorkers, workerProfiles, workers } from '../workforce/workerRequirements';
import {
    administrativeServiceResourceType,
    educationServiceResourceType,
    humanResourcesServiceResourceType,
    internalLogisticsServiceResourceType,
    logisticsServiceResourceType,
    trainingServiceResourceType,
} from './services';

const zeroLastTicksResults: LastManagementTickResults = {
    overallEfficiency: 0,
    workerEfficiencyOverall: 1,
    workerEfficiency: {},
    resourceEfficiency: {},
    overqualifiedWorkers: {},
    exactUsedByEdu: {},
    totalUsedByEdu: {},
    lastProduced: {},
    lastConsumed: {},
    wageCosts: 0,
    inputCosts: 0,
    costBalance: 0,
};

const defaultPollutionPerTick = {
    air: 0,
    water: 0,
    soil: 0,
};

const makeManagementFacilityDefaults = () => ({
    type: 'management' as const,
    maxScale: 1,
    scale: 1,
    pollutionPerTick: { ...defaultPollutionPerTick },
    construction: null,
    lastConstructionCompletedTick: 0,
    maintenanceStatus: 1,
    maxMaintenance: 1,
    cumulativeRepairAcc: 0,
    lastTickMaintenanceConsumption: 0,
    lastTickRestorationConsumption: 0,
    lastTickResults: {
        ...zeroLastTicksResults,
    },
});

export const HR_DEPARTMENT_NAME = 'HR Department';
export const PRODUCED_HR_QUANTITY = 2000;
export const USED_QUANTITY = 20;
export const ESTIMATED_HR_OVERHEAD = 1.025;
export const HR_WORLD_BUFFER = 1.4;
export const humanResourcesOfficeFacilityType = (planetId: string, id: string): HRFacility =>
    withDerivedWorkers(workerProfiles.administration, {
        ...makeManagementFacilityDefaults(),
        planetId,
        id,
        name: HR_DEPARTMENT_NAME,
        powerConsumptionPerTick: 0.5,
        needs: [{ resource: administrativeServiceResourceType, quantity: USED_QUANTITY }],
        produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
        hrBuffer: 0,
        hrStarvation: 0,
        wagePidState: nullWagePidState(),
    });

export const LOGISTICS_DEPARTMENT_NAME = 'Logistics Department';
export const STORAGE_DEPARTMENT_SERVICE_HEADROOM = 20 / 3;
export const PRODUCED_STORAGE_QUANTITY = Math.ceil(
    storageFormKeys().length *
        STORAGE_SHELL_CAPACITY.mass *
        SR_HOLDING_COST_PER_TON *
        STORAGE_DEPARTMENT_SERVICE_HEADROOM,
);
export const logisticsDepartmentFacilityType = (planetId: string, id: string): StorageDepartment =>
    withDerivedWorkers(workerProfiles.logistics, {
        ...makeManagementFacilityDefaults(),
        planetId,
        id,
        name: LOGISTICS_DEPARTMENT_NAME,
        powerConsumptionPerTick: 0.5,
        needs: [
            { resource: administrativeServiceResourceType, quantity: 5 },
            { resource: logisticsServiceResourceType, quantity: 30 },
        ],
        produces: [{ resource: internalLogisticsServiceResourceType, quantity: PRODUCED_STORAGE_QUANTITY }],

        transportBuffer: 0,
        transportStarvation: 0,
    });
// service shield for production
// increased buffer for storageServiceResourceType
// KEEP. ONLY UNUSED UNTIL NEXT TICKET
export const RESEARCH_DEPARTMENT_NAME = 'R&D Department';
export const researchAndDevelopmentFacilityType = (planetId: string, id: string): ManagementFacility =>
    withDerivedWorkers(workerProfiles.research, {
        ...makeManagementFacilityDefaults(),
        planetId,
        id,
        name: 'Research & Development',
        powerConsumptionPerTick: 0.5,
        needs: [
            { resource: administrativeServiceResourceType, quantity: 1 },
            { resource: educationServiceResourceType, quantity: 10 },
        ],
        produces: [{ resource: administrativeServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
    });
// KEEP. ONLY UNUSED UNTIL NEXT TICKET
export const TRAINING_CENTER_NAME = 'Training Center';
export const trainingCenterFacilityType = (planetId: string, id: string): TrainingsDepartment =>
    withDerivedWorkers(workerProfiles.education, {
        ...makeManagementFacilityDefaults(),
        planetId,
        id,
        name: TRAINING_CENTER_NAME,
        powerConsumptionPerTick: 0.5,
        needs: [
            { resource: administrativeServiceResourceType, quantity: 1 },
            { resource: educationServiceResourceType, quantity: 10 },
        ],
        produces: [{ resource: trainingServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
        trainingsBuffer: 0,
    });
// shorten time for onbording
// decrease productivity malus for onboarding
// worker XP increase
// increase XP bonus for productivity

export const shipConstructionFacilityType = (planetId: string, id: string): ShipConstructionFacility => {
    return {
        planetId,
        id,
        type: 'ship_construction',
        name: 'Ship Construction Facility',
        maxScale: 1,
        scale: 1,
        construction: null,
        lastConstructionCompletedTick: 0,
        maintenanceStatus: 1,
        maxMaintenance: 1,
        cumulativeRepairAcc: 0,
        lastTickMaintenanceConsumption: 0,
        lastTickRestorationConsumption: 0,
        powerConsumptionPerTick: 2,
        workerRequirement: workers(workerProfiles.construction, 45),
        pollutionPerTick: { ...defaultPollutionPerTick },
        shipName: '',
        produces: null,
        progress: 0,
        lastTickResults: { ...zeroLastTicksResults },
    };
};
