/**
 * simulation/utils/initialWorld.ts
 *
 * Builds the rich initial game world used by the simulation worker.
 *
 * Earth (8 billion people):
 *   - Earth Government: owns all resource claims, operates its own large
 *     agricultural and water-extraction facilities.
 *   - 20 private companies of varying sizes that tenant arable land and
 *     water sources from the government and produce food.
 *   - 1 mining company (existing "test-company") that tenants iron ore.
 *
 * Alpha Centauri (1 million people):
 *   - Alpha Centauri Government: owns all resource claims, runs some
 *     facilities.
 *   - 3 small private companies producing food.
 *
 * Design:
 *   Small factory helpers create correctly-shaped facilities, resources
 *   and agents.  Everything is wired together at the bottom in
 *   `createInitialGameState()`.
 */

import { TICKS_PER_YEAR } from '../constants';
import type { ProductionFacility, Resource, StorageFacility } from '../planet/facilities';
import {
    agriculturalProductResourceType,
    arableLandResourceType,
    ironOreDepositResourceType,
    ironOreResourceType,
    waterResourceType,
    waterSourceResourceType,
} from '../planet/facilities';
import {
    createEmptyDemographicEventCounters,
    type Agent,
    type AgentPlanetAssets,
    type GameState,
    type Planet,
} from '../planet/planet';
import type { ResourceClaim, ResourceQuantity } from '../planet/planet';
import { createPopulation } from './entities';
import { makeWorkforceDemography } from './testHelper';

// ============================================================================
// Factory helpers
// ============================================================================

function makeProductionFacility(opts: {
    planetId: string;
    id: string;
    name: string;
    scale: number;
    powerPerTick: number;
    workers: { none?: number; primary?: number; secondary?: number; tertiary?: number };
    pollution: { air: number; water: number; soil: number };
    needs: { resource: Resource; quantity: number }[];
    produces: { resource: Resource; quantity: number }[];
}): ProductionFacility {
    return {
        planetId: opts.planetId,
        id: opts.id,
        name: opts.name,
        maxScale: opts.scale,
        scale: opts.scale,
        powerConsumptionPerTick: opts.powerPerTick,
        workerRequirement: {
            none: opts.workers.none ?? 0,
            primary: opts.workers.primary ?? 0,
            secondary: opts.workers.secondary ?? 0,
            tertiary: opts.workers.tertiary ?? 0,
        },
        pollutionPerTick: opts.pollution,
        needs: opts.needs,
        produces: opts.produces,
        lastTickResults: {
            overallEfficiency: 1,
            workerEfficiency: {},
            resourceEfficiency: {},
            overqualifiedWorkers: {},
            exactUsedByEdu: {},
            totalUsedByEdu: {},
        },
    };
}

function makeStorage(opts: {
    planetId: string;
    id: string;
    name: string;
    scale?: number;
    volumeCapacity?: number;
    massCapacity?: number;
}): StorageFacility {
    return {
        planetId: opts.planetId,
        id: opts.id,
        name: opts.name,
        maxScale: opts.scale ?? 1,
        scale: opts.scale ?? 1,
        powerConsumptionPerTick: 0.1,
        workerRequirement: { none: 10, primary: 10, secondary: 5, tertiary: 0 },
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: {
            volume: opts.volumeCapacity ?? 1e11,
            mass: opts.massCapacity ?? 1e13,
        },
        current: { mass: 0, volume: 0 },
        currentInStorage: {},
    };
}

/** Build a water-extraction facility for a given planet/agent. */
function makeWaterExtraction(planetId: string, agentId: string, scale: number): ProductionFacility {
    return makeProductionFacility({
        planetId,
        id: `${agentId}-water-extraction`,
        name: `Water Extraction (${agentId})`,
        scale,
        powerPerTick: 0.5,
        workers: { none: 4, primary: 2 },
        pollution: { air: 0.00000005, water: 0.00001, soil: 0.00000001 },
        needs: [{ resource: waterSourceResourceType, quantity: 1000 }],
        produces: [{ resource: waterResourceType, quantity: 1000 }],
    });
}

/** Build an agricultural-production facility for a given planet/agent. */
function makeAgriculturalProduction(planetId: string, agentId: string, scale: number): ProductionFacility {
    return makeProductionFacility({
        planetId,
        id: `${agentId}-agricultural`,
        name: `Agricultural Facility (${agentId})`,
        scale,
        powerPerTick: 1,
        workers: { none: 20000, primary: 50000, secondary: 35000, tertiary: 100 },
        pollution: { air: 0.00001, water: 0.00001, soil: 0.00001 },
        needs: [
            { resource: waterResourceType, quantity: 1000 },
            { resource: arableLandResourceType, quantity: 1000 },
        ],
        produces: [{ resource: agriculturalProductResourceType, quantity: 1000 }],
    });
}

/** Build an iron-extraction facility for a given planet/agent. */
function makeIronExtraction(planetId: string, agentId: string, scale: number): ProductionFacility {
    return makeProductionFacility({
        planetId,
        id: `${agentId}-iron-extraction`,
        name: `Iron Extraction (${agentId})`,
        scale,
        powerPerTick: 0.8,
        workers: { secondary: 1 },
        pollution: { air: 0.000001, water: 0.00001, soil: 0.000001 },
        needs: [{ resource: ironOreDepositResourceType, quantity: 1000 }],
        produces: [{ resource: ironOreResourceType, quantity: 1000 }],
    });
}

function makeAgentPlanetAssets(
    planetId: string,
    facilities: ProductionFacility[],
    storage: StorageFacility,
    claims: string[],
    tenancies: string[],
): AgentPlanetAssets {
    return {
        resourceClaims: claims,
        resourceTenancies: tenancies,
        productionFacilities: facilities,
        storageFacility: storage,
        deposits: 0,
        loans: 0,
        allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        workforceDemography: makeWorkforceDemography(),
        deaths: createEmptyDemographicEventCounters(),
        disabilities: createEmptyDemographicEventCounters(),
    };
}

type ResourceClaimEntry = ResourceQuantity & ResourceClaim;

// ============================================================================
// Earth setup
// ============================================================================

const EARTH_ID = 'earth';

// ---------------------------------------------------------------------------
// Resource claims — Government owns all, tenants assigned below
// ---------------------------------------------------------------------------

// Arable land: total 20 million units.
// Government keeps a large share (scale 2000 × 1000 = 2M) for itself.
// 20 companies get chunks of the remaining 18M.
//
// Water sources: total 20 million units.
// Same split approach.
//
// Iron ore: 5M total, test-company gets most, 2 new mining agents.

const earthArableLandClaims: ResourceClaimEntry[] = [];
const earthWaterSourceClaims: ResourceClaimEntry[] = [];
const earthIronOreClaims: ResourceClaimEntry[] = [];

// ---------------------------------------------------------------------------
// Private company definitions
// ---------------------------------------------------------------------------

/**
 * Each company spec describes a food-producing company on Earth.
 * `arableLand` and `waterSource` are the quantities they tenant from the
 * government's resource pool.  The agricultural facility's scale is set
 * so that `scale × 1000 = arableLand` (matching the need definition).
 */
interface CompanySpec {
    id: string;
    name: string;
    /** Arable land quantity tenanted (units). Agricultural facility scale = arableLand / 1000. */
    arableLand: number;
    /** Water source quantity tenanted (units). Water extraction scale = waterSource / 1000. */
    waterSource: number;
    /** Starting wealth (coins). */
    wealth: number;
}

// 20 companies — sizes range from small family farms (scale ~0.5)
// to large agribusiness corporations (scale ~5).
// Total arable land across all 20: ~2,800,000 units ⇒ feeds ~2.8 M people
// (the agricultural facility produces ~1 ton/tick at scale 1, and
// 1 person needs 1 ton/year ≈ 1/360 ton/tick, so scale 1 ≈ 360 people/tick
// but actual dynamics come from the engine — here we just set capacity).
const earthCompanySpecs: CompanySpec[] = [
    // --- Large corporations (5) ---
    { id: 'agri-corp-alpha', name: 'Alpha Agri Corp', arableLand: 300000, waterSource: 300000, wealth: 5e8 },
    { id: 'agri-corp-beta', name: 'Beta Agri Corp', arableLand: 280000, waterSource: 280000, wealth: 4.5e8 },
    { id: 'agri-corp-gamma', name: 'Gamma Agri Corp', arableLand: 250000, waterSource: 250000, wealth: 4e8 },
    { id: 'agri-corp-delta', name: 'Delta Agri Corp', arableLand: 220000, waterSource: 220000, wealth: 3.5e8 },
    { id: 'agri-corp-epsilon', name: 'Epsilon Agri Corp', arableLand: 200000, waterSource: 200000, wealth: 3e8 },

    // --- Mid-size companies (7) ---
    { id: 'green-fields', name: 'Green Fields Ltd', arableLand: 150000, waterSource: 150000, wealth: 2e8 },
    { id: 'harvest-moon', name: 'Harvest Moon Inc', arableLand: 140000, waterSource: 140000, wealth: 1.8e8 },
    { id: 'terra-farms', name: 'Terra Farms Co', arableLand: 130000, waterSource: 130000, wealth: 1.5e8 },
    { id: 'golden-grain', name: 'Golden Grain LLC', arableLand: 120000, waterSource: 120000, wealth: 1.2e8 },
    { id: 'sunridge-ag', name: 'Sunridge Agriculture', arableLand: 110000, waterSource: 110000, wealth: 1e8 },
    { id: 'prairie-harvest', name: 'Prairie Harvest Co', arableLand: 100000, waterSource: 100000, wealth: 9e7 },
    { id: 'valley-produce', name: 'Valley Produce Inc', arableLand: 90000, waterSource: 90000, wealth: 8e7 },

    // --- Small companies (8) ---
    { id: 'riverside-farm', name: 'Riverside Farm', arableLand: 70000, waterSource: 70000, wealth: 5e7 },
    { id: 'hilltop-ag', name: 'Hilltop Agriculture', arableLand: 60000, waterSource: 60000, wealth: 4e7 },
    { id: 'meadow-co', name: 'Meadow & Co', arableLand: 50000, waterSource: 50000, wealth: 3.5e7 },
    { id: 'oak-valley', name: 'Oak Valley Farms', arableLand: 45000, waterSource: 45000, wealth: 3e7 },
    { id: 'cedar-fields', name: 'Cedar Fields Ltd', arableLand: 40000, waterSource: 40000, wealth: 2.5e7 },
    { id: 'brookside-ag', name: 'Brookside Agriculture', arableLand: 35000, waterSource: 35000, wealth: 2e7 },
    { id: 'pinewood-farm', name: 'Pinewood Farm Co', arableLand: 30000, waterSource: 30000, wealth: 1.5e7 },
    { id: 'willow-creek', name: 'Willow Creek Farms', arableLand: 25000, waterSource: 25000, wealth: 1e7 },
];

// --- Mining companies (in addition to the original test-company) ---
interface MiningSpec {
    id: string;
    name: string;
    ironOre: number;
    wealth: number;
}

const earthMiningSpecs: MiningSpec[] = [
    { id: 'test-company', name: 'Test Company', ironOre: 3000000, wealth: 1e9 },
    { id: 'ironworks-global', name: 'Ironworks Global', ironOre: 1500000, wealth: 5e8 },
    { id: 'deep-core-mining', name: 'Deep Core Mining', ironOre: 500000, wealth: 2e8 },
];

// ============================================================================
// Build Earth agents, resources and planet
// ============================================================================

function buildEarth(): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];

    // ------------------------------------------------------------------
    // Earth Government
    // ------------------------------------------------------------------

    // Government's own agricultural facility (the large existing one)
    const govAgriFacility = makeAgriculturalProduction(EARTH_ID, 'earth-gov', 2000);
    const govWaterFacility = makeWaterExtraction(EARTH_ID, 'earth-gov', 2000);
    const govStorage = makeStorage({ planetId: EARTH_ID, id: 'earth-gov-storage', name: 'Gov. Central Storage' });

    // Resource claim IDs that the government owns
    const govArableLandClaimId = 'earth-gov-arable';
    const govWaterSourceClaimId = 'earth-gov-water';

    // Government tenants its own claims for arable land and water
    const govClaims: string[] = [govArableLandClaimId, govWaterSourceClaimId];
    const govTenancies: string[] = [govArableLandClaimId, govWaterSourceClaimId];

    // We'll collect all claim IDs as we create company resources

    // Government's arable land (for its own facility: scale 2000 × 1000 = 2M)
    earthArableLandClaims.push({
        id: govArableLandClaimId,
        type: arableLandResourceType,
        quantity: 2000000,
        regenerationRate: 2000000,
        maximumCapacity: 2000000,
        claimAgentId: 'earth-government',
        tenantAgentId: 'earth-government',
        tenantCostInCoins: 0,
    });

    // Government's water source (for its own facility)
    earthWaterSourceClaims.push({
        id: govWaterSourceClaimId,
        type: waterSourceResourceType,
        quantity: 2000000,
        regenerationRate: 2000000,
        maximumCapacity: 2000000,
        claimAgentId: 'earth-government',
        tenantAgentId: 'earth-government',
        tenantCostInCoins: 0,
    });

    // ------------------------------------------------------------------
    // Food-producing companies
    // ------------------------------------------------------------------

    for (const spec of earthCompanySpecs) {
        const arableClaimId = `earth-arable-${spec.id}`;
        const waterClaimId = `earth-water-${spec.id}`;
        const agriScale = spec.arableLand / 1000;
        const waterScale = spec.waterSource / 1000;

        // Arable land claim (owned by gov, tenanted by this company)
        earthArableLandClaims.push({
            id: arableClaimId,
            type: arableLandResourceType,
            quantity: spec.arableLand,
            regenerationRate: spec.arableLand,
            maximumCapacity: spec.arableLand,
            claimAgentId: 'earth-government',
            tenantAgentId: spec.id,
            tenantCostInCoins: Math.floor(spec.arableLand * 0.01), // small per-tick rent
        });

        // Water source claim (owned by gov, tenanted by this company)
        earthWaterSourceClaims.push({
            id: waterClaimId,
            type: waterSourceResourceType,
            quantity: spec.waterSource,
            regenerationRate: spec.waterSource,
            maximumCapacity: spec.waterSource,
            claimAgentId: 'earth-government',
            tenantAgentId: spec.id,
            tenantCostInCoins: Math.floor(spec.waterSource * 0.005),
        });

        govClaims.push(arableClaimId, waterClaimId);

        const agentStorage = makeStorage({
            planetId: EARTH_ID,
            id: `${spec.id}-storage`,
            name: `${spec.name} Storage`,
        });

        const agriProd = makeAgriculturalProduction(EARTH_ID, spec.id, agriScale);
        const waterProd = makeWaterExtraction(EARTH_ID, spec.id, waterScale);

        const agent: Agent = {
            id: spec.id,
            name: spec.name,
            associatedPlanetId: EARTH_ID,
            transportShips: [],
            assets: {
                [EARTH_ID]: makeAgentPlanetAssets(
                    EARTH_ID,
                    [waterProd, agriProd],
                    agentStorage,
                    [], // companies don't own claims
                    [arableClaimId, waterClaimId], // they tenant them
                ),
            },
        };
        agents.push(agent);
    }

    // ------------------------------------------------------------------
    // Mining companies
    // ------------------------------------------------------------------

    for (const spec of earthMiningSpecs) {
        const ironClaimId = `earth-iron-${spec.id}`;
        govClaims.push(ironClaimId);

        earthIronOreClaims.push({
            id: ironClaimId,
            type: ironOreDepositResourceType,
            quantity: spec.ironOre,
            regenerationRate: 0, // non-renewable
            maximumCapacity: spec.ironOre,
            claimAgentId: 'earth-government',
            tenantAgentId: spec.id,
            tenantCostInCoins: Math.floor(spec.ironOre * 0.001),
        });

        const agentStorage = makeStorage({
            planetId: EARTH_ID,
            id: `${spec.id}-storage`,
            name: `${spec.name} Storage`,
        });

        const ironProd = makeIronExtraction(EARTH_ID, spec.id, spec.ironOre / 1000);

        // Check if the agent already exists (test-company is also listed in
        // mining specs and should NOT duplicate with food producers).
        const existing = agents.find((a) => a.id === spec.id);
        if (existing) {
            // Merge: add iron tenancy + facility to existing agent
            const earthAssets = existing.assets[EARTH_ID]!;
            earthAssets.resourceTenancies.push(ironClaimId);
            earthAssets.productionFacilities.push(ironProd);
        } else {
            const agent: Agent = {
                id: spec.id,
                name: spec.name,
                associatedPlanetId: EARTH_ID,
                transportShips: [],
                assets: {
                    [EARTH_ID]: makeAgentPlanetAssets(EARTH_ID, [ironProd], agentStorage, [], [ironClaimId]),
                },
            };
            agents.push(agent);
        }
    }

    // ------------------------------------------------------------------
    // Unclaimed remaining arable land & water (available for future tenanting)
    // ------------------------------------------------------------------

    const totalArableClaimed = earthArableLandClaims.reduce((s, c) => s + c.quantity, 0);
    const remainingArable = 20000000 - totalArableClaimed;
    if (remainingArable > 0) {
        const unclaimedArableId = 'earth-arable-unclaimed';
        earthArableLandClaims.push({
            id: unclaimedArableId,
            type: arableLandResourceType,
            quantity: remainingArable,
            regenerationRate: remainingArable,
            maximumCapacity: remainingArable,
            claimAgentId: 'earth-government',
            tenantAgentId: null,
            tenantCostInCoins: 0,
        });
        govClaims.push(unclaimedArableId);
    }

    const totalWaterClaimed = earthWaterSourceClaims.reduce((s, c) => s + c.quantity, 0);
    const remainingWater = 20000000 - totalWaterClaimed;
    if (remainingWater > 0) {
        const unclaimedWaterId = 'earth-water-unclaimed';
        earthWaterSourceClaims.push({
            id: unclaimedWaterId,
            type: waterSourceResourceType,
            quantity: remainingWater,
            regenerationRate: remainingWater,
            maximumCapacity: remainingWater,
            claimAgentId: 'earth-government',
            tenantAgentId: null,
            tenantCostInCoins: 0,
        });
        govClaims.push(unclaimedWaterId);
    }

    // ------------------------------------------------------------------
    // Earth Government agent (must be built last so govClaims is complete)
    // ------------------------------------------------------------------

    const earthGovernment: Agent = {
        id: 'earth-government',
        name: 'Earth Government',
        associatedPlanetId: EARTH_ID,
        transportShips: [],
        assets: {
            [EARTH_ID]: makeAgentPlanetAssets(
                EARTH_ID,
                [govWaterFacility, govAgriFacility],
                govStorage,
                govClaims,
                govTenancies,
            ),
        },
    };
    agents.unshift(earthGovernment); // government first

    // ------------------------------------------------------------------
    // Build the planet
    // ------------------------------------------------------------------

    const earthPlanet: Planet = {
        id: EARTH_ID,
        name: 'Earth',
        position: { x: 0, y: 0, z: 0 },
        population: createPopulation(8_000_000_000),
        governmentId: earthGovernment.id,

        bank: {
            loans: 0,
            deposits: 0,
            householdDeposits: 0,
            equity: 0,
            loanRate: 0,
            depositRate: 0,
        },

        wagePerEdu: {
            none: 1.0,
            primary: 1.0,
            secondary: 1.0,
            tertiary: 1.0,
        },

        marketPrices: { [agriculturalProductResourceType.name]: 1.0 },
        lastMarketResult: {},

        resources: {
            [arableLandResourceType.name]: earthArableLandClaims,
            [waterSourceResourceType.name]: earthWaterSourceClaims,
            [ironOreDepositResourceType.name]: earthIronOreClaims,
        },

        infrastructure: {
            primarySchools: 10000,
            secondarySchools: 5000,
            universities: 2000,
            hospitals: 3000,
            mobility: {
                roads: 100000,
                railways: 50000,
                airports: 1000,
                seaports: 500,
                spaceports: 10,
            },
            energy: {
                production: 1_000_000, // 1 TW
            },
        },

        environment: {
            naturalDisasters: {
                earthquakes: 10,
                floods: 20,
                storms: 30,
            },
            pollution: {
                air: 5,
                water: 2,
                soil: 1,
            },
            regenerationRates: {
                air: {
                    constant: 1,
                    percentage: 1 / TICKS_PER_YEAR,
                },
                water: {
                    constant: 1,
                    percentage: 1 / TICKS_PER_YEAR,
                },
                soil: {
                    constant: 1,
                    percentage: 0.1 / TICKS_PER_YEAR,
                },
            },
        },
    };

    return { planet: earthPlanet, agents };
}

// ============================================================================
// Alpha Centauri setup
// ============================================================================

const AC_ID = 'alpha-centauri';

interface ACCompanySpec {
    id: string;
    name: string;
    arableLand: number;
    waterSource: number;
    wealth: number;
}

const acCompanySpecs: ACCompanySpec[] = [
    { id: 'ac-frontier-farms', name: 'Frontier Farms AC', arableLand: 15000, waterSource: 15000, wealth: 5e7 },
    { id: 'ac-nova-ag', name: 'Nova Agriculture', arableLand: 10000, waterSource: 10000, wealth: 3e7 },
    { id: 'ac-colony-co', name: 'Colony Co-op', arableLand: 5000, waterSource: 5000, wealth: 1e7 },
];

function buildAlphaCentauri(): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];

    const acArableLandClaims: ResourceClaimEntry[] = [];
    const acWaterSourceClaims: ResourceClaimEntry[] = [];

    const govArableClaimId = 'ac-gov-arable';
    const govWaterClaimId = 'ac-gov-water';

    const govClaims: string[] = [govArableClaimId, govWaterClaimId];
    const govTenancies: string[] = [govArableClaimId, govWaterClaimId];

    // Government's own facilities (small colony scale)
    const govAgriFacility = makeAgriculturalProduction(AC_ID, 'ac-gov', 20);
    const govWaterFacility = makeWaterExtraction(AC_ID, 'ac-gov', 20);
    const govStorage = makeStorage({ planetId: AC_ID, id: 'ac-gov-storage', name: 'AC Gov. Storage' });

    // Gov arable land (scale 20 × 1000 = 20,000 units)
    acArableLandClaims.push({
        id: govArableClaimId,
        type: arableLandResourceType,
        quantity: 20000,
        regenerationRate: 20000,
        maximumCapacity: 20000,
        claimAgentId: 'ac-government',
        tenantAgentId: 'ac-government',
        tenantCostInCoins: 0,
    });

    // Gov water source
    acWaterSourceClaims.push({
        id: govWaterClaimId,
        type: waterSourceResourceType,
        quantity: 20000,
        regenerationRate: 20000,
        maximumCapacity: 20000,
        claimAgentId: 'ac-government',
        tenantAgentId: 'ac-government',
        tenantCostInCoins: 0,
    });

    // Company agents
    for (const spec of acCompanySpecs) {
        const arableClaimId = `ac-arable-${spec.id}`;
        const waterClaimId = `ac-water-${spec.id}`;
        const agriScale = spec.arableLand / 1000;
        const waterScale = spec.waterSource / 1000;

        govClaims.push(arableClaimId, waterClaimId);

        acArableLandClaims.push({
            id: arableClaimId,
            type: arableLandResourceType,
            quantity: spec.arableLand,
            regenerationRate: spec.arableLand,
            maximumCapacity: spec.arableLand,
            claimAgentId: 'ac-government',
            tenantAgentId: spec.id,
            tenantCostInCoins: Math.floor(spec.arableLand * 0.01),
        });

        acWaterSourceClaims.push({
            id: waterClaimId,
            type: waterSourceResourceType,
            quantity: spec.waterSource,
            regenerationRate: spec.waterSource,
            maximumCapacity: spec.waterSource,
            claimAgentId: 'ac-government',
            tenantAgentId: spec.id,
            tenantCostInCoins: Math.floor(spec.waterSource * 0.005),
        });

        const agentStorage = makeStorage({
            planetId: AC_ID,
            id: `${spec.id}-storage`,
            name: `${spec.name} Storage`,
        });

        const agriProd = makeAgriculturalProduction(AC_ID, spec.id, agriScale);
        const waterProd = makeWaterExtraction(AC_ID, spec.id, waterScale);

        agents.push({
            id: spec.id,
            name: spec.name,
            associatedPlanetId: AC_ID,
            transportShips: [],
            assets: {
                [AC_ID]: makeAgentPlanetAssets(
                    AC_ID,
                    [waterProd, agriProd],
                    agentStorage,
                    [],
                    [arableClaimId, waterClaimId],
                ),
            },
        });
    }

    // Remaining unclaimed arable land
    const totalAC_Arable = acArableLandClaims.reduce((s, c) => s + c.quantity, 0);
    const acTotalArable = 80000; // smaller total for the colony
    const remainArable = acTotalArable - totalAC_Arable;
    if (remainArable > 0) {
        const id = 'ac-arable-unclaimed';
        acArableLandClaims.push({
            id,
            type: arableLandResourceType,
            quantity: remainArable,
            regenerationRate: remainArable,
            maximumCapacity: remainArable,
            claimAgentId: 'ac-government',
            tenantAgentId: null,
            tenantCostInCoins: 0,
        });
        govClaims.push(id);
    }

    const totalAC_Water = acWaterSourceClaims.reduce((s, c) => s + c.quantity, 0);
    const acTotalWater = 80000;
    const remainWater = acTotalWater - totalAC_Water;
    if (remainWater > 0) {
        const id = 'ac-water-unclaimed';
        acWaterSourceClaims.push({
            id,
            type: waterSourceResourceType,
            quantity: remainWater,
            regenerationRate: remainWater,
            maximumCapacity: remainWater,
            claimAgentId: 'ac-government',
            tenantAgentId: null,
            tenantCostInCoins: 0,
        });
        govClaims.push(id);
    }

    // AC Government agent
    const acGovernment: Agent = {
        id: 'ac-government',
        name: 'Alpha Centauri Government',
        associatedPlanetId: AC_ID,
        transportShips: [],
        assets: {
            [AC_ID]: makeAgentPlanetAssets(
                AC_ID,
                [govWaterFacility, govAgriFacility],
                govStorage,
                govClaims,
                govTenancies,
            ),
        },
    };
    agents.unshift(acGovernment);

    // Build planet
    const acPlanet: Planet = {
        id: AC_ID,
        name: 'Alpha Centauri',
        position: { x: 4.37, y: 0, z: 0 },
        population: createPopulation(1_000_000),
        governmentId: acGovernment.id,

        bank: {
            loans: 0,
            deposits: 0,
            householdDeposits: 0,
            equity: 0,
            loanRate: 0,
            depositRate: 0,
        },

        wagePerEdu: {
            none: 1.0,
            primary: 1.0,
            secondary: 1.0,
            tertiary: 1.0,
        },

        marketPrices: { [agriculturalProductResourceType.name]: 1.0 },
        lastMarketResult: {},

        resources: {
            [arableLandResourceType.name]: acArableLandClaims,
            [waterSourceResourceType.name]: acWaterSourceClaims,
        },

        infrastructure: {
            primarySchools: 50,
            secondarySchools: 25,
            universities: 5,
            hospitals: 10,
            mobility: {
                roads: 500,
                railways: 100,
                airports: 2,
                seaports: 0,
                spaceports: 3,
            },
            energy: {
                production: 50000, // 50 GW — modest colony grid
            },
        },

        environment: {
            naturalDisasters: {
                earthquakes: 0,
                floods: 0,
                storms: 5,
            },
            pollution: {
                air: 2,
                water: 1,
                soil: 1,
            },
            regenerationRates: {
                air: {
                    constant: 0.1,
                    percentage: 0.1 / TICKS_PER_YEAR,
                },
                water: {
                    constant: 0.05,
                    percentage: 0.05 / TICKS_PER_YEAR,
                },
                soil: {
                    constant: 0.005,
                    percentage: 0.005 / TICKS_PER_YEAR,
                },
            },
        },
    };

    return { planet: acPlanet, agents };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create the full initial GameState for the simulation.
 *
 * Returns:
 *  - Earth with ~8 B population, 1 government + 20 food companies + 3 mining companies
 *  - Alpha Centauri with ~1 M population, 1 government + 3 food companies
 *
 * Total agents: 28  (2 governments + 20 food + 3 mining + 3 AC food)
 */
export function createInitialGameState(): GameState {
    const { planet: earth, agents: earthAgents } = buildEarth();
    const { planet: alphaCentauri, agents: acAgents } = buildAlphaCentauri();

    const allAgents = [...earthAgents, ...acAgents];

    return {
        tick: 0,
        planets: new Map([
            [earth.id, earth],
            [alphaCentauri.id, alphaCentauri],
        ]),
        agents: new Map(allAgents.map((a) => [a.id, a])),
    };
}
