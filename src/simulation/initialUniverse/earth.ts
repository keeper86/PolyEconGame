import { agriculturalProductResourceType } from '../planet/resources';
import {
    arableLandResourceType,
    coalDepositResourceType,
    copperDepositResourceType,
    forestResourceType,
    ironOreDepositResourceType,
    naturalGasFieldResourceType,
    oilReservoirResourceType,
    phosphateRockDepositResourceType,
    potashDepositResourceType,
    rareEarthDepositResourceType,
    sandDepositResourceType,
    waterSourceResourceType,
} from '../planet/landBoundResources';
import {
    agriculturalProductionFacility,
    aluminumSmelter,
    beveragePlant,
    brickFactory,
    cementPlant,
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
    textileMill,
    vehicleFactory,
    waterExtractionFacility,
} from '../planet/facilities';
import type { Agent, Planet } from '../planet/planet';
import { makeAgent, makeStorage, createPopulation, makeDefaultEnvironment } from './helpers';
import { makeClaim, makeUnclaimedRemainder } from './resourceClaimFactory';
import type { ResourceClaimEntry } from './helpers';

export const EARTH_ID = 'earth';
const GOV = 'earth-government';

const TOTAL_ARABLE = 20_000_000;
const TOTAL_WATER = 20_000_000;
const TOTAL_IRON_ORE = 10_000_000;
const TOTAL_COAL = 8_000_000;
const TOTAL_OIL = 6_000_000;
const TOTAL_GAS = 5_000_000;
const TOTAL_FOREST = 4_000_000;
const TOTAL_COPPER = 3_000_000;
const TOTAL_RARE_EARTH = 1_000_000;
const TOTAL_SAND = 4_000_000;
const TOTAL_PHOSPHATE = 2_000_000;
const TOTAL_POTASH = 2_000_000;

interface AgriSpec {
    id: string;
    name: string;
    arableLand: number;
    waterSource: number;
    wealth: number;
}

interface MiningSpec {
    id: string;
    name: string;
    ironOre: number;
    wealth: number;
}

interface CoalSpec {
    id: string;
    name: string;
    coal: number;
    wealth: number;
}

interface OilSpec {
    id: string;
    name: string;
    oil: number;
    gas: number;
    wealth: number;
}

interface TimberSpec {
    id: string;
    name: string;
    forest: number;
    wealth: number;
}

interface RefinerySpec {
    id: string;
    name: string;
    wealth: number;
}

interface MfgSpec {
    id: string;
    name: string;
    wealth: number;
}

const agriSpecs: AgriSpec[] = [
    // Large corporations
    { id: 'agri-corp-alpha', name: 'Alpha Agri Corp', arableLand: 300000, waterSource: 300000, wealth: 5e8 },
    { id: 'agri-corp-beta', name: 'Beta Agri Corp', arableLand: 280000, waterSource: 280000, wealth: 4.5e8 },
    { id: 'agri-corp-gamma', name: 'Gamma Agri Corp', arableLand: 250000, waterSource: 250000, wealth: 4e8 },
    { id: 'agri-corp-delta', name: 'Delta Agri Corp', arableLand: 220000, waterSource: 220000, wealth: 3.5e8 },
    { id: 'agri-corp-epsilon', name: 'Epsilon Agri Corp', arableLand: 200000, waterSource: 200000, wealth: 3e8 },
    // Mid-size
    { id: 'green-fields', name: 'Green Fields Ltd', arableLand: 150000, waterSource: 150000, wealth: 2e8 },
    { id: 'harvest-moon', name: 'Harvest Moon Inc', arableLand: 140000, waterSource: 140000, wealth: 1.8e8 },
    { id: 'terra-farms', name: 'Terra Farms Co', arableLand: 130000, waterSource: 130000, wealth: 1.5e8 },
    { id: 'golden-grain', name: 'Golden Grain LLC', arableLand: 120000, waterSource: 120000, wealth: 1.2e8 },
    { id: 'sunridge-ag', name: 'Sunridge Agriculture', arableLand: 110000, waterSource: 110000, wealth: 1e8 },
    { id: 'prairie-harvest', name: 'Prairie Harvest Co', arableLand: 100000, waterSource: 100000, wealth: 9e7 },
    { id: 'valley-produce', name: 'Valley Produce Inc', arableLand: 90000, waterSource: 90000, wealth: 8e7 },
    // Small farms
    { id: 'riverside-farm', name: 'Riverside Farm', arableLand: 70000, waterSource: 70000, wealth: 5e7 },
    { id: 'hilltop-ag', name: 'Hilltop Agriculture', arableLand: 60000, waterSource: 60000, wealth: 4e7 },
    { id: 'meadow-co', name: 'Meadow & Co', arableLand: 50000, waterSource: 50000, wealth: 3.5e7 },
    { id: 'oak-valley', name: 'Oak Valley Farms', arableLand: 45000, waterSource: 45000, wealth: 3e7 },
    { id: 'cedar-fields', name: 'Cedar Fields Ltd', arableLand: 40000, waterSource: 40000, wealth: 2.5e7 },
    { id: 'brookside-ag', name: 'Brookside Agriculture', arableLand: 35000, waterSource: 35000, wealth: 2e7 },
    { id: 'pinewood-farm', name: 'Pinewood Farm Co', arableLand: 30000, waterSource: 30000, wealth: 1.5e7 },
    { id: 'willow-creek', name: 'Willow Creek Farms', arableLand: 25000, waterSource: 25000, wealth: 1e7 },
    // Cotton & textile feedstock farms
    { id: 'cotton-world', name: 'Cotton World Corp', arableLand: 80000, waterSource: 80000, wealth: 1.2e8 },
    { id: 'textile-fields', name: 'Textile Fields Ltd', arableLand: 60000, waterSource: 60000, wealth: 9e7 },
];

const miningSpecs: MiningSpec[] = [
    { id: 'test-company', name: 'Test Company', ironOre: 3000000, wealth: 1e9 },
    { id: 'ironworks-global', name: 'Ironworks Global', ironOre: 2000000, wealth: 7e8 },
    { id: 'deep-core-mining', name: 'Deep Core Mining', ironOre: 1500000, wealth: 4e8 },
    { id: 'red-earth-mines', name: 'Red Earth Mines', ironOre: 1000000, wealth: 2.5e8 },
    { id: 'steel-source-co', name: 'Steel Source Co', ironOre: 800000, wealth: 1.5e8 },
    { id: 'ore-horizon', name: 'Ore Horizon Ltd', ironOre: 500000, wealth: 1e8 },
];

const coalSpecs: CoalSpec[] = [
    { id: 'blackrock-coal', name: 'Blackrock Coal Co', coal: 2000000, wealth: 6e8 },
    { id: 'carbon-energy', name: 'Carbon Energy Group', coal: 1500000, wealth: 4e8 },
    { id: 'deep-seam-coal', name: 'Deep Seam Coal', coal: 1000000, wealth: 2.5e8 },
    { id: 'coalfields-int', name: 'Coalfields International', coal: 800000, wealth: 2e8 },
];

const oilSpecs: OilSpec[] = [
    { id: 'petro-global', name: 'PetroGlobal Corp', oil: 1500000, gas: 1000000, wealth: 2e9 },
    { id: 'continental-oil', name: 'Continental Oil Inc', oil: 1200000, gas: 800000, wealth: 1.5e9 },
    { id: 'north-sea-energy', name: 'North Sea Energy', oil: 800000, gas: 600000, wealth: 8e8 },
    { id: 'gulf-petroleum', name: 'Gulf Petroleum Ltd', oil: 600000, gas: 400000, wealth: 6e8 },
];

const timberSpecs: TimberSpec[] = [
    { id: 'great-northern-timber', name: 'Great Northern Timber', forest: 800000, wealth: 3e8 },
    { id: 'pacific-lumber', name: 'Pacific Lumber Co', forest: 600000, wealth: 2e8 },
    { id: 'boreal-wood', name: 'Boreal Wood Products', forest: 500000, wealth: 1.5e8 },
    { id: 'tropical-forest-co', name: 'Tropical Forest Co', forest: 400000, wealth: 1.2e8 },
];

const copperRareEarthSpecs: RefinerySpec[] = [
    { id: 'copper-basin-mining', name: 'Copper Basin Mining', wealth: 4e8 },
    { id: 'rare-elements-corp', name: 'Rare Elements Corp', wealth: 5e8 },
    { id: 'pacific-copper-co', name: 'Pacific Copper Co', wealth: 2.5e8 },
];

const sandPhosphateSpecs: RefinerySpec[] = [
    { id: 'desert-sand-corp', name: 'Desert Sand Corp', wealth: 1.5e8 },
    { id: 'phosphate-global', name: 'Phosphate Global', wealth: 2e8 },
    { id: 'potash-ag-supply', name: 'Potash Ag Supply', wealth: 1.8e8 },
];

const steelMfgSpecs: MfgSpec[] = [
    { id: 'atlas-steel', name: 'Atlas Steel Works', wealth: 1.2e9 },
    { id: 'meridian-steel', name: 'Meridian Steel Corp', wealth: 9e8 },
    { id: 'nova-metals', name: 'Nova Metals Group', wealth: 7e8 },
    { id: 'forge-masters', name: 'Forge Masters Inc', wealth: 5e8 },
];

const refineryMfgSpecs: MfgSpec[] = [
    { id: 'horizon-refinery', name: 'Horizon Refinery Corp', wealth: 1.5e9 },
    { id: 'global-petrochem', name: 'Global Petrochemicals', wealth: 1.2e9 },
    { id: 'coastal-refining', name: 'Coastal Refining Ltd', wealth: 8e8 },
];

const buildMaterialsSpecs: MfgSpec[] = [
    { id: 'concrete-giant', name: 'Concrete Giant Corp', wealth: 6e8 },
    { id: 'urban-materials', name: 'Urban Materials Inc', wealth: 4e8 },
    { id: 'glass-world', name: 'Glass World Ltd', wealth: 3e8 },
    { id: 'brick-works-intl', name: 'Brick Works International', wealth: 2.5e8 },
];

const fertilizerChemSpecs: MfgSpec[] = [
    { id: 'agrochem-global', name: 'AgroChem Global', wealth: 7e8 },
    { id: 'soil-science-corp', name: 'Soil Science Corp', wealth: 5e8 },
    { id: 'green-chem-ltd', name: 'GreenChem Ltd', wealth: 3e8 },
];

const consumerGoodsSpecs: MfgSpec[] = [
    { id: 'world-foods-corp', name: 'World Foods Corp', wealth: 8e8 },
    { id: 'beverage-planet', name: 'Beverage Planet Inc', wealth: 6e8 },
    { id: 'pharma-global', name: 'PharmaGlobal Corp', wealth: 1.5e9 },
    { id: 'fashion-world', name: 'Fashion World Ltd', wealth: 5e8 },
    { id: 'home-furnishings', name: 'Home Furnishings Corp', wealth: 4e8 },
    { id: 'paper-world', name: 'Paper World Inc', wealth: 3e8 },
];

const techMfgSpecs: MfgSpec[] = [
    { id: 'silicon-dynamics', name: 'Silicon Dynamics Corp', wealth: 2e9 },
    { id: 'global-electronics', name: 'Global Electronics Inc', wealth: 1.8e9 },
    { id: 'mech-industries', name: 'Mech Industries Ltd', wealth: 1.2e9 },
    { id: 'automotion-corp', name: 'Automotion Corp', wealth: 1.5e9 },
    { id: 'precision-parts', name: 'Precision Parts Co', wealth: 8e8 },
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

    const govArableId = 'earth-gov-arable';
    const govWaterId = 'earth-gov-water';
    const govClaims: string[] = [govArableId, govWaterId];
    const govTenancies: string[] = [govArableId, govWaterId];

    arableClaims.push(
        makeClaim({
            id: govArableId,
            type: arableLandResourceType,
            quantity: 2_000_000_000,
            claimAgentId: GOV,
            tenantAgentId: GOV,
        }),
    );
    waterClaims.push(
        makeClaim({
            id: govWaterId,
            type: waterSourceResourceType,
            quantity: 2_000_000_000,
            claimAgentId: GOV,
            tenantAgentId: GOV,
        }),
    );

    // --- Agricultural companies ---
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
                tenantCostInCoins: Math.floor(spec.arableLand * 0.01),
            }),
        );
        waterClaims.push(
            makeClaim({
                id: waterId,
                type: waterSourceResourceType,
                quantity: spec.waterSource,
                claimAgentId: GOV,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.waterSource * 0.005),
            }),
        );

        const agriScale = spec.arableLand / 1000;
        const waterScale = spec.waterSource / 1000;
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
                wealth: spec.wealth,
            }),
        );
    }

    // --- Iron ore mining companies ---
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
                tenantCostInCoins: Math.floor(spec.ironOre * 0.001),
                renewable: false,
            }),
        );

        const ironScale = spec.ironOre / 1000;
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
                wealth: spec.wealth,
            }),
        );
    }

    // --- Coal mining companies ---
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
                tenantCostInCoins: Math.floor(spec.coal * 0.001),
                renewable: false,
            }),
        );

        const scale = spec.coal / 1000;
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
                wealth: spec.wealth,
            }),
        );
    }

    // --- Oil & gas companies ---
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
                tenantCostInCoins: Math.floor(spec.oil * 0.002),
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
                tenantCostInCoins: Math.floor(spec.gas * 0.002),
                renewable: false,
            }),
        );

        const oilFacility = oilWell(EARTH_ID, `${spec.id}-oil`);
        oilFacility.scale = spec.oil / 1000;
        oilFacility.maxScale = oilFacility.scale;

        const gasFacility = naturalGasWell(EARTH_ID, `${spec.id}-gas`);
        gasFacility.scale = spec.gas / 1000;
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
                wealth: spec.wealth,
            }),
        );
    }

    // --- Timber companies ---
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
                tenantCostInCoins: Math.floor(spec.forest * 0.002),
            }),
        );

        const logging = loggingCamp(EARTH_ID, `${spec.id}-logging`);
        logging.scale = spec.forest / 1000;
        logging.maxScale = logging.scale;

        const mill = sawmill(EARTH_ID, `${spec.id}-sawmill`);
        mill.scale = Math.floor(spec.forest / 1500);
        mill.maxScale = mill.scale;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [logging, mill],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
                tenancies: [forestId],
                wealth: spec.wealth,
            }),
        );
    }

    // --- Copper & rare earth mining ---
    const [copperBasin, rareElements, pacificCopper] = copperRareEarthSpecs;

    const copperBasinCopperId = 'earth-copper-copper-basin-mining';
    govClaims.push(copperBasinCopperId);
    copperClaims.push(
        makeClaim({
            id: copperBasinCopperId,
            type: copperDepositResourceType,
            quantity: 1_200_000,
            claimAgentId: GOV,
            tenantAgentId: copperBasin.id,
            tenantCostInCoins: 1200,
            renewable: false,
        }),
    );
    const cb1 = copperMine(EARTH_ID, 'copper-basin-mine');
    cb1.scale = 1200;
    cb1.maxScale = 1200;
    const cb2 = copperSmelter(EARTH_ID, 'copper-basin-smelter');
    cb2.scale = 800;
    cb2.maxScale = 800;
    agents.push(
        makeAgent({
            id: copperBasin.id,
            name: copperBasin.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [cb1, cb2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'copper-basin-storage', name: 'Copper Basin Storage' }),
            tenancies: [copperBasinCopperId],
            wealth: copperBasin.wealth,
        }),
    );

    const rareEarthId = 'earth-rare-earth-rare-elements';
    govClaims.push(rareEarthId);
    rareEarthClaims.push(
        makeClaim({
            id: rareEarthId,
            type: rareEarthDepositResourceType,
            quantity: 600_000,
            claimAgentId: GOV,
            tenantAgentId: rareElements.id,
            tenantCostInCoins: 600,
            renewable: false,
        }),
    );
    const re1 = rareEarthMine(EARTH_ID, 'rare-elements-mine');
    re1.scale = 600;
    re1.maxScale = 600;
    agents.push(
        makeAgent({
            id: rareElements.id,
            name: rareElements.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [re1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'rare-elements-storage', name: 'Rare Elements Storage' }),
            tenancies: [rareEarthId],
            wealth: rareElements.wealth,
        }),
    );

    const pacificCopperId = 'earth-copper-pacific-copper';
    govClaims.push(pacificCopperId);
    copperClaims.push(
        makeClaim({
            id: pacificCopperId,
            type: copperDepositResourceType,
            quantity: 800_000,
            claimAgentId: GOV,
            tenantAgentId: pacificCopper.id,
            tenantCostInCoins: 800,
            renewable: false,
        }),
    );
    const pc1 = copperMine(EARTH_ID, 'pacific-copper-mine');
    pc1.scale = 800;
    pc1.maxScale = 800;
    agents.push(
        makeAgent({
            id: pacificCopper.id,
            name: pacificCopper.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pc1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'pacific-copper-storage', name: 'Pacific Copper Storage' }),
            tenancies: [pacificCopperId],
            wealth: pacificCopper.wealth,
        }),
    );

    // --- Sand, phosphate & potash ---
    const [desertSand, phosphateGlobal, potashSupply] = sandPhosphateSpecs;

    const desertSandId = 'earth-sand-desert-sand';
    govClaims.push(desertSandId);
    sandClaims.push(
        makeClaim({
            id: desertSandId,
            type: sandDepositResourceType,
            quantity: 2_000_000,
            claimAgentId: GOV,
            tenantAgentId: desertSand.id,
            tenantCostInCoins: 500,
            renewable: true,
        }),
    );
    const ds1 = sandMine(EARTH_ID, 'desert-sand-mine');
    ds1.scale = 2000;
    ds1.maxScale = 2000;
    agents.push(
        makeAgent({
            id: desertSand.id,
            name: desertSand.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ds1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'desert-sand-storage', name: 'Desert Sand Storage' }),
            tenancies: [desertSandId],
            wealth: desertSand.wealth,
        }),
    );

    const phosphateId = 'earth-phosphate-phosphate-global';
    govClaims.push(phosphateId);
    phosphateClaims.push(
        makeClaim({
            id: phosphateId,
            type: phosphateRockDepositResourceType,
            quantity: 1_200_000,
            claimAgentId: GOV,
            tenantAgentId: phosphateGlobal.id,
            tenantCostInCoins: 600,
            renewable: false,
        }),
    );
    const ph1 = phosphateMine(EARTH_ID, 'phosphate-global-mine');
    ph1.scale = 1200;
    ph1.maxScale = 1200;
    agents.push(
        makeAgent({
            id: phosphateGlobal.id,
            name: phosphateGlobal.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ph1],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'phosphate-global-storage',
                name: 'Phosphate Global Storage',
            }),
            tenancies: [phosphateId],
            wealth: phosphateGlobal.wealth,
        }),
    );

    const potashId = 'earth-potash-potash-supply';
    govClaims.push(potashId);
    potashClaims.push(
        makeClaim({
            id: potashId,
            type: potashDepositResourceType,
            quantity: 1_200_000,
            claimAgentId: GOV,
            tenantAgentId: potashSupply.id,
            tenantCostInCoins: 600,
            renewable: false,
        }),
    );
    const pk1 = potashMine(EARTH_ID, 'potash-supply-mine');
    pk1.scale = 1200;
    pk1.maxScale = 1200;
    agents.push(
        makeAgent({
            id: potashSupply.id,
            name: potashSupply.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pk1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'potash-supply-storage', name: 'Potash Supply Storage' }),
            tenancies: [potashId],
            wealth: potashSupply.wealth,
        }),
    );

    // --- Steel manufacturers (buy iron ore + coal, produce steel) ---
    for (const spec of steelMfgSpecs) {
        const smelter = ironSmelter(EARTH_ID, `${spec.id}-smelter`);
        smelter.scale = 500;
        smelter.maxScale = 500;
        const alumSmelter = aluminumSmelter(EARTH_ID, `${spec.id}-alum`);
        alumSmelter.scale = 200;
        alumSmelter.maxScale = 200;
        const powerPlant = coalPowerPlant(EARTH_ID, `${spec.id}-power`);
        powerPlant.scale = 100;
        powerPlant.maxScale = 100;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [powerPlant, smelter, alumSmelter],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
                wealth: spec.wealth,
            }),
        );
    }

    // --- Oil refineries ---
    for (const spec of refineryMfgSpecs) {
        const refinery = oilRefinery(EARTH_ID, `${spec.id}-refinery`);
        refinery.scale = 600;
        refinery.maxScale = 600;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                planetId: EARTH_ID,
                facilities: [refinery],
                storage: makeStorage({ planetId: EARTH_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
                wealth: spec.wealth,
            }),
        );
    }

    // --- Building materials manufacturers ---
    const [concreteGiant, urbanMaterials, glassWorld, brickWorksIntl] = buildMaterialsSpecs;

    const cg1 = cementPlant(EARTH_ID, 'concrete-giant-cement');
    cg1.scale = 400;
    cg1.maxScale = 400;
    const cg2 = concretePlant(EARTH_ID, 'concrete-giant-concrete');
    cg2.scale = 300;
    cg2.maxScale = 300;
    agents.push(
        makeAgent({
            id: concreteGiant.id,
            name: concreteGiant.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [cg1, cg2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'concrete-giant-storage', name: 'Concrete Giant Storage' }),
            wealth: concreteGiant.wealth,
        }),
    );

    const um1 = cementPlant(EARTH_ID, 'urban-materials-cement');
    um1.scale = 300;
    um1.maxScale = 300;
    const um2 = brickFactory(EARTH_ID, 'urban-materials-brick');
    um2.scale = 200;
    um2.maxScale = 200;
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
            wealth: urbanMaterials.wealth,
        }),
    );

    const gw1 = glassFactory(EARTH_ID, 'glass-world-factory');
    gw1.scale = 400;
    gw1.maxScale = 400;
    agents.push(
        makeAgent({
            id: glassWorld.id,
            name: glassWorld.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [gw1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'glass-world-storage', name: 'Glass World Storage' }),
            wealth: glassWorld.wealth,
        }),
    );

    const bw1 = brickFactory(EARTH_ID, 'brick-works-intl-factory');
    bw1.scale = 300;
    bw1.maxScale = 300;
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
            wealth: brickWorksIntl.wealth,
        }),
    );

    // --- Fertilizer & chemicals ---
    const [agroChem, soilScience, greenChem] = fertilizerChemSpecs;

    const ac1 = fertilizerPlant(EARTH_ID, 'agrochem-fertilizer');
    ac1.scale = 600;
    ac1.maxScale = 600;
    const ac2 = pesticidePlant(EARTH_ID, 'agrochem-pesticide');
    ac2.scale = 300;
    ac2.maxScale = 300;
    agents.push(
        makeAgent({
            id: agroChem.id,
            name: agroChem.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ac1, ac2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'agrochem-storage', name: 'AgroChem Storage' }),
            wealth: agroChem.wealth,
        }),
    );

    const ss1 = fertilizerPlant(EARTH_ID, 'soil-science-fertilizer');
    ss1.scale = 400;
    ss1.maxScale = 400;
    agents.push(
        makeAgent({
            id: soilScience.id,
            name: soilScience.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ss1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'soil-science-storage', name: 'Soil Science Storage' }),
            wealth: soilScience.wealth,
        }),
    );

    const gc1 = pesticidePlant(EARTH_ID, 'green-chem-pesticide');
    gc1.scale = 400;
    gc1.maxScale = 400;
    agents.push(
        makeAgent({
            id: greenChem.id,
            name: greenChem.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [gc1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'green-chem-storage', name: 'GreenChem Storage' }),
            wealth: greenChem.wealth,
        }),
    );

    // --- Consumer goods manufacturers ---
    const [worldFoods, beveragePlanet, pharmaGlobal, fashionWorld, homeFurnishings, paperWorld] = consumerGoodsSpecs;

    const wf1 = foodProcessingPlant(EARTH_ID, 'world-foods-processing');
    wf1.scale = 800;
    wf1.maxScale = 800;
    const wf2 = beveragePlant(EARTH_ID, 'world-foods-beverage');
    wf2.scale = 400;
    wf2.maxScale = 400;
    agents.push(
        makeAgent({
            id: worldFoods.id,
            name: worldFoods.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [wf1, wf2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'world-foods-storage', name: 'World Foods Storage' }),
            wealth: worldFoods.wealth,
        }),
    );

    const bp1 = beveragePlant(EARTH_ID, 'beverage-planet-plant');
    bp1.scale = 600;
    bp1.maxScale = 600;
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
            wealth: beveragePlanet.wealth,
        }),
    );

    const pg1 = pharmaceuticalPlant(EARTH_ID, 'pharma-global-plant');
    pg1.scale = 500;
    pg1.maxScale = 500;
    agents.push(
        makeAgent({
            id: pharmaGlobal.id,
            name: pharmaGlobal.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pg1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'pharma-global-storage', name: 'PharmaGlobal Storage' }),
            wealth: pharmaGlobal.wealth,
        }),
    );

    const fw1 = textileMill(EARTH_ID, 'fashion-world-textile');
    fw1.scale = 400;
    fw1.maxScale = 400;
    const fw2 = clothingFactory(EARTH_ID, 'fashion-world-clothing');
    fw2.scale = 300;
    fw2.maxScale = 300;
    agents.push(
        makeAgent({
            id: fashionWorld.id,
            name: fashionWorld.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [fw1, fw2],
            storage: makeStorage({ planetId: EARTH_ID, id: 'fashion-world-storage', name: 'Fashion World Storage' }),
            wealth: fashionWorld.wealth,
        }),
    );

    const hf1 = furnitureFactory(EARTH_ID, 'home-furnishings-factory');
    hf1.scale = 300;
    hf1.maxScale = 300;
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
            wealth: homeFurnishings.wealth,
        }),
    );

    const pw1 = paperMill(EARTH_ID, 'paper-world-mill');
    pw1.scale = 400;
    pw1.maxScale = 400;
    agents.push(
        makeAgent({
            id: paperWorld.id,
            name: paperWorld.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [pw1],
            storage: makeStorage({ planetId: EARTH_ID, id: 'paper-world-storage', name: 'Paper World Storage' }),
            wealth: paperWorld.wealth,
        }),
    );

    // --- Tech & heavy manufacturing ---
    const [siliconDynamics, globalElectronics, mechIndustries, automotionCorp, precisionParts] = techMfgSpecs;

    const sd1 = electronicComponentFactory(EARTH_ID, 'silicon-dynamics-components');
    sd1.scale = 600;
    sd1.maxScale = 600;
    const sd2 = consumerElectronicsFactory(EARTH_ID, 'silicon-dynamics-consumer');
    sd2.scale = 400;
    sd2.maxScale = 400;
    agents.push(
        makeAgent({
            id: siliconDynamics.id,
            name: siliconDynamics.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [sd1, sd2],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'silicon-dynamics-storage',
                name: 'Silicon Dynamics Storage',
            }),
            wealth: siliconDynamics.wealth,
        }),
    );

    const ge1 = electronicComponentFactory(EARTH_ID, 'global-electronics-components');
    ge1.scale = 400;
    ge1.maxScale = 400;
    const ge2 = consumerElectronicsFactory(EARTH_ID, 'global-electronics-consumer');
    ge2.scale = 600;
    ge2.maxScale = 600;
    agents.push(
        makeAgent({
            id: globalElectronics.id,
            name: globalElectronics.name,
            associatedPlanetId: EARTH_ID,
            planetId: EARTH_ID,
            facilities: [ge1, ge2],
            storage: makeStorage({
                planetId: EARTH_ID,
                id: 'global-electronics-storage',
                name: 'Global Electronics Storage',
            }),
            wealth: globalElectronics.wealth,
        }),
    );

    const mi1 = machineryFactory(EARTH_ID, 'mech-industries-machinery');
    mi1.scale = 400;
    mi1.maxScale = 400;
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
            wealth: mechIndustries.wealth,
        }),
    );

    const au1 = vehicleFactory(EARTH_ID, 'automotion-corp-vehicles');
    au1.scale = 300;
    au1.maxScale = 300;
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
            wealth: automotionCorp.wealth,
        }),
    );

    const pp1 = machineryFactory(EARTH_ID, 'precision-parts-machinery');
    pp1.scale = 200;
    pp1.maxScale = 200;
    const pp2 = vehicleFactory(EARTH_ID, 'precision-parts-vehicles');
    pp2.scale = 100;
    pp2.maxScale = 100;
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
            wealth: precisionParts.wealth,
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
    govWaterFacility.scale = 2000;
    govWaterFacility.maxScale = 2000;
    const govAgriFacility = agriculturalProductionFacility(EARTH_ID, 'earth-gov-agri');
    govAgriFacility.scale = 2000;
    govAgriFacility.maxScale = 2000;

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
        marketPrices: { [agriculturalProductResourceType.name]: 1.0 },
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
