import type { ManagementFacility } from './facility';

const zeroLastTicksResults = {
    overallEfficiency: 0,
    workerEfficiency: {},
    resourceEfficiency: {},
    overqualifiedWorkers: {},
    exactUsedByEdu: {},
    totalUsedByEdu: {},
    lastProduced: {},
    lastConsumed: {},
};

const defaultPollutionPerTick = {
    air: 0,
    water: 0,
    soil: 0,
};

const makeFacilityDefaults = () => ({
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
    ...makeFacilityDefaults(),
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
