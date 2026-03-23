import { initialMarketPrices } from './initialMarketPrices';
import {
    arableLandResourceType,
    coalDepositResourceType,
    copperDepositResourceType,
    forestResourceType,
    ironOreDepositResourceType,
    oilReservoirResourceType,
    sandDepositResourceType,
    waterSourceResourceType,
} from '../planet/landBoundResources';
import {
    agriculturalProductionFacility,
    beveragePlant,
    cementPlant,
    coalMine,
    coalPowerPlant,
    copperMine,
    copperSmelter,
    foodProcessingPlant,
    glassFactory,
    ironExtractionFacility,
    ironSmelter,
    loggingCamp,
    oilRefinery,
    oilWell,
    sawmill,
    waterExtractionFacility,
} from '../planet/facilities';
import type { Agent, Planet } from '../planet/planet';
import { makeAgent, makeStorage, createPopulation, makeDefaultEnvironment } from './helpers';
import { makeClaim, makeUnclaimedRemainder } from './resourceClaimFactory';
import type { ResourceClaimEntry } from './helpers';

interface AgriSpec {
    id: string;
    name: string;
    arableLand: number;
    waterSource: number;
}

interface SmallPlanetSpec {
    id: string;
    name: string;
    population: number;
    position: { x: number; y: number; z: number };
    totalArable: number;
    totalWater: number;
    govAgriScale: number;
    agriCompanies: AgriSpec[];
    industrialAgents: { planet: Planet; agents: Agent[] }['agents'];
    infrastructure: Planet['infrastructure'];
    environment: Planet['environment'];
    extraResources?: Record<string, ResourceClaimEntry[]>;
}

function buildSmallPlanet(spec: SmallPlanetSpec): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];
    const arableClaims: ResourceClaimEntry[] = [];
    const waterClaims: ResourceClaimEntry[] = [];
    const govId = `${spec.id}-government`;

    const govArableId = `${spec.id}-gov-arable`;
    const govWaterId = `${spec.id}-gov-water`;
    const govClaims: string[] = [govArableId, govWaterId];
    const govTenancies: string[] = [govArableId, govWaterId];

    arableClaims.push(
        makeClaim({
            id: govArableId,
            type: arableLandResourceType,
            quantity: spec.govAgriScale * 1000,
            claimAgentId: govId,
            tenantAgentId: govId,
        }),
    );
    waterClaims.push(
        makeClaim({
            id: govWaterId,
            type: waterSourceResourceType,
            quantity: spec.govAgriScale * 1000,
            claimAgentId: govId,
            tenantAgentId: govId,
        }),
    );

    for (const company of spec.agriCompanies) {
        const arableId = `${spec.id}-arable-${company.id}`;
        const waterId = `${spec.id}-water-${company.id}`;
        govClaims.push(arableId, waterId);

        arableClaims.push(
            makeClaim({
                id: arableId,
                type: arableLandResourceType,
                quantity: company.arableLand,
                claimAgentId: govId,
                tenantAgentId: company.id,
                tenantCostInCoins: Math.floor(company.arableLand * 0.01),
            }),
        );
        waterClaims.push(
            makeClaim({
                id: waterId,
                type: waterSourceResourceType,
                quantity: company.waterSource,
                claimAgentId: govId,
                tenantAgentId: company.id,
                tenantCostInCoins: Math.floor(company.waterSource * 0.005),
            }),
        );

        const waterFacility = waterExtractionFacility(spec.id, `${company.id}-water`);
        const scale = company.arableLand / 1000;
        waterFacility.scale = scale;
        waterFacility.maxScale = scale;

        const agriFacility = agriculturalProductionFacility(spec.id, `${company.id}-agri`);
        agriFacility.scale = scale;
        agriFacility.maxScale = scale;

        agents.push(
            makeAgent({
                id: company.id,
                name: company.name,
                associatedPlanetId: spec.id,
                planetId: spec.id,
                facilities: [waterFacility, agriFacility],
                storage: makeStorage({
                    planetId: spec.id,
                    id: `${company.id}-storage`,
                    name: `${company.name} Storage`,
                }),
                tenancies: [arableId, waterId],
            }),
        );
    }

    // Register industrial agents' resource tenancies in govClaims
    for (const agent of spec.industrialAgents) {
        for (const tenancyId of agent.assets[spec.id]?.resourceTenancies ?? []) {
            govClaims.push(tenancyId);
        }
        agents.push(agent);
    }

    const arableRemainder = makeUnclaimedRemainder({
        idPrefix: `${spec.id}-arable`,
        type: arableLandResourceType,
        total: spec.totalArable,
        existing: arableClaims,
        claimAgentId: govId,
    });
    if (arableRemainder) {
        arableClaims.push(arableRemainder);
        govClaims.push(arableRemainder.id);
    }

    const waterRemainder = makeUnclaimedRemainder({
        idPrefix: `${spec.id}-water`,
        type: waterSourceResourceType,
        total: spec.totalWater,
        existing: waterClaims,
        claimAgentId: govId,
    });
    if (waterRemainder) {
        waterClaims.push(waterRemainder);
        govClaims.push(waterRemainder.id);
    }

    const govWaterFacility = waterExtractionFacility(spec.id, `${spec.id}-gov-water-fac`);
    govWaterFacility.scale = spec.govAgriScale;
    govWaterFacility.maxScale = spec.govAgriScale;
    const govAgriFacility = agriculturalProductionFacility(spec.id, `${spec.id}-gov-agri-fac`);
    govAgriFacility.scale = spec.govAgriScale;
    govAgriFacility.maxScale = spec.govAgriScale;

    const govAgent = makeAgent({
        id: govId,
        name: `${spec.name} Government`,
        associatedPlanetId: spec.id,
        planetId: spec.id,
        facilities: [govWaterFacility, govAgriFacility],
        storage: makeStorage({ planetId: spec.id, id: `${spec.id}-gov-storage`, name: `${spec.name} Gov. Storage` }),
        claims: govClaims,
        tenancies: govTenancies,
    });
    agents.unshift(govAgent);

    const planet: Planet = {
        id: spec.id,
        name: spec.name,
        position: spec.position,
        population: createPopulation(spec.population),
        governmentId: govId,
        bank: { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 },
        wagePerEdu: { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 },
        marketPrices: { ...initialMarketPrices },
        lastMarketResult: {},
        resources: {
            [arableLandResourceType.name]: arableClaims,
            [waterSourceResourceType.name]: waterClaims,
            ...(spec.extraResources ?? {}),
        },
        infrastructure: spec.infrastructure,
        environment: spec.environment,
    };

    return { planet, agents };
}

// ============================================================================
// Gune — forest & timber world
// ============================================================================

const guneForestClaims: ResourceClaimEntry[] = [];

function buildGuneIndustrialAgents(): Agent[] {
    const forestId = 'gune-forest-gune-timber';
    guneForestClaims.push(
        makeClaim({
            id: forestId,
            type: forestResourceType,
            quantity: 15000,
            claimAgentId: 'gune-government',
            tenantAgentId: 'gune-timber-co',
            tenantCostInCoins: 150,
        }),
    );
    const l1 = loggingCamp('gune', 'gune-timber-logging');
    l1.scale = 15;
    l1.maxScale = 15;
    const l2 = sawmill('gune', 'gune-timber-sawmill');
    l2.scale = 10;
    l2.maxScale = 10;
    const timberAgent = makeAgent({
        id: 'gune-timber-co',
        name: 'Gune Timber Co',
        associatedPlanetId: 'gune',
        planetId: 'gune',
        facilities: [l1, l2],
        storage: makeStorage({ planetId: 'gune', id: 'gune-timber-storage', name: 'Gune Timber Storage' }),
        tenancies: [forestId],
    });

    const fp1 = foodProcessingPlant('gune', 'gune-foods-plant');
    fp1.scale = 5;
    fp1.maxScale = 5;
    const foodAgent = makeAgent({
        id: 'gune-food-proc',
        name: 'Gune Food Processing',
        associatedPlanetId: 'gune',
        planetId: 'gune',
        facilities: [fp1],
        storage: makeStorage({ planetId: 'gune', id: 'gune-food-storage', name: 'Gune Foods Storage' }),
    });

    return [timberAgent, foodAgent];
}

// ============================================================================
// Icedonia — mineral & energy world
// ============================================================================

const icedoniaCoalClaims: ResourceClaimEntry[] = [];

function buildIcedoniaIndustrialAgents(): Agent[] {
    const coalId = 'icedonia-coal-polar-energy';
    icedoniaCoalClaims.push(
        makeClaim({
            id: coalId,
            type: coalDepositResourceType,
            quantity: 60000,
            claimAgentId: 'icedonia-government',
            tenantAgentId: 'icedonia-polar-energy',
            tenantCostInCoins: 60,
            renewable: false,
        }),
    );
    const c1 = coalMine('icedonia', 'icedonia-polar-coal-mine');
    c1.scale = 60;
    c1.maxScale = 60;
    const c2 = coalPowerPlant('icedonia', 'icedonia-polar-power-plant');
    c2.scale = 10;
    c2.maxScale = 10;
    return [
        makeAgent({
            id: 'icedonia-polar-energy',
            name: 'Polar Energy Corp',
            associatedPlanetId: 'icedonia',
            planetId: 'icedonia',
            facilities: [c1, c2],
            storage: makeStorage({ planetId: 'icedonia', id: 'icedonia-polar-storage', name: 'Polar Energy Storage' }),
            tenancies: [coalId],
        }),
    ];
}

// ============================================================================
// Pandara — agricultural & steel hub
// ============================================================================

const pandaraIronClaims: ResourceClaimEntry[] = [];

function buildPandaraIndustrialAgents(): Agent[] {
    const ironId = 'pandara-iron-pandara-steel';
    pandaraIronClaims.push(
        makeClaim({
            id: ironId,
            type: ironOreDepositResourceType,
            quantity: 200000,
            claimAgentId: 'pandara-government',
            tenantAgentId: 'pandara-steel-works',
            tenantCostInCoins: 200,
            renewable: false,
        }),
    );
    const i1 = ironExtractionFacility('pandara', 'pandara-steel-iron');
    i1.scale = 200;
    i1.maxScale = 200;
    const i2 = ironSmelter('pandara', 'pandara-steel-smelter');
    i2.scale = 80;
    i2.maxScale = 80;
    const steelAgent = makeAgent({
        id: 'pandara-steel-works',
        name: 'Pandara Steel Works',
        associatedPlanetId: 'pandara',
        planetId: 'pandara',
        facilities: [i1, i2],
        storage: makeStorage({ planetId: 'pandara', id: 'pandara-steel-storage', name: 'Pandara Steel Storage' }),
        tenancies: [ironId],
    });

    const fp1 = foodProcessingPlant('pandara', 'pandara-food-plant');
    fp1.scale = 20;
    fp1.maxScale = 20;
    const bev1 = beveragePlant('pandara', 'pandara-bev-plant');
    bev1.scale = 10;
    bev1.maxScale = 10;
    const foodAgent = makeAgent({
        id: 'pandara-food-corp',
        name: 'Pandara Food Corp',
        associatedPlanetId: 'pandara',
        planetId: 'pandara',
        facilities: [fp1, bev1],
        storage: makeStorage({ planetId: 'pandara', id: 'pandara-food-storage', name: 'Pandara Food Storage' }),
    });

    return [steelAgent, foodAgent];
}

// ============================================================================
// Paradies — refinery & glass
// ============================================================================

const paradiesOilClaims: ResourceClaimEntry[] = [];
const paradiesSandClaims: ResourceClaimEntry[] = [];

function buildParadiesIndustrialAgents(): Agent[] {
    const oilId = 'paradies-oil-paradies-refinery';
    paradiesOilClaims.push(
        makeClaim({
            id: oilId,
            type: oilReservoirResourceType,
            quantity: 100000,
            claimAgentId: 'paradies-government',
            tenantAgentId: 'paradies-refinery',
            tenantCostInCoins: 200,
            renewable: false,
        }),
    );
    const or1 = oilWell('paradies', 'paradies-oil-well');
    or1.scale = 100;
    or1.maxScale = 100;
    const or2 = oilRefinery('paradies', 'paradies-oil-refinery');
    or2.scale = 40;
    or2.maxScale = 40;
    const refineryAgent = makeAgent({
        id: 'paradies-refinery',
        name: 'Paradies Refinery Corp',
        associatedPlanetId: 'paradies',
        planetId: 'paradies',
        facilities: [or1, or2],
        storage: makeStorage({
            planetId: 'paradies',
            id: 'paradies-refinery-storage',
            name: 'Paradies Refinery Storage',
        }),
        tenancies: [oilId],
    });

    const sandId = 'paradies-sand-glass-works';
    paradiesSandClaims.push(
        makeClaim({
            id: sandId,
            type: sandDepositResourceType,
            quantity: 80000,
            claimAgentId: 'paradies-government',
            tenantAgentId: 'paradies-glass-works',
            tenantCostInCoins: 40,
            renewable: true,
        }),
    );
    const gl1 = glassFactory('paradies', 'paradies-glass-factory');
    gl1.scale = 30;
    gl1.maxScale = 30;
    const glassAgent = makeAgent({
        id: 'paradies-glass-works',
        name: 'Paradies Glass Works',
        associatedPlanetId: 'paradies',
        planetId: 'paradies',
        facilities: [gl1],
        storage: makeStorage({ planetId: 'paradies', id: 'paradies-glass-storage', name: 'Paradies Glass Storage' }),
        tenancies: [sandId],
    });

    return [refineryAgent, glassAgent];
}

// ============================================================================
// Suerte — copper & cement world
// ============================================================================

const suerteCopperClaims: ResourceClaimEntry[] = [];

function buildSuerteIndustrialAgents(): Agent[] {
    const copperId = 'suerte-copper-suerte-mining';
    suerteCopperClaims.push(
        makeClaim({
            id: copperId,
            type: copperDepositResourceType,
            quantity: 120000,
            claimAgentId: 'suerte-government',
            tenantAgentId: 'suerte-copper-mining',
            tenantCostInCoins: 120,
            renewable: false,
        }),
    );
    const cm1 = copperMine('suerte', 'suerte-copper-mine');
    cm1.scale = 120;
    cm1.maxScale = 120;
    const cs1 = copperSmelter('suerte', 'suerte-copper-smelter');
    cs1.scale = 60;
    cs1.maxScale = 60;
    const copperAgent = makeAgent({
        id: 'suerte-copper-mining',
        name: 'Suerte Copper Mining',
        associatedPlanetId: 'suerte',
        planetId: 'suerte',
        facilities: [cm1, cs1],
        storage: makeStorage({ planetId: 'suerte', id: 'suerte-copper-storage', name: 'Suerte Copper Storage' }),
        tenancies: [copperId],
    });

    const cem1 = cementPlant('suerte', 'suerte-cement-plant');
    cem1.scale = 20;
    cem1.maxScale = 20;
    const cementAgent = makeAgent({
        id: 'suerte-cement-co',
        name: 'Suerte Cement Co',
        associatedPlanetId: 'suerte',
        planetId: 'suerte',
        facilities: [cem1],
        storage: makeStorage({ planetId: 'suerte', id: 'suerte-cement-storage', name: 'Suerte Cement Storage' }),
    });

    return [copperAgent, cementAgent];
}

// ============================================================================
// Planet spec definitions
// ============================================================================

export function buildSmallPlanets(): { planet: Planet; agents: Agent[] }[] {
    return [
        buildSmallPlanet({
            id: 'gune',
            name: 'Gune',
            population: 500_000,
            position: { x: 8.5, y: 1.2, z: -0.5 },
            totalArable: 40000,
            totalWater: 40000,
            govAgriScale: 10,
            agriCompanies: [
                { id: 'gune-harvest-co', name: 'Gune Harvest Co', arableLand: 8000, waterSource: 8000 },
                { id: 'gune-soil-works', name: 'Gune Soil Works', arableLand: 5000, waterSource: 5000 },
                {
                    id: 'gune-valley-crops',
                    name: 'Gune Valley Crops',
                    arableLand: 4000,
                    waterSource: 4000,
                },
            ],
            industrialAgents: buildGuneIndustrialAgents(),
            extraResources: { [forestResourceType.name]: guneForestClaims },
            infrastructure: {
                primarySchools: 30,
                secondarySchools: 15,
                universities: 3,
                hospitals: 8,
                mobility: { roads: 300, railways: 60, airports: 1, seaports: 0, spaceports: 2 },
                energy: { production: 30000 },
            },
            environment: makeDefaultEnvironment({
                air: 1,
                water: 1,
                soil: 0,
                airRegen: 0.08,
                waterRegen: 0.04,
                soilRegen: 0.003,
                earthquakes: 2,
                floods: 5,
                storms: 8,
            }),
        }),
        buildSmallPlanet({
            id: 'icedonia',
            name: 'Icedonia',
            population: 200_000,
            position: { x: -3.2, y: 5.1, z: 2.0 },
            totalArable: 20000,
            totalWater: 60000,
            govAgriScale: 5,
            agriCompanies: [
                { id: 'icedonia-polar-farms', name: 'Polar Farms', arableLand: 5000, waterSource: 5000 },
                {
                    id: 'icedonia-frost-ag',
                    name: 'Frost Agriculture',
                    arableLand: 3000,
                    waterSource: 3000,
                },
            ],
            industrialAgents: buildIcedoniaIndustrialAgents(),
            extraResources: { [coalDepositResourceType.name]: icedoniaCoalClaims },
            infrastructure: {
                primarySchools: 15,
                secondarySchools: 8,
                universities: 1,
                hospitals: 4,
                mobility: { roads: 150, railways: 20, airports: 1, seaports: 2, spaceports: 1 },
                energy: { production: 15000 },
            },
            environment: makeDefaultEnvironment({
                airRegen: 0.15,
                waterRegen: 0.2,
                soilRegen: 0.002,
                floods: 10,
                storms: 20,
            }),
        }),
        buildSmallPlanet({
            id: 'pandara',
            name: 'Pandara',
            population: 3_000_000,
            position: { x: 12.0, y: -2.5, z: 1.5 },
            totalArable: 150000,
            totalWater: 150000,
            govAgriScale: 50,
            agriCompanies: [
                { id: 'pandara-green-delta', name: 'Green Delta', arableLand: 30000, waterSource: 30000 },
                {
                    id: 'pandara-river-farms',
                    name: 'River Farms Pandara',
                    arableLand: 25000,
                    waterSource: 25000,
                },
                {
                    id: 'pandara-sunleaf',
                    name: 'Sunleaf Agriculture',
                    arableLand: 20000,
                    waterSource: 20000,
                },
                {
                    id: 'pandara-crop-union',
                    name: 'Pandara Crop Union',
                    arableLand: 15000,
                    waterSource: 15000,
                },
                {
                    id: 'pandara-harvest-guild',
                    name: 'Harvest Guild Pandara',
                    arableLand: 10000,
                    waterSource: 10000,
                },
            ],
            industrialAgents: buildPandaraIndustrialAgents(),
            extraResources: { [ironOreDepositResourceType.name]: pandaraIronClaims },
            infrastructure: {
                primarySchools: 200,
                secondarySchools: 100,
                universities: 20,
                hospitals: 60,
                mobility: { roads: 5000, railways: 1000, airports: 10, seaports: 5, spaceports: 4 },
                energy: { production: 200000 },
            },
            environment: makeDefaultEnvironment({
                air: 3,
                water: 2,
                soil: 1,
                airRegen: 0.5,
                waterRegen: 0.3,
                soilRegen: 0.02,
                earthquakes: 5,
                floods: 15,
                storms: 10,
            }),
        }),
        buildSmallPlanet({
            id: 'paradies',
            name: 'Paradies',
            population: 800_000,
            position: { x: 6.3, y: 3.8, z: -1.2 },
            totalArable: 70000,
            totalWater: 70000,
            govAgriScale: 15,
            agriCompanies: [
                { id: 'paradies-eden-farms', name: 'Eden Farms', arableLand: 20000, waterSource: 20000 },
                {
                    id: 'paradies-blossom-ag',
                    name: 'Blossom Agriculture',
                    arableLand: 15000,
                    waterSource: 15000,
                },
                {
                    id: 'paradies-golden-fields',
                    name: 'Golden Fields Paradies',
                    arableLand: 10000,
                    waterSource: 10000,
                },
                {
                    id: 'paradies-sun-harvest',
                    name: 'Paradies Sun Harvest',
                    arableLand: 8000,
                    waterSource: 8000,
                },
            ],
            industrialAgents: buildParadiesIndustrialAgents(),
            extraResources: {
                [oilReservoirResourceType.name]: paradiesOilClaims,
                [sandDepositResourceType.name]: paradiesSandClaims,
            },
            infrastructure: {
                primarySchools: 60,
                secondarySchools: 30,
                universities: 6,
                hospitals: 15,
                mobility: { roads: 800, railways: 150, airports: 3, seaports: 1, spaceports: 2 },
                energy: { production: 60000 },
            },
            environment: makeDefaultEnvironment({
                air: 1,
                airRegen: 0.12,
                waterRegen: 0.1,
                soilRegen: 0.01,
                earthquakes: 1,
                floods: 3,
                storms: 4,
            }),
        }),
        buildSmallPlanet({
            id: 'suerte',
            name: 'Suerte',
            population: 1_500_000,
            position: { x: -1.8, y: -4.2, z: 3.3 },
            totalArable: 100000,
            totalWater: 100000,
            govAgriScale: 30,
            agriCompanies: [
                {
                    id: 'suerte-lucky-harvest',
                    name: 'Lucky Harvest',
                    arableLand: 25000,
                    waterSource: 25000,
                },
                {
                    id: 'suerte-fortune-farms',
                    name: 'Fortune Farms',
                    arableLand: 20000,
                    waterSource: 20000,
                },
                {
                    id: 'suerte-oasis-ag',
                    name: 'Oasis Agriculture',
                    arableLand: 15000,
                    waterSource: 15000,
                },
                {
                    id: 'suerte-sunrise-crops',
                    name: 'Sunrise Crops',
                    arableLand: 10000,
                    waterSource: 10000,
                },
            ],
            industrialAgents: buildSuerteIndustrialAgents(),
            extraResources: { [copperDepositResourceType.name]: suerteCopperClaims },
            infrastructure: {
                primarySchools: 100,
                secondarySchools: 50,
                universities: 10,
                hospitals: 30,
                mobility: { roads: 2000, railways: 400, airports: 5, seaports: 3, spaceports: 3 },
                energy: { production: 100000 },
            },
            environment: makeDefaultEnvironment({
                air: 2,
                water: 1,
                soil: 1,
                airRegen: 0.2,
                waterRegen: 0.15,
                soilRegen: 0.01,
                earthquakes: 3,
                floods: 8,
                storms: 12,
            }),
        }),
    ];
}
