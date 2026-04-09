import {
    arableLandResourceType,
    clayDepositResourceType,
    coalDepositResourceType,
    copperDepositResourceType,
    forestResourceType,
    ironOreDepositResourceType,
    limestoneDepositResourceType,
    naturalGasFieldResourceType,
    oilReservoirResourceType,
    sandDepositResourceType,
    stoneDepositResourceType,
    waterSourceResourceType,
} from './landBoundResources';
import type { ResourceProcessLevel } from './claims';
import {
    agriculturalProductResourceType,
    beverageResourceType,
    cementResourceType,
    chemicalResourceType,
    clayResourceType,
    clothingResourceType,
    coalResourceType,
    concreteResourceType,
    consumerElectronicsResourceType,
    copperOreResourceType,
    copperResourceType,
    cottonResourceType,
    crudeOilResourceType,
    electronicComponentResourceType,
    fabricResourceType,
    fuelResourceType,
    furnitureResourceType,
    glassResourceType,
    ironOreResourceType,
    limestoneResourceType,
    logsResourceType,
    lumberResourceType,
    machineryResourceType,
    naturalGasResourceType,
    packagingResourceType,
    paperResourceType,
    pesticideResourceType,
    pharmaceuticalResourceType,
    plasticResourceType,
    processedFoodResourceType,
    sandResourceType,
    siliconWaferResourceType,
    steelResourceType,
    stoneResourceType,
    vehicleResourceType,
    waterResourceType,
} from './resources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
} from './services';
import type { ProductionFacility } from './facility';

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
    type: 'production' as const,
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
});

export const coalMine = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Coal Mine',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 30,
        primary: 15,
        secondary: 4,
        tertiary: 1,
    },
    needs: [{ resource: coalDepositResourceType, quantity: 0.5 }],
    produces: [{ resource: coalResourceType, quantity: 500 }],
});

export const oilWell = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Oil Well',
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 10,
        primary: 25,
        secondary: 15,
        tertiary: 2,
    },
    needs: [{ resource: oilReservoirResourceType, quantity: 0.3 }],
    produces: [{ resource: crudeOilResourceType, quantity: 300 }],
});

export const naturalGasWell = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Natural Gas Well',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 10,
        secondary: 6,
        tertiary: 1,
    },
    needs: [{ resource: naturalGasFieldResourceType, quantity: 0.1 }],
    produces: [{ resource: naturalGasResourceType, quantity: 100 }],
});

export const loggingCamp = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Logging Camp',
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 20,
        primary: 10,
        secondary: 2,
        tertiary: 0,
    },
    needs: [{ resource: forestResourceType, quantity: 400 }],
    produces: [{ resource: logsResourceType, quantity: 400 }],
});

export const stoneQuarry = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Stone Quarry',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 20,
        primary: 10,
        secondary: 3,
        tertiary: 0,
    },
    needs: [{ resource: stoneDepositResourceType, quantity: 0.4 }],
    produces: [{ resource: stoneResourceType, quantity: 400 }],
});

export const copperMine = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Copper Mine',
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 20,
        primary: 12,
        secondary: 5,
        tertiary: 1,
    },
    needs: [{ resource: copperDepositResourceType, quantity: 0.4 }],
    produces: [{ resource: copperOreResourceType, quantity: 400 }],
});

export const sandMine = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Sand Mine',
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 8,
        primary: 5,
        secondary: 1,
        tertiary: 0,
    },
    needs: [{ resource: sandDepositResourceType, quantity: 0.3 }],
    produces: [{ resource: sandResourceType, quantity: 300 }],
});

export const limestoneQuarry = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Limestone Quarry',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 12,
        primary: 8,
        secondary: 2,
        tertiary: 0,
    },
    needs: [{ resource: limestoneDepositResourceType, quantity: 0.3 }],
    produces: [{ resource: limestoneResourceType, quantity: 300 }],
});

export const clayMine = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Clay Mine',
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 10,
        primary: 6,
        secondary: 2,
        tertiary: 0,
    },
    needs: [{ resource: clayDepositResourceType, quantity: 0.4 }],
    produces: [{ resource: clayResourceType, quantity: 400 }],
});

export const ironSmelter = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Iron Smelter',
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 15,
        primary: 30,
        secondary: 20,
        tertiary: 3,
    },
    needs: [
        { resource: ironOreResourceType, quantity: 150 },
        { resource: coalResourceType, quantity: 30 },
    ],
    produces: [{ resource: steelResourceType, quantity: 100 }],
});

export const copperSmelter = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Copper Smelter',
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 8,
        primary: 20,
        secondary: 12,
        tertiary: 2,
    },
    needs: [
        { resource: copperOreResourceType, quantity: 120 },
        { resource: coalResourceType, quantity: 20 },
    ],
    produces: [{ resource: copperResourceType, quantity: 100 }],
});

export const oilRefinery = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Oil Refinery',
    powerConsumptionPerTick: 1.5,
    workerRequirement: {
        none: 20,
        primary: 40,
        secondary: 30,
        tertiary: 8,
    },
    needs: [{ resource: crudeOilResourceType, quantity: 200 }],
    produces: [
        { resource: fuelResourceType, quantity: 40 },
        { resource: plasticResourceType, quantity: 70 },
        { resource: chemicalResourceType, quantity: 90 },
    ],
});

export const sawmill = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Sawmill',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 15,
        primary: 20,
        secondary: 8,
        tertiary: 1,
    },
    needs: [{ resource: logsResourceType, quantity: 300 }],
    produces: [{ resource: lumberResourceType, quantity: 200 }],
});

export const cementPlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Cement Plant',
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 10,
        primary: 20,
        secondary: 12,
        tertiary: 2,
    },
    needs: [
        { resource: limestoneResourceType, quantity: 60 },
        { resource: clayResourceType, quantity: 15 },
        { resource: coalResourceType, quantity: 10 },
    ],
    produces: [{ resource: cementResourceType, quantity: 50 }],
});

export const concretePlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Concrete Plant',
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 8,
        primary: 21,
        secondary: 10,
        tertiary: 2,
    },
    needs: [
        { resource: cementResourceType, quantity: 40 },
        { resource: stoneResourceType, quantity: 80 },
        { resource: sandResourceType, quantity: 40 },
        { resource: waterResourceType, quantity: 20 },
    ],
    produces: [{ resource: concreteResourceType, quantity: 100 }],
});

export const glassFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Glass Factory',
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 8,
        primary: 18,
        secondary: 10,
        tertiary: 1,
    },
    needs: [
        { resource: sandResourceType, quantity: 80 },
        { resource: limestoneResourceType, quantity: 20 },
        { resource: naturalGasResourceType, quantity: 10 },
    ],
    produces: [{ resource: glassResourceType, quantity: 100 }],
});

export const pesticidePlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Pesticide Plant',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 4,
        primary: 10,
        secondary: 8,
        tertiary: 2,
    },
    needs: [
        { resource: chemicalResourceType, quantity: 50 }, // we don't have generic chemicals; maybe add later
        { resource: waterResourceType, quantity: 80 },
    ],
    produces: [{ resource: pesticideResourceType, quantity: 30 }],
});

export const pharmaceuticalPlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Pharmaceutical Plant',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 3,
        primary: 8,
        secondary: 15,
        tertiary: 5,
    },
    needs: [
        { resource: agriculturalProductResourceType, quantity: 20 },
        { resource: chemicalResourceType, quantity: 100 },
        { resource: waterResourceType, quantity: 100 },
    ],
    produces: [{ resource: pharmaceuticalResourceType, quantity: 10 }],
});

export const foodProcessingPlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Food Processing Plant',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 10,
        secondary: 4,
        tertiary: 1,
    },

    needs: [
        { resource: agriculturalProductResourceType, quantity: 60 },
        { resource: chemicalResourceType, quantity: 5 },
        { resource: waterResourceType, quantity: 100 },
    ],
    produces: [{ resource: processedFoodResourceType, quantity: 80 }],
});

export const beveragePlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Beverage Plant',
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 10,
        primary: 18,
        secondary: 6,
        tertiary: 1,
    },
    needs: [
        { resource: waterResourceType, quantity: 110 },
        { resource: agriculturalProductResourceType, quantity: 20 },
        { resource: chemicalResourceType, quantity: 1 },
    ],
    produces: [{ resource: beverageResourceType, quantity: 100 }],
});

export const paperMill = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Paper Mill',
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 10,
        primary: 20,
        secondary: 12,
        tertiary: 2,
    },
    needs: [
        { resource: logsResourceType, quantity: 150 },
        { resource: waterResourceType, quantity: 50 },
    ],
    produces: [{ resource: paperResourceType, quantity: 100 }],
});

export const cottonFarm = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Cotton Farm',
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 15,
        primary: 8,
        secondary: 2,
        tertiary: 0,
    },
    needs: [
        { resource: arableLandResourceType, quantity: 200 },
        { resource: waterResourceType, quantity: 80 },
    ],
    produces: [{ resource: cottonResourceType, quantity: 100 }],
});

export const textileMill = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Textile Mill',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 20,
        primary: 30,
        secondary: 15,
        tertiary: 2,
    },
    needs: [
        { resource: cottonResourceType, quantity: 120 },
        { resource: waterResourceType, quantity: 30 },
    ],
    produces: [{ resource: fabricResourceType, quantity: 100 }],
});

export const clothingFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Clothing Factory',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 25,
        primary: 40,
        secondary: 15,
        tertiary: 2,
    },
    needs: [
        { resource: waterResourceType, quantity: 50 },
        { resource: fabricResourceType, quantity: 80 },
        { resource: plasticResourceType, quantity: 10 },
    ],
    produces: [{ resource: clothingResourceType, quantity: 60 }],
});

export const furnitureFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Furniture Factory',
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 15,
        primary: 25,
        secondary: 12,
        tertiary: 2,
    },
    needs: [
        { resource: lumberResourceType, quantity: 100 },
        { resource: steelResourceType, quantity: 20 },
        { resource: fabricResourceType, quantity: 10 },
    ],
    produces: [{ resource: furnitureResourceType, quantity: 50 }],
});

export const siliconWaferFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Silicon Wafer Factory',
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 5,
        primary: 15,
        secondary: 15,
        tertiary: 20,
    },
    needs: [
        { resource: sandResourceType, quantity: 300 },
        { resource: naturalGasResourceType, quantity: 20 },
    ],
    produces: [{ resource: siliconWaferResourceType, quantity: 80 }],
});

export const electronicComponentFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Electronics Component Factory',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 5,
        primary: 15,
        secondary: 30,
        tertiary: 8,
    },
    needs: [
        { resource: siliconWaferResourceType, quantity: 40 }, // for silicon
        { resource: copperResourceType, quantity: 40 },
        { resource: plasticResourceType, quantity: 20 },
    ],
    produces: [{ resource: electronicComponentResourceType, quantity: 40 }],
});

export const consumerElectronicsFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Consumer Electronics Factory',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 8,
        primary: 20,
        secondary: 35,
        tertiary: 6,
    },
    needs: [
        { resource: electronicComponentResourceType, quantity: 20 },
        { resource: plasticResourceType, quantity: 30 },
        { resource: glassResourceType, quantity: 30 },
    ],
    produces: [{ resource: consumerElectronicsResourceType, quantity: 20 }],
});

export const machineryFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Machinery Factory',
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 10,
        primary: 30,
        secondary: 35,
        tertiary: 5,
    },
    needs: [
        { resource: steelResourceType, quantity: 90 },
        { resource: chemicalResourceType, quantity: 5 },
        { resource: plasticResourceType, quantity: 20 },
    ],
    produces: [{ resource: machineryResourceType, quantity: 50 }],
});

export const vehicleFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Vehicle Factory',
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 20,
        primary: 50,
        secondary: 50,
        tertiary: 8,
    },
    needs: [
        { resource: steelResourceType, quantity: 10 },
        { resource: plasticResourceType, quantity: 10 },
        { resource: glassResourceType, quantity: 2 },
        { resource: electronicComponentResourceType, quantity: 2 },
        { resource: fabricResourceType, quantity: 5 },
        { resource: machineryResourceType, quantity: 10 },
    ],
    produces: [{ resource: vehicleResourceType, quantity: 10.5 }],
});

export const agriculturalProductionFacility = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Agricultural Facility',
    powerConsumptionPerTick: 1,
    workerRequirement: {
        none: 30,
        primary: 20,
        secondary: 10,
        tertiary: 0,
    },
    needs: [
        { resource: waterResourceType, quantity: 20 },
        { resource: arableLandResourceType, quantity: 50 },
    ],
    produces: [{ resource: agriculturalProductResourceType, quantity: 40 }],
});

export const intensiveFarmFacility = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Intensive Agricultural Facility',
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 20,
        primary: 15,
        secondary: 10,
        tertiary: 2,
    },
    needs: [
        { resource: arableLandResourceType, quantity: 30 },
        { resource: waterResourceType, quantity: 100 },
        { resource: pesticideResourceType, quantity: 10 },
        { resource: chemicalResourceType, quantity: 20 },
    ],
    produces: [{ resource: agriculturalProductResourceType, quantity: 120 }],
});

export const waterExtractionFacility = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Water Extraction Facility',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 5,
        secondary: 5,
        tertiary: 0,
    },

    needs: [{ resource: waterSourceResourceType, quantity: 800 }],
    produces: [{ resource: waterResourceType, quantity: 800 }],
});

export const ironExtractionFacility = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Iron Extraction Facility',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 20,
        primary: 12,
        secondary: 5,
        tertiary: 1,
    },
    needs: [{ resource: ironOreDepositResourceType, quantity: 0.4 }],
    produces: [{ resource: ironOreResourceType, quantity: 400 }],
});

export const coalPowerPlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Coal Power Plant' as const,
    powerConsumptionPerTick: -200, // produces power for ~ 200 facilities
    workerRequirement: {
        none: 0,
        primary: 10,
        secondary: 20,
        tertiary: 5,
    },
    needs: [{ resource: coalResourceType, quantity: 40 }],
    produces: [],
});

export const packagingPlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Packaging Plant',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 10,
        primary: 15,
        secondary: 10,
        tertiary: 1,
    },
    needs: [
        { resource: paperResourceType, quantity: 10 },
        { resource: plasticResourceType, quantity: 60 },
    ],
    produces: [{ resource: packagingResourceType, quantity: 40 }],
});

export const administrativeCenter = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Administrative Center' as const,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 20,
        primary: 40,
        secondary: 50,
        tertiary: 10,
    },
    needs: [],
    produces: [{ resource: administrativeServiceResourceType, quantity: 100 }],
});

export const logisticsHub = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Logistics Hub' as const,
    powerConsumptionPerTick: 0.2,
    workerRequirement: {
        none: 30,
        primary: 60,
        secondary: 10,
        tertiary: 1,
    },
    needs: [
        { resource: vehicleResourceType, quantity: 0.1 },
        { resource: fuelResourceType, quantity: 10.0 },
        { resource: administrativeServiceResourceType, quantity: 5 },
    ],
    produces: [{ resource: logisticsServiceResourceType, quantity: 100 }],
});

export const constructionFacility = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Construction Facility' as const,
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 40,
        primary: 40,
        secondary: 20,
        tertiary: 4,
    },
    needs: [
        { resource: concreteResourceType, quantity: 60 },
        { resource: steelResourceType, quantity: 30 },
        { resource: machineryResourceType, quantity: 1 },
        { resource: administrativeServiceResourceType, quantity: 1 },
        { resource: logisticsServiceResourceType, quantity: 1 },
    ],
    produces: [{ resource: constructionServiceResourceType, quantity: 100 }],
});

export const groceryChain = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Grocery Chain' as const,
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 60,
        primary: 60,
        secondary: 40,
        tertiary: 2,
    },
    needs: [
        { resource: processedFoodResourceType, quantity: 30 },
        { resource: beverageResourceType, quantity: 20 },
        { resource: packagingResourceType, quantity: 5 },
        { resource: logisticsServiceResourceType, quantity: 5 },
        { resource: administrativeServiceResourceType, quantity: 5 },
    ],
    produces: [{ resource: groceryServiceResourceType, quantity: 200 }],
});

export const retailChain = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Retail Chain' as const,
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 50,
        primary: 60,
        secondary: 30,
        tertiary: 5,
    },
    needs: [
        { resource: consumerElectronicsResourceType, quantity: 10 },
        { resource: clothingResourceType, quantity: 30 },
        { resource: furnitureResourceType, quantity: 30 },
        { resource: packagingResourceType, quantity: 10 },
        { resource: logisticsServiceResourceType, quantity: 20 },
        { resource: administrativeServiceResourceType, quantity: 5 },
    ],
    produces: [{ resource: retailServiceResourceType, quantity: 150 }],
});

export const hospital = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Hospital' as const,
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 20,
        primary: 20,
        secondary: 30,
        tertiary: 50,
    },
    needs: [
        { resource: pharmaceuticalResourceType, quantity: 2 },
        { resource: chemicalResourceType, quantity: 20 },
        { resource: logisticsServiceResourceType, quantity: 10 },
        { resource: administrativeServiceResourceType, quantity: 3 },
    ],
    produces: [{ resource: healthcareServiceResourceType, quantity: 300 }],
});

export const educationCenter = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Education Center' as const,
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 20,
        primary: 30,
        secondary: 50,
        tertiary: 100,
    },
    needs: [
        { resource: paperResourceType, quantity: 30 },
        { resource: furnitureResourceType, quantity: 5 },
        { resource: administrativeServiceResourceType, quantity: 6 },
    ],
    produces: [{ resource: educationServiceResourceType, quantity: 300 }],
});

export type FacilityFactory = (planetId: string, id: string) => ProductionFacility;

export type FacilityCatalogEntry = {
    factory: FacilityFactory;
    primaryOutputLevel: ResourceProcessLevel;
};

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

const entry = (factory: FacilityFactory): FacilityCatalogEntry => {
    const instance = factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID);
    const primaryOutput = instance.produces[0]?.resource.level;

    const primaryOutputLevel: ResourceProcessLevel =
        !primaryOutput || primaryOutput === 'source' ? 'raw' : primaryOutput;
    return { factory, primaryOutputLevel };
};

export const ALL_FACILITY_ENTRIES: FacilityCatalogEntry[] = [
    entry(coalMine),
    entry(oilWell),
    entry(naturalGasWell),
    entry(loggingCamp),
    entry(stoneQuarry),
    entry(copperMine),
    entry(sandMine),
    entry(limestoneQuarry),
    entry(clayMine),
    entry(cottonFarm),
    entry(agriculturalProductionFacility),
    entry(waterExtractionFacility),
    entry(ironExtractionFacility),
    entry(coalPowerPlant),
    entry(ironSmelter),
    entry(copperSmelter),
    entry(oilRefinery),
    entry(sawmill),
    entry(cementPlant),
    entry(glassFactory),
    entry(pesticidePlant),
    entry(paperMill),
    entry(textileMill),
    entry(concretePlant),
    entry(foodProcessingPlant),
    entry(beveragePlant),
    entry(pharmaceuticalPlant),
    entry(clothingFactory),
    entry(furnitureFactory),
    entry(electronicComponentFactory),
    entry(consumerElectronicsFactory),
    entry(machineryFactory),
    entry(vehicleFactory),
    entry(intensiveFarmFacility),
    entry(packagingPlant),
    entry(administrativeCenter),
    entry(logisticsHub),
    entry(constructionFacility),
    entry(groceryChain),
    entry(retailChain),
    entry(hospital),
    entry(educationCenter),
    entry(siliconWaferFactory),
];
export const FACILITY_LEVELS: ResourceProcessLevel[] = ['raw', 'refined', 'manufactured', 'services'] as const;
export type FacilityLevel = ResourceProcessLevel[] | 'refined' | 'manufactured' | 'services';
export const FACILITY_LEVEL_LABELS: Record<ResourceProcessLevel, string> = {
    raw: 'Raw Extraction',
    refined: 'Refinement',
    manufactured: 'Manufacturing',
    services: 'Services',
};

export const facilitiesByLevel: Record<ResourceProcessLevel, FacilityCatalogEntry[]> = {
    raw: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'raw'),
    refined: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'refined'),
    manufactured: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'manufactured'),
    services: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'services'),
};

export const facilityByName: ReadonlyMap<string, FacilityCatalogEntry> = new Map(
    ALL_FACILITY_ENTRIES.map((e) => [e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name, e]),
);
