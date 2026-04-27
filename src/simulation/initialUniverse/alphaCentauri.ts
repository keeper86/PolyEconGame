import { initialMarketPrices } from './initialMarketPrices';
import {
    arableLandResourceType,
    coalDepositResourceType,
    ironOreDepositResourceType,
    waterSourceResourceType,
} from '../planet/landBoundResources';
import {
    administrativeCenter,
    agriculturalProductionFacility,
    beveragePlant,
    coalMine,
    coalPowerPlant,
    foodProcessingPlant,
    groceryChain,
    hospital,
    ironExtractionFacility,
    ironSmelter,
    logisticsHub,
    packagingPlant,
    pharmaceuticalPlant,
    retailChain,
    waterExtractionFacility,
} from '../planet/productionFacilities';
import type { Agent, Planet } from '../planet/planet';
import { makeAgent, makeStorage, createPopulation, makeDefaultEnvironment } from './helpers';
import { makeClaim, makeUnclaimedRemainder } from './resourceClaimFactory';
import type { ResourceClaimEntry } from './helpers';

export const AC_ID = 'alpha-centauri';
const GOV = 'ac-government';

const TOTAL_ARABLE = 80_000;
const TOTAL_WATER = 80_000;
const TOTAL_IRON = 500_000;
const TOTAL_COAL = 400_000;

interface AgriSpec {
    id: string;
    name: string;
    arableLand: number;
    waterSource: number;
}

interface IndustrialSpec {
    id: string;
    name: string;
}

const agriSpecs: AgriSpec[] = [
    { id: 'ac-frontier-farms', name: 'Frontier Farms AC', arableLand: 15000, waterSource: 15000 },
    { id: 'ac-nova-ag', name: 'Nova Agriculture', arableLand: 10000, waterSource: 10000 },
    { id: 'ac-colony-co', name: 'Colony Co-op', arableLand: 5000, waterSource: 5000 },
    { id: 'ac-hydro-farms', name: 'AC Hydro Farms', arableLand: 8000, waterSource: 8000 },
    { id: 'ac-pioneer-ag', name: 'Pioneer Agriculture', arableLand: 6000, waterSource: 6000 },
    { id: 'ac-stardust-crops', name: 'Stardust Crops Ltd', arableLand: 4000, waterSource: 4000 },
];

const industrialSpecs: IndustrialSpec[] = [
    { id: 'ac-colony-iron', name: 'Colony Iron Works' },
    { id: 'ac-energy-corp', name: 'AC Energy Corp' },
    { id: 'ac-food-proc', name: 'AC Food Processing' },
    { id: 'ac-pharma-colony', name: 'Colony Pharma' },
];

export function buildAlphaCentauri(): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];
    const arableClaims: ResourceClaimEntry[] = [];
    const waterClaims: ResourceClaimEntry[] = [];
    const ironClaims: ResourceClaimEntry[] = [];
    const coalClaims: ResourceClaimEntry[] = [];

    const govArableId = 'ac-gov-arable';
    const govWaterId = 'ac-gov-water';
    const govClaims: string[] = [govArableId, govWaterId];
    const govTenancies: string[] = [govArableId, govWaterId];

    arableClaims.push(
        makeClaim({
            id: govArableId,
            type: arableLandResourceType,
            quantity: 20000,
            tenantAgentId: GOV,
            renewable: true,
        }),
    );
    waterClaims.push(
        makeClaim({
            id: govWaterId,
            type: waterSourceResourceType,
            quantity: 20000,
            tenantAgentId: GOV,
            renewable: true,
        }),
    );

    for (const spec of agriSpecs) {
        const arableId = `ac-arable-${spec.id}`;
        const waterId = `ac-water-${spec.id}`;
        govClaims.push(arableId, waterId);

        arableClaims.push(
            makeClaim({
                id: arableId,
                type: arableLandResourceType,
                quantity: spec.arableLand,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.arableLand * 0.01),
                renewable: true,
            }),
        );
        waterClaims.push(
            makeClaim({
                id: waterId,
                type: waterSourceResourceType,
                quantity: spec.waterSource,
                tenantAgentId: spec.id,
                tenantCostInCoins: Math.floor(spec.waterSource * 0.005),
                renewable: true,
            }),
        );

        const agriScale = spec.arableLand / 1000;
        const waterScale = spec.waterSource / 1000;

        const waterFacility = waterExtractionFacility(AC_ID, `${spec.id}-water`);
        waterFacility.scale = waterScale;
        waterFacility.maxScale = waterScale;

        const agriFacility = agriculturalProductionFacility(AC_ID, `${spec.id}-agri`);
        agriFacility.scale = agriScale;
        agriFacility.maxScale = agriScale;

        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: AC_ID,
                planetId: AC_ID,
                facilities: [waterFacility, agriFacility],
                storage: makeStorage({ planetId: AC_ID, id: `${spec.id}-storage`, name: `${spec.name} Storage` }),
                tenancies: [arableId, waterId],
            }),
        );
    }

    // Iron mining + smelting
    const [colonyIron, energyCorp, foodProc, pharmaColony] = industrialSpecs;

    const ironId = 'ac-iron-colony-iron';
    govClaims.push(ironId);
    ironClaims.push(
        makeClaim({
            id: ironId,
            type: ironOreDepositResourceType,
            quantity: 300000,
            tenantAgentId: colonyIron.id,
            tenantCostInCoins: 300,
            renewable: false,
        }),
    );
    const ci1 = ironExtractionFacility(AC_ID, 'colony-iron-extraction');
    ci1.scale = 300;
    ci1.maxScale = 300;
    const ci2 = ironSmelter(AC_ID, 'colony-iron-smelter');
    ci2.scale = 100;
    ci2.maxScale = 100;
    agents.push(
        makeAgent({
            id: colonyIron.id,
            name: colonyIron.name,
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [ci1, ci2],
            storage: makeStorage({ planetId: AC_ID, id: 'colony-iron-storage', name: 'Colony Iron Storage' }),
            tenancies: [ironId],
        }),
    );

    // Coal power & energy
    const coalId = 'ac-coal-energy-corp';
    govClaims.push(coalId);
    coalClaims.push(
        makeClaim({
            id: coalId,
            type: coalDepositResourceType,
            quantity: 200000,
            tenantAgentId: energyCorp.id,
            tenantCostInCoins: 200,
            renewable: false,
        }),
    );
    const ec1 = coalMine(AC_ID, 'energy-corp-coal-mine');
    ec1.scale = 200;
    ec1.maxScale = 200;
    const ec2 = coalPowerPlant(AC_ID, 'energy-corp-power-plant');
    ec2.scale = 50;
    ec2.maxScale = 50;
    agents.push(
        makeAgent({
            id: energyCorp.id,
            name: energyCorp.name,
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [ec1, ec2],
            storage: makeStorage({ planetId: AC_ID, id: 'energy-corp-storage', name: 'AC Energy Storage' }),
            tenancies: [coalId],
        }),
    );

    // Food processing
    const fp1 = foodProcessingPlant(AC_ID, 'ac-food-proc-plant');
    fp1.scale = 30;
    fp1.maxScale = 30;
    agents.push(
        makeAgent({
            id: foodProc.id,
            name: foodProc.name,
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [fp1],
            storage: makeStorage({ planetId: AC_ID, id: 'ac-food-proc-storage', name: 'AC Food Processing Storage' }),
        }),
    );

    // Pharmaceuticals
    const ph1 = pharmaceuticalPlant(AC_ID, 'ac-pharma-colony-plant');
    ph1.scale = 20;
    ph1.maxScale = 20;
    agents.push(
        makeAgent({
            id: pharmaColony.id,
            name: pharmaColony.name,
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [ph1],
            storage: makeStorage({ planetId: AC_ID, id: 'ac-pharma-colony-storage', name: 'Colony Pharma Storage' }),
        }),
    );

    // Beverage plant (needed for grocery chains)
    const bev1 = beveragePlant(AC_ID, 'ac-beverage-plant');
    bev1.scale = 20;
    bev1.maxScale = 20;
    agents.push(
        makeAgent({
            id: 'ac-beverage-corp',
            name: 'AC Beverage Corp',
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [bev1],
            storage: makeStorage({ planetId: AC_ID, id: 'ac-beverage-storage', name: 'AC Beverage Storage' }),
        }),
    );

    // Packaging plant (needed for grocery chains and food processing)
    const pkg1 = packagingPlant(AC_ID, 'ac-packaging-plant');
    pkg1.scale = 10;
    pkg1.maxScale = 10;
    agents.push(
        makeAgent({
            id: 'ac-packaging-corp',
            name: 'AC Packaging Corp',
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [pkg1],
            storage: makeStorage({ planetId: AC_ID, id: 'ac-packaging-storage', name: 'AC Packaging Storage' }),
        }),
    );

    // Administrative center
    const adm1 = administrativeCenter(AC_ID, 'ac-admin-center');
    adm1.scale = 100;
    adm1.maxScale = 100;
    agents.push(
        makeAgent({
            id: 'ac-admin-services',
            name: 'AC Administrative Services',
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [adm1],
            storage: makeStorage({ planetId: AC_ID, id: 'ac-admin-storage', name: 'AC Admin Storage' }),
        }),
    );

    // Logistics hub
    const log1 = logisticsHub(AC_ID, 'ac-logistics-hub');
    log1.scale = 50;
    log1.maxScale = 50;
    agents.push(
        makeAgent({
            id: 'ac-logistics-corp',
            name: 'AC Logistics Corp',
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [log1],
            storage: makeStorage({ planetId: AC_ID, id: 'ac-logistics-storage', name: 'AC Logistics Storage' }),
        }),
    );

    // Grocery chain
    const groc1 = groceryChain(AC_ID, 'ac-grocery-chain');
    groc1.scale = 100;
    groc1.maxScale = 100;
    agents.push(
        makeAgent({
            id: 'ac-grocery-corp',
            name: 'AC Grocery Corp',
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [groc1],
            storage: makeStorage({ planetId: AC_ID, id: 'ac-grocery-storage', name: 'AC Grocery Storage' }),
        }),
    );

    // Retail chain
    const ret1 = retailChain(AC_ID, 'ac-retail-chain');
    ret1.scale = 50;
    ret1.maxScale = 50;
    agents.push(
        makeAgent({
            id: 'ac-retail-corp',
            name: 'AC Retail Corp',
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [ret1],
            storage: makeStorage({ planetId: AC_ID, id: 'ac-retail-storage', name: 'AC Retail Storage' }),
        }),
    );

    // Hospital (healthcare service)
    const hosp1 = hospital(AC_ID, 'ac-hospital');
    hosp1.scale = 30;
    hosp1.maxScale = 30;
    agents.push(
        makeAgent({
            id: 'ac-healthcare-corp',
            name: 'AC Healthcare Corp',
            associatedPlanetId: AC_ID,
            planetId: AC_ID,
            facilities: [hosp1],
            storage: makeStorage({ planetId: AC_ID, id: 'ac-healthcare-storage', name: 'AC Healthcare Storage' }),
        }),
    );

    // Unclaimed remainders
    const remainders = [
        {
            claims: arableClaims,
            total: TOTAL_ARABLE,
            type: arableLandResourceType,
            prefix: 'ac-arable',
            renewable: true,
        },
        { claims: waterClaims, total: TOTAL_WATER, type: waterSourceResourceType, prefix: 'ac-water', renewable: true },
        {
            claims: ironClaims,
            total: TOTAL_IRON,
            type: ironOreDepositResourceType,
            prefix: 'ac-iron',
            renewable: false,
        },
        { claims: coalClaims, total: TOTAL_COAL, type: coalDepositResourceType, prefix: 'ac-coal', renewable: false },
    ];
    for (const { claims, total, type, prefix, renewable } of remainders) {
        const remainder = makeUnclaimedRemainder({
            idPrefix: prefix,
            type,
            total,
            existing: claims,
            claimAgentId: GOV,
            renewable,
        });
        if (remainder) {
            claims.push(remainder);
            govClaims.push(remainder.id);
        }
    }

    // Government agent
    const govWaterFacility = waterExtractionFacility(AC_ID, 'ac-gov-water');
    govWaterFacility.scale = 20;
    govWaterFacility.maxScale = 20;
    const govAgriFacility = agriculturalProductionFacility(AC_ID, 'ac-gov-agri');
    govAgriFacility.scale = 20;
    govAgriFacility.maxScale = 20;

    const govAgent = makeAgent({
        id: GOV,
        name: 'Alpha Centauri Government',
        associatedPlanetId: AC_ID,
        planetId: AC_ID,
        facilities: [govWaterFacility, govAgriFacility],
        storage: makeStorage({ planetId: AC_ID, id: 'ac-gov-storage', name: 'AC Gov. Storage' }),
        claims: govClaims,
        tenancies: govTenancies,
    });
    agents.unshift(govAgent);

    const planet: Planet = {
        id: AC_ID,
        name: 'Alpha Centauri',
        position: { x: 4.37, y: 0, z: 0 },
        population: createPopulation(1_000_000),
        governmentId: GOV,
        bank: {
            loans: 0,
            deposits: 0,
            householdDeposits: 0,
            equity: 0,
            loanRate: 0,
            depositRate: 0,
        },
        wagePerEdu: { none: 1.0, primary: 1.0, secondary: 1.0, tertiary: 1.0 },
        marketPrices: { ...initialMarketPrices },
        lastMarketResult: {},
        avgMarketResult: {},
        monthPriceAcc: {},
        resources: {
            [arableLandResourceType.name]: arableClaims,
            [waterSourceResourceType.name]: waterClaims,
            [ironOreDepositResourceType.name]: ironClaims,
            [coalDepositResourceType.name]: coalClaims,
        },
        infrastructure: {
            primarySchools: 50,
            secondarySchools: 25,
            universities: 5,
            hospitals: 10,
            mobility: { roads: 500, railways: 100, airports: 2, seaports: 0, spaceports: 3 },
            energy: { production: 50000 },
        },
        environment: makeDefaultEnvironment({
            air: 2,
            water: 1,
            soil: 1,
            airRegen: 0.1,
            waterRegen: 0.05,
            soilRegen: 0.005,
            storms: 5,
        }),
    };

    return { planet, agents };
}
