import {
    administrativeCenter,
    agriculturalProductionFacility,
    beveragePlant,
    brickFactory,
    cementPlant,
    clayMine,
    clothingFactory,
    coalMine,
    concretePlant,
    constructionService,
    consumerElectronicsFactory,
    copperMine,
    copperSmelter,
    cottonFarm,
    electronicComponentFactory,
    fertilizerPlant,
    foodProcessingPlant,
    furnitureFactory,
    glassFactory,
    groceryChain,
    hospital,
    ironExtractionFacility,
    ironSmelter,
    limestoneQuarry,
    loggingCamp,
    logisticsHub,
    machineryFactory,
    naturalGasWell,
    oilRefinery,
    oilWell,
    packagingPlant,
    paperMill,
    pesticidePlant,
    pharmaceuticalPlant,
    phosphateMine,
    potashMine,
    retailChain,
    sandMine,
    sawmill,
    school,
    siliconWaferFactory,
    stoneQuarry,
    textileMill,
    university,
    vehicleFactory,
    waterExtractionFacility,
} from '../planet/facilities';
import {
    arableLandResourceType,
    bauxiteDepositResourceType,
    clayDepositResourceType,
    coalDepositResourceType,
    copperDepositResourceType,
    forestResourceType,
    ironOreDepositResourceType,
    limestoneDepositResourceType,
    naturalGasFieldResourceType,
    oilReservoirResourceType,
    phosphateRockDepositResourceType,
    potashDepositResourceType,
    rareEarthDepositResourceType,
    sandDepositResourceType,
    stoneQuarryResourceType,
    waterSourceResourceType,
} from '../planet/landBoundResources';
import type { Agent, Planet } from '../planet/planet';
import type { ResourceClaimEntry } from './helpers';
import { createPopulation, makeAgent, makeDefaultEnvironment, makeStorage } from './helpers';
import { initialMarketPrices } from './initialMarketPrices';
import { makeClaim, makeUnclaimedRemainder } from './resourceClaimFactory';

export const EARTH_ID = 'earth';
const GOV = 'earth-government';

const TOTAL_ARABLE = 1_500_000_000;
const TOTAL_WATER = 2_000_000_000;
const TOTAL_IRON_ORE = 5_000_000_000;
const TOTAL_COAL = 4_000_000_000;
const TOTAL_OIL = 3_000_000_000;
const TOTAL_GAS = 2_500_000_000;
const TOTAL_FOREST = 2_000_000_000;
const TOTAL_COPPER = 1_500_000_000;
const TOTAL_RARE_EARTH = 500_000_000;
const TOTAL_SAND = 2_000_000_000;
const TOTAL_PHOSPHATE = 1_000_000_000;
const TOTAL_POTASH = 1_000_000_000;
const TOTAL_BAUXITE = 1_200_000_000;
const TOTAL_LIMESTONE = 3_000_000_000;
const TOTAL_CLAY = 2_000_000_000;
const TOTAL_STONE = 4_000_000_000;

interface AgriSpec {
    id: string;
    name: string;
    arableLand: number;
    waterSource: number;
}

interface MiningSpec {
    id: string;
    name: string;
    ironOre: number;
}

interface CoalSpec {
    id: string;
    name: string;
    coal: number;
}

interface OilSpec {
    id: string;
    name: string;
    oil: number;
    gas: number;
}

interface TimberSpec {
    id: string;
    name: string;
    forest: number;
}

interface MfgSpec {
    id: string;
    name: string;
}

const agriSpecs: AgriSpec[] = [
    { id: 'agri-corp-alpha', name: 'Alpha Agri Corp', arableLand: 60_000_000, waterSource: 1_500_000 },
    { id: 'agri-corp-beta', name: 'Beta Agri Corp', arableLand: 56_000_000, waterSource: 1_400_000 },
    { id: 'agri-corp-gamma', name: 'Gamma Agri Corp', arableLand: 50_000_000, waterSource: 1_250_000 },
    { id: 'agri-corp-delta', name: 'Delta Agri Corp', arableLand: 44_000_000, waterSource: 1_100_000 },
    {
        id: 'agri-corp-epsilon',
        name: 'Epsilon Agri Corp',
        arableLand: 40_000_000,
        waterSource: 1_000_000,
    },
    { id: 'green-fields', name: 'Green Fields Ltd', arableLand: 30_000_000, waterSource: 750_000 },
    { id: 'harvest-moon', name: 'Harvest Moon Inc', arableLand: 28_000_000, waterSource: 700_000 },
    { id: 'terra-farms', name: 'Terra Farms Co', arableLand: 26_000_000, waterSource: 650_000 },
    { id: 'golden-grain', name: 'Golden Grain LLC', arableLand: 24_000_000, waterSource: 600_000 },
    { id: 'sunridge-ag', name: 'Sunridge Agriculture', arableLand: 22_000_000, waterSource: 550_000 },
    {
        id: 'prairie-harvest',
        name: 'Prairie Harvest Co',
        arableLand: 20_000_000,
        waterSource: 500_000,
    },
    { id: 'valley-produce', name: 'Valley Produce Inc', arableLand: 18_000_000, waterSource: 450_000 },
    { id: 'riverside-farm', name: 'Riverside Farm', arableLand: 14_000_000, waterSource: 350_000 },
    { id: 'hilltop-ag', name: 'Hilltop Agriculture', arableLand: 12_000_000, waterSource: 300_000 },
    { id: 'meadow-co', name: 'Meadow & Co', arableLand: 10_000_000, waterSource: 250_000 },
    { id: 'oak-valley', name: 'Oak Valley Farms', arableLand: 9_000_000, waterSource: 225_000 },
    { id: 'cedar-fields', name: 'Cedar Fields Ltd', arableLand: 8_000_000, waterSource: 200_000 },
    { id: 'brookside-ag', name: 'Brookside Agriculture', arableLand: 7_000_000, waterSource: 175_000 },
    { id: 'pinewood-farm', name: 'Pinewood Farm Co', arableLand: 6_000_000, waterSource: 150_000 },
    { id: 'willow-creek', name: 'Willow Creek Farms', arableLand: 5_000_000, waterSource: 125_000 },
    { id: 'cotton-world', name: 'Cotton World Corp', arableLand: 80_000, waterSource: 80_000 },
    { id: 'textile-fields', name: 'Textile Fields Ltd', arableLand: 52_000, waterSource: 52_000 },
];

const miningSpecs: MiningSpec[] = [
    { id: 'ironworks-global', name: 'Ironworks Global', ironOre: 400_000_000 },
    { id: 'deep-core-mining', name: 'Deep Core Mining', ironOre: 300_000_000 },
    { id: 'red-earth-mines', name: 'Red Earth Mines', ironOre: 200_000_000 },
    { id: 'steel-source-co', name: 'Steel Source Co', ironOre: 100_000_000 },
];

const coalSpecs: CoalSpec[] = [
    { id: 'blackrock-coal', name: 'Blackrock Coal Co', coal: 150_000_000 },
    { id: 'carbon-energy', name: 'Carbon Energy Group', coal: 100_000_000 },
    { id: 'deep-seam-coal', name: 'Deep Seam Coal', coal: 50_000_000 },
];

const oilSpecs: OilSpec[] = [
    { id: 'petro-global', name: 'PetroGlobal Corp', oil: 1_200_000_000, gas: 20_000_000 },
    { id: 'continental-oil', name: 'Continental Oil Inc', oil: 1_000_000_000, gas: 18_000_000 },
    { id: 'north-sea-energy', name: 'North Sea Energy', oil: 800_000_000, gas: 16_000_000 },
    { id: 'gulf-petroleum', name: 'Gulf Petroleum Ltd', oil: 600_000_000, gas: 14_000_000 },
    { id: 'arctic-oil-co', name: 'Arctic Oil Co', oil: 400_000_000, gas: 12_000_000 },
];

const timberSpecs: TimberSpec[] = [
    { id: 'great-northern-timber', name: 'Great Northern Timber', forest: 250_000_000 },
    { id: 'pacific-lumber', name: 'Pacific Lumber Co', forest: 200_000_000 },
    { id: 'boreal-wood', name: 'Boreal Wood Products', forest: 150_000_000 },
    { id: 'tropical-forest-co', name: 'Tropical Forest Co', forest: 100_000_000 },
];

const steelMfgSpecs: MfgSpec[] = [
    { id: 'atlas-steel', name: 'Atlas Steel Works' },
    { id: 'meridian-steel', name: 'Meridian Steel Corp' },
    { id: 'nova-metals', name: 'Nova Metals Group' },
    { id: 'forge-masters', name: 'Forge Masters Inc' },
    { id: 'titan-steel', name: 'Titan Steel Ltd' },
];

const refineryMfgSpecs: MfgSpec[] = [
    { id: 'horizon-refinery', name: 'Horizon Refinery Corp' },
    { id: 'global-petrochem', name: 'Global Petrochemicals' },
    { id: 'coastal-refining', name: 'Coastal Refining Ltd' },
    { id: 'inland-refinery', name: 'Inland Refinery Co' },
];

const buildMaterialsSpecs: MfgSpec[] = [
    { id: 'concrete-giant', name: 'Concrete Giant Corp' },
    { id: 'urban-materials', name: 'Urban Materials Inc' },
    { id: 'glass-world', name: 'Glass World Ltd' },
    { id: 'brick-works-intl', name: 'Brick Works International' },
    { id: 'stone-age-quarrying', name: 'Stone Age Quarrying' },
];

const fertilizerChemSpecs: MfgSpec[] = [
    { id: 'agrochem-global', name: 'AgroChem Global' },
    { id: 'soil-science-corp', name: 'Soil Science Corp' },
    { id: 'green-chem-ltd', name: 'GreenChem Ltd' },
];

const consumerGoodsSpecs: MfgSpec[] = [
    { id: 'world-foods-corp', name: 'World Foods Corp' },
    { id: 'beverage-planet', name: 'Beverage Planet Inc' },
    { id: 'freshdrink-co', name: 'Freshdrink Co' },
    { id: 'pharma-global', name: 'PharmaGlobal Corp' },
    { id: 'medlife-corp', name: 'MedLife Corp' },
    { id: 'paper-world', name: 'Paper World Inc' },
    { id: 'northern-paper', name: 'Northern Paper Mills' },
];

const textileSpecs: MfgSpec[] = [
    { id: 'fashion-world', name: 'Fashion World Ltd' },
    { id: 'global-textiles', name: 'Global Textiles Inc' },
    { id: 'fiber-craft', name: 'FiberCraft Corp' },
];

const furnitureSpecs: MfgSpec[] = [
    { id: 'home-furnishings', name: 'Home Furnishings Corp' },
    { id: 'woodcraft-intl', name: 'Woodcraft International' },
];

const siliconWaferSpecs: MfgSpec[] = [
    { id: 'wafer-tech', name: 'WaferTech Corp' },
    { id: 'global-wafers', name: 'Global Wafers Inc' },
];

const techMfgSpecs: MfgSpec[] = [
    { id: 'silicon-dynamics', name: 'Silicon Dynamics Corp' },
    { id: 'global-electronics', name: 'Global Electronics Inc' },
    { id: 'circuit-world', name: 'Circuit World Ltd' },
];

const consumerElectronicSpecs: MfgSpec[] = [
    { id: 'techvision-corp', name: 'TechVision Corp' },
    { id: 'gadget-world', name: 'Gadget World Inc' },
    { id: 'device-planet', name: 'Device Planet Ltd' },
];

const machinerySpecs: MfgSpec[] = [
    { id: 'mech-industries', name: 'Mech Industries Ltd' },
    { id: 'heavy-works-intl', name: 'Heavy Works International' },
    { id: 'precision-engineering', name: 'Precision Engineering Co' },
];

const vehicleSpecs: MfgSpec[] = [
    { id: 'automotion-corp', name: 'Automotion Corp' },
    { id: 'drivetech-motors', name: 'DriveTech Motors' },
    { id: 'precision-parts', name: 'Precision Parts Co' },
];

const packagingSpecs: MfgSpec[] = [
    { id: 'pack-global', name: 'PackGlobal Corp' },
    { id: 'wrap-world', name: 'Wrap World Inc' },
];

const adminSpecs: MfgSpec[] = [
    { id: 'global-admin-services', name: 'Global Admin Services' },
    { id: 'civic-solutions', name: 'Civic Solutions Corp' },
    { id: 'metro-admin-group', name: 'Metro Admin Group' },
];

const logisticsSpecs: MfgSpec[] = [
    { id: 'swift-logistics', name: 'Swift Logistics Corp' },
    { id: 'global-freight', name: 'Global Freight Ltd' },
    { id: 'nexus-distribution', name: 'Nexus Distribution Inc' },
];

const grocerySpecs: MfgSpec[] = [
    { id: 'freshmart-chain', name: 'FreshMart Chain' },
    { id: 'world-grocery', name: 'World Grocery Corp' },
    { id: 'daily-basket', name: 'Daily Basket Inc' },
    { id: 'metro-grocers', name: 'Metro Grocers Ltd' },
];

const retailSpecs: MfgSpec[] = [
    { id: 'omni-retail', name: 'OmniRetail Corp' },
    { id: 'global-shops', name: 'Global Shops Ltd' },
    { id: 'prime-retail-chain', name: 'Prime Retail Chain' },
];

const healthcareSpecs: MfgSpec[] = [
    { id: 'healthnet-corp', name: 'HealthNet Corp' },
    { id: 'global-care-ltd', name: 'Global Care Ltd' },
    { id: 'metro-health-group', name: 'Metro Health Group' },
];

const constructionSvcSpecs: MfgSpec[] = [
    { id: 'buildright-services', name: 'BuildRight Services' },
    { id: 'urban-construct-co', name: 'Urban Construct Co' },
    { id: 'global-builders', name: 'Global Builders Corp' },
];

const educationSpecs: MfgSpec[] = [
    { id: 'edu-network-corp', name: 'Edu Network Corp' },
    { id: 'knowledge-global', name: 'Knowledge Global Ltd' },
    { id: 'campus-systems', name: 'Campus Systems Inc' },
];

export function buildEarth(): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];
    const arableClaims: ResourceClaimEntry[] = [];
    const waterClaims: ResourceClaimEntry[] = [];
    const ironOreClaims: ResourceClaimEntry[] = [];
    const coalClaims: ResourceClaimEntry[] = [];
    const oilClaims: ResourceClaimEntry[] = [];
    const gasClaims: ResourceClaimEntry[] = [];
    const forestClaims: ResourceClaimEntry[] = [];
    const copperClaims: ResourceClaimEntry[] = [];
    const rareEarthClaims: ResourceClaimEntry[] = [];
    const sandClaims: ResourceClaimEntry[] = [];
    const phosphateClaims: ResourceClaimEntry[] = [];
    const potashClaims: ResourceClaimEntry[] = [];
    const bauxiteClaims: ResourceClaimEntry[] = [];
    const limestoneClaims: ResourceClaimEntry[] = [];
    const clayClaims: ResourceClaimEntry[] = [];
    const stoneClaims: ResourceClaimEntry[] = [];

    const govArableId = 'earth-gov-arable';
    const govWaterId = 'earth-gov-water';
    const govClaims: string[] = [govArableId, govWaterId];
    const govTenancies: string[] = [govArableId, govWaterId];

    arableClaims.push(
        makeClaim({
            id: govArableId,
            type: arableLandResourceType,
            quantity: 100_000_000,
            claimAgentId: GOV,
            tenantAgentId: GOV,
            renewable: true,
        }),
    );
    waterClaims.push(
        makeClaim({
            id: govWaterId,
            type: waterSourceResourceType,
            quantity: 100_000_000,
            claimAgentId: GOV,
            tenantAgentId: GOV,
            renewable: true,
        }),
    );

    for (const spec of agriSpecs) {
        const arableId = `earth-arable-${spec.id}`;
        const waterId = `earth-water-${spec.id}`;
        govClaims.push(arableId, waterId);

        arableClaims.push(
            makeClaim({
                id: arableId,
                type: arableLandResourceType,
                quantity: spec.arableLand,
                claimAgentId: GOV,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.arableLand * 0.001),
                renewable: true,
            }),
        );
        waterClaims.push(
            makeClaim({
                id: waterId,
                type: waterSourceResourceType,
                quantity: spec.waterSource,
                claimAgentId: GOV,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.waterSource * 0.0005),
                renewable: true,
            }),
        );

        const agriScale = Math.max(1, Math.round(spec.arableLand / 2_000));
        const waterScale = Math.max(1, Math.round(spec.waterSource / 2_000));
        const isCottonFarmer = spec.id === 'cotton-world' || spec.id === 'textile-fields';

        const facilities = isCottonFarmer
            ? [waterExtractionFacility(EARTH_ID, `${spec.id}-water`), cottonFarm(EARTH_ID, `${spec.id}-cotton`)]
            : [
                  waterExtractionFacility(EARTH_ID, `${spec.id}-water`),
                  agriculturalProductionFacility(EARTH_ID, `${spec.id}-agri`),
              ];

        const waterFacility = facilities[0];
        waterFacility.scale = waterScale;
        waterFacility.maxScale = waterScale;

        const prodFacility = facilities[1];
        prodFacility.scale = agriScale;
        prodFacility.maxScale = agriScale;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities,
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
                tenancies: [arableId, waterId],
            }),
        );
    }

    for (const spec of miningSpecs) {
        const ironId = `earth-iron-${spec.id}`;
        govClaims.push(ironId);

        ironOreClaims.push(
            makeClaim({
                id: ironId,
                type: ironOreDepositResourceType,
                quantity: spec.ironOre,
                claimAgentId: GOV,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.ironOre * 0.0001),
                renewable: false,
            }),
        );

        const ironScale = Math.max(1, Math.round(spec.ironOre / 10_000_000));
        const ironFacility = ironExtractionFacility(EARTH_ID, `${spec.id}-iron`);
        ironFacility.scale = ironScale;
        ironFacility.maxScale = ironScale;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [ironFacility],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
                tenancies: [ironId],
            }),
        );
    }

    for (const spec of coalSpecs) {
        const coalId = `earth-coal-${spec.id}`;
        govClaims.push(coalId);

        coalClaims.push(
            makeClaim({
                id: coalId,
                type: coalDepositResourceType,
                quantity: spec.coal,
                claimAgentId: GOV,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.coal * 0.0001),
                renewable: false,
            }),
        );

        const scale = Math.max(1, Math.round(spec.coal / 10_000_000));
        const facility = coalMine(EARTH_ID, `${spec.id}-coal`);
        facility.scale = scale;
        facility.maxScale = scale;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [facility],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
                tenancies: [coalId],
            }),
        );
    }

    for (const spec of oilSpecs) {
        const oilId = `earth-oil-${spec.id}`;
        const gasId = `earth-gas-${spec.id}`;
        govClaims.push(oilId, gasId);

        oilClaims.push(
            makeClaim({
                id: oilId,
                type: oilReservoirResourceType,
                quantity: spec.oil,
                claimAgentId: GOV,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.oil * 0.0002),
                renewable: false,
            }),
        );
        gasClaims.push(
            makeClaim({
                id: gasId,
                type: naturalGasFieldResourceType,
                quantity: spec.gas,
                claimAgentId: GOV,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.gas * 0.0002),
                renewable: false,
            }),
        );

        const oilFacility = oilWell(EARTH_ID, `${spec.id}-oil`);
        oilFacility.scale = Math.max(1, Math.round(spec.oil / 10_000_00));
        oilFacility.maxScale = oilFacility.scale;

        const gasFacility = naturalGasWell(EARTH_ID, `${spec.id}-gas`);
        gasFacility.scale = Math.max(1, Math.round(spec.gas / 10_000_00));
        gasFacility.maxScale = gasFacility.scale;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [oilFacility, gasFacility],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
                tenancies: [oilId, gasId],
            }),
        );
    }

    for (const spec of timberSpecs) {
        const forestId = `earth-forest-${spec.id}`;
        govClaims.push(forestId);

        forestClaims.push(
            makeClaim({
                id: forestId,
                type: forestResourceType,
                quantity: spec.forest,
                claimAgentId: GOV,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.forest * 0.0002),
            }),
        );

        const logScale = Math.max(1, Math.round(spec.forest / 10_000_000));
        const logging = loggingCamp(EARTH_ID, `${spec.id}-logging`);
        logging.scale = logScale;
        logging.maxScale = logScale;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [logging],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
                tenancies: [forestId],
            }),
        );
    }

    // --- Sawmill companies (buy logs from market, produce lumber) ---
    const sw1 = sawmill(EARTH_ID, 'global-sawmills-mill');
    sw1.scale = 2;
    sw1.maxScale = 2;
    agents.push(
        makeAgent({
            id: 'global-sawmills',
            name: 'Global Sawmills Corp',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [sw1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'global-sawmills-storage',
                name: 'Global Sawmills Storage',
            }),
        }),
    );
    const sw2 = sawmill(EARTH_ID, 'timber-products-mill');
    sw2.scale = 1;
    sw2.maxScale = 1;
    agents.push(
        makeAgent({
            id: 'timber-products',
            name: 'Timber Products Co',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [sw2],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'timber-products-storage',
                name: 'Timber Products Storage',
            }),
        }),
    );

    // --- Copper mining companies (mine only; smelting is separate) ---
    const copperBasinCopperId = 'earth-copper-copper-basin-mining';
    govClaims.push(copperBasinCopperId);
    copperClaims.push(
        makeClaim({
            id: copperBasinCopperId,
            type: copperDepositResourceType,
            quantity: 500_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'copper-basin-mining',
            tenantCostInCoins: 50_000,
            renewable: false,
        }),
    );
    const cb1 = copperMine(EARTH_ID, 'copper-basin-mine');
    cb1.scale = 70;
    cb1.maxScale = 70;
    agents.push(
        makeAgent({
            id: 'copper-basin-mining',
            name: 'Copper Basin Mining',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [cb1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'copper-basin-storage', name: 'Copper Basin Storage' }),
            tenancies: [copperBasinCopperId],
        }),
    );

    const pacificCopperId = 'earth-copper-pacific-copper';
    govClaims.push(pacificCopperId);
    copperClaims.push(
        makeClaim({
            id: pacificCopperId,
            type: copperDepositResourceType,
            quantity: 350_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'pacific-copper-co',
            tenantCostInCoins: 35_000,
            renewable: false,
        }),
    );
    const pc1 = copperMine(EARTH_ID, 'pacific-copper-mine');
    pc1.scale = 40;
    pc1.maxScale = 40;
    agents.push(
        makeAgent({
            id: 'pacific-copper-co',
            name: 'Pacific Copper Co',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pc1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'pacific-copper-storage', name: 'Pacific Copper Storage' }),
            tenancies: [pacificCopperId],
        }),
    );

    const andeanCopperId = 'earth-copper-andean-mines';
    govClaims.push(andeanCopperId);
    copperClaims.push(
        makeClaim({
            id: andeanCopperId,
            type: copperDepositResourceType,
            quantity: 250_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'andean-copper-mines',
            tenantCostInCoins: 25_000,
            renewable: false,
        }),
    );
    const ac1 = copperMine(EARTH_ID, 'andean-copper-mine');
    ac1.scale = 25;
    ac1.maxScale = 25;
    agents.push(
        makeAgent({
            id: 'andean-copper-mines',
            name: 'Andean Copper Mines',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ac1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'andean-copper-storage', name: 'Andean Copper Storage' }),
            tenancies: [andeanCopperId],
        }),
    );

    // --- Copper smelting companies (buy copper ore from market) ---
    const cs1 = copperSmelter(EARTH_ID, 'world-copper-smelter');
    cs1.scale = 250;
    cs1.maxScale = 250;
    agents.push(
        makeAgent({
            id: 'world-copper-smelting',
            name: 'World Copper Smelting',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [cs1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'world-copper-smelting-storage',
                name: 'World Copper Smelting Storage',
            }),
        }),
    );
    const cs2 = copperSmelter(EARTH_ID, 'pacific-metals-smelter');
    cs2.scale = 200;
    cs2.maxScale = 200;
    agents.push(
        makeAgent({
            id: 'pacific-metals-corp',
            name: 'Pacific Metals Corp',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [cs2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'pacific-metals-storage', name: 'Pacific Metals Storage' }),
        }),
    );

    // --- Sand mining ---
    const desertSandId = 'earth-sand-desert-sand';
    govClaims.push(desertSandId);
    sandClaims.push(
        makeClaim({
            id: desertSandId,
            type: sandDepositResourceType,
            quantity: 800_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'desert-sand-corp',
            tenantCostInCoins: 25_000,
            renewable: true,
        }),
    );
    const ds1 = sandMine(EARTH_ID, 'desert-sand-mine');
    ds1.scale = 6;
    ds1.maxScale = 6;
    agents.push(
        makeAgent({
            id: 'desert-sand-corp',
            name: 'Desert Sand Corp',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ds1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'desert-sand-storage', name: 'Desert Sand Storage' }),
            tenancies: [desertSandId],
        }),
    );
    const saharaSandId = 'earth-sand-sahara-sand';
    govClaims.push(saharaSandId);
    sandClaims.push(
        makeClaim({
            id: saharaSandId,
            type: sandDepositResourceType,
            quantity: 600_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'sahara-sand-co',
            tenantCostInCoins: 20_000,
            renewable: true,
        }),
    );
    const ds2 = sandMine(EARTH_ID, 'sahara-sand-mine');
    ds2.scale = 4;
    ds2.maxScale = 4;
    agents.push(
        makeAgent({
            id: 'sahara-sand-co',
            name: 'Sahara Sand Co',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ds2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'sahara-sand-storage', name: 'Sahara Sand Storage' }),
            tenancies: [saharaSandId],
        }),
    );

    // --- Phosphate mining ---
    const phosphateId = 'earth-phosphate-phosphate-global';
    govClaims.push(phosphateId);
    phosphateClaims.push(
        makeClaim({
            id: phosphateId,
            type: phosphateRockDepositResourceType,
            quantity: 500_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'phosphate-global',
            tenantCostInCoins: 30_000,
            renewable: false,
        }),
    );
    const ph1 = phosphateMine(EARTH_ID, 'phosphate-global-mine');
    ph1.scale = 35;
    ph1.maxScale = 35;
    agents.push(
        makeAgent({
            id: 'phosphate-global',
            name: 'Phosphate Global',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ph1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'phosphate-global-storage',
                name: 'Phosphate Global Storage',
            }),
            tenancies: [phosphateId],
        }),
    );
    const maghrebPhosphateId = 'earth-phosphate-maghreb';
    govClaims.push(maghrebPhosphateId);
    phosphateClaims.push(
        makeClaim({
            id: maghrebPhosphateId,
            type: phosphateRockDepositResourceType,
            quantity: 300_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'maghreb-phosphate',
            tenantCostInCoins: 20_000,
            renewable: false,
        }),
    );
    const ph2 = phosphateMine(EARTH_ID, 'maghreb-phosphate-mine');
    ph2.scale = 25;
    ph2.maxScale = 25;
    agents.push(
        makeAgent({
            id: 'maghreb-phosphate',
            name: 'Maghreb Phosphate Corp',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ph2],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'maghreb-phosphate-storage',
                name: 'Maghreb Phosphate Storage',
            }),
            tenancies: [maghrebPhosphateId],
        }),
    );

    // --- Potash mining ---
    const potashId = 'earth-potash-potash-supply';
    govClaims.push(potashId);
    potashClaims.push(
        makeClaim({
            id: potashId,
            type: potashDepositResourceType,
            quantity: 500_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'potash-ag-supply',
            tenantCostInCoins: 30_000,
            renewable: false,
        }),
    );
    const pk1 = potashMine(EARTH_ID, 'potash-supply-mine');
    pk1.scale = 1;
    pk1.maxScale = 1;
    agents.push(
        makeAgent({
            id: 'potash-ag-supply',
            name: 'Potash Ag Supply',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pk1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'potash-supply-storage', name: 'Potash Supply Storage' }),
            tenancies: [potashId],
        }),
    );

    // --- Limestone quarrying (needed for cement, glass) ---
    const alpineLimestoneId = 'earth-limestone-alpine';
    govClaims.push(alpineLimestoneId);
    limestoneClaims.push(
        makeClaim({
            id: alpineLimestoneId,
            type: limestoneDepositResourceType,
            quantity: 600_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'alpine-stone-corp',
            tenantCostInCoins: 30_000,
            renewable: true,
        }),
    );
    const ls1 = limestoneQuarry(EARTH_ID, 'alpine-limestone-quarry');
    ls1.scale = 1;
    ls1.maxScale = 1;
    agents.push(
        makeAgent({
            id: 'alpine-stone-corp',
            name: 'Alpine Stone Corp',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ls1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'alpine-stone-storage', name: 'Alpine Stone Storage' }),
            tenancies: [alpineLimestoneId],
        }),
    );
    const karstLimestoneId = 'earth-limestone-karst';
    govClaims.push(karstLimestoneId);
    limestoneClaims.push(
        makeClaim({
            id: karstLimestoneId,
            type: limestoneDepositResourceType,
            quantity: 450_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'karst-quarry-co',
            tenantCostInCoins: 22_000,
            renewable: true,
        }),
    );
    const ls2 = limestoneQuarry(EARTH_ID, 'karst-limestone-quarry');
    ls2.scale = 1;
    ls2.maxScale = 1;
    agents.push(
        makeAgent({
            id: 'karst-quarry-co',
            name: 'Karst Quarry Co',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ls2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'karst-quarry-storage', name: 'Karst Quarry Storage' }),
            tenancies: [karstLimestoneId],
        }),
    );
    const coralLimestoneId = 'earth-limestone-coral';
    govClaims.push(coralLimestoneId);
    limestoneClaims.push(
        makeClaim({
            id: coralLimestoneId,
            type: limestoneDepositResourceType,
            quantity: 300_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'coral-rock-mining',
            tenantCostInCoins: 15_000,
            renewable: true,
        }),
    );
    const ls3 = limestoneQuarry(EARTH_ID, 'coral-limestone-quarry');
    ls3.scale = 1;
    ls3.maxScale = 1;
    agents.push(
        makeAgent({
            id: 'coral-rock-mining',
            name: 'Coral Rock Mining',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ls3],
            storage: makeStorage({ planetId: EARTH_ID, id: 'coral-rock-storage', name: 'Coral Rock Storage' }),
            tenancies: [coralLimestoneId],
        }),
    );

    // --- Clay mining (needed for cement, brick) ---
    const deltaClayId = 'earth-clay-delta-clay';
    govClaims.push(deltaClayId);
    clayClaims.push(
        makeClaim({
            id: deltaClayId,
            type: clayDepositResourceType,
            quantity: 500_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'delta-clay-mining',
            tenantCostInCoins: 25_000,
            renewable: true,
        }),
    );
    const cl1 = clayMine(EARTH_ID, 'delta-clay-mine');
    cl1.scale = 4;
    cl1.maxScale = 4;
    agents.push(
        makeAgent({
            id: 'delta-clay-mining',
            name: 'Delta Clay Mining',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [cl1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'delta-clay-storage', name: 'Delta Clay Storage' }),
            tenancies: [deltaClayId],
        }),
    );
    const plainsClayId = 'earth-clay-plains-clay';
    govClaims.push(plainsClayId);
    clayClaims.push(
        makeClaim({
            id: plainsClayId,
            type: clayDepositResourceType,
            quantity: 400_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'plains-clay-corp',
            tenantCostInCoins: 20_000,
            renewable: true,
        }),
    );
    const cl2 = clayMine(EARTH_ID, 'plains-clay-mine');
    cl2.scale = 3;
    cl2.maxScale = 3;
    agents.push(
        makeAgent({
            id: 'plains-clay-corp',
            name: 'Plains Clay Corp',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [cl2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'plains-clay-storage', name: 'Plains Clay Storage' }),
            tenancies: [plainsClayId],
        }),
    );

    // --- Stone quarrying (needed for concrete) ---
    const graniteStoneId = 'earth-stone-granite-quarrying';
    govClaims.push(graniteStoneId);
    stoneClaims.push(
        makeClaim({
            id: graniteStoneId,
            type: stoneQuarryResourceType,
            quantity: 800_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'granite-quarrying-corp',
            tenantCostInCoins: 40_000,
            renewable: true,
        }),
    );
    const sq1 = stoneQuarry(EARTH_ID, 'granite-quarry');
    sq1.scale = 2;
    sq1.maxScale = 2;
    agents.push(
        makeAgent({
            id: 'granite-quarrying-corp',
            name: 'Granite Quarrying Corp',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [sq1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'granite-quarry-storage', name: 'Granite Quarry Storage' }),
            tenancies: [graniteStoneId],
        }),
    );
    const basaltStoneId = 'earth-stone-basalt-quarrying';
    govClaims.push(basaltStoneId);
    stoneClaims.push(
        makeClaim({
            id: basaltStoneId,
            type: stoneQuarryResourceType,
            quantity: 600_000_000,
            claimAgentId: GOV,
            tenantAgentId: 'basalt-rock-corp',
            tenantCostInCoins: 30_000,
            renewable: true,
        }),
    );
    const sq2 = stoneQuarry(EARTH_ID, 'basalt-quarry');
    sq2.scale = 2;
    sq2.maxScale = 2;
    agents.push(
        makeAgent({
            id: 'basalt-rock-corp',
            name: 'Basalt Rock Corp',
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [sq2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'basalt-rock-storage', name: 'Basalt Rock Storage' }),
            tenancies: [basaltStoneId],
        }),
    );

    // --- Steel manufacturers (buy iron ore + coal from market) ---
    for (const spec of steelMfgSpecs) {
        const smelter = ironSmelter(EARTH_ID, `${spec.id}-smelter`);
        smelter.scale = 40;
        smelter.maxScale = 40;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [smelter],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
            }),
        );
    }

    // --- Oil refineries (buy crude oil from market) ---
    for (const spec of refineryMfgSpecs) {
        const refinery = oilRefinery(EARTH_ID, `${spec.id}-refinery`);
        refinery.scale = 500;
        refinery.maxScale = 500;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [refinery],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
            }),
        );
    }

    // --- Building materials (buy limestone, clay, stone, sand from market) ---
    const [concreteGiant, urbanMaterials, glassWorld, brickWorksIntl, stoneAgeQuarrying] = buildMaterialsSpecs;

    const cg1 = cementPlant(EARTH_ID, 'concrete-giant-cement');
    cg1.scale = 2;
    cg1.maxScale = 2;
    const cg2 = concretePlant(EARTH_ID, 'concrete-giant-concrete');
    cg2.scale = 10;
    cg2.maxScale = 10;
    agents.push(
        makeAgent({
            id: concreteGiant.id,
            name: concreteGiant.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [cg1, cg2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'concrete-giant-storage', name: 'Concrete Giant Storage' }),
        }),
    );

    const um1 = cementPlant(EARTH_ID, 'urban-materials-cement');
    um1.scale = 2;
    um1.maxScale = 2;
    const um2 = brickFactory(EARTH_ID, 'urban-materials-brick');
    um2.scale = 10;
    um2.maxScale = 10;
    agents.push(
        makeAgent({
            id: urbanMaterials.id,
            name: urbanMaterials.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [um1, um2],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'urban-materials-storage',
                name: 'Urban Materials Storage',
            }),
        }),
    );

    const gw1 = glassFactory(EARTH_ID, 'glass-world-factory');
    gw1.scale = 12;
    gw1.maxScale = 12;
    agents.push(
        makeAgent({
            id: glassWorld.id,
            name: glassWorld.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [gw1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'glass-world-storage', name: 'Glass World Storage' }),
        }),
    );

    const bw1 = brickFactory(EARTH_ID, 'brick-works-intl-factory');
    bw1.scale = 10;
    bw1.maxScale = 10;
    agents.push(
        makeAgent({
            id: brickWorksIntl.id,
            name: brickWorksIntl.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [bw1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'brick-works-intl-storage',
                name: 'Brick Works Intl Storage',
            }),
        }),
    );

    const sa1 = concretePlant(EARTH_ID, 'stone-age-concrete');
    sa1.scale = 5;
    sa1.maxScale = 5;
    agents.push(
        makeAgent({
            id: stoneAgeQuarrying.id,
            name: stoneAgeQuarrying.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [sa1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'stone-age-storage', name: 'Stone Age Storage' }),
        }),
    );

    // --- Fertilizer & chemicals (buy gas + phosphate/potash from market) ---
    const [agroChem, soilScience, greenChem] = fertilizerChemSpecs;

    const acf1 = fertilizerPlant(EARTH_ID, 'agrochem-fertilizer');
    acf1.scale = 10;
    acf1.maxScale = 10;
    const acf2 = pesticidePlant(EARTH_ID, 'agrochem-pesticide');
    acf2.scale = 8;
    acf2.maxScale = 8;
    agents.push(
        makeAgent({
            id: agroChem.id,
            name: agroChem.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [acf1, acf2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'agrochem-storage', name: 'AgroChem Storage' }),
        }),
    );

    const ss1 = fertilizerPlant(EARTH_ID, 'soil-science-fertilizer');
    ss1.scale = 8;
    ss1.maxScale = 8;
    agents.push(
        makeAgent({
            id: soilScience.id,
            name: soilScience.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ss1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'soil-science-storage', name: 'Soil Science Storage' }),
        }),
    );

    const gc1 = pesticidePlant(EARTH_ID, 'green-chem-pesticide');
    gc1.scale = 8;
    gc1.maxScale = 8;
    agents.push(
        makeAgent({
            id: greenChem.id,
            name: greenChem.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [gc1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'green-chem-storage', name: 'GreenChem Storage' }),
        }),
    );

    // --- Consumer food & beverages (buy agri products + water from market) ---
    const [worldFoods, beveragePlanet, freshdrinkCo, pharmaGlobal, medlife, paperWorldSpec, northernPaper] =
        consumerGoodsSpecs;

    const wf1 = foodProcessingPlant(EARTH_ID, 'world-foods-processing');
    wf1.scale = 80;
    wf1.maxScale = 80;
    const wf2 = beveragePlant(EARTH_ID, 'world-foods-beverage');
    wf2.scale = 20;
    wf2.maxScale = 20;
    agents.push(
        makeAgent({
            id: worldFoods.id,
            name: worldFoods.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [wf1, wf2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'world-foods-storage', name: 'World Foods Storage' }),
        }),
    );

    const bp1 = beveragePlant(EARTH_ID, 'beverage-planet-plant');
    bp1.scale = 30;
    bp1.maxScale = 30;
    agents.push(
        makeAgent({
            id: beveragePlanet.id,
            name: beveragePlanet.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [bp1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'beverage-planet-storage',
                name: 'Beverage Planet Storage',
            }),
        }),
    );

    const fd1 = beveragePlant(EARTH_ID, 'freshdrink-plant');
    fd1.scale = 20;
    fd1.maxScale = 20;
    const fd2 = foodProcessingPlant(EARTH_ID, 'freshdrink-foods');
    fd2.scale = 30;
    fd2.maxScale = 30;
    agents.push(
        makeAgent({
            id: freshdrinkCo.id,
            name: freshdrinkCo.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [fd1, fd2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'freshdrink-storage', name: 'Freshdrink Storage' }),
        }),
    );

    // --- Pharma (buy agri + chemicals + water from market) ---
    const pg1 = pharmaceuticalPlant(EARTH_ID, 'pharma-global-plant');
    pg1.scale = 8;
    pg1.maxScale = 8;
    agents.push(
        makeAgent({
            id: pharmaGlobal.id,
            name: pharmaGlobal.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pg1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'pharma-global-storage', name: 'PharmaGlobal Storage' }),
        }),
    );

    const ml1 = pharmaceuticalPlant(EARTH_ID, 'medlife-plant');
    ml1.scale = 6;
    ml1.maxScale = 6;
    agents.push(
        makeAgent({
            id: medlife.id,
            name: medlife.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ml1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'medlife-storage', name: 'MedLife Storage' }),
        }),
    );

    // --- Paper mills (buy logs + water from market) ---
    const pw1 = paperMill(EARTH_ID, 'paper-world-mill');
    pw1.scale = 80;
    pw1.maxScale = 80;
    agents.push(
        makeAgent({
            id: paperWorldSpec.id,
            name: paperWorldSpec.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pw1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'paper-world-storage', name: 'Paper World Storage' }),
        }),
    );

    const np1 = paperMill(EARTH_ID, 'northern-paper-mill');
    np1.scale = 60;
    np1.maxScale = 60;
    agents.push(
        makeAgent({
            id: northernPaper.id,
            name: northernPaper.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [np1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'northern-paper-storage', name: 'Northern Paper Storage' }),
        }),
    );

    // --- Textile & clothing (buy cotton from market) ---
    const [fashionWorld, globalTextiles, fiberCraft] = textileSpecs;

    const fw1 = textileMill(EARTH_ID, 'fashion-world-textile');
    fw1.scale = 6;
    fw1.maxScale = 6;
    const fw2 = clothingFactory(EARTH_ID, 'fashion-world-clothing');
    fw2.scale = 8;
    fw2.maxScale = 8;
    agents.push(
        makeAgent({
            id: fashionWorld.id,
            name: fashionWorld.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [fw1, fw2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'fashion-world-storage', name: 'Fashion World Storage' }),
        }),
    );

    const gt1 = textileMill(EARTH_ID, 'global-textiles-mill');
    gt1.scale = 5;
    gt1.maxScale = 5;
    agents.push(
        makeAgent({
            id: globalTextiles.id,
            name: globalTextiles.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [gt1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'global-textiles-storage',
                name: 'Global Textiles Storage',
            }),
        }),
    );

    const fc1 = clothingFactory(EARTH_ID, 'fiber-craft-clothing');
    fc1.scale = 5;
    fc1.maxScale = 5;
    agents.push(
        makeAgent({
            id: fiberCraft.id,
            name: fiberCraft.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [fc1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'fiber-craft-storage', name: 'FiberCraft Storage' }),
        }),
    );

    // --- Furniture (buy lumber + steel + fabric from market) ---
    const [homeFurnishings, woodcraftIntl] = furnitureSpecs;

    const hf1 = furnitureFactory(EARTH_ID, 'home-furnishings-factory');
    hf1.scale = 2;
    hf1.maxScale = 2;
    agents.push(
        makeAgent({
            id: homeFurnishings.id,
            name: homeFurnishings.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [hf1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'home-furnishings-storage',
                name: 'Home Furnishings Storage',
            }),
        }),
    );

    const wci1 = furnitureFactory(EARTH_ID, 'woodcraft-intl-factory');
    wci1.scale = 1;
    wci1.maxScale = 1;
    agents.push(
        makeAgent({
            id: woodcraftIntl.id,
            name: woodcraftIntl.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [wci1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'woodcraft-intl-storage', name: 'Woodcraft Intl Storage' }),
        }),
    );

    // silicon wafer factories (buy sand from market) ---
    const [waferTech, globalWafers] = siliconWaferSpecs;
    const wt1 = siliconWaferFactory(EARTH_ID, 'wafer-tech-factory');
    wt1.scale = 3;
    wt1.maxScale = 3;
    agents.push(
        makeAgent({
            id: waferTech.id,
            name: waferTech.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [wt1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'wafer-tech-storage', name: 'Wafer Tech Storage' }),
        }),
    );

    const gws1 = siliconWaferFactory(EARTH_ID, 'global-wafers-factory');
    gws1.scale = 2;
    gws1.maxScale = 2;
    agents.push(
        makeAgent({
            id: globalWafers.id,
            name: globalWafers.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [gws1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'global-wafers-storage', name: 'Global Wafers Storage' }),
        }),
    );

    // --- Electronic component factories (buy sand+copper+rareEarth+plastic from market) ---
    const [siliconDynamics, globalElectronics, circuitWorld] = techMfgSpecs;

    const sd1 = electronicComponentFactory(EARTH_ID, 'silicon-dynamics-components');
    sd1.scale = 6;
    sd1.maxScale = 6;
    agents.push(
        makeAgent({
            id: siliconDynamics.id,
            name: siliconDynamics.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [sd1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'silicon-dynamics-storage',
                name: 'Silicon Dynamics Storage',
            }),
        }),
    );

    const ge1 = electronicComponentFactory(EARTH_ID, 'global-electronics-components');
    ge1.scale = 5;
    ge1.maxScale = 5;
    agents.push(
        makeAgent({
            id: globalElectronics.id,
            name: globalElectronics.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ge1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'global-electronics-storage',
                name: 'Global Electronics Storage',
            }),
        }),
    );

    const cw1 = electronicComponentFactory(EARTH_ID, 'circuit-world-components');
    cw1.scale = 4;
    cw1.maxScale = 4;
    agents.push(
        makeAgent({
            id: circuitWorld.id,
            name: circuitWorld.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [cw1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'circuit-world-storage', name: 'Circuit World Storage' }),
        }),
    );

    // --- Consumer electronics (buy components + plastic + glass from market) ---
    const [techvision, gadgetWorld, devicePlanet] = consumerElectronicSpecs;

    const tv1 = consumerElectronicsFactory(EARTH_ID, 'techvision-consumer');
    tv1.scale = 4;
    tv1.maxScale = 4;
    agents.push(
        makeAgent({
            id: techvision.id,
            name: techvision.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [tv1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'techvision-storage', name: 'TechVision Storage' }),
        }),
    );

    const gw2 = consumerElectronicsFactory(EARTH_ID, 'gadget-world-consumer');
    gw2.scale = 4;
    gw2.maxScale = 4;
    agents.push(
        makeAgent({
            id: gadgetWorld.id,
            name: gadgetWorld.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [gw2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'gadget-world-storage', name: 'Gadget World Storage' }),
        }),
    );

    const dp1 = consumerElectronicsFactory(EARTH_ID, 'device-planet-consumer');
    dp1.scale = 3;
    dp1.maxScale = 3;
    agents.push(
        makeAgent({
            id: devicePlanet.id,
            name: devicePlanet.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [dp1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'device-planet-storage', name: 'Device Planet Storage' }),
        }),
    );

    // --- Machinery (buy steel + electronic components + plastic from market) ---
    const [mechIndustries, heavyWorks, precisionEngineering] = machinerySpecs;

    const mi1 = machineryFactory(EARTH_ID, 'mech-industries-machinery');
    mi1.scale = 2;
    mi1.maxScale = 2;
    agents.push(
        makeAgent({
            id: mechIndustries.id,
            name: mechIndustries.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [mi1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'mech-industries-storage',
                name: 'Mech Industries Storage',
            }),
        }),
    );

    const hw1 = machineryFactory(EARTH_ID, 'heavy-works-machinery');
    hw1.scale = 2;
    hw1.maxScale = 2;
    agents.push(
        makeAgent({
            id: heavyWorks.id,
            name: heavyWorks.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [hw1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'heavy-works-storage', name: 'Heavy Works Storage' }),
        }),
    );

    const pe1 = machineryFactory(EARTH_ID, 'precision-engineering-machinery');
    pe1.scale = 1;
    pe1.maxScale = 1;
    agents.push(
        makeAgent({
            id: precisionEngineering.id,
            name: precisionEngineering.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pe1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'precision-engineering-storage',
                name: 'Precision Engineering Storage',
            }),
        }),
    );

    // --- Vehicle manufacturers (buy steel+aluminum+plastic+glass+electronic+fabric from market) ---
    const [automotionCorp, drivetechMotors, precisionParts] = vehicleSpecs;

    const au1 = vehicleFactory(EARTH_ID, 'automotion-corp-vehicles');
    au1.scale = 30;
    au1.maxScale = 30;
    agents.push(
        makeAgent({
            id: automotionCorp.id,
            name: automotionCorp.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [au1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'automotion-corp-storage',
                name: 'Automotion Corp Storage',
            }),
        }),
    );

    const dt1 = vehicleFactory(EARTH_ID, 'drivetech-motors-vehicles');
    dt1.scale = 25;
    dt1.maxScale = 25;
    agents.push(
        makeAgent({
            id: drivetechMotors.id,
            name: drivetechMotors.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [dt1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'drivetech-motors-storage',
                name: 'DriveTech Motors Storage',
            }),
        }),
    );

    const pp1 = vehicleFactory(EARTH_ID, 'precision-parts-vehicles');
    pp1.scale = 20;
    pp1.maxScale = 20;
    const pp2 = machineryFactory(EARTH_ID, 'precision-parts-machinery');
    pp2.scale = 1;
    pp2.maxScale = 1;
    agents.push(
        makeAgent({
            id: precisionParts.id,
            name: precisionParts.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pp1, pp2],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'precision-parts-storage',
                name: 'Precision Parts Storage',
            }),
        }),
    );

    // --- Packaging plants (buy paper + plastic from market) ---
    for (const spec of packagingSpecs) {
        const f1 = packagingPlant(EARTH_ID, `${spec.id}-packaging`);
        f1.scale = 100;
        f1.maxScale = 100;
        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [f1],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
            }),
        );
    }

    // --- Administrative centers (buy paper + consumer electronics from market) ---
    for (const spec of adminSpecs) {
        const f1 = administrativeCenter(EARTH_ID, `${spec.id}-admin`);
        f1.scale = 5000;
        f1.maxScale = 5000;
        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [f1],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
            }),
        );
    }

    // --- Logistics hubs (buy vehicle + fuel from market; need admin service) ---
    for (const spec of logisticsSpecs) {
        const f1 = logisticsHub(EARTH_ID, `${spec.id}-logistics`);
        f1.scale = 2000;
        f1.maxScale = 2000;
        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [f1],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
            }),
        );
    }

    // --- Grocery chains (buy processed food + beverage + packaging from market; need logistics + admin services) ---
    for (const spec of grocerySpecs) {
        const f1 = groceryChain(EARTH_ID, `${spec.id}-grocery`);
        f1.scale = 2000;
        f1.maxScale = 2000;
        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [f1],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
            }),
        );
    }

    // --- Retail chains (buy consumer electronics + clothing + furniture from market; need logistics + admin services) ---
    for (const spec of retailSpecs) {
        const f1 = retailChain(EARTH_ID, `${spec.id}-retail`);
        f1.scale = 1000;
        f1.maxScale = 1000;
        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [f1],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
            }),
        );
    }

    // --- Hospitals (buy pharma + chemicals from market; need logistics + admin services) ---
    for (const spec of healthcareSpecs) {
        const f1 = hospital(EARTH_ID, `${spec.id}-hospital`);
        f1.scale = 1000;
        f1.maxScale = 1000;
        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [f1],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
            }),
        );
    }

    // --- Construction services (buy concrete + steel + machinery from market; need admin + logistics services) ---
    for (const spec of constructionSvcSpecs) {
        const f1 = constructionService(EARTH_ID, `${spec.id}-construction`);
        f1.scale = 500;
        f1.maxScale = 500;
        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [f1],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
            }),
        );
    }

    // --- Education providers (buy paper + furniture from market; need admin service) ---
    const [eduNetwork, knowledgeGlobal, campusSystems] = educationSpecs;

    const en1 = school(EARTH_ID, `${eduNetwork.id}-school`);
    en1.scale = 500;
    en1.maxScale = 500;
    const en2 = university(EARTH_ID, `${eduNetwork.id}-university`);
    en2.scale = 300;
    en2.maxScale = 300;
    agents.push(
        makeAgent({
            id: eduNetwork.id,
            name: eduNetwork.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [en1, en2],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: `${eduNetwork.id}-storage`,
                name: `${eduNetwork.name} Storage`,
            }),
        }),
    );

    const kg1 = school(EARTH_ID, `${knowledgeGlobal.id}-school`);
    kg1.scale = 400;
    kg1.maxScale = 400;
    const kg2 = university(EARTH_ID, `${knowledgeGlobal.id}-university`);
    kg2.scale = 200;
    kg2.maxScale = 200;
    agents.push(
        makeAgent({
            id: knowledgeGlobal.id,
            name: knowledgeGlobal.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [kg1, kg2],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: `${knowledgeGlobal.id}-storage`,
                name: `${knowledgeGlobal.name} Storage`,
            }),
        }),
    );

    const edu3s = school(EARTH_ID, `${campusSystems.id}-school`);
    edu3s.scale = 300;
    edu3s.maxScale = 300;
    const edu3u = university(EARTH_ID, `${campusSystems.id}-university`);
    edu3u.scale = 150;
    edu3u.maxScale = 150;
    agents.push(
        makeAgent({
            id: campusSystems.id,
            name: campusSystems.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [edu3s, edu3u],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: `${campusSystems.id}-storage`,
                name: `${campusSystems.name} Storage`,
            }),
        }),
    );

    // --- Unclaimed remainders ---
    const remainders = [
        { claims: arableClaims, total: TOTAL_ARABLE, type: arableLandResourceType, prefix: 'earth-arable' },
        { claims: waterClaims, total: TOTAL_WATER, type: waterSourceResourceType, prefix: 'earth-water' },
        { claims: ironOreClaims, total: TOTAL_IRON_ORE, type: ironOreDepositResourceType, prefix: 'earth-iron' },
        { claims: coalClaims, total: TOTAL_COAL, type: coalDepositResourceType, prefix: 'earth-coal' },
        { claims: oilClaims, total: TOTAL_OIL, type: oilReservoirResourceType, prefix: 'earth-oil' },
        { claims: gasClaims, total: TOTAL_GAS, type: naturalGasFieldResourceType, prefix: 'earth-gas' },
        { claims: forestClaims, total: TOTAL_FOREST, type: forestResourceType, prefix: 'earth-forest' },
        { claims: copperClaims, total: TOTAL_COPPER, type: copperDepositResourceType, prefix: 'earth-copper' },
        {
            claims: rareEarthClaims,
            total: TOTAL_RARE_EARTH,
            type: rareEarthDepositResourceType,
            prefix: 'earth-rare-earth',
        },
        { claims: sandClaims, total: TOTAL_SAND, type: sandDepositResourceType, prefix: 'earth-sand' },
        {
            claims: phosphateClaims,
            total: TOTAL_PHOSPHATE,
            type: phosphateRockDepositResourceType,
            prefix: 'earth-phosphate',
        },
        { claims: potashClaims, total: TOTAL_POTASH, type: potashDepositResourceType, prefix: 'earth-potash' },
        { claims: bauxiteClaims, total: TOTAL_BAUXITE, type: bauxiteDepositResourceType, prefix: 'earth-bauxite' },
        {
            claims: limestoneClaims,
            total: TOTAL_LIMESTONE,
            type: limestoneDepositResourceType,
            prefix: 'earth-limestone',
        },
        { claims: clayClaims, total: TOTAL_CLAY, type: clayDepositResourceType, prefix: 'earth-clay' },
        { claims: stoneClaims, total: TOTAL_STONE, type: stoneQuarryResourceType, prefix: 'earth-stone' },
    ];

    for (const { claims, total, type, prefix } of remainders) {
        const remainder = makeUnclaimedRemainder({
            idPrefix: prefix,
            type,
            total,
            existing: claims,
            claimAgentId: GOV,
        });
        if (remainder) {
            claims.push(remainder);
            govClaims.push(remainder.id);
        }
    }

    // --- Earth Government agent ---
    const govWaterFacility = waterExtractionFacility(EARTH_ID, 'earth-gov-water');
    govWaterFacility.scale = 200;
    govWaterFacility.maxScale = 200;
    const govAgriFacility = agriculturalProductionFacility(EARTH_ID, 'earth-gov-agri');
    govAgriFacility.scale = 800;
    govAgriFacility.maxScale = 800;

    const govStorage = makeStorage({ planetId: EARTH_ID, id: 'earth-gov-storage', name: 'Gov. Central Storage' });
    const govAgent = makeAgent({
        id: GOV,
        name: 'Earth Government',
        associatedPlanetId: EARTH_ID,
        planetId: EARTH_ID,
        facilities: [govWaterFacility, govAgriFacility],
        storage: govStorage,
        claims: govClaims,
        tenancies: govTenancies,
    });
    agents.unshift(govAgent);

    const planet: Planet = {
        id: EARTH_ID,
        name: 'Earth',
        position: { x: 0, y: 0, z: 0 },
        population: createPopulation(8_000_000_000),
        governmentId: GOV,
        bank: { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 },
        wagePerEdu: { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 },
        marketPrices: { ...initialMarketPrices },
        lastMarketResult: {},
        resources: {
            [arableLandResourceType.name]: arableClaims,
            [waterSourceResourceType.name]: waterClaims,
            [ironOreDepositResourceType.name]: ironOreClaims,
            [coalDepositResourceType.name]: coalClaims,
            [oilReservoirResourceType.name]: oilClaims,
            [naturalGasFieldResourceType.name]: gasClaims,
            [forestResourceType.name]: forestClaims,
            [copperDepositResourceType.name]: copperClaims,
            [rareEarthDepositResourceType.name]: rareEarthClaims,
            [sandDepositResourceType.name]: sandClaims,
            [phosphateRockDepositResourceType.name]: phosphateClaims,
            [potashDepositResourceType.name]: potashClaims,
            [bauxiteDepositResourceType.name]: bauxiteClaims,
            [limestoneDepositResourceType.name]: limestoneClaims,
            [clayDepositResourceType.name]: clayClaims,
            [stoneQuarryResourceType.name]: stoneClaims,
        },
        infrastructure: {
            primarySchools: 10000,
            secondarySchools: 5000,
            universities: 2000,
            hospitals: 3000,
            mobility: { roads: 100000, railways: 50000, airports: 1000, seaports: 500, spaceports: 10 },
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

    return { planet, agents };
}
