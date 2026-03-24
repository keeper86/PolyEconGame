import {
    agriculturalProductResourceType,
    aluminumResourceType,
    asphaltResourceType,
    beverageResourceType,
    brickResourceType,
    chemicalResourceType,
    clothingResourceType,
    coalResourceType,
    concreteResourceType,
    consumerElectronicsResourceType,
    copperOreResourceType,
    copperResourceType,
    cottonResourceType,
    crudeOilResourceType,
    dieselResourceType,
    electronicComponentResourceType,
    fabricResourceType,
    fertilizerResourceType,
    furnitureResourceType,
    gasolineResourceType,
    glassResourceType,
    ironOreResourceType,
    jetFuelResourceType,
    limestoneResourceType,
    logsResourceType,
    lubricantResourceType,
    lumberResourceType,
    machineryResourceType,
    naturalGasResourceType,
    paperResourceType,
    pesticideResourceType,
    pharmaceuticalResourceType,
    phosphateRockResourceType,
    plasticResourceType,
    potashResourceType,
    processedFoodResourceType,
    rareEarthOreResourceType,
    sandResourceType,
    steelResourceType,
    stoneResourceType,
    vehicleResourceType,
    waterResourceType,
    cementResourceType,
    bauxiteResourceType,
    clayResourceType,
} from '../planet/resources';

/**
 * Baseline market prices seeded for all resources at universe creation.
 *
 * Derived bottom-up from facility recipes: each tier's price covers
 * input costs plus a processing margin. Without these seeds, agents
 * producing unpriced goods would compute break-even ceilings based on
 * INITIAL_FOOD_PRICE=1.0, which collapses demand for upstream inputs.
 */
export const initialMarketPrices: Record<string, number> = {
    // Raw materials
    [agriculturalProductResourceType.name]: 1.0,
    [ironOreResourceType.name]: 1.0,
    [coalResourceType.name]: 1.0,
    [crudeOilResourceType.name]: 1.5,
    [naturalGasResourceType.name]: 1.5,
    [logsResourceType.name]: 1.0,
    [stoneResourceType.name]: 0.5,
    [bauxiteResourceType.name]: 0.8,
    [copperOreResourceType.name]: 1.5,
    [rareEarthOreResourceType.name]: 3.0,
    [sandResourceType.name]: 0.5,
    [limestoneResourceType.name]: 0.5,
    [clayResourceType.name]: 0.5,
    [waterResourceType.name]: 0.5,
    [phosphateRockResourceType.name]: 1.0,
    [potashResourceType.name]: 1.0,
    [cottonResourceType.name]: 1.5,
    // Tier 1 processed — recipe cost + processing margin
    [steelResourceType.name]: 3.0, // 150 iron ore + 30 coal → 100 steel
    [lumberResourceType.name]: 2.0, // 300 logs → 200 lumber
    [aluminumResourceType.name]: 4.0, // 800 bauxite → 200 aluminum
    [copperResourceType.name]: 2.5, // 120 copper ore + 20 coal → 100 copper
    [glassResourceType.name]: 1.5, // 80 sand + 20 limestone + 30 coal → 100 glass
    [cementResourceType.name]: 2.0, // 60 limestone + 15 clay + 10 coal → 50 cement
    [plasticResourceType.name]: 2.0, // oil refinery by-product
    [chemicalResourceType.name]: 2.0, // oil refinery by-product
    [gasolineResourceType.name]: 2.5, // oil refinery
    [dieselResourceType.name]: 2.5, // oil refinery
    [jetFuelResourceType.name]: 3.0, // oil refinery
    [lubricantResourceType.name]: 3.0, // oil refinery
    [asphaltResourceType.name]: 1.5, // oil refinery
    [brickResourceType.name]: 1.0, // 120 clay + 10 coal → 110 brick
    [fertilizerResourceType.name]: 2.0, // 25 natural gas + 25 phosphate → 50 fertilizer
    // Tier 2 processed
    [fabricResourceType.name]: 3.0, // 120 cotton + 30 water → 100 fabric
    [processedFoodResourceType.name]: 2.5, // 200 agri + 100 water → 150 processed food
    [beverageResourceType.name]: 1.5, // 80 water + 20 agri → 100 beverage
    [paperResourceType.name]: 2.5, // 150 logs + 50 water → 100 paper
    [pesticideResourceType.name]: 3.5, // 40 chemical → 30 pesticide
    [concreteResourceType.name]: 2.5, // 40 cement + 80 stone + 40 sand + 20 water → 100 concrete
    // Tier 3 manufactured
    [clothingResourceType.name]: 6.0, // 80 fabric + 10 plastic → 60 clothing
    [furnitureResourceType.name]: 5.0, // 100 lumber + 20 steel + 10 fabric → 100 furniture
    [electronicComponentResourceType.name]: 15.0, // 100 sand + 100 copper + 50 rare earth + 100 plastic → 80
    // Tier 4 complex manufactured
    [consumerElectronicsResourceType.name]: 15.0, // 100 electronic component + 50 plastic + 50 glass → 200
    [machineryResourceType.name]: 15.0, // 80 steel + 10 electronic component + 20 plastic → 50
    [vehicleResourceType.name]: 15.0, // 10 steel + 5 aluminum + ... → 10 vehicles
    [pharmaceuticalResourceType.name]: 50.0, // 100 agri + 80 chemical + 100 water → 10 pharma
};
