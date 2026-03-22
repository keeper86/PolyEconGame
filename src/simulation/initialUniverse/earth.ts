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
    { id: 'agri-corp-alpha', name: 'Alpha Agri Corp', arableLand: 6_000_000, waterSource: 6_000_000, wealth: 5e11 },
    { id: 'agri-corp-beta', name: 'Beta Agri Corp', arableLand: 5_600_000, waterSource: 5_600_000, wealth: 4.5e11 },
    { id: 'agri-corp-gamma', name: 'Gamma Agri Corp', arableLand: 5_000_000, waterSource: 5_000_000, wealth: 4e11 },
    { id: 'agri-corp-delta', name: 'Delta Agri Corp', arableLand: 4_400_000, waterSource: 4_400_000, wealth: 3.5e11 },
    { id: 'agri-corp-epsilon', name: 'Epsilon Agri Corp', arableLand: 4_000_000, waterSource: 4_000_000, wealth: 3e11 },
    // Mid-size
    { id: 'green-fields', name: 'Green Fields Ltd', arableLand: 3_000_000, waterSource: 3_000_000, wealth: 2e11 },
    { id: 'harvest-moon', name: 'Harvest Moon Inc', arableLand: 2_800_000, waterSource: 2_800_000, wealth: 1.8e11 },
    { id: 'terra-farms', name: 'Terra Farms Co', arableLand: 2_600_000, waterSource: 2_600_000, wealth: 1.5e11 },
    { id: 'golden-grain', name: 'Golden Grain LLC', arableLand: 2_400_000, waterSource: 2_400_000, wealth: 1.2e11 },
    { id: 'sunridge-ag', name: 'Sunridge Agriculture', arableLand: 2_200_000, waterSource: 2_200_000, wealth: 1e11 },
    { id: 'prairie-harvest', name: 'Prairie Harvest Co', arableLand: 2_000_000, waterSource: 2_000_000, wealth: 9e10 },
    { id: 'valley-produce', name: 'Valley Produce Inc', arableLand: 1_800_000, waterSource: 1_800_000, wealth: 8e10 },
    // Small farms
    { id: 'riverside-farm', name: 'Riverside Farm', arableLand: 1_400_000, waterSource: 1_400_000, wealth: 5e10 },
    { id: 'hilltop-ag', name: 'Hilltop Agriculture', arableLand: 1_200_000, waterSource: 1_200_000, wealth: 4e10 },
    { id: 'meadow-co', name: 'Meadow & Co', arableLand: 1_000_000, waterSource: 1_000_000, wealth: 3.5e10 },
    { id: 'oak-valley', name: 'Oak Valley Farms', arableLand: 900_000, waterSource: 900_000, wealth: 3e10 },
    { id: 'cedar-fields', name: 'Cedar Fields Ltd', arableLand: 800_000, waterSource: 800_000, wealth: 2.5e10 },
    { id: 'brookside-ag', name: 'Brookside Agriculture', arableLand: 700_000, waterSource: 700_000, wealth: 2e10 },
    { id: 'pinewood-farm', name: 'Pinewood Farm Co', arableLand: 600_000, waterSource: 600_000, wealth: 1.5e10 },
    { id: 'willow-creek', name: 'Willow Creek Farms', arableLand: 500_000, waterSource: 500_000, wealth: 1e10 },
    // Cotton & textile feedstock farms
    { id: 'cotton-world', name: 'Cotton World Corp', arableLand: 1_600_000, waterSource: 1_600_000, wealth: 1.2e11 },
    { id: 'textile-fields', name: 'Textile Fields Ltd', arableLand: 1_200_000, waterSource: 1_200_000, wealth: 9e10 },
];

const miningSpecs: MiningSpec[] = [
    { id: 'test-company', name: 'Test Company', ironOre: 1_500_000_000, wealth: 1e12 },
    { id: 'ironworks-global', name: 'Ironworks Global', ironOre: 1_000_000_000, wealth: 7e11 },
    { id: 'deep-core-mining', name: 'Deep Core Mining', ironOre: 750_000_000, wealth: 4e11 },
    { id: 'red-earth-mines', name: 'Red Earth Mines', ironOre: 500_000_000, wealth: 2.5e11 },
    { id: 'steel-source-co', name: 'Steel Source Co', ironOre: 400_000_000, wealth: 1.5e11 },
    { id: 'ore-horizon', name: 'Ore Horizon Ltd', ironOre: 250_000_000, wealth: 1e11 },
];

const coalSpecs: CoalSpec[] = [
    { id: 'blackrock-coal', name: 'Blackrock Coal Co', coal: 1_000_000_000, wealth: 6e11 },
    { id: 'carbon-energy', name: 'Carbon Energy Group', coal: 750_000_000, wealth: 4e11 },
    { id: 'deep-seam-coal', name: 'Deep Seam Coal', coal: 500_000_000, wealth: 2.5e11 },
    { id: 'coalfields-int', name: 'Coalfields International', coal: 400_000_000, wealth: 2e11 },
];

const oilSpecs: OilSpec[] = [
    { id: 'petro-global', name: 'PetroGlobal Corp', oil: 750_000_000, gas: 500_000_000, wealth: 2e12 },
    { id: 'continental-oil', name: 'Continental Oil Inc', oil: 600_000_000, gas: 400_000_000, wealth: 1.5e12 },
    { id: 'north-sea-energy', name: 'North Sea Energy', oil: 400_000_000, gas: 300_000_000, wealth: 8e11 },
    { id: 'gulf-petroleum', name: 'Gulf Petroleum Ltd', oil: 300_000_000, gas: 200_000_000, wealth: 6e11 },
];

const timberSpecs: TimberSpec[] = [
    { id: 'great-northern-timber', name: 'Great Northern Timber', forest: 400_000_000, wealth: 3e11 },
    { id: 'pacific-lumber', name: 'Pacific Lumber Co', forest: 300_000_000, wealth: 2e11 },
    { id: 'boreal-wood', name: 'Boreal Wood Products', forest: 250_000_000, wealth: 1.5e11 },
    { id: 'tropical-forest-co', name: 'Tropical Forest Co', forest: 200_000_000, wealth: 1.2e11 },
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
    { id: 'atlas-steel', name: 'Atlas Steel Works', wealth: 1.2e12 },
    { id: 'meridian-steel', name: 'Meridian Steel Corp', wealth: 9e11 },
    { id: 'nova-metals', name: 'Nova Metals Group', wealth: 7e11 },
    { id: 'forge-masters', name: 'Forge Masters Inc', wealth: 5e11 },
];

const refineryMfgSpecs: MfgSpec[] = [
    { id: 'horizon-refinery', name: 'Horizon Refinery Corp', wealth: 1.5e12 },
    { id: 'global-petrochem', name: 'Global Petrochemicals', wealth: 1.2e12 },
    { id: 'coastal-refining', name: 'Coastal Refining Ltd', wealth: 8e11 },
];

const buildMaterialsSpecs: MfgSpec[] = [
    { id: 'concrete-giant', name: 'Concrete Giant Corp', wealth: 6e11 },
    { id: 'urban-materials', name: 'Urban Materials Inc', wealth: 4e11 },
    { id: 'glass-world', name: 'Glass World Ltd', wealth: 3e11 },
    { id: 'brick-works-intl', name: 'Brick Works International', wealth: 2.5e11 },
];

const fertilizerChemSpecs: MfgSpec[] = [
    { id: 'agrochem-global', name: 'AgroChem Global', wealth: 7e11 },
    { id: 'soil-science-corp', name: 'Soil Science Corp', wealth: 5e11 },
    { id: 'green-chem-ltd', name: 'GreenChem Ltd', wealth: 3e11 },
];

const consumerGoodsSpecs: MfgSpec[] = [
    { id: 'world-foods-corp', name: 'World Foods Corp', wealth: 8e11 },
    { id: 'beverage-planet', name: 'Beverage Planet Inc', wealth: 6e11 },
    { id: 'pharma-global', name: 'PharmaGlobal Corp', wealth: 1.5e12 },
    { id: 'fashion-world', name: 'Fashion World Ltd', wealth: 5e11 },
    { id: 'home-furnishings', name: 'Home Furnishings Corp', wealth: 4e11 },
    { id: 'paper-world', name: 'Paper World Inc', wealth: 3e11 },
];

const techMfgSpecs: MfgSpec[] = [
    { id: 'silicon-dynamics', name: 'Silicon Dynamics Corp', wealth: 2e12 },
    { id: 'global-electronics', name: 'Global Electronics Inc', wealth: 1.8e12 },
    { id: 'mech-industries', name: 'Mech Industries Ltd', wealth: 1.2e12 },
    { id: 'automotion-corp', name: 'Automotion Corp', wealth: 1.5e12 },
    { id: 'precision-parts', name: 'Precision Parts Co', wealth: 8e11 },
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
            quantity: 600_000_000,
            claimAgentId: GOV,
            tenantAgentId: copperBasin.id,
            tenantCostInCoins: 600_000,
            renewable: false,
        }),
    );
    const cb1 = copperMine(EARTH_ID, 'copper-basin-mine');
    cb1.scale = 600_000;
    cb1.maxScale = 600_000;
    const cb2 = copperSmelter(EARTH_ID, 'copper-basin-smelter');
    cb2.scale = 400_000;
    cb2.maxScale = 400_000;
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
            quantity: 300_000_000,
            claimAgentId: GOV,
            tenantAgentId: rareElements.id,
            tenantCostInCoins: 300_000,
            renewable: false,
        }),
    );
    const re1 = rareEarthMine(EARTH_ID, 'rare-elements-mine');
    re1.scale = 300_000;
    re1.maxScale = 300_000;
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
            quantity: 400_000_000,
            claimAgentId: GOV,
            tenantAgentId: pacificCopper.id,
            tenantCostInCoins: 400_000,
            renewable: false,
        }),
    );
    const pc1 = copperMine(EARTH_ID, 'pacific-copper-mine');
    pc1.scale = 400_000;
    pc1.maxScale = 400_000;
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
            quantity: 1_000_000_000,
            claimAgentId: GOV,
            tenantAgentId: desertSand.id,
            tenantCostInCoins: 250_000,
            renewable: true,
        }),
    );
    const ds1 = sandMine(EARTH_ID, 'desert-sand-mine');
    ds1.scale = 1_000_000;
    ds1.maxScale = 1_000_000;
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
            quantity: 600_000_000,
            claimAgentId: GOV,
            tenantAgentId: phosphateGlobal.id,
            tenantCostInCoins: 300_000,
            renewable: false,
        }),
    );
    const ph1 = phosphateMine(EARTH_ID, 'phosphate-global-mine');
    ph1.scale = 600_000;
    ph1.maxScale = 600_000;
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
            quantity: 600_000_000,
            claimAgentId: GOV,
            tenantAgentId: potashSupply.id,
            tenantCostInCoins: 300_000,
            renewable: false,
        }),
    );
    const pk1 = potashMine(EARTH_ID, 'potash-supply-mine');
    pk1.scale = 600_000;
    pk1.maxScale = 600_000;
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
        smelter.scale = 250_000;
        smelter.maxScale = 250_000;
        const alumSmelter = aluminumSmelter(EARTH_ID, `${spec.id}-alum`);
        alumSmelter.scale = 100_000;
        alumSmelter.maxScale = 100_000;
        const powerPlant = coalPowerPlant(EARTH_ID, `${spec.id}-power`);
        powerPlant.scale = 50_000;
        powerPlant.maxScale = 50_000;

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
        refinery.scale = 300_000;
        refinery.maxScale = 300_000;

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
    cg1.scale = 200_000;
    cg1.maxScale = 200_000;
    const cg2 = concretePlant(EARTH_ID, 'concrete-giant-concrete');
    cg2.scale = 150_000;
    cg2.maxScale = 150_000;
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
    um1.scale = 150_000;
    um1.maxScale = 150_000;
    const um2 = brickFactory(EARTH_ID, 'urban-materials-brick');
    um2.scale = 100_000;
    um2.maxScale = 100_000;
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
    gw1.scale = 200_000;
    gw1.maxScale = 200_000;
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
    bw1.scale = 150_000;
    bw1.maxScale = 150_000;
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
    ac1.scale = 300_000;
    ac1.maxScale = 300_000;
    const ac2 = pesticidePlant(EARTH_ID, 'agrochem-pesticide');
    ac2.scale = 150_000;
    ac2.maxScale = 150_000;
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
    ss1.scale = 200_000;
    ss1.maxScale = 200_000;
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
    gc1.scale = 200_000;
    gc1.maxScale = 200_000;
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
    wf1.scale = 400_000;
    wf1.maxScale = 400_000;
    const wf2 = beveragePlant(EARTH_ID, 'world-foods-beverage');
    wf2.scale = 200_000;
    wf2.maxScale = 200_000;
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
    bp1.scale = 300_000;
    bp1.maxScale = 300_000;
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
    pg1.scale = 250_000;
    pg1.maxScale = 250_000;
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
    fw1.scale = 200_000;
    fw1.maxScale = 200_000;
    const fw2 = clothingFactory(EARTH_ID, 'fashion-world-clothing');
    fw2.scale = 150_000;
    fw2.maxScale = 150_000;
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
    hf1.scale = 150_000;
    hf1.maxScale = 150_000;
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
    pw1.scale = 200_000;
    pw1.maxScale = 200_000;
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
    sd1.scale = 300_000;
    sd1.maxScale = 300_000;
    const sd2 = consumerElectronicsFactory(EARTH_ID, 'silicon-dynamics-consumer');
    sd2.scale = 200_000;
    sd2.maxScale = 200_000;
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
    ge1.scale = 200_000;
    ge1.maxScale = 200_000;
    const ge2 = consumerElectronicsFactory(EARTH_ID, 'global-electronics-consumer');
    ge2.scale = 300_000;
    ge2.maxScale = 300_000;
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
    mi1.scale = 200_000;
    mi1.maxScale = 200_000;
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
    au1.scale = 150_000;
    au1.maxScale = 150_000;
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
    pp1.scale = 100_000;
    pp1.maxScale = 100_000;
    const pp2 = vehicleFactory(EARTH_ID, 'precision-parts-vehicles');
    pp2.scale = 50_000;
    pp2.maxScale = 50_000;
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
    govWaterFacility.scale = 1_000_000;
    govWaterFacility.maxScale = 1_000_000;
    const govAgriFacility = agriculturalProductionFacility(EARTH_ID, 'earth-gov-agri');
    govAgriFacility.scale = 1_000_000;
    govAgriFacility.maxScale = 1_000_000;

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
