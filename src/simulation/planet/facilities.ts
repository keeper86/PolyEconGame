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
    asphaltResourceType,
    beverageResourceType,
    brickResourceType,
    cementResourceType,
    clothingResourceType,
    concreteResourceType,
    consumerElectronicsResourceType,
    copperResourceType,
    cottonResourceType,
    dieselResourceType,
    electronicComponentResourceType,
    fabricResourceType,
    fertilizerResourceType,
    furnitureResourceType,
    gasolineResourceType,
    glassResourceType,
    ironOreResourceType,
    jetFuelResourceType,
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
} from './resources';
import type { ProductionFacility } from './storage';

const zeroLastTicksResults = {
    overallEfficiency: 0,
    workerEfficiency: {},
    resourceEfficiency: {},
    overqualifiedWorkers: {},
    exactUsedByEdu: {},
    totalUsedByEdu: {},
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.00005,
        soil: 0.0002,
    },
    needs: [{ resource: coalDepositResourceType, quantity: 1000 }],
    produces: [{ resource: coalResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.00005,
        water: 0.0002,
        soil: 0.0001,
    },
    needs: [{ resource: oilReservoirResourceType, quantity: 1000 }],
    produces: [{ resource: crudeOilResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.00002,
        water: 0.00001,
        soil: 0.00001,
    },
    needs: [{ resource: naturalGasFieldResourceType, quantity: 1000 }],
    produces: [{ resource: naturalGasResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.00001,
        water: 0.0001,
        soil: 0.00005,
    },
    needs: [{ resource: forestResourceType, quantity: 600 }],
    produces: [{ resource: logsResourceType, quantity: 600 }],
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.00002,
        soil: 0.0001,
    },
    needs: [{ resource: stoneQuarryResourceType, quantity: 500 }],
    produces: [{ resource: stoneResourceType, quantity: 500 }],
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.0001,
        soil: 0.0002,
    },
    needs: [{ resource: bauxiteDepositResourceType, quantity: 500 }],
    produces: [{ resource: bauxiteResourceType, quantity: 500 }],
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
    pollutionPerTick: {
        air: 0.00015,
        water: 0.0002,
        soil: 0.00025,
    },
    needs: [{ resource: copperDepositResourceType, quantity: 500 }],
    produces: [{ resource: copperOreResourceType, quantity: 500 }],
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
    pollutionPerTick: {
        air: 0.0002,
        water: 0.0003,
        soil: 0.0003,
    },
    needs: [{ resource: rareEarthDepositResourceType, quantity: 1000 }],
    produces: [{ resource: rareEarthOreResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.00005,
        water: 0.00002,
        soil: 0.0001,
    },
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.00002,
        soil: 0.0001,
    },
    needs: [{ resource: limestoneDepositResourceType, quantity: 600 }],
    produces: [{ resource: limestoneResourceType, quantity: 600 }],
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
    pollutionPerTick: {
        air: 0.00005,
        water: 0.00005,
        soil: 0.00015,
    },
    needs: [{ resource: clayDepositResourceType, quantity: 1000 }],
    produces: [{ resource: clayResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.0005,
        water: 0.0002,
        soil: 0.0001,
    },
    needs: [
        { resource: ironOreResourceType, quantity: 650 },
        { resource: coalResourceType, quantity: 150 },
    ],
    produces: [{ resource: steelResourceType, quantity: 500 }],
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.0001,
        soil: 0.0002,
    },
    needs: [{ resource: phosphateRockDepositResourceType, quantity: 750 }],
    produces: [{ resource: phosphateRockResourceType, quantity: 750 }],
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
    pollutionPerTick: {
        air: 0.00005,
        water: 0.00005,
        soil: 0.0001,
    },
    needs: [{ resource: potashDepositResourceType, quantity: 1000 }],
    produces: [{ resource: potashResourceType, quantity: 1000 }],
    lastTickResults: { ...zeroLastTicksResults },
});

export const aluminumSmelter = (planetId: string, id: string): ProductionFacility => ({
    planetId,
    id,
    name: 'Aluminum Smelter',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 2.0, // very power-intensive
    workerRequirement: {
        none: 10,
        primary: 25,
        secondary: 18,
        tertiary: 2,
    },
    pollutionPerTick: {
        air: 0.0003,
        water: 0.0001,
        soil: 0.00005,
    },
    needs: [{ resource: bauxiteResourceType, quantity: 2000 }],
    produces: [{ resource: aluminumResourceType, quantity: 500 }],
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
    pollutionPerTick: {
        air: 0.0004,
        water: 0.0002,
        soil: 0.0001,
    },
    needs: [
        { resource: copperOreResourceType, quantity: 1200 },
        { resource: coalResourceType, quantity: 200 },
    ],
    produces: [{ resource: copperResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.0006,
        water: 0.0004,
        soil: 0.0002,
    },
    needs: [{ resource: crudeOilResourceType, quantity: 2000 }],
    produces: [
        { resource: gasolineResourceType, quantity: 600 },
        { resource: dieselResourceType, quantity: 400 },
        { resource: jetFuelResourceType, quantity: 200 },
        { resource: lubricantResourceType, quantity: 100 },
        { resource: asphaltResourceType, quantity: 300 },
        { resource: plasticResourceType, quantity: 200 },
        { resource: chemicalResourceType, quantity: 200 },
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.00005,
        soil: 0.00002,
    },
    needs: [{ resource: logsResourceType, quantity: 750 }],
    produces: [{ resource: lumberResourceType, quantity: 500 }],
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
    pollutionPerTick: {
        air: 0.0004,
        water: 0.0001,
        soil: 0.00005,
    },
    needs: [
        { resource: limestoneResourceType, quantity: 600 },
        { resource: clayResourceType, quantity: 150 },
        { resource: coalResourceType, quantity: 100 },
    ],
    produces: [{ resource: cementResourceType, quantity: 500 }],
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.00005,
        soil: 0.00002,
    },
    needs: [
        { resource: cementResourceType, quantity: 400 },
        { resource: stoneResourceType, quantity: 800 },
        { resource: sandResourceType, quantity: 400 },
        { resource: waterResourceType, quantity: 200 },
    ],
    produces: [{ resource: concreteResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.0002,
        water: 0.00002,
        soil: 0.00001,
    },
    needs: [
        { resource: clayResourceType, quantity: 1200 },
        { resource: coalResourceType, quantity: 100 },
    ],
    produces: [{ resource: brickResourceType, quantity: 1100 }],
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
    pollutionPerTick: {
        air: 0.0003,
        water: 0.0001,
        soil: 0.00002,
    },
    needs: [
        { resource: sandResourceType, quantity: 800 },
        { resource: limestoneResourceType, quantity: 200 },
        { resource: coalResourceType, quantity: 300 },
    ],
    produces: [{ resource: glassResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.0002,
        water: 0.0003,
        soil: 0.0001,
    },
    needs: [
        { resource: naturalGasResourceType, quantity: 250 },
        { resource: phosphateRockResourceType, quantity: 250 },
    ],
    produces: [{ resource: fertilizerResourceType, quantity: 500 }],
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
    pollutionPerTick: {
        air: 0.0003,
        water: 0.0004,
        soil: 0.0002,
    },
    needs: [
        { resource: chemicalResourceType, quantity: 400 }, // we don't have generic chemicals; maybe add later
    ],
    produces: [{ resource: pesticideResourceType, quantity: 300 }],
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.0002,
        soil: 0.00005,
    },
    needs: [
        { resource: agriculturalProductResourceType, quantity: 200 },
        { resource: chemicalResourceType, quantity: 300 },
        { resource: waterResourceType, quantity: 200 },
    ],
    produces: [{ resource: pharmaceuticalResourceType, quantity: 100 }], // in boxes
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
    pollutionPerTick: {
        air: 0.00005,
        water: 0.0001,
        soil: 0.00002,
    },
    needs: [
        { resource: agriculturalProductResourceType, quantity: 1200 },
        { resource: waterResourceType, quantity: 500 },
    ],
    produces: [{ resource: processedFoodResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.00002,
        water: 0.0001,
        soil: 0.00001,
    },
    needs: [
        { resource: waterResourceType, quantity: 800 },
        { resource: agriculturalProductResourceType, quantity: 200 },
    ],
    produces: [{ resource: beverageResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.0002,
        water: 0.0003,
        soil: 0.00005,
    },
    needs: [
        { resource: logsResourceType, quantity: 1500 },
        { resource: waterResourceType, quantity: 500 },
    ],
    produces: [{ resource: paperResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.00002,
        water: 0.0001,
        soil: 0.00005,
    },
    needs: [
        { resource: arableLandResourceType, quantity: 1000 },
        { resource: waterResourceType, quantity: 800 },
    ],
    produces: [{ resource: cottonResourceType, quantity: 200 }],
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.0002,
        soil: 0.00002,
    },
    needs: [
        { resource: cottonResourceType, quantity: 1200 },
        { resource: waterResourceType, quantity: 300 },
    ],
    produces: [{ resource: fabricResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.00005,
        water: 0.0001,
        soil: 0.00001,
    },
    needs: [
        { resource: fabricResourceType, quantity: 800 },
        { resource: plasticResourceType, quantity: 100 },
    ],
    produces: [{ resource: clothingResourceType, quantity: 5000 }], // pieces
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.00005,
        soil: 0.00002,
    },
    needs: [
        { resource: lumberResourceType, quantity: 600 },
        { resource: steelResourceType, quantity: 200 },
        { resource: fabricResourceType, quantity: 100 },
    ],
    produces: [{ resource: furnitureResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.0002,
        soil: 0.00005,
    },
    needs: [
        { resource: sandResourceType, quantity: 500 }, // for silicon
        { resource: copperResourceType, quantity: 200 },
        { resource: rareEarthOreResourceType, quantity: 50 },
        { resource: plasticResourceType, quantity: 300 },
    ],
    produces: [{ resource: electronicComponentResourceType, quantity: 100000 }], // many components
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
    pollutionPerTick: {
        air: 0.0001,
        water: 0.0001,
        soil: 0.00002,
    },
    needs: [
        { resource: electronicComponentResourceType, quantity: 5000 },
        { resource: plasticResourceType, quantity: 400 },
        { resource: glassResourceType, quantity: 100 },
        { resource: copperResourceType, quantity: 50 },
    ],
    produces: [{ resource: consumerElectronicsResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.0002,
        water: 0.0001,
        soil: 0.00005,
    },
    needs: [
        { resource: steelResourceType, quantity: 800 },
        { resource: electronicComponentResourceType, quantity: 2000 },
        { resource: plasticResourceType, quantity: 200 },
    ],
    produces: [{ resource: machineryResourceType, quantity: 150 }],
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
    pollutionPerTick: {
        air: 0.0003,
        water: 0.0002,
        soil: 0.0001,
    },
    needs: [
        { resource: steelResourceType, quantity: 1000 },
        { resource: plasticResourceType, quantity: 300 },
        { resource: glassResourceType, quantity: 100 },
        { resource: electronicComponentResourceType, quantity: 3000 },
        { resource: fabricResourceType, quantity: 100 },
    ],
    produces: [{ resource: vehicleResourceType, quantity: 100 }],
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
        none: 8,
        primary: 5,
        secondary: 2,
        tertiary: 0,
    },
    pollutionPerTick: {
        air: 0.00001,
        water: 0.00001,
        soil: 0.00001,
    },
    needs: [
        { resource: waterResourceType, quantity: 300 },
        { resource: arableLandResourceType, quantity: 500 },
    ],
    produces: [{ resource: agriculturalProductResourceType, quantity: 500 }],
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
        none: 4,
        primary: 2,
        secondary: 0,
        tertiary: 0,
    },
    pollutionPerTick: {
        air: 0.00000005,
        water: 0.00001,
        soil: 0.00000001,
    },
    needs: [{ resource: waterSourceResourceType, quantity: 1000 }],
    produces: [{ resource: waterResourceType, quantity: 1000 }],
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
    pollutionPerTick: {
        air: 0.000001,
        water: 0.00001,
        soil: 0.000001,
    },
    needs: [{ resource: ironOreDepositResourceType, quantity: 500 }],
    produces: [{ resource: ironOreResourceType, quantity: 500 }],
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
    pollutionPerTick: {
        air: 0.0005,
        water: 0.0002,
        soil: 0.0001,
    },
    needs: [{ resource: coalResourceType, quantity: 40 }],
    produces: [],
});

export const facilityMap = {
    coalMine,
    oilWell,
    naturalGasWell,
    loggingCamp,
    stoneQuarry,
    bauxiteMine,
    copperMine,
    rareEarthMine,
    sandMine,
    limestoneQuarry,
    clayMine,
    ironSmelter,
    phosphateMine,
    potashMine,
    aluminumSmelter,
    copperSmelter,
    oilRefinery,
    sawmill,
    cementPlant,
    concretePlant,
    brickFactory,
    glassFactory,
    fertilizerPlant,
    pesticidePlant,
    pharmaceuticalPlant,
    foodProcessingPlant,
    beveragePlant,
    paperMill,
    cottonFarm,
    textileMill,
    clothingFactory,
    furnitureFactory,
    electronicComponentFactory,
    consumerElectronicsFactory,
    machineryFactory,
    vehicleFactory,
    agriculturalProductionFacility,
    waterExtractionFacility,
    ironExtractionFacility,
    coalPowerPlant, // added power plant
} as const;
