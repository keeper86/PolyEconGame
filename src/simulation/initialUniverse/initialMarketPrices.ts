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
} from '../planet/resources';
import {
    administrativeServiceResourceType,
    constructionServiceResourceType,
    educationServiceResourceType,
    groceryServiceResourceType,
    healthcareServiceResourceType,
    logisticsServiceResourceType,
    maintenanceServiceResourceType,
    retailServiceResourceType,
} from '../planet/services';

const baselineFactor = 10;
export const initialMarketPrices: Record<string, number> = {
    // Raw materials
    [agriculturalProductResourceType.name]: 1.0 * baselineFactor,
    [ironOreResourceType.name]: 1.0 * baselineFactor,
    [coalResourceType.name]: 1.0 * baselineFactor,
    [crudeOilResourceType.name]: 1.5 * baselineFactor,
    [logsResourceType.name]: 1.0 * baselineFactor,
    [stoneResourceType.name]: 0.5 * baselineFactor,
    [copperOreResourceType.name]: 1.5 * baselineFactor,
    [sandResourceType.name]: 0.5 * baselineFactor,
    [limestoneResourceType.name]: 0.5 * baselineFactor,
    [clayResourceType.name]: 0.5 * baselineFactor,
    [waterResourceType.name]: 0.5 * baselineFactor,
    [cottonResourceType.name]: 1.5 * baselineFactor,
    // Tier 1 processed — recipe cost + processing margin
    [steelResourceType.name]: 3.0 * baselineFactor, // 150 iron ore + 30 coal → 100 steel
    [lumberResourceType.name]: 2.0 * baselineFactor, // 300 logs → 200 lumber
    [copperResourceType.name]: 2.5 * baselineFactor, // 120 copper ore + 20 coal → 100 copper
    [glassResourceType.name]: 1.5 * baselineFactor, // 80 sand + 20 limestone + 30 coal → 100 glass
    [cementResourceType.name]: 2.0 * baselineFactor, // 60 limestone + 15 clay + 10 coal → 50 cement
    [plasticResourceType.name]: 2.0 * baselineFactor, // oil refinery by-product
    [chemicalResourceType.name]: 2.0 * baselineFactor, // oil refinery by-product
    [fuelResourceType.name]: 2.5 * baselineFactor, // oil refinery    // Tier 2 processed
    [fabricResourceType.name]: 3.0 * baselineFactor, // 120 cotton + 30 water → 100 fabric
    [processedFoodResourceType.name]: 2.5 * baselineFactor, // 200 agri + 100 water → 150 processed food
    [beverageResourceType.name]: 1.5 * baselineFactor, // 80 water + 20 agri → 100 beverage
    [paperResourceType.name]: 2.5 * baselineFactor, // 150 logs + 50 water → 100 paper
    [pesticideResourceType.name]: 3.5 * baselineFactor, // 40 chemical → 30 pesticide
    [concreteResourceType.name]: 2.5 * baselineFactor, // 40 cement + 80 stone + 40 sand + 20 water → 100 concrete
    [siliconWaferResourceType.name]: 5.0 * baselineFactor, // 100 sand + 50 coal → 20 silicon wafer
    [packagingResourceType.name]: 2.0 * baselineFactor, // 50 paper + 20 plastic → 100 packaging
    // Tier 3 manufactured
    [clothingResourceType.name]: 6.0 * baselineFactor, // 80 fabric + 10 plastic → 60 clothing
    [furnitureResourceType.name]: 5.0 * baselineFactor, // 100 lumber + 20 steel + 10 fabric → 100 furniture
    [electronicComponentResourceType.name]: 15.0 * baselineFactor, // 100 sand + 100 copper + 50 rare earth + 100 plastic → 80
    [consumerElectronicsResourceType.name]: 15.0 * baselineFactor, // 100 electronic component + 50 plastic + 50 glass → 200
    [machineryResourceType.name]: 15.0 * baselineFactor, // 80 steel + 10 electronic component + 20 plastic → 50
    [vehicleResourceType.name]: 30.0 * baselineFactor, // 10 steel + 5 aluminum + ... → 10 vehicles
    [pharmaceuticalResourceType.name]: 20.0 * baselineFactor, // 100 agri + 80 chemical + 100 water → 10 pharma
    // Tier 4 services
    [groceryServiceResourceType.name]: 1.0 * baselineFactor,
    [healthcareServiceResourceType.name]: 1.0 * baselineFactor,
    [administrativeServiceResourceType.name]: 1.0 * baselineFactor,
    [logisticsServiceResourceType.name]: 1.0 * baselineFactor,
    [retailServiceResourceType.name]: 1.0 * baselineFactor,
    [constructionServiceResourceType.name]: 1.0 * baselineFactor,
    [educationServiceResourceType.name]: 1.0 * baselineFactor,
    [maintenanceServiceResourceType.name]: 1.0 * baselineFactor,
};
