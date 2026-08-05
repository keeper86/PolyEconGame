import type { LastManagementTickResults, ManagementFacility, ShipConstructionFacility } from './facility';
import { administrativeServiceResourceType, humanResourcesServiceResourceType } from './services';

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
export const PRODUCED_QUANTITY = 200;
export const ESTIMATED_HR_OVERHEAD = 1.025;
export const humanResourcesOfficeFacilityType = (planetId: string, id: string): ManagementFacility => ({
    ...makeManagementFacilityDefaults(),
    planetId,
    id,
    name: HR_DEPARTMENT_NAME,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 0,
        primary: 1,
        secondary: 2,
        tertiary: 1,
    },
    needs: [{ resource: administrativeServiceResourceType, quantity: 2 }],
    produces: [{ resource: humanResourcesServiceResourceType, quantity: PRODUCED_QUANTITY }],
});
export const humanResourcesScaleForWorkers = (neededWorkers: number): number => neededWorkers / PRODUCED_QUANTITY;

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
