import type { HRFacility, LastManagementTickResults, ManagementFacility, ShipConstructionFacility } from './facility';
import {
    administrativeServiceResourceType,
    educationServiceResourceType,
    humanResourcesServiceResourceType,
    logisticsServiceResourceType,
    storageServiceResourceType,
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
    lastTickResults: {
        ...zeroLastTicksResults,
    },
});

export const HR_DEPARTMENT_NAME = 'HR Department';
export const PRODUCED_QUANTITY = 1000;
export const USED_QUANTITY = 15;
export const ESTIMATED_HR_OVERHEAD = 1.025;
export const HR_WORLD_BUFFER = 1.4;
export const humanResourcesOfficeFacilityType = (planetId: string, id: string): HRFacility => ({
    ...makeManagementFacilityDefaults(),
    planetId,
    id,
    name: HR_DEPARTMENT_NAME,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 0,
        primary: 5,
        secondary: 10,
        tertiary: 5,
    },
    needs: [{ resource: administrativeServiceResourceType, quantity: USED_QUANTITY }],
    produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_QUANTITY }],
    hrBuffer: 0,
});
export const STORAGE_DEPARTMENT_NAME = 'Storage Department';
export const storageDepartmentFacilityType = (planetId: string, id: string): ManagementFacility => ({
    ...makeManagementFacilityDefaults(),
    planetId,
    id,
    name: STORAGE_DEPARTMENT_NAME,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 0,
        primary: 1,
        secondary: 2,
        tertiary: 1,
    },
    needs: [
        { resource: administrativeServiceResourceType, quantity: 1 },
        { resource: logisticsServiceResourceType, quantity: 10 },
    ],
    produces: [{ resource: storageServiceResourceType, quantity: PRODUCED_QUANTITY }],
});

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
    produces: [{ resource: administrativeServiceResourceType, quantity: PRODUCED_QUANTITY }],
});

export const TRAINING_CENTER_NAME = 'Training Center';
export const trainingCenterFacilityType = (planetId: string, id: string): ManagementFacility => ({
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
    produces: [{ resource: administrativeServiceResourceType, quantity: PRODUCED_QUANTITY }],
});

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
