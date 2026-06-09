import {
    administrativeCenter,
    beveragePlant,
    cementPlant,
    clayMine,
    clothingFactory,
    coalMine,
    coalPowerPlant,
    concretePlant,
    constructionFacility,
    consumerElectronicsFactory,
    copperMine,
    copperSmelter,
    cottonFarm,
    electronicComponentFactory,
    foodProcessingPlant,
    furnitureFactory,
    glassFactory,
    groceryChain,
    hospital,
    intensiveFarmFacility,
    ironExtractionFacility,
    ironSmelter,
    limestoneQuarry,
    loggingCamp,
    logisticsHub,
    machineryFactory,
    oilRefinery,
    oilWell,
    packagingPlant,
    paperMill,
    pesticidePlant,
    pharmaceuticalPlant,
    retailChain,
    sandMine,
    sawmill,
    siliconWaferFactory,
    stoneQuarry,
    textileMill,
    educationCenter,
    vehicleFactory,
    waterExtractionFacility,
} from '../planet/productionFacilities';
import {
    arableLandResourceType,
    clayDepositResourceType,
    coalDepositResourceType,
    copperDepositResourceType,
    forestResourceType,
    ironOreDepositResourceType,
    limestoneDepositResourceType,
    oilReservoirResourceType,
    sandDepositResourceType,
    stoneDepositResourceType,
    waterSourceResourceType,
} from '../planet/landBoundResources';
import type { Agent, Planet } from '../planet/planet';
import type { ProductionFacility } from '../planet/facility';
import type { ResourceClaimEntry } from './helpers';
import { createPopulation, makeAgent, makeDefaultEnvironment, makeStorage } from './helpers';
import { initialMarketPrices } from './initialMarketPrices';
import { makeClaim, makeUnclaimedRemainder } from './resourceClaimFactory';

export const PROC_PLANET_ID = 'earth';
const GOV = 'earth-government';

const TOTAL_ARABLE = 2_500_000_000;
const TOTAL_WATER = 2_000_000_000;
const TOTAL_IRON_ORE = 5_000_000_000_000;
const TOTAL_COAL = 4_000_000_000_000;
const TOTAL_OIL = 3_000_000_000_000;
const TOTAL_FOREST = 200_000_000_000;
const TOTAL_COPPER = 1_000_500_000_000;
const TOTAL_SAND = 2_000_000_000_000;
const TOTAL_LIMESTONE = 3_000_000_000_000;
const TOTAL_CLAY = 2_000_000_000_000;
const TOTAL_STONE = 4_000_000_000_000;

function splitScale(total: number, count: number, seed: string): number[] {
    let s = 0;
    for (let i = 0; i < seed.length; i++) {
        s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const rand = () => {
        s = (1664525 * s + 1013904223) >>> 0;
        return s / 0x1_0000_0000;
    };

    const weights = Array.from({ length: count }, () => 0.5 + rand());
    const wSum = weights.reduce((a, b) => a + b, 0);

    const intTotal = Math.round(total);
    let remaining = intTotal;
    const shares: number[] = [];
    for (let i = 0; i < count; i++) {
        if (i === count - 1) {
            shares.push(remaining);
        } else {
            const share = Math.max(1, Math.round((weights[i] / wSum) * intTotal));
            shares.push(share);
            remaining -= share;
        }
    }
    return shares;
}

interface FacilityTarget {
    totalScale: number;
    agentCount: number;
}

const TARGETS: Record<string, FacilityTarget> = {
    coalMine: { totalScale: 64_546, agentCount: 3 },
    oilWell: { totalScale: 781_908, agentCount: 4 },
    loggingCamp: { totalScale: 422_917, agentCount: 4 },
    stoneQuarry: { totalScale: 160_000, agentCount: 3 },
    copperMine: { totalScale: 53_516, agentCount: 3 },
    sandMine: { totalScale: 400_922, agentCount: 3 },
    limestoneQuarry: { totalScale: 145_818, agentCount: 3 },
    clayMine: { totalScale: 24_000, agentCount: 3 },
    cottonFarm: { totalScale: 983_157, agentCount: 4 },
    waterExtractionFacility: { totalScale: 381_115, agentCount: 4 },
    ironExtractionFacility: { totalScale: 242_191, agentCount: 4 },
    coalPowerPlant: { totalScale: 73_244, agentCount: 4 },
    ironSmelter: { totalScale: 645_843, agentCount: 4 },
    copperSmelter: { totalScale: 178_386, agentCount: 3 },
    oilRefinery: { totalScale: 1_172_862, agentCount: 4 },
    sawmill: { totalScale: 533_333, agentCount: 4 },
    cementPlant: { totalScale: 640_000, agentCount: 4 },
    glassFactory: { totalScale: 267_275, agentCount: 3 },
    pesticidePlant: { totalScale: 248_025, agentCount: 3 },
    paperMill: { totalScale: 61_111, agentCount: 3 },
    textileMill: { totalScale: 819_297, agentCount: 4 },
    concretePlant: { totalScale: 800_000, agentCount: 4 },
    foodProcessingPlant: { totalScale: 1_000_000, agentCount: 4 },
    beveragePlant: { totalScale: 466_667, agentCount: 3 },
    pharmaceuticalPlant: { totalScale: 277_778, agentCount: 3 },
    clothingFactory: { totalScale: 888_889, agentCount: 4 },
    furnitureFactory: { totalScale: 1_066_667, agentCount: 4 },
    electronicComponentFactory: { totalScale: 445_964, agentCount: 3 },
    consumerElectronicsFactory: { totalScale: 888_889, agentCount: 4 },
    machineryFactory: { totalScale: 32_745, agentCount: 2 },
    vehicleFactory: { totalScale: 30_392, agentCount: 2 },
    intensiveFarmFacility: { totalScale: 724_074, agentCount: 4 },
    packagingPlant: { totalScale: 1_611_111, agentCount: 4 },
    administrativeCenter: { totalScale: 2_132_889, agentCount: 4 },
    logisticsHub: { totalScale: 3_191_111, agentCount: 4 },
    constructionService: { totalScale: 1_333_333, agentCount: 4 },
    groceryChain: { totalScale: 1_833_333, agentCount: 6 },
    retailChain: { totalScale: 1_777_778, agentCount: 4 },
    hospital: { totalScale: 1_488_889, agentCount: 4 },
    siliconWaferFactory: { totalScale: 222_982, agentCount: 4 },
};

const NAMES: Record<string, string[]> = {
    tankerTransport: [],
    coalMine: [
        'Blackrock Coal Co',
        'Carbon Energy Group',
        'Deep Seam Coal',
        'Anthracite Mining Corp',
        'Coalfield Ventures',
        'Northern Seam Ltd',
    ],
    oilWell: [
        'PetroGlobal Corp',
        'Continental Oil Inc',
        'North Sea Energy',
        'Gulf Petroleum Ltd',
        'Arctic Oil Co',
        'Pacific Offshore Inc',
        'Deep Horizon Oil',
        'Inland Petroleum Corp',
        'Delta Oil & Gas',
        'Caspian Energy Group',
        'Sahara Petroleum',
        'Borealis Oil Ltd',
        'Global Gas Corp',
        'NordicGas Ltd',
        'Meridian Natural Gas',
        'Caspian Gas Ventures',
        'Southern Fields Gas',
        'ArcticGas Consortium',
    ],
    loggingCamp: [
        'Great Northern Timber',
        'Pacific Lumber Co',
        'Boreal Wood Products',
        'Tropical Forest Co',
        'Redwood Harvesting',
        'Nordic Forestry Ltd',
        'Taiga Timber Corp',
        'Hardwood Estates',
        'Evergreen Logging Inc',
        'Cedar Ridge Timber',
    ],
    stoneQuarry: [
        'Granite Quarrying Corp',
        'Basalt Rock Corp',
        'Alpine Stone Ltd',
        'Continental Quarries',
        'Bedrock Mining Co',
        'Mesa Stone Corp',
    ],
    copperMine: [
        'Copper Basin Mining',
        'Pacific Copper Co',
        'Andean Copper Mines',
        'Red Dragon Minerals',
        'Atlas Copper Ltd',
    ],
    sandMine: [
        'Desert Sand Corp',
        'Sahara Sand Co',
        'Coastal Aggregates Ltd',
        'Riviera Minerals',
        'Golden Dunes Mining',
        'Silica Resources Corp',
    ],
    limestoneQuarry: [
        'Alpine Stone Corp',
        'Karst Quarry Co',
        'Coral Rock Mining',
        'White Cliffs Materials',
        'Limestone Dynamics Ltd',
    ],
    clayMine: ['Delta Clay Mining', 'Plains Clay Corp', 'Red Earth Clay Ltd'],
    cottonFarm: [
        'Cotton World Corp',
        'Textile Fields Ltd',
        'Delta Cotton Farms',
        'Southern Plains Cotton',
        'Nile Cotton Co',
        'Indus Valley Textiles',
        'Cotton Empire Inc',
        'Prairie Fiber Corp',
        'Sun Belt Cotton',
        'Golden Fleece Farms',
    ],
    waterExtractionFacility: [
        'AquaGlobal Corp',
        'Pure Water Inc',
        'H2O Ventures',
        'Continental Water Corp',
        'Blue Ocean Utilities',
        'Fresh Source Ltd',
        'AquaTech Corp',
        'Hydro Systems Inc',
        'Clearwater Utilities',
        'Riviera Water Co',
    ],
    ironExtractionFacility: [
        'Ironworks Global',
        'Deep Core Mining',
        'Red Earth Mines',
        'Steel Source Co',
        'Iron Ridge Corp',
        'Magnetite Mining Inc',
        'Ferrum Extraction Ltd',
        'Highland Iron Co',
        'Ore Masters Corp',
        'Taconite Mining Inc',
    ],
    coalPowerPlant: [
        'PowerGen Corp',
        'National Energy Ltd',
        'Continental Power Inc',
        'Grid Masters Corp',
        'Atlas Energy Group',
        'Volt Systems Ltd',
        'MegaWatt Corp',
        'Ampere Power Co',
        'Kilowatt Energy Inc',
        'ThermalPower Ltd',
    ],
    ironSmelter: [
        'Atlas Steel Works',
        'Meridian Steel Corp',
        'Nova Metals Group',
        'Forge Masters Inc',
        'Titan Steel Ltd',
        'Vulcan Metals Corp',
        'Ironclad Industries',
        'Red Forge Co',
        'Steel Dynamics Ltd',
        'Molten Steel Corp',
        'Crucible Metals Inc',
        'Alloy Masters Ltd',
    ],
    copperSmelter: [
        'World Copper Smelting',
        'Pacific Metals Corp',
        'Copper Dynamics Ltd',
        'Electro Metals Inc',
        'Conductive Corp',
        'Cathode Masters Ltd',
        'Refining Ventures',
        'Bronze Age Metals',
        'Copper Ridge Corp',
        'AlloyCraft Inc',
    ],
    oilRefinery: [
        'Horizon Refinery Corp',
        'Global Petrochemicals',
        'Coastal Refining Ltd',
        'Inland Refinery Co',
        'Continental Petrochem',
        'NorthWest Refining',
        'Gulf Coast Refineries',
        'Pacific Derivatives Corp',
        'Midland Refinery Group',
        'TarSands Processing',
        'HydroCarbon Corp',
        'Distillation Masters Ltd',
    ],
    sawmill: [
        'Global Sawmills Corp',
        'Timber Products Co',
        'Pacific Milling Inc',
        'Hardwood Processing Ltd',
        'Lumber Masters Corp',
        'Northern Mills Ltd',
        'Forest Products Inc',
        'Cedar Milling Co',
        'Pine Ridge Sawmill',
        'Boreal Processing Ltd',
        'Timberline Corp',
        'Woodland Milling Inc',
    ],
    cementPlant: [
        'Cement Giant Corp',
        'Continental Cement',
        'Urban Concrete Inc',
        'Grey Stone Corp',
        'Portland Cement Ltd',
        'Clinker Corp',
        'Building Stone Inc',
        'Pacific Cement Co',
        'Alpine Cement Ltd',
        'MegaMix Corp',
        'Foundation Materials Inc',
        'Bridge Cement Ltd',
    ],
    glassFactory: [
        'Glass World Ltd',
        'Crystal Dynamics Corp',
        'Clear Vision Glass',
        'Silicon Glass Inc',
        'Glazing Solutions Corp',
        'Optical Glass Ltd',
        'Continental Glass Corp',
        'Palace Glass Inc',
        'ArcticGlass Ltd',
        'Flint Glass Corp',
    ],
    pesticidePlant: ['GreenChem Ltd', 'CropGuard Corp', 'BioShield Chemicals', 'Field Protect Inc', 'AgriDefense Ltd'],
    paperMill: [
        'Paper World Inc',
        'Northern Paper Mills',
        'Pacific Pulp Corp',
        'Newsprint Dynamics',
        'Cellulose Masters Ltd',
    ],
    textileMill: [
        'Global Textiles Inc',
        'FiberCraft Corp',
        'Woven World Ltd',
        'Continental Fabric Corp',
        'Loom Masters Inc',
        'Thread & Fiber Co',
        'Pacific Weaving Corp',
        'Spinning Technologies Ltd',
        'Mill Stream Corp',
        'Fiber Dynamics Inc',
        'Eastern Textiles Ltd',
        'Yarn Masters Corp',
    ],
    concretePlant: [
        'Concrete Giant Corp',
        'Urban Materials Inc',
        'Stone Age Building',
        'MixMaster Corp',
        'Aggregate Solutions Ltd',
        'Foundation Corp',
        'Structural Mix Inc',
        'Precast Dynamics',
        'ReadyMix Co',
        'ConcreteTech Ltd',
        'Block & Slab Corp',
        'Paving Masters Inc',
    ],
    foodProcessingPlant: [
        'World Foods Corp',
        'Continental Food Inc',
        'Pacific Provisions Ltd',
        'Harvest Processing Corp',
        'FoodTech Inc',
        'Nourish Corp',
        'Global Provisions Ltd',
        'Ready Meals Corp',
        'Processed Foods Inc',
        'Canned Goods Corp',
        'FoodChain Ltd',
        'Nutrition Masters Inc',
    ],
    beveragePlant: [
        'Beverage Planet Inc',
        'Freshdrink Co',
        'ThirstQuench Corp',
        'LiquidRefresh Ltd',
        'Bottle Factory Corp',
        'DrinkWorks Inc',
        'H2O Plus Corp',
        'Sunrise Beverages',
        'Pacific Drinks Ltd',
        'Continental Beverages Corp',
    ],
    pharmaceuticalPlant: [
        'PharmaGlobal Corp',
        'MedLife Corp',
        'BioSynth Inc',
        'CureAll Pharmaceuticals',
        'Remedy Corp',
        'HealTech Ltd',
        'Compound Dynamics',
        'Generic Meds Inc',
        'Research Pharma Corp',
        'Vital Drugs Ltd',
    ],
    clothingFactory: [
        'Fashion World Ltd',
        'Garment Masters Corp',
        'Global Apparel Inc',
        'ThreadWorks Ltd',
        'StitchRight Corp',
        'ClothCraft Inc',
        'WearTech Corp',
        'StyleMakers Ltd',
        'Fabric Arts Corp',
        'Couture Industries Inc',
        'Ready-to-Wear Corp',
        'Drape & Stitch Ltd',
    ],
    furnitureFactory: [
        'Home Furnishings Corp',
        'Woodcraft International',
        'LivingSpace Corp',
        'HomeWorks Ltd',
        'Comfort Furniture Inc',
        'Nordic Design Corp',
        'Wooden Dreams Ltd',
        'Casa Furniture Inc',
        'GoodHome Corp',
        'Modern Furnishings Ltd',
        'Classic Wood Corp',
        'Interior Masters Inc',
    ],
    electronicComponentFactory: [
        'Silicon Dynamics Corp',
        'Global Electronics Inc',
        'Circuit World Ltd',
        'Component Masters Corp',
        'PCB Dynamics Inc',
        'Micro Elements Ltd',
        'TechParts Corp',
        'Board Masters Inc',
        'ChipWorks Ltd',
        'ElectroBase Corp',
    ],
    consumerElectronicsFactory: [
        'TechVision Corp',
        'Gadget World Inc',
        'Device Planet Ltd',
        'SmartTech Corp',
        'DigitalEdge Inc',
        'Consumer Electronics Ltd',
        'NextGen Devices Corp',
        'Pixel Perfect Inc',
        'ElectoHome Ltd',
        'TechLife Corp',
        'Digital Masters Inc',
        'SmartHome Corp',
    ],
    machineryFactory: [
        'Mech Industries Ltd',
        'Heavy Works International',
        'Precision Engineering Co',
        'Iron Horse Machinery',
        'Gear Works Corp',
    ],
    vehicleFactory: [
        'Automotion Corp',
        'DriveTech Motors',
        'Precision Parts Co',
        'WheelWorks Corp',
        'Motor Masters Ltd',
    ],
    intensiveFarmFacility: [
        'AgroTech Global',
        'Precision Farming Inc',
        'Yield Max Corp',
        'GrowSmart Ltd',
        'Crop Science Corp',
        'AgroVentures Inc',
        'Cultivar Corp',
        'FarmTech Ltd',
        'PrecisionCrop Inc',
        'HighYield Farms',
        'CropDynamics Corp',
        'Agronomics Ltd',
    ],
    packagingPlant: [
        'PackGlobal Corp',
        'Wrap World Inc',
        'BoxMakers Ltd',
        'Container Corp',
        'PackArt Inc',
        'ShipRight Corp',
        'Pack Dynamics Ltd',
        'BulkPack Corp',
        'Seal Masters Inc',
        'WrapTech Corp',
        'PackSolutions Ltd',
        'Crate & Box Corp',
    ],
    administrativeCenter: [
        'Global Admin Services',
        'Civic Solutions Corp',
        'Metro Admin Group',
        'BackOffice Corp',
        'AdminWorld Inc',
        'Corporate Services Ltd',
        'BizAdmin Corp',
        'Central Office Inc',
        'OfficeTech Corp',
        'AdminPro Ltd',
        'Enterprise Services Corp',
        'SupportHub Inc',
    ],
    logisticsHub: [
        'Swift Logistics Corp',
        'Global Freight Ltd',
        'Nexus Distribution Inc',
        'MoveIt Corp',
        'FlowChain Ltd',
        'ShipFast Corp',
        'RouteMax Inc',
        'Cargo Masters Ltd',
        'DeliverAll Corp',
        'FreightWorks Inc',
        'TransitHub Ltd',
        'LogiFlow Corp',
    ],
    constructionService: [
        'BuildRight Services',
        'Urban Construct Co',
        'Global Builders Corp',
        'Foundation Works Inc',
        'ErectAll Ltd',
        'SkyHigh Construction',
        'GroundWork Corp',
        'MegaBuild Inc',
        'Construct Masters Ltd',
        'TowerBuilders Corp',
        'BlueCollar Services Inc',
        'EliteBuild Corp',
    ],
    groceryChain: [
        'FreshMart Chain',
        'World Grocery Corp',
        'Daily Basket Inc',
        'Metro Grocers Ltd',
        'SuperFresh Corp',
        'GrocerWorld Inc',
        'The Food Depot',
        'FoodFirst Corp',
        'Pantry Masters Ltd',
        'FreshChoice Inc',
        'BigBasket Corp',
        'GrocerPlus Ltd',
    ],
    retailChain: [
        'OmniRetail Corp',
        'Global Shops Ltd',
        'Prime Retail Chain',
        'MegaMart Inc',
        'ShopWorld Corp',
        'RetailFirst Ltd',
        'StoreChain Corp',
        'OpenMart Inc',
        'ValueShop Corp',
        'BuyMore Ltd',
        'ShopSmart Corp',
        'BargainWorld Inc',
    ],
    hospital: [
        'HealthNet Corp',
        'Global Care Ltd',
        'Metro Health Group',
        'CureAll Clinics',
        'WellBeing Corp',
        'MedCenter Inc',
        'LifeHealth Corp',
        'CareFirst Ltd',
        'Vitality Health Corp',
        'HealAll Inc',
        'MediGroup Ltd',
        'WellnessFirst Corp',
    ],
    siliconWaferFactory: [
        'WaferTech Corp',
        'Global Wafers Inc',
        'Silicon Masters Ltd',
        'PureSilicon Corp',
        'Wafer Dynamics Inc',
        'CrystalSilicon Ltd',
        'SemiConductor Corp',
        'Wafer Works Inc',
        'SiliconEdge Ltd',
        'ChipStart Corp',
    ],
};

function depositPerScale(facilityType: string): number {
    switch (facilityType) {
        case 'coalMine':
            return 500000;
        case 'oilWell':
            return 300000;
        case 'loggingCamp':
            return 400000;
        case 'stoneQuarry':
            return 400000;
        case 'copperMine':
            return 400000;
        case 'sandMine':
            return 300000;
        case 'limestoneQuarry':
            return 300000;
        case 'clayMine':
            return 400000;
        case 'cottonFarm':
            return 200000;
        case 'intensiveFarmFacility':
            return 30000;
        case 'waterExtractionFacility':
            return 800000;
        case 'ironExtractionFacility':
            return 400000;
        default:
            return 0;
    }
}

type FacilityFactory = (planetId: string, id: string) => ProductionFacility;

function getFacilityFactory(type: string): FacilityFactory {
    const MAP: Record<string, FacilityFactory> = {
        coalMine,
        oilWell,
        loggingCamp,
        stoneQuarry,
        copperMine,
        sandMine,
        limestoneQuarry,
        clayMine,
        cottonFarm,
        waterExtractionFacility,
        ironExtractionFacility,
        coalPowerPlant,
        ironSmelter,
        copperSmelter,
        oilRefinery,
        sawmill,
        cementPlant,
        glassFactory,
        pesticidePlant,
        paperMill,
        textileMill,
        concretePlant,
        foodProcessingPlant,
        beveragePlant,
        pharmaceuticalPlant,
        clothingFactory,
        furnitureFactory,
        electronicComponentFactory,
        consumerElectronicsFactory,
        machineryFactory,
        vehicleFactory,
        intensiveFarmFacility,
        packagingPlant,
        administrativeCenter,
        logisticsHub,
        constructionService: constructionFacility,
        groceryChain,
        retailChain,
        hospital,
        siliconWaferFactory,
    };
    const f = MAP[type];
    if (!f) {
        throw new Error(`Unknown facility type: ${type}`);
    }
    return f;
}

interface ClaimPool {
    type:
        | typeof arableLandResourceType
        | typeof waterSourceResourceType
        | typeof coalDepositResourceType
        | typeof oilReservoirResourceType
        | typeof forestResourceType
        | typeof stoneDepositResourceType
        | typeof copperDepositResourceType
        | typeof sandDepositResourceType
        | typeof limestoneDepositResourceType
        | typeof clayDepositResourceType
        | typeof ironOreDepositResourceType;
    total: number;
    prefix: string;
    renewable: boolean;
    entries: ResourceClaimEntry[];
}

function resourceType(facilityType: string): ClaimPool['type'] | null {
    const MAP: Record<string, ClaimPool['type']> = {
        coalMine: coalDepositResourceType,
        oilWell: oilReservoirResourceType,
        loggingCamp: forestResourceType,
        stoneQuarry: stoneDepositResourceType,
        copperMine: copperDepositResourceType,
        sandMine: sandDepositResourceType,
        limestoneQuarry: limestoneDepositResourceType,
        clayMine: clayDepositResourceType,
        cottonFarm: arableLandResourceType,
        intensiveFarmFacility: arableLandResourceType,
        waterExtractionFacility: waterSourceResourceType,
        ironExtractionFacility: ironOreDepositResourceType,
    };
    return MAP[facilityType] ?? null;
}

function renewableForResource(facilityType: string): boolean {
    const NON_RENEWABLE = new Set([
        'coalMine',
        'oilWell',
        'copperMine',
        'ironExtractionFacility',
        'stoneQuarry',
        'sandMine',
        'limestoneQuarry',
        'clayMine',
    ]);
    return !NON_RENEWABLE.has(facilityType);
}

function claimPoolKey(facilityType: string): string {
    if (facilityType === 'intensiveFarmFacility') {
        return 'cottonFarm';
    }
    return facilityType;
}

export function buildProceduralWorld(): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];
    const govClaims: string[] = [];

    const claimPools = new Map<string, ResourceClaimEntry[]>();

    const govArableId = `${PROC_PLANET_ID}-gov-arable`;
    const govWaterId = `${PROC_PLANET_ID}-gov-water`;
    govClaims.push(govArableId, govWaterId);

    if (!claimPools.has('cottonFarm')) {
        claimPools.set('cottonFarm', []);
    }
    if (!claimPools.has('waterExtractionFacility')) {
        claimPools.set('waterExtractionFacility', []);
    }

    claimPools.get('cottonFarm')!.push(
        makeClaim({
            id: govArableId,
            type: arableLandResourceType,
            quantity: 100_000_000,
            tenantAgentId: 'proc-utilities',
            costPerTick: 1_000_000,
            renewable: true,
        }),
    );
    claimPools.get('waterExtractionFacility')!.push(
        makeClaim({
            id: govWaterId,
            type: waterSourceResourceType,
            quantity: 100_000_000,
            tenantAgentId: 'proc-utilities',
            costPerTick: 500_000,
            renewable: true,
        }),
    );

    for (const [facilityType, target] of Object.entries(TARGETS)) {
        const names = NAMES[facilityType] ?? [];
        const count = Math.min(target.agentCount, names.length);
        if (count === 0) {
            continue;
        }

        const scales = splitScale(target.totalScale, count, facilityType);
        const rType = resourceType(facilityType);
        const dpScale = depositPerScale(facilityType);

        for (let i = 0; i < count; i++) {
            const name = names[i];
            const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const scale = scales[i];

            const facilities: ProductionFacility[] = [];
            const tenancies: string[] = [];

            const factory = getFacilityFactory(facilityType);
            const fac = factory(PROC_PLANET_ID, `${id}-${facilityType}`);
            fac.scale = scale;
            fac.maxScale = scale;
            facilities.push(fac);

            if (facilityType === 'cottonFarm' || facilityType === 'intensiveFarmFacility') {
                const waterNeeded = facilityType === 'cottonFarm' ? 80 : 100;
                const waterExtractPerUnit = 800;
                const waterScale = Math.max(1, Math.ceil((scale * waterNeeded) / waterExtractPerUnit));
                const wFac = waterExtractionFacility(PROC_PLANET_ID, `${id}-water`);
                wFac.scale = waterScale;
                wFac.maxScale = waterScale;
                facilities.push(wFac);

                const waterPool = claimPools.get('waterExtractionFacility') ?? [];
                claimPools.set('waterExtractionFacility', waterPool);
                const waterClaimQty = waterScale * 800;
                const waterClaimId = `${PROC_PLANET_ID}-water-${id}`;
                const waterClaim = makeClaim({
                    id: waterClaimId,
                    type: waterSourceResourceType,
                    quantity: waterClaimQty,
                    tenantAgentId: id,
                    tenantCostInCoins: Math.floor(waterClaimQty * 0.0005),
                    renewable: true,
                });
                waterPool.push(waterClaim);
                govClaims.push(waterClaimId);
                tenancies.push(waterClaimId);
            }

            if (rType !== null && dpScale > 0) {
                const poolKey = claimPoolKey(facilityType);
                const pool = claimPools.get(poolKey) ?? [];
                claimPools.set(poolKey, pool);
                const depositQty = scale * dpScale;
                const claimId = `${PROC_PLANET_ID}-deposit-${facilityType}-${id}`;
                const claim = makeClaim({
                    id: claimId,
                    type: rType,
                    quantity: depositQty,
                    tenantAgentId: id,
                    tenantCostInCoins: Math.floor(depositQty * 0.0001),
                    renewable: renewableForResource(facilityType),
                });
                pool.push(claim);
                govClaims.push(claimId);
                tenancies.push(claimId);
            }

            agents.push(
                makeAgent({
                    id,
                    name,
                    associatedPlanetId: PROC_PLANET_ID,
                    planetId: PROC_PLANET_ID,
                    facilities,
                    storage: makeStorage({ planetId: PROC_PLANET_ID, id: `${id}-storage`, name: `${name} Storage` }),
                    tenancies,
                }),
            );
        }
    }

    {
        const pestScale = Math.round(TARGETS.pesticidePlant.totalScale * 0.1);
        const f2 = pesticidePlant(PROC_PLANET_ID, 'agrochemplus-pest');
        f2.scale = pestScale;
        f2.maxScale = pestScale;
        agents.push(
            makeAgent({
                id: 'agrochemplus-corp',
                name: 'AgroChemPlus Corp',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'agrochemplus-storage',
                    name: 'AgroChemPlus Storage',
                }),
            }),
        );
    }

    {
        const paperScale = Math.round(TARGETS.paperMill.totalScale * 0.1);
        const packScale = Math.round(TARGETS.packagingPlant.totalScale * 0.05);
        const f1 = paperMill(PROC_PLANET_ID, 'paperpack-paper');
        f1.scale = paperScale;
        f1.maxScale = paperScale;
        const f2 = packagingPlant(PROC_PLANET_ID, 'paperpack-pack');
        f2.scale = packScale;
        f2.maxScale = packScale;
        agents.push(
            makeAgent({
                id: 'paperpack-industries',
                name: 'PaperPack Industries',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'paperpack-storage', name: 'PaperPack Storage' }),
            }),
        );
    }

    {
        const texScale = Math.round(TARGETS.textileMill.totalScale * 0.08);
        const cloScale = Math.round(TARGETS.clothingFactory.totalScale * 0.08);
        const f1 = textileMill(PROC_PLANET_ID, 'fashionchain-textile');
        f1.scale = texScale;
        f1.maxScale = texScale;
        const f2 = clothingFactory(PROC_PLANET_ID, 'fashionchain-clothing');
        f2.scale = cloScale;
        f2.maxScale = cloScale;
        agents.push(
            makeAgent({
                id: 'fashionchain-group',
                name: 'FashionChain Group',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'fashionchain-storage',
                    name: 'FashionChain Storage',
                }),
            }),
        );
    }

    {
        const waferScale = Math.round(TARGETS.siliconWaferFactory.totalScale * 0.1);
        const compScale = Math.round(TARGETS.electronicComponentFactory.totalScale * 0.08);
        const f1 = siliconWaferFactory(PROC_PLANET_ID, 'chipmaker-wafer');
        f1.scale = waferScale;
        f1.maxScale = waferScale;
        const f2 = electronicComponentFactory(PROC_PLANET_ID, 'chipmaker-comp');
        f2.scale = compScale;
        f2.maxScale = compScale;
        agents.push(
            makeAgent({
                id: 'chipmaker-technologies',
                name: 'ChipMaker Technologies',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'chipmaker-storage', name: 'ChipMaker Storage' }),
            }),
        );
    }

    {
        const ceScale = Math.round(TARGETS.consumerElectronicsFactory.totalScale * 0.08);
        const retScale = Math.round(TARGETS.retailChain.totalScale * 0.06);
        const f1 = consumerElectronicsFactory(PROC_PLANET_ID, 'techretail-ce');
        f1.scale = ceScale;
        f1.maxScale = ceScale;
        const f2 = retailChain(PROC_PLANET_ID, 'techretail-retail');
        f2.scale = retScale;
        f2.maxScale = retScale;
        agents.push(
            makeAgent({
                id: 'techretail-corp',
                name: 'TechRetail Corp',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'techretail-storage',
                    name: 'TechRetail Storage',
                }),
            }),
        );
    }

    {
        const fpScale = Math.round(TARGETS.foodProcessingPlant.totalScale * 0.08);
        const grScale = Math.round(TARGETS.groceryChain.totalScale * 0.06);
        const f1 = foodProcessingPlant(PROC_PLANET_ID, 'freshgrocer-food');
        f1.scale = fpScale;
        f1.maxScale = fpScale;
        const f2 = groceryChain(PROC_PLANET_ID, 'freshgrocer-grocery');
        f2.scale = grScale;
        f2.maxScale = grScale;
        agents.push(
            makeAgent({
                id: 'freshgrocer-inc',
                name: 'FreshGrocer Inc',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'freshgrocer-storage',
                    name: 'FreshGrocer Storage',
                }),
            }),
        );
    }

    {
        const machScale = Math.round(TARGETS.machineryFactory.totalScale * 0.15);
        const vehScale = Math.round(TARGETS.vehicleFactory.totalScale * 0.15);
        const f1 = machineryFactory(PROC_PLANET_ID, 'autoindustry-mach');
        f1.scale = machScale;
        f1.maxScale = machScale;
        const f2 = vehicleFactory(PROC_PLANET_ID, 'autoindustry-veh');
        f2.scale = vehScale;
        f2.maxScale = vehScale;
        agents.push(
            makeAgent({
                id: 'autoindustry-conglomerate',
                name: 'AutoIndustry Conglomerate',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'autoindustry-storage',
                    name: 'AutoIndustry Storage',
                }),
            }),
        );
    }

    {
        const concScale = Math.round(TARGETS.concretePlant.totalScale * 0.08);
        const cstScale = Math.round(TARGETS.constructionService.totalScale * 0.08);
        const f1 = concretePlant(PROC_PLANET_ID, 'buildmaster-concrete');
        f1.scale = concScale;
        f1.maxScale = concScale;
        const f2 = constructionFacility(PROC_PLANET_ID, 'buildmaster-construction');
        f2.scale = cstScale;
        f2.maxScale = cstScale;
        agents.push(
            makeAgent({
                id: 'buildmaster-group',
                name: 'BuildMaster Group',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'buildmaster-storage',
                    name: 'BuildMaster Storage',
                }),
            }),
        );
    }

    {
        const admScale = Math.round(TARGETS.administrativeCenter.totalScale * 0.06);
        const logScale = Math.round(TARGETS.logisticsHub.totalScale * 0.06);
        const f1 = administrativeCenter(PROC_PLANET_ID, 'infragroup-admin');
        f1.scale = admScale;
        f1.maxScale = admScale;
        const f2 = logisticsHub(PROC_PLANET_ID, 'infragroup-logistics');
        f2.scale = logScale;
        f2.maxScale = logScale;
        agents.push(
            makeAgent({
                id: 'infragroup-global',
                name: 'InfraGroup Global',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'infragroup-storage',
                    name: 'InfraGroup Storage',
                }),
            }),
        );
    }

    const educationSpecs = [
        { id: 'edu-network-corp', name: 'Edu Network Corp' },
        { id: 'knowledge-global', name: 'Knowledge Global Ltd' },
        { id: 'campus-systems-inc', name: 'Campus Systems Inc' },
        { id: 'scholars-union', name: 'Scholars Union' },
    ];
    for (const spec of educationSpecs) {
        const u = educationCenter(PROC_PLANET_ID, `${spec.id}-university`);
        u.scale = 4000;
        u.maxScale = 4000;
        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [u],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: `${spec.id}-storage`,
                    name: `${spec.name} Storage`,
                }),
            }),
        );
    }

    const poolConfigs: Array<{
        facilityType: string;
        total: number;
        type: ClaimPool['type'];
        prefix: string;
        renewable: boolean;
    }> = [
        {
            facilityType: 'coalMine',
            total: TOTAL_COAL,
            type: coalDepositResourceType,
            prefix: `${PROC_PLANET_ID}-coal`,
            renewable: renewableForResource('coalMine'),
        },
        {
            facilityType: 'oilWell',
            total: TOTAL_OIL,
            type: oilReservoirResourceType,
            prefix: `${PROC_PLANET_ID}-oil`,
            renewable: renewableForResource('oilWell'),
        },
        {
            facilityType: 'loggingCamp',
            total: TOTAL_FOREST,
            type: forestResourceType,
            prefix: `${PROC_PLANET_ID}-forest`,
            renewable: renewableForResource('loggingCamp'),
        },
        {
            facilityType: 'stoneQuarry',
            total: TOTAL_STONE,
            type: stoneDepositResourceType,
            prefix: `${PROC_PLANET_ID}-stone`,
            renewable: renewableForResource('stoneQuarry'),
        },
        {
            facilityType: 'copperMine',
            total: TOTAL_COPPER,
            type: copperDepositResourceType,
            prefix: `${PROC_PLANET_ID}-copper`,
            renewable: renewableForResource('copperMine'),
        },
        {
            facilityType: 'sandMine',
            total: TOTAL_SAND,
            type: sandDepositResourceType,
            prefix: `${PROC_PLANET_ID}-sand`,
            renewable: renewableForResource('sandMine'),
        },
        {
            facilityType: 'limestoneQuarry',
            total: TOTAL_LIMESTONE,
            type: limestoneDepositResourceType,
            prefix: `${PROC_PLANET_ID}-limestone`,
            renewable: renewableForResource('limestoneQuarry'),
        },
        {
            facilityType: 'clayMine',
            total: TOTAL_CLAY,
            type: clayDepositResourceType,
            prefix: `${PROC_PLANET_ID}-clay`,
            renewable: renewableForResource('clayMine'),
        },
        {
            facilityType: 'cottonFarm',
            total: TOTAL_ARABLE,
            type: arableLandResourceType,
            prefix: `${PROC_PLANET_ID}-arable`,
            renewable: renewableForResource('cottonFarm'),
        },
        {
            facilityType: 'waterExtractionFacility',
            total: TOTAL_WATER,
            type: waterSourceResourceType,
            prefix: `${PROC_PLANET_ID}-water`,
            renewable: renewableForResource('waterExtractionFacility'),
        },
        {
            facilityType: 'ironExtractionFacility',
            total: TOTAL_IRON_ORE,
            type: ironOreDepositResourceType,
            prefix: `${PROC_PLANET_ID}-iron`,
            renewable: renewableForResource('ironExtractionFacility'),
        },
    ];

    for (const cfg of poolConfigs) {
        if (!claimPools.has(cfg.facilityType)) {
            claimPools.set(cfg.facilityType, []);
        }
    }

    for (const cfg of poolConfigs) {
        const pool = claimPools.get(cfg.facilityType)!;
        const remainder = makeUnclaimedRemainder({
            idPrefix: cfg.prefix,
            type: cfg.type,
            total: cfg.total,
            existing: pool,
            claimAgentId: GOV,
            renewable: cfg.renewable,
        });
        if (remainder) {
            pool.push(remainder);
            govClaims.push(remainder.id);
        }
    }

    const utilWaterFac = waterExtractionFacility(PROC_PLANET_ID, 'proc-util-water');
    utilWaterFac.scale = 200;
    utilWaterFac.maxScale = 200;
    const utilAgriFac = intensiveFarmFacility(PROC_PLANET_ID, 'proc-util-agri');
    utilAgriFac.scale = 800;
    utilAgriFac.maxScale = 800;
    const utilAgent = makeAgent({
        id: 'proc-utilities',
        name: 'Public Utilities Corp',
        associatedPlanetId: PROC_PLANET_ID,
        planetId: PROC_PLANET_ID,
        facilities: [utilWaterFac, utilAgriFac],
        storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'proc-util-storage', name: 'Public Utilities Storage' }),
        tenancies: [govArableId, govWaterId],
    });
    agents.push(utilAgent);

    const govAgent = makeAgent({
        id: GOV,
        name: 'Procedural Earth Government',
        associatedPlanetId: PROC_PLANET_ID,
        planetId: PROC_PLANET_ID,
        facilities: [],
        storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'proc-gov-storage', name: 'Gov. Central Storage' }),
        claims: govClaims,
    });
    agents.unshift(govAgent);

    const getPool = (k: string): ResourceClaimEntry[] => claimPools.get(k) ?? [];

    const planet: Planet = {
        id: PROC_PLANET_ID,
        name: 'Earth',
        position: { x: 10, y: 0, z: 0 },
        population: createPopulation(8_000_000_000, 2),
        governmentId: GOV,
        bank: {
            loans: 0,
            deposits: 0,
            householdDeposits: 0,
            equity: 0,
            loanRate: 0,
            depositRate: 0,
        },
        wagePerEdu: { none: 10.0, primary: 10.0, secondary: 10.0, tertiary: 10.0 },
        marketPrices: { ...initialMarketPrices },
        transportPipeline: {},
        orderBooks: {},
        lastMarketResult: {},
        avgMarketResult: {},
        monthPriceAcc: {},
        consumedResources: {},
        producedResources: {},
        productionCosts: {},
        lastProductionCostFloors: {},
        landBoundCostPerUnit: {},
        resources: {
            [arableLandResourceType.name]: getPool('cottonFarm'),
            [waterSourceResourceType.name]: getPool('waterExtractionFacility'),
            [ironOreDepositResourceType.name]: getPool('ironExtractionFacility'),
            [coalDepositResourceType.name]: getPool('coalMine'),
            [oilReservoirResourceType.name]: getPool('oilWell'),
            [forestResourceType.name]: getPool('loggingCamp'),
            [copperDepositResourceType.name]: getPool('copperMine'),
            [sandDepositResourceType.name]: getPool('sandMine'),
            [limestoneDepositResourceType.name]: getPool('limestoneQuarry'),
            [clayDepositResourceType.name]: getPool('clayMine'),
            [stoneDepositResourceType.name]: getPool('stoneQuarry'),
        },
        infrastructure: {
            primarySchools: 10_000,
            secondarySchools: 5_000,
            universities: 2_000,
            hospitals: 3_000,
            mobility: { roads: 100_000, railways: 50_000, airports: 1_000, seaports: 500, spaceports: 10 },
            energy: { production: 1_000_000 },
        },
        environment: makeDefaultEnvironment({
            air: 5,
            water: 2,
            soil: 1,
            airRegen: 1,
            waterRegen: 1,
            soilRegen: 0.1,
            earthquakes: 10,
            floods: 20,
            storms: 30,
        }),
    };

    const TICKS_PER_YEAR = 30 * 12;

    const extractionRatePerScale: Record<string, number> = {
        coalMine: 0.5,
        oilWell: 0.3,
        copperMine: 0.4,
        ironExtractionFacility: 0.4,
    };

    const resourceSummary: Array<{
        resource: string;
        totalDeposit: number;
        assignedToAgents: number;
        unassigned: number;
        renewable: boolean;
        depletionYears: number | null;
    }> = poolConfigs.map((cfg) => {
        const pool = claimPools.get(cfg.facilityType) ?? [];

        const assigned = pool
            .filter((c) => c.tenantAgentId !== null && c.tenantAgentId !== GOV)
            .reduce((s, c) => s + c.quantity, 0);
        const unclaimedQty = pool.filter((c) => c.tenantAgentId === null).reduce((s, c) => s + c.quantity, 0);

        const rate = extractionRatePerScale[cfg.facilityType] ?? null;

        let depletionYears: number | null = null;
        if (rate !== null && assigned > 0 && !renewableForResource(cfg.facilityType)) {
            const dpScale = depositPerScale(cfg.facilityType);
            depletionYears = Math.round(dpScale / rate / TICKS_PER_YEAR);
        }

        return {
            resource: cfg.type.name,
            totalDeposit: cfg.total,
            assignedToAgents: assigned,
            unassigned: unclaimedQty,
            renewable: renewableForResource(cfg.facilityType),
            depletionYears,
        };
    });

    console.log('\n=== Procedural World Summary ===');
    console.log(`Agents: ${agents.length}`);
    console.log('\nResource Deposits:');
    console.log(
        `${'Resource'.padEnd(28)} ${'Total Deposit'.padStart(20)} ${'Assigned'.padStart(16)} ${'Unassigned'.padStart(16)} ${'Renewable'.padStart(10)} ${'Depletion (yrs)'.padStart(16)}`,
    );
    console.log('-'.repeat(110));
    for (const r of resourceSummary) {
        const depletion = r.depletionYears !== null ? r.depletionYears.toLocaleString() : 'renewable';
        console.log(
            `${r.resource.padEnd(28)} ${r.totalDeposit.toLocaleString().padStart(20)} ${r.assignedToAgents.toLocaleString().padStart(16)} ${r.unassigned.toLocaleString().padStart(16)} ${(r.renewable ? 'yes' : 'no').padStart(10)} ${depletion.padStart(16)}`,
        );
    }
    console.log('=================================\n');

    return { planet, agents };
}
