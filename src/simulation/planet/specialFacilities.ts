import { nullWagePidState } from './facility';
import type {
    HRFacility,
    LastManagementTickResults,
    ManagementFacility,
    ShipConstructionFacility,
    StorageDepartment,
    TrainingsDepartment,
} from './facility';
import {
    administrativeServiceResourceType,
    educationServiceResourceType,
    humanResourcesServiceResourceType,
    logisticsServiceResourceType,
    storageServiceResourceType,
    trainingServiceResourceType,
} from './services';

const zeroLastTicksResults: LastManagementTickResults = {
    overallEfficiency: 0,
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
export const humanResourcesOfficeFacilityType = (planetId: string, id: string): HRFacility => ({
    ...makeManagementFacilityDefaults(),
    planetId,
    id,
    name: HR_DEPARTMENT_NAME,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 10,
        primary: 10,
        secondary: 20,
        tertiary: 5,
    },
    needs: [{ resource: administrativeServiceResourceType, quantity: USED_QUANTITY }],
    produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
    hrBuffer: 0,
    wagePidState: nullWagePidState(),
});

export const STORAGE_DEPARTMENT_NAME = 'Storage Department';
export const PRODUCED_STORAGE_QUANTITY = 10000;
export const storageDepartmentFacilityType = (planetId: string, id: string): StorageDepartment => ({
    ...makeManagementFacilityDefaults(),
    planetId,
    id,
    name: STORAGE_DEPARTMENT_NAME,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 25,
        primary: 10,
        secondary: 10,
        tertiary: 2,
    },
    needs: [
        { resource: administrativeServiceResourceType, quantity: 5 },
        { resource: logisticsServiceResourceType, quantity: 50 },
    ],
    produces: [{ resource: storageServiceResourceType, quantity: PRODUCED_STORAGE_QUANTITY }],

    storageBuffer: 0,
    storageStarvation: 0,
});
// service shield for production
// increased buffer for storageServiceResourceType

export const RESEARCH_DEPARTMENT_NAME = 'R&D Department';
export const researchAndDevelopmentFacilityType = (planetId: string, id: string): ManagementFacility => ({
    ...makeManagementFacilityDefaults(),
    planetId,
    id,
    name: 'Research & Development',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 0,
        primary: 1,
        secondary: 2,
        tertiary: 5,
    },
    needs: [
        { resource: administrativeServiceResourceType, quantity: 1 },
        { resource: educationServiceResourceType, quantity: 10 },
    ],
    produces: [{ resource: administrativeServiceResourceType, quantity: PRODUCED_HR_QUANTITY }],
});

export const TRAINING_CENTER_NAME = 'Training Center';
export const trainingCenterFacilityType = (planetId: string, id: string): TrainingsDepartment => ({
    ...makeManagementFacilityDefaults(),
    planetId,
    id,
    name: TRAINING_CENTER_NAME,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 0,
        primary: 1,
        secondary: 2,
        tertiary: 5,
    },
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
        workerRequirement: {
            none: 10,
            primary: 20,
            secondary: 10,
            tertiary: 5,
        },
        pollutionPerTick: { ...defaultPollutionPerTick },
        shipName: '',
        produces: null,
        progress: 0,
        lastTickResults: { ...zeroLastTicksResults },
    };
};
