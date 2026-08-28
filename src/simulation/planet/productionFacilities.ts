import type { ResourceProcessLevel } from './claims';
import type { Facility, ProductionFacility } from './facility';
import {
    arableLandResourceType,
    coalDepositResourceType,
    copperDepositResourceType,
    forestResourceType,
    ironOreDepositResourceType,
    limestoneDepositResourceType,
    oilReservoirResourceType,
    sandDepositResourceType,
    stoneDepositResourceType,
    waterSourceResourceType,
} from './landBoundResources';

import {
    beverageResourceType,
    cementResourceType,
    chemicalResourceType,
    clothingResourceType,
    coalResourceType,
    concreteResourceType,
    copperOreResourceType,
    copperResourceType,
    cottonResourceType,
    crudeOilResourceType,
    electronicsResourceType,
    fabricResourceType,
    fuelResourceType,
    furnitureResourceType,
    glassResourceType,
    ironOreResourceType,
    consumerElectronicsResourceType as itDevicesResourceType,
    limestoneResourceType,
    logsResourceType,
    lumberResourceType,
    machineryResourceType,
    packagingResourceType,
    paperResourceType,
    pesticideResourceType,
    pharmaceuticalResourceType,
    plasticResourceType,
    processedFoodResourceType,
    produceResourceType,
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
    maintenanceServiceResourceType,
    retailServiceResourceType,
} from './services';

const zeroLastTicksProductionResults = {
    overallEfficiency: 0,
    workerEfficiency: {},
    resourceEfficiency: {},
    overqualifiedWorkers: {},
    exactUsedByEdu: {},
    totalUsedByEdu: {},
    lastProduced: {},
    lastConsumed: {},
    revenue: 0,
    wageCosts: 0,
    inputCosts: 0,
    costBalance: 0,
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
    lastConstructionCompletedTick: 0,
    maintenanceStatus: 1,
    maxMaintenance: 1,
    cumulativeRepairAcc: 0,
    lastTickMaintenanceConsumption: 0,
    lastTickRestorationConsumption: 0,
    pidState: null,
    lastTickResults: {
        ...zeroLastTicksProductionResults,
        workerEfficiency: {},
        resourceEfficiency: {},
        overqualifiedWorkers: {},
        exactUsedByEdu: {},
        totalUsedByEdu: {},
        lastProduced: {},
        lastConsumed: {},
    },
});

const coalMine = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Coal Mine',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 10,
        primary: 30,
        secondary: 10,
        tertiary: 2,
    },
    needs: [{ resource: coalDepositResourceType, quantity: 0.5 }],
    produces: [{ resource: coalResourceType, quantity: 500 }],
});

export const oilWellName = 'Oil Well';
export const oilWell = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: oilWellName,
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 10,
        primary: 30,
        secondary: 20,
        tertiary: 5,
    },
    needs: [{ resource: oilReservoirResourceType, quantity: 0.2 }],
    produces: [{ resource: crudeOilResourceType, quantity: 200 }],
});

const loggingCamp = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Logging Camp',
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 10,
        primary: 20,
        secondary: 10,
        tertiary: 1,
    },
    needs: [{ resource: forestResourceType, quantity: 200 }],
    produces: [{ resource: logsResourceType, quantity: 200 }],
});

const stoneQuarry = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Stone Quarry',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 10,
        primary: 20,
        secondary: 10,
        tertiary: 1,
    },
    needs: [{ resource: stoneDepositResourceType, quantity: 0.2 }],
    produces: [{ resource: stoneResourceType, quantity: 200 }],
});

const copperMine = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Copper Mine',
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 10,
        primary: 20,
        secondary: 20,
        tertiary: 1,
    },
    needs: [{ resource: copperDepositResourceType, quantity: 0.2 }],
    produces: [{ resource: copperOreResourceType, quantity: 200 }],
});

const sandMine = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Sand Mine',
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 5,
        primary: 10,
        secondary: 10,
        tertiary: 0,
    },
    needs: [{ resource: sandDepositResourceType, quantity: 0.3 }],
    produces: [{ resource: sandResourceType, quantity: 300 }],
});

const limestoneQuarry = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Limestone Quarry',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 10,
        primary: 10,
        secondary: 10,
        tertiary: 0,
    },
    needs: [{ resource: limestoneDepositResourceType, quantity: 0.3 }],
    produces: [{ resource: limestoneResourceType, quantity: 300 }],
});

export const ironSmelter = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Iron Smelter',
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 5,
        primary: 30,
        secondary: 20,
        tertiary: 5,
    },
    needs: [
        { resource: ironOreResourceType, quantity: 150 },
        { resource: coalResourceType, quantity: 30 },
    ],
    produces: [{ resource: steelResourceType, quantity: 100 }],
});

const copperSmelter = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Copper Smelter',
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 5,
        primary: 30,
        secondary: 20,
        tertiary: 5,
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
        none: 5,
        primary: 20,
        secondary: 30,
        tertiary: 20,
    },
    needs: [{ resource: crudeOilResourceType, quantity: 200 }],
    produces: [
        { resource: fuelResourceType, quantity: 80 },
        { resource: plasticResourceType, quantity: 60 },
        { resource: chemicalResourceType, quantity: 60 },
    ],
});

const sawmill = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Sawmill',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 5,
        primary: 20,
        secondary: 20,
        tertiary: 1,
    },
    needs: [{ resource: logsResourceType, quantity: 300 }],
    produces: [{ resource: lumberResourceType, quantity: 200 }],
});

const cementPlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Cement Plant',
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 5,
        primary: 20,
        secondary: 10,
        tertiary: 3,
    },
    needs: [
        { resource: limestoneResourceType, quantity: 60 },
        { resource: coalResourceType, quantity: 10 },
    ],
    produces: [{ resource: cementResourceType, quantity: 50 }],
});

const concretePlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Concrete Plant',
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 5,
        primary: 20,
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

const glassFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Glass Factory',
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 5,
        primary: 15,
        secondary: 10,
        tertiary: 3,
    },
    needs: [
        { resource: sandResourceType, quantity: 150 },
        { resource: limestoneResourceType, quantity: 40 },
        { resource: chemicalResourceType, quantity: 10 },
    ],
    produces: [{ resource: glassResourceType, quantity: 100 }],
});

const pesticidePlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Pesticide Plant',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 0,
        primary: 10,
        secondary: 20,
        tertiary: 10,
    },
    needs: [
        { resource: chemicalResourceType, quantity: 60 },
        { resource: waterResourceType, quantity: 100 },
    ],
    produces: [{ resource: pesticideResourceType, quantity: 30 }],
});

const pharmaPlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Pharma Plant',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 0,
        primary: 10,
        secondary: 30,
        tertiary: 50,
    },
    needs: [
        { resource: produceResourceType, quantity: 30 },
        { resource: chemicalResourceType, quantity: 120 },
        { resource: waterResourceType, quantity: 100 },
    ],
    produces: [{ resource: pharmaceuticalResourceType, quantity: 10 }],
});

const foodProcessor = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Food Processor',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 10,
        secondary: 10,
        tertiary: 5,
    },

    needs: [
        { resource: produceResourceType, quantity: 60 },
        { resource: chemicalResourceType, quantity: 5 },
        { resource: waterResourceType, quantity: 100 },
        { resource: packagingResourceType, quantity: 2 },
    ],
    produces: [{ resource: processedFoodResourceType, quantity: 80 }],
});

const beveragePlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Beverage Plant',
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 5,
        primary: 15,
        secondary: 15,
        tertiary: 2,
    },
    needs: [
        { resource: waterResourceType, quantity: 110 },
        { resource: produceResourceType, quantity: 20 },
        { resource: chemicalResourceType, quantity: 10 },
        { resource: glassResourceType, quantity: 5 },
        { resource: packagingResourceType, quantity: 2 },
    ],
    produces: [{ resource: beverageResourceType, quantity: 100 }],
});

const paperMill = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Paper Mill',
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 5,
        primary: 20,
        secondary: 20,
        tertiary: 4,
    },
    needs: [
        { resource: logsResourceType, quantity: 150 },
        { resource: waterResourceType, quantity: 50 },
    ],
    produces: [{ resource: paperResourceType, quantity: 100 }],
});

const cottonFarm = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Cotton Farm',
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 5,
        primary: 20,
        secondary: 10,
        tertiary: 0,
    },
    needs: [
        { resource: arableLandResourceType, quantity: 200 },
        { resource: waterResourceType, quantity: 80 },
    ],
    produces: [{ resource: cottonResourceType, quantity: 100 }],
});

const textileMill = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Textile Mill',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 5,
        primary: 30,
        secondary: 30,
        tertiary: 2,
    },
    needs: [
        { resource: cottonResourceType, quantity: 120 },
        { resource: waterResourceType, quantity: 30 },
        { resource: plasticResourceType, quantity: 80 },
    ],
    produces: [{ resource: fabricResourceType, quantity: 100 }],
});

const clothingFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Clothing Factory',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 30,
        secondary: 20,
        tertiary: 5,
    },
    needs: [
        { resource: waterResourceType, quantity: 100 },
        { resource: fabricResourceType, quantity: 80 },
        { resource: chemicalResourceType, quantity: 20 },
    ],
    produces: [{ resource: clothingResourceType, quantity: 60 }],
});

const furnitureFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Furniture Factory',
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 5,
        primary: 30,
        secondary: 20,
        tertiary: 5,
    },
    needs: [
        { resource: lumberResourceType, quantity: 100 },
        { resource: steelResourceType, quantity: 20 },
        { resource: fabricResourceType, quantity: 10 },
        { resource: plasticResourceType, quantity: 30 },
    ],
    produces: [{ resource: furnitureResourceType, quantity: 50 }],
});

const siliconWaferFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Silicon Wafer Factory',
    powerConsumptionPerTick: 0.9,
    workerRequirement: {
        none: 0,
        primary: 10,
        secondary: 25,
        tertiary: 30,
    },
    needs: [
        { resource: sandResourceType, quantity: 300 },
        { resource: chemicalResourceType, quantity: 60 },
        { resource: waterResourceType, quantity: 50 },
    ],
    produces: [{ resource: siliconWaferResourceType, quantity: 80 }],
});

const electronicsFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Electronics Factory',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 0,
        primary: 10,
        secondary: 30,
        tertiary: 30,
    },
    needs: [
        { resource: siliconWaferResourceType, quantity: 40 },
        { resource: copperResourceType, quantity: 40 },
        { resource: plasticResourceType, quantity: 30 },
    ],
    produces: [{ resource: electronicsResourceType, quantity: 40 }],
});

const itDevicesFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'IT Devices Factory',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 0,
        primary: 20,
        secondary: 40,
        tertiary: 20,
    },
    needs: [
        { resource: electronicsResourceType, quantity: 20 },
        { resource: plasticResourceType, quantity: 30 },
        { resource: glassResourceType, quantity: 30 },
    ],
    produces: [{ resource: itDevicesResourceType, quantity: 20 }],
});

export const machineryFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Machinery Factory',
    powerConsumptionPerTick: 1.0,
    workerRequirement: {
        none: 5,
        primary: 30,
        secondary: 40,
        tertiary: 30,
    },
    needs: [
        { resource: steelResourceType, quantity: 90 },
        { resource: chemicalResourceType, quantity: 10 },
        { resource: plasticResourceType, quantity: 40 },
    ],
    produces: [{ resource: machineryResourceType, quantity: 40 }],
});

const vehicleFactory = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Vehicle Factory',
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 5,
        primary: 50,
        secondary: 60,
        tertiary: 20,
    },
    needs: [
        { resource: steelResourceType, quantity: 10 },
        { resource: plasticResourceType, quantity: 10 },
        { resource: glassResourceType, quantity: 2 },
        { resource: fabricResourceType, quantity: 5 },
        { resource: machineryResourceType, quantity: 10 },
    ],
    produces: [{ resource: vehicleResourceType, quantity: 10.5 }],
});

export const agriculturalFacility = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Agricultural Facility',
    powerConsumptionPerTick: 1.2,
    workerRequirement: {
        none: 10,
        primary: 25,
        secondary: 15,
        tertiary: 0,
    },
    needs: [
        { resource: arableLandResourceType, quantity: 30 },
        { resource: waterResourceType, quantity: 100 },
        { resource: pesticideResourceType, quantity: 10 },
    ],
    produces: [{ resource: produceResourceType, quantity: 120 }],
});

export const waterFacility = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Water Facility',
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 5,
        primary: 10,
        secondary: 10,
        tertiary: 0,
    },

    needs: [{ resource: waterSourceResourceType, quantity: 800 }],
    produces: [{ resource: waterResourceType, quantity: 800 }],
});

const ironMine = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Iron Mine',
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 5,
        primary: 20,
        secondary: 10,
        tertiary: 1,
    },
    needs: [{ resource: ironOreDepositResourceType, quantity: 0.4 }],
    produces: [{ resource: ironOreResourceType, quantity: 400 }],
});

const packagingPlant = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Packaging Plant',
    powerConsumptionPerTick: 0.7,
    workerRequirement: {
        none: 5,
        primary: 25,
        secondary: 20,
        tertiary: 3,
    },
    needs: [
        { resource: paperResourceType, quantity: 10 },
        { resource: plasticResourceType, quantity: 60 },
    ],
    produces: [{ resource: packagingResourceType, quantity: 40 }],
});

const administrativeCenter = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Administrative Center' as const,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 10,
        primary: 40,
        secondary: 50,
        tertiary: 30,
    },
    needs: [
        { resource: furnitureResourceType, quantity: 1 },
        { resource: itDevicesResourceType, quantity: 0.1 },
    ],
    produces: [{ resource: administrativeServiceResourceType, quantity: 300 }],
});

const logisticsHub = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Logistics Hub' as const,
    powerConsumptionPerTick: 0.2,
    workerRequirement: {
        none: 100,
        primary: 60,
        secondary: 30,
        tertiary: 10,
    },
    needs: [
        { resource: vehicleResourceType, quantity: 1 },
        { resource: fuelResourceType, quantity: 60 },
    ],
    produces: [{ resource: logisticsServiceResourceType, quantity: 300 }],
});

const constructionFacility = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Construction Facility' as const,
    powerConsumptionPerTick: 0.3,
    workerRequirement: {
        none: 30,
        primary: 50,
        secondary: 40,
        tertiary: 10,
    },
    needs: [
        { resource: concreteResourceType, quantity: 100 },
        { resource: steelResourceType, quantity: 80 },
        { resource: machineryResourceType, quantity: 15 },
    ],
    produces: [{ resource: constructionServiceResourceType, quantity: 300 }],
});

const groceryChain = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Grocery Chain' as const,
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 5,
        primary: 90,
        secondary: 60,
        tertiary: 10,
    },
    needs: [
        { resource: processedFoodResourceType, quantity: 30 },
        { resource: beverageResourceType, quantity: 20 },
    ],
    produces: [{ resource: groceryServiceResourceType, quantity: 300 }],
});

const retailChain = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Retail Chain' as const,
    powerConsumptionPerTick: 0.4,
    workerRequirement: {
        none: 10,
        primary: 80,
        secondary: 50,
        tertiary: 10,
    },
    needs: [
        { resource: itDevicesResourceType, quantity: 10 },
        { resource: clothingResourceType, quantity: 10 },
        { resource: furnitureResourceType, quantity: 10 },
    ],
    produces: [{ resource: retailServiceResourceType, quantity: 200 }],
});

const hospital = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Hospital' as const,
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 0,
        primary: 10,
        secondary: 50,
        tertiary: 90,
    },
    needs: [
        { resource: pharmaceuticalResourceType, quantity: 5 },
        { resource: chemicalResourceType, quantity: 20 },
        { resource: furnitureResourceType, quantity: 5 },
    ],
    produces: [{ resource: healthcareServiceResourceType, quantity: 200 }],
});

const educationCenter = (planetId: string, id: string): ProductionFacility => ({
    ...makeFacilityDefaults(),
    planetId,
    id,
    name: 'Education Center' as const,
    powerConsumptionPerTick: 0.6,
    workerRequirement: {
        none: 0,
        primary: 20,
        secondary: 60,
        tertiary: 120,
    },
    needs: [
        { resource: paperResourceType, quantity: 30 },
        { resource: furnitureResourceType, quantity: 5 },
    ],
    produces: [{ resource: educationServiceResourceType, quantity: 300 }],
});

const maintenanceFacility = (planetId: string, id: string): ProductionFacility => {
    return {
        ...makeFacilityDefaults(),
        planetId,
        id,
        name: 'Maintenance Facility',
        powerConsumptionPerTick: 2,
        workerRequirement: {
            none: 5,
            primary: 30,
            secondary: 60,
            tertiary: 10,
        },
        needs: [
            { resource: steelResourceType, quantity: 10 },
            { resource: electronicsResourceType, quantity: 5 },
            { resource: plasticResourceType, quantity: 10 },
        ],
        produces: [{ resource: maintenanceServiceResourceType, quantity: 100 }],
    };
};

export type FacilityFactory = (planetId: string, id: string) => ProductionFacility;

export type FacilityCatalogEntry = {
    factory: FacilityFactory;
    template: ProductionFacility;
    primaryOutputLevel: ResourceProcessLevel;
};

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

const entry = (factory: FacilityFactory): FacilityCatalogEntry => {
    const instance = factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID);
    const primaryOutput = instance.produces[0]?.resource.level;

    const primaryOutputLevel: ResourceProcessLevel =
        !primaryOutput || primaryOutput === 'source' || primaryOutput === 'currency' ? 'raw' : primaryOutput;
    return { factory, template: instance, primaryOutputLevel };
};

export const ALL_PRODUCTION_FACILITY_ENTRIES = {
    coalMine: entry(coalMine),
    oilWell: entry(oilWell),
    loggingCamp: entry(loggingCamp),
    stoneQuarry: entry(stoneQuarry),
    copperMine: entry(copperMine),
    sandMine: entry(sandMine),
    limestoneQuarry: entry(limestoneQuarry),
    cottonFarm: entry(cottonFarm),
    waterFacility: entry(waterFacility),
    ironMine: entry(ironMine),
    ironSmelter: entry(ironSmelter),
    copperSmelter: entry(copperSmelter),
    oilRefinery: entry(oilRefinery),
    sawmill: entry(sawmill),
    cementPlant: entry(cementPlant),
    glassFactory: entry(glassFactory),
    pesticidePlant: entry(pesticidePlant),
    paperMill: entry(paperMill),
    textileMill: entry(textileMill),
    concretePlant: entry(concretePlant),
    foodProcessor: entry(foodProcessor),
    beveragePlant: entry(beveragePlant),
    pharmaPlant: entry(pharmaPlant),
    clothingFactory: entry(clothingFactory),
    furnitureFactory: entry(furnitureFactory),
    electronicsFactory: entry(electronicsFactory),
    itDevicesFactory: entry(itDevicesFactory),
    machineryFactory: entry(machineryFactory),
    vehicleFactory: entry(vehicleFactory),
    agriculturalFacility: entry(agriculturalFacility),
    packagingPlant: entry(packagingPlant),
    administrativeCenter: entry(administrativeCenter),
    logisticsHub: entry(logisticsHub),
    constructionFacility: entry(constructionFacility),
    groceryChain: entry(groceryChain),
    retailChain: entry(retailChain),
    hospital: entry(hospital),
    educationCenter: entry(educationCenter),
    siliconWaferFactory: entry(siliconWaferFactory),
    maintenanceFacility: entry(maintenanceFacility),
} as const;

export type FacilityType = keyof typeof ALL_PRODUCTION_FACILITY_ENTRIES;
export const FACILITY_LEVELS: ResourceProcessLevel[] = ['raw', 'refined', 'manufactured', 'services'] as const;
export const FACILITY_LEVEL_LABELS: Record<ResourceProcessLevel, string> = {
    raw: 'Raw Extraction',
    refined: 'Refinement',
    manufactured: 'Manufacturing',
    services: 'Services',
    internal: 'Internal',
};
export const neededWorkersByFacility: (facility: Facility) => number = (facility) => {
    return (
        facility.scale *
        ((facility.workerRequirement.none ?? 0) +
            (facility.workerRequirement.primary ?? 0) +
            (facility.workerRequirement.secondary ?? 0) +
            (facility.workerRequirement.tertiary ?? 0))
    );
};

const allFacilityEntries = Object.values(ALL_PRODUCTION_FACILITY_ENTRIES);
export const facilitiesByLevel: Record<ResourceProcessLevel, FacilityCatalogEntry[]> = {
    raw: allFacilityEntries.filter((e) => e.primaryOutputLevel === 'raw'),
    refined: allFacilityEntries.filter((e) => e.primaryOutputLevel === 'refined'),
    manufactured: allFacilityEntries.filter((e) => e.primaryOutputLevel === 'manufactured'),
    services: allFacilityEntries.filter((e) => e.primaryOutputLevel === 'services'),
    internal: allFacilityEntries.filter((e) => e.primaryOutputLevel === 'internal'),
};

export const facilityByName: ReadonlyMap<string, FacilityCatalogEntry> = new Map(
    allFacilityEntries.map((e) => [e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name, e]),
);
