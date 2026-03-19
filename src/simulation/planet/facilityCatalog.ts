import type { ProductionFacility } from './storage';
import type { ResourceProcessLevel } from './planet';
import {
    agriculturalProductionFacility,
    aluminumSmelter,
    bauxiteMine,
    beveragePlant,
    brickFactory,
    cementPlant,
    clayMine,
    clothingFactory,
    coalMine,
    coalPowerPlant,
    concretePlant,
    consumerElectronicsFactory,
    copperMine,
    copperSmelter,
    cottonFarm,
    electronicComponentFactory,
    fertilizerPlant,
    foodProcessingPlant,
    furnitureFactory,
    glassFactory,
    ironExtractionFacility,
    ironSmelter,
    limestoneQuarry,
    loggingCamp,
    machineryFactory,
    naturalGasWell,
    oilRefinery,
    oilWell,
    paperMill,
    pesticidePlant,
    pharmaceuticalPlant,
    phosphateMine,
    potashMine,
    rareEarthMine,
    sandMine,
    sawmill,
    stoneQuarry,
    textileMill,
    vehicleFactory,
    waterExtractionFacility,
} from './facilities';

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
];

export const FACILITY_LEVELS: ResourceProcessLevel[] = ['raw', 'refined', 'manufactured', 'consumerGood'];

export const FACILITY_LEVEL_LABELS: Record<ResourceProcessLevel, string> = {
    source: 'Source',
    raw: 'Raw Extraction',
    refined: 'Refinement',
    manufactured: 'Manufacturing',
    consumerGood: 'Consumer Goods',
};

export const facilitiesByLevel: Record<ResourceProcessLevel, FacilityCatalogEntry[]> = {
    source: [],
    raw: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'raw'),
    refined: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'refined'),
    manufactured: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'manufactured'),
    consumerGood: ALL_FACILITY_ENTRIES.filter((e) => e.primaryOutputLevel === 'consumerGood'),
};
