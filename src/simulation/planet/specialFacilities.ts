import { defaultBuildingCost } from '../ships/ships';
import type {
    LastManagementTickResults,
    ManagementFacility,
    ProductionFacility,
    ShipConstructionFacility,
} from './facility';
import { MAINTENANCE_COST_MULTIPLIER } from './production';
import { zeroLastTicksProductionResults } from './productionFacilities';
import { maintenanceServiceResourceType } from './services';

const zeroLastTicksResults: LastManagementTickResults = {
    overallEfficiency: 0,
    workerEfficiency: {},
    resourceEfficiency: {},
    overqualifiedWorkers: {},
    exactUsedByEdu: {},
    totalUsedByEdu: {},
    lastConsumed: {},
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
    lastTickResults: {
        ...zeroLastTicksResults,
        workerEfficiency: {},
        resourceEfficiency: {},
        overqualifiedWorkers: {},
        exactUsedByEdu: {},
        totalUsedByEdu: {},
        lastProduced: {},
        lastConsumed: {},
    },
    buffer: 0,
    maxBuffer: 100,
    bufferPerTickPerScale: 10,
});

export const humanResourcesOfficeFacilityType = (planetId: string, id: string): ManagementFacility => ({
    ...makeManagementFacilityDefaults(),
    planetId,
    id,
    name: 'Human Resources Office',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 10,
        secondary: 5,
        tertiary: 1,
    },
    needs: [],
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

export const shipMaintenanceFacilityType = (planetId: string, id: string): ProductionFacility => {
    return {
        planetId,
        id,
        type: 'production',
        name: 'Ship Maintenance Facility',
        maxScale: 1,
        scale: 1,
        construction: null,
        powerConsumptionPerTick: 2,
        workerRequirement: {
            none: 10,
            primary: 20,
            secondary: 10,
            tertiary: 5,
        },
        pollutionPerTick: { ...defaultPollutionPerTick },
        needs: defaultBuildingCost.map((rq) => ({
            resource: rq.resource,
            quantity: rq.quantity * MAINTENANCE_COST_MULTIPLIER,
        })),
        produces: [{ resource: maintenanceServiceResourceType, quantity: 10 }],
        lastTickResults: { ...zeroLastTicksProductionResults },
    };
};
