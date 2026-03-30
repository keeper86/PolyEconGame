import {
    coalDepositResourceType,
    oilReservoirResourceType,
    naturalGasFieldResourceType,
    forestResourceType,
    stoneQuarryResourceType,
    bauxiteDepositResourceType,
    copperDepositResourceType,
    rareEarthDepositResourceType,
    sandDepositResourceType,
    limestoneDepositResourceType,
    clayDepositResourceType,
    arableLandResourceType,
    phosphateRockDepositResourceType,
    potashDepositResourceType,
    ironOreDepositResourceType,
    waterSourceResourceType,
} from './landBoundResources';
import type { ResourceProcessLevel } from './planet';
import {
    coalResourceType,
    crudeOilResourceType,
    naturalGasResourceType,
    logsResourceType,
    stoneResourceType,
    bauxiteResourceType,
    copperOreResourceType,
    rareEarthOreResourceType,
    sandResourceType,
    limestoneResourceType,
    clayResourceType,
    agriculturalProductResourceType,
    aluminumResourceType,
    beverageResourceType,
    brickResourceType,
    cementResourceType,
    clothingResourceType,
    concreteResourceType,
    consumerElectronicsResourceType,
    copperResourceType,
    cottonResourceType,
    electronicComponentResourceType,
    fabricResourceType,
    fertilizerResourceType,
    furnitureResourceType,
    fuelResourceType,
    glassResourceType,
    ironOreResourceType,
    lubricantResourceType,
    lumberResourceType,
    machineryResourceType,
    paperResourceType,
    pesticideResourceType,
    pharmaceuticalResourceType,
    plasticResourceType,
    processedFoodResourceType,
    steelResourceType,
    vehicleResourceType,
    waterResourceType,
    chemicalResourceType,
    phosphateRockResourceType,
    potashResourceType,
    constructionResourceType,
    packagingResourceType,
} from './resources';
import {
    administrativeServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    retailServiceResourceType,
} from './services';
import type { ProductionFacility } from './storage';

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

export const coalMine = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Coal Mine',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 30,
        primary: 15,
        secondary: 4,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: coalDepositResourceType, quantity: 500 }],
    produces: [{ resource: coalResourceType, quantity: 500 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const oilWell = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Oil Well',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 10,
        primary: 20,
        secondary: 10,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: oilReservoirResourceType, quantity: 100 }],
    produces: [{ resource: crudeOilResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const naturalGasWell = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Natural Gas Well',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 10,
        secondary: 6,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: naturalGasFieldResourceType, quantity: 100 }],
    produces: [{ resource: naturalGasResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const loggingCamp = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Logging Camp',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 20,
        primary: 10,
        secondary: 2,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: forestResourceType, quantity: 400 }],
    produces: [{ resource: logsResourceType, quantity: 400 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const stoneQuarry = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Stone Quarry',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 20,
        primary: 10,
        secondary: 3,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: stoneQuarryResourceType, quantity: 400 }],
    produces: [{ resource: stoneResourceType, quantity: 400 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const bauxiteMine = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Bauxite Mine',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 15,
        primary: 10,
        secondary: 4,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: bauxiteDepositResourceType, quantity: 400 }],
    produces: [{ resource: bauxiteResourceType, quantity: 400 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const copperMine = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Copper Mine',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 20,
        primary: 12,
        secondary: 5,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: copperDepositResourceType, quantity: 400 }],
    produces: [{ resource: copperOreResourceType, quantity: 400 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const rareEarthMine = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Rare Earth Mine',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 10,
        primary: 15,
        secondary: 10,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: rareEarthDepositResourceType, quantity: 400 }],
    produces: [{ resource: rareEarthOreResourceType, quantity: 400 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const sandMine = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Sand Mine',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 8,
        primary: 5,
        secondary: 1,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: sandDepositResourceType, quantity: 300 }],
    produces: [{ resource: sandResourceType, quantity: 300 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const limestoneQuarry = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Limestone Quarry',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 12,
        primary: 8,
        secondary: 2,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: limestoneDepositResourceType, quantity: 300 }],
    produces: [{ resource: limestoneResourceType, quantity: 300 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const clayMine = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Clay Mine',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 10,
        primary: 6,
        secondary: 2,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: clayDepositResourceType, quantity: 400 }],
    produces: [{ resource: clayResourceType, quantity: 400 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const ironSmelter = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Iron Smelter',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 15,
        primary: 30,
        secondary: 20,
        tertiary: 3,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: ironOreResourceType, quantity: 150 },
        { resource: coalResourceType, quantity: 30 },
    ],
    produces: [{ resource: steelResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const phosphateMine = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Phosphate Mine',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 8,
        primary: 12,
        secondary: 5,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: phosphateRockDepositResourceType, quantity: 150 }],
    produces: [{ resource: phosphateRockResourceType, quantity: 150 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const potashMine = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Potash Mine',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 8,
        secondary: 4,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: potashDepositResourceType, quantity: 200 }],
    produces: [{ resource: potashResourceType, quantity: 200 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const aluminumSmelter = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Aluminum Smelter',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 2.0,
    workerRequirement: {
        none: 10,
        primary: 25,
        secondary: 18,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: bauxiteResourceType, quantity: 800 }],
    produces: [{ resource: aluminumResourceType, quantity: 200 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const copperSmelter = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Copper Smelter',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 8,
        primary: 20,
        secondary: 12,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: copperOreResourceType, quantity: 120 },
        { resource: coalResourceType, quantity: 20 },
    ],
    produces: [{ resource: copperResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const oilRefinery = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Oil Refinery',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.5,
    workerRequirement: {
        none: 20,
        primary: 40,
        secondary: 30,
        tertiary: 8,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: crudeOilResourceType, quantity: 200 }],
    produces: [
        { resource: fuelResourceType, quantity: 100 },
        { resource: lubricantResourceType, quantity: 10 },
        { resource: plasticResourceType, quantity: 40 },
        { resource: chemicalResourceType, quantity: 50 },
    ],
    lastTickResults: { ...zeroLastTicksResults },
});

export const sawmill = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Sawmill',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 15,
        primary: 20,
        secondary: 8,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: logsResourceType, quantity: 300 }],
    produces: [{ resource: lumberResourceType, quantity: 200 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const cementPlant = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Cement Plant',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 10,
        primary: 20,
        secondary: 12,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: limestoneResourceType, quantity: 60 },
        { resource: clayResourceType, quantity: 15 },
        { resource: coalResourceType, quantity: 10 },
    ],
    produces: [{ resource: cementResourceType, quantity: 50 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const concretePlant = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Concrete Plant',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 8,
        primary: 21,
        secondary: 10,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: cementResourceType, quantity: 40 },
        { resource: stoneResourceType, quantity: 80 },
        { resource: sandResourceType, quantity: 40 },
        { resource: waterResourceType, quantity: 20 },
    ],
    produces: [{ resource: concreteResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const brickFactory = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Brick Factory',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 6,
        primary: 12,
        secondary: 4,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: clayResourceType, quantity: 120 },
        { resource: coalResourceType, quantity: 10 },
    ],
    produces: [{ resource: brickResourceType, quantity: 110 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const glassFactory = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Glass Factory',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 8,
        primary: 18,
        secondary: 10,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: sandResourceType, quantity: 80 },
        { resource: limestoneResourceType, quantity: 20 },
        { resource: coalResourceType, quantity: 30 },
    ],
    produces: [{ resource: glassResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const fertilizerPlant = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Fertilizer Plant',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 5,
        primary: 12,
        secondary: 8,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: naturalGasResourceType, quantity: 25 },
        { resource: phosphateRockResourceType, quantity: 25 },
        { resource: potashResourceType, quantity: 10 },
    ],
    produces: [{ resource: fertilizerResourceType, quantity: 50 }],
    lastTickResults: { ...zeroLastTicksResults },
});

// For simplicity, we'll assume phosphate and potash are included as generic minerals. If you want to add them, create deposit types.

export const pesticidePlant = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Pesticide Plant',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 4,
        primary: 10,
        secondary: 8,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: chemicalResourceType, quantity: 40 }, // we don't have generic chemicals; maybe add later
    ],
    produces: [{ resource: pesticideResourceType, quantity: 30 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const pharmaceuticalPlant = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Pharmaceutical Plant',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 3,
        primary: 8,
        secondary: 15,
        tertiary: 5,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: agriculturalProductResourceType, quantity: 20 },
        { resource: packagingResourceType, quantity: 1 },
        { resource: chemicalResourceType, quantity: 100 },
        { resource: waterResourceType, quantity: 100 },
    ],
    produces: [{ resource: pharmaceuticalResourceType, quantity: 10 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const foodProcessingPlant = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Food Processing Plant',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 10,
        secondary: 4,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: agriculturalProductResourceType, quantity: 60 },
        { resource: packagingResourceType, quantity: 10 },
        { resource: waterResourceType, quantity: 100 },
    ],
    produces: [{ resource: processedFoodResourceType, quantity: 80 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const beveragePlant = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Beverage Plant',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 10,
        primary: 18,
        secondary: 6,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: waterResourceType, quantity: 80 },
        { resource: agriculturalProductResourceType, quantity: 20 },
    ],
    produces: [{ resource: beverageResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const paperMill = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Paper Mill',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 10,
        primary: 20,
        secondary: 12,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: logsResourceType, quantity: 150 },
        { resource: waterResourceType, quantity: 50 },
    ],
    produces: [{ resource: paperResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const cottonFarm = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Cotton Farm',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 15,
        primary: 8,
        secondary: 2,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: arableLandResourceType, quantity: 100 },
        { resource: waterResourceType, quantity: 80 },
    ],
    produces: [{ resource: cottonResourceType, quantity: 20 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const textileMill = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Textile Mill',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 20,
        primary: 30,
        secondary: 15,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: cottonResourceType, quantity: 120 },
        { resource: waterResourceType, quantity: 30 },
    ],
    produces: [{ resource: fabricResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const clothingFactory = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Clothing Factory',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 25,
        primary: 40,
        secondary: 15,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: fabricResourceType, quantity: 80 },
        { resource: plasticResourceType, quantity: 10 },
    ],
    produces: [{ resource: clothingResourceType, quantity: 60 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const furnitureFactory = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Furniture Factory',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 15,
        primary: 25,
        secondary: 12,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: lumberResourceType, quantity: 100 },
        { resource: steelResourceType, quantity: 20 },
        { resource: fabricResourceType, quantity: 10 },
    ],
    produces: [{ resource: furnitureResourceType, quantity: 50 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const electronicComponentFactory = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Electronics Component Factory',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 5,
        primary: 15,
        secondary: 30,
        tertiary: 8,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: sandResourceType, quantity: 100 }, // for silicon
        { resource: copperResourceType, quantity: 100 },
        { resource: rareEarthOreResourceType, quantity: 50 },
        { resource: plasticResourceType, quantity: 100 },
    ],
    produces: [{ resource: electronicComponentResourceType, quantity: 80 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const consumerElectronicsFactory = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Consumer Electronics Factory',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 8,
        primary: 20,
        secondary: 35,
        tertiary: 6,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: electronicComponentResourceType, quantity: 20 },
        { resource: plasticResourceType, quantity: 30 },
        { resource: glassResourceType, quantity: 30 },
        { resource: packagingResourceType, quantity: 2 },
    ],
    produces: [{ resource: consumerElectronicsResourceType, quantity: 20 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const machineryFactory = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Machinery Factory',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 10,
        primary: 30,
        secondary: 35,
        tertiary: 5,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: steelResourceType, quantity: 90 },
        { resource: electronicComponentResourceType, quantity: 10 },
        { resource: plasticResourceType, quantity: 20 },
    ],
    produces: [{ resource: machineryResourceType, quantity: 50 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const vehicleFactory = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Vehicle Factory',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 20,
        primary: 50,
        secondary: 50,
        tertiary: 8,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: steelResourceType, quantity: 10 },
        { resource: aluminumResourceType, quantity: 5 },
        { resource: plasticResourceType, quantity: 10 },
        { resource: glassResourceType, quantity: 2 },
        { resource: electronicComponentResourceType, quantity: 2 },
        { resource: fabricResourceType, quantity: 5 },
        { resource: machineryResourceType, quantity: 10 },
    ],
    produces: [{ resource: vehicleResourceType, quantity: 10.5 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const agriculturalProductionFacility = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Agricultural Facility',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1,
    workerRequirement: {
        none: 30,
        primary: 20,
        secondary: 10,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: waterResourceType, quantity: 20 },
        { resource: arableLandResourceType, quantity: 50 },
    ],
    produces: [{ resource: agriculturalProductResourceType, quantity: 50 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const intensiveFarmFacility = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Intensive Agricultural Facility',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 20,
        primary: 15,
        secondary: 10,
        tertiary: 2,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: arableLandResourceType, quantity: 30 },
        { resource: waterResourceType, quantity: 100 },
        { resource: fertilizerResourceType, quantity: 10 },
        { resource: pesticideResourceType, quantity: 10 },
    ],
    produces: [{ resource: agriculturalProductResourceType, quantity: 120 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const waterExtractionFacility = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Water Extraction Facility',
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },

    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 5,
        secondary: 5,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: waterSourceResourceType, quantity: 800 }],
    produces: [{ resource: waterResourceType, quantity: 800 }],
});

export const ironExtractionFacility = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Iron Extraction Facility',
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 20,
        primary: 12,
        secondary: 5,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: ironOreDepositResourceType, quantity: 400 }],
    produces: [{ resource: ironOreResourceType, quantity: 400 }],
});

export const constructionFacility = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Construction Facility',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 1.5,
    workerRequirement: {
        none: 20,
        primary: 40,
        secondary: 30,
        tertiary: 10,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: brickResourceType, quantity: 50 },
        { resource: concreteResourceType, quantity: 60 },
        { resource: lumberResourceType, quantity: 20 },
        { resource: steelResourceType, quantity: 10 },
        { resource: glassResourceType, quantity: 10 },
        { resource: machineryResourceType, quantity: 5 },
    ],
    produces: [{ resource: constructionResourceType, quantity: 100 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const packagingPlant = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Packaging Plant',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 10,
        primary: 15,
        secondary: 10,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: paperResourceType, quantity: 40 },
        { resource: plasticResourceType, quantity: 30 },
    ],
    produces: [{ resource: packagingResourceType, quantity: 50 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const coalPowerPlant = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Coal Power Plant' as const,
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: -200, // produces power for ~ 200 facilities
    workerRequirement: {
        none: 0,
        primary: 10,
        secondary: 20,
        tertiary: 5,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [{ resource: coalResourceType, quantity: 40 }],
    produces: [],
});

export const administrativeCenter = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Administrative Center' as const,
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 20,
        primary: 30,
        secondary: 50,
        tertiary: 10,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: paperResourceType, quantity: 20 },
        { resource: consumerElectronicsResourceType, quantity: 5 },
    ],
    produces: [{ resource: administrativeServiceResourceType, quantity: 100 }],
});

export const logisticsHub = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Logistics Hub' as const,
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: 0.2,
    workerRequirement: {
        none: 30,
        primary: 60,
        secondary: 10,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },

    needs: [
        { resource: vehicleResourceType, quantity: 0.5 },
        { resource: fuelResourceType, quantity: 1.0 },
        { resource: administrativeServiceResourceType, quantity: 1 },
    ],
    produces: [{ resource: logisticsServiceResourceType, quantity: 100 }],
});

export const constructionService = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Construction Service' as const,
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 40,
        primary: 40,
        secondary: 20,
        tertiary: 4,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: concreteResourceType, quantity: 60 },
        { resource: steelResourceType, quantity: 30 },
        { resource: machineryResourceType, quantity: 1 },
        { resource: administrativeServiceResourceType, quantity: 1 },
        { resource: logisticsServiceResourceType, quantity: 1 },
    ],
    produces: [{ resource: constructionResourceType, quantity: 100 }],
});

export const groceryChain = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Grocery Chain' as const,
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 30,
        primary: 50,
        secondary: 15,
        tertiary: 1,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: processedFoodResourceType, quantity: 20 },
        { resource: beverageResourceType, quantity: 10 },
        { resource: packagingResourceType, quantity: 10 },
        { resource: logisticsServiceResourceType, quantity: 20 },
        { resource: administrativeServiceResourceType, quantity: 1 },
    ],
    produces: [{ resource: groceryServiceResourceType, quantity: 100 }],
});

export const groceryStore = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Grocery Store' as const,
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 20,
        primary: 50,
        secondary: 40,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: agriculturalProductResourceType, quantity: 100 },
        { resource: waterSourceResourceType, quantity: 40 },
    ],
    produces: [{ resource: groceryServiceResourceType, quantity: 50 }],
});

export const retailChain = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Retail Chain' as const,
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 30,
        primary: 50,
        secondary: 15,
        tertiary: 5,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: consumerElectronicsResourceType, quantity: 20 },
        { resource: clothingResourceType, quantity: 20 },
        { resource: furnitureResourceType, quantity: 20 },
        { resource: logisticsServiceResourceType, quantity: 20 },
        { resource: administrativeServiceResourceType, quantity: 1 },
    ],
    produces: [{ resource: retailServiceResourceType, quantity: 100 }],
});

export const retailStore = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Retail Store' as const,
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 10,
        primary: 30,
        secondary: 20,
        tertiary: 0,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: consumerElectronicsResourceType, quantity: 5 },
        { resource: clothingResourceType, quantity: 10 },
        { resource: furnitureResourceType, quantity: 10 },
        { resource: logisticsServiceResourceType, quantity: 10 },
    ],
    produces: [{ resource: retailServiceResourceType, quantity: 20 }],
});

export const hospital = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Hospital' as const,
    maxScale: 1,
    scale: 1,
    lastTickResults: { ...zeroLastTicksResults },
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 20,
        primary: 20,
        secondary: 30,
        tertiary: 50,
    },
    pollutionPerTick: { ...defaultPollutionPerTick },
    needs: [
        { resource: pharmaceuticalResourceType, quantity: 1 },
        { resource: logisticsServiceResourceType, quantity: 10 },
        { resource: administrativeServiceResourceType, quantity: 3 },
    ],
    produces: [{ resource: healthcareServiceResourceType, quantity: 100 }],
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
    const primaryOutput = instance.produces[0];
    const primaryOutputLevel: ResourceProcessLevel = primaryOutput?.resource.level ?? 'raw';
    return { factory, primaryOutputLevel };
};

export const ALL_FACILITY_ENTRIES: FacilityCatalogEntry[] = [
    entry(coalMine),
    entry(oilWell),
    entry(naturalGasWell),
    entry(loggingCamp),
    entry(stoneQuarry),
    entry(bauxiteMine),
    entry(copperMine),
    entry(rareEarthMine),
    entry(sandMine),
    entry(limestoneQuarry),
    entry(clayMine),
    entry(phosphateMine),
    entry(potashMine),
    entry(cottonFarm),
    entry(agriculturalProductionFacility),
    entry(waterExtractionFacility),
    entry(ironExtractionFacility),
    entry(coalPowerPlant),
    entry(ironSmelter),
    entry(aluminumSmelter),
    entry(copperSmelter),
    entry(oilRefinery),
    entry(sawmill),
    entry(cementPlant),
    entry(glassFactory),
    entry(fertilizerPlant),
    entry(pesticidePlant),
    entry(paperMill),
    entry(textileMill),
    entry(concretePlant),
    entry(brickFactory),
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
    entry(constructionFacility),
    entry(packagingPlant),
    entry(administrativeCenter),
    entry(logisticsHub),
    entry(constructionService),
    entry(groceryChain),
    entry(groceryStore),
    entry(retailChain),
    entry(retailStore),
    entry(hospital),
];
export const FACILITY_LEVELS: ResourceProcessLevel[] = ['raw', 'refined', 'manufactured', 'services'];

export const FACILITY_LEVEL_LABELS: Record<ResourceProcessLevel, string> = {
    source: 'Source',
    raw: 'Raw Extraction',
    refined: 'Refinement',
    manufactured: 'Manufacturing',
    services: 'Services',
};

export const facilitiesByLevel: Record<ResourceProcessLevel, FacilityCatalogEntry[]> = {
    source: [],
    raw: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'raw'),
    refined: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'refined'),
    manufactured: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'manufactured'),
    services: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'services'),
};

export const facilityByName: ReadonlyMap<string, FacilityCatalogEntry> = new Map(
    ALL_FACILITY_ENTRIES.map((e) => [e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name, e]),
);
