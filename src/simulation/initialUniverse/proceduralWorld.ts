import { createRecyclerAgent } from '../agents/recycler';
import type { ProductionFacility } from '../planet/facility';
import {
    arableLandResourceType,
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
import { ALL_FACILITY_ENTRIES, type FacilityType } from '../planet/productionFacilities';
import { createPopulation, makeAgent, makeDefaultEnvironment, makeStorage } from './helpers';
import { initialMarketPrices } from './initialMarketPrices';
import { getNamesFor } from './preConfiguredCompanies';
import { makePool } from './resourceClaimFactory';

export const PROC_PLANET_ID = 'earth';
const GOV = 'earth-government';

const TOTAL_ARABLE = 3_500_000_00;
const TOTAL_WATER = 4_000_000_00;
const TOTAL_IRON_ORE = 5_000_000_00_000;
const TOTAL_COAL = 4_000_000_000_00;
const TOTAL_OIL = 3_000_000_000_00;
const TOTAL_FOREST = 200_000_000_00;
const TOTAL_COPPER = 1_000_500_00_000;
const TOTAL_SAND = 2_000_000_000_00;
const TOTAL_LIMESTONE = 3_000_000_00_000;
const TOTAL_STONE = 4_000_000_000_00;

// TODO: USE stochastic rounds prng here
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

const flatTargetFactor = 1;
const TARGETS: Record<string, FacilityTarget> = {
    administrativeCenter: { totalScale: 66194, agentCount: Math.ceil(flatTargetFactor * 1) },
    agriculturalFacility: { totalScale: 301666, agentCount: Math.ceil(flatTargetFactor * 3) },
    beveragePlant: { totalScale: 249749, agentCount: Math.ceil(flatTargetFactor * 2) },
    cementPlant: { totalScale: 44928, agentCount: Math.ceil(flatTargetFactor * 1) },
    clothingFactory: { totalScale: 208124, agentCount: Math.ceil(flatTargetFactor * 2) },
    coalMine: { totalScale: 10888, agentCount: Math.ceil(flatTargetFactor * 1) },
    concretePlant: { totalScale: 56160, agentCount: Math.ceil(flatTargetFactor * 1) },
    constructionFacility: { totalScale: 93600, agentCount: Math.ceil(flatTargetFactor * 1) },
    copperMine: { totalScale: 74925, agentCount: Math.ceil(flatTargetFactor * 1) },
    copperSmelter: { totalScale: 124874, agentCount: Math.ceil(flatTargetFactor * 1) },
    cottonFarm: { totalScale: 230914, agentCount: Math.ceil(flatTargetFactor * 2) },
    educationCenter: { totalScale: 37221, agentCount: Math.ceil(flatTargetFactor * 1) },
    electronicsFactory: { totalScale: 312186, agentCount: Math.ceil(flatTargetFactor * 3) },
    foodProcessor: { totalScale: 468279, agentCount: Math.ceil(flatTargetFactor * 4) },
    furnitureFactory: { totalScale: 254795, agentCount: Math.ceil(flatTargetFactor * 2) },
    glassFactory: { totalScale: 199979, agentCount: Math.ceil(flatTargetFactor * 2) },
    groceryChain: { totalScale: 1248744, agentCount: Math.ceil(flatTargetFactor * 9) },
    hospital: { totalScale: 777043, agentCount: Math.ceil(flatTargetFactor * 6) },
    ironMine: { totalScale: 31216, agentCount: Math.ceil(flatTargetFactor * 1) },
    ironSmelter: { totalScale: 83243, agentCount: Math.ceil(flatTargetFactor * 1) },
    itDevicesFactory: { totalScale: 624372, agentCount: Math.ceil(flatTargetFactor * 5) },
    limestoneQuarry: { totalScale: 35649, agentCount: Math.ceil(flatTargetFactor * 1) },
    loggingCamp: { totalScale: 203299, agentCount: Math.ceil(flatTargetFactor * 2) },
    logisticsHub: { totalScale: 944554, agentCount: Math.ceil(flatTargetFactor * 7) },
    machineryFactory: { totalScale: 3671, agentCount: Math.ceil(flatTargetFactor * 1) },
    maintenanceFacility: { totalScale: 1, agentCount: Math.ceil(flatTargetFactor * 1) },
    oilRefinery: { totalScale: 549464, agentCount: Math.ceil(flatTargetFactor * 4) },
    oilWell: { totalScale: 549464, agentCount: Math.ceil(flatTargetFactor * 4) },
    packagingPlant: { totalScale: 17951, agentCount: Math.ceil(flatTargetFactor * 1) },
    paperMill: { totalScale: 16271, agentCount: Math.ceil(flatTargetFactor * 1) },
    pesticidePlant: { totalScale: 100555, agentCount: Math.ceil(flatTargetFactor * 1) },
    pharmaPlant: { totalScale: 155409, agentCount: Math.ceil(flatTargetFactor * 2) },
    retailChain: { totalScale: 1248744, agentCount: Math.ceil(flatTargetFactor * 9) },
    sandMine: { totalScale: 263571, agentCount: Math.ceil(flatTargetFactor * 2) },
    sawmill: { totalScale: 127397, agentCount: Math.ceil(flatTargetFactor * 1) },
    siliconWaferFactory: { totalScale: 156093, agentCount: Math.ceil(flatTargetFactor * 2) },
    stoneQuarry: { totalScale: 22464, agentCount: Math.ceil(flatTargetFactor * 1) },
    textileMill: { totalScale: 192429, agentCount: Math.ceil(flatTargetFactor * 2) },
    vehicleFactory: { totalScale: 8996, agentCount: Math.ceil(flatTargetFactor * 1) },
    waterFacility: { totalScale: 218071, agentCount: Math.ceil(flatTargetFactor * 2) },
};
export function buildProceduralWorld(): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];

    for (const [facilityType, target] of Object.entries(TARGETS)) {
        const names = getNamesFor(facilityType as FacilityType, target.agentCount);
        const scales = splitScale(target.totalScale, names.length, facilityType);

        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const scale = scales[i];

            const facilities: ProductionFacility[] = [];

            const entry = ALL_FACILITY_ENTRIES[facilityType as FacilityType];
            const fac = entry.factory(PROC_PLANET_ID, `${id}-${facilityType}`);
            fac.scale = scale;
            fac.maxScale = scale;
            facilities.push(fac);

            agents.push(
                makeAgent({
                    id,
                    name,
                    associatedPlanetId: PROC_PLANET_ID,
                    planetId: PROC_PLANET_ID,
                    facilities,
                    storage: makeStorage({ planetId: PROC_PLANET_ID, id: `${id}-storage`, name: `${name} Storage` }),
                }),
            );
        }
    }

    const govAgent = makeAgent({
        id: GOV,
        name: 'Procedural Earth Government',
        associatedPlanetId: PROC_PLANET_ID,
        planetId: PROC_PLANET_ID,
        facilities: [],
        storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'proc-gov-storage', name: 'Gov. Central Storage' }),
    });
    agents.unshift(govAgent);

    const planetBase = {
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
        monthTransferVolume: 0,
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
            [arableLandResourceType.name]: {
                pool: makePool({
                    type: arableLandResourceType,
                    quantity: TOTAL_ARABLE,
                    renewable: true,
                }),
                claims: [],
            },
            [waterSourceResourceType.name]: {
                pool: makePool({
                    type: waterSourceResourceType,
                    quantity: TOTAL_WATER,
                    renewable: true,
                }),
                claims: [],
            },
            [ironOreDepositResourceType.name]: {
                pool: makePool({
                    type: ironOreDepositResourceType,
                    quantity: TOTAL_IRON_ORE,
                    renewable: false,
                }),
                claims: [],
            },
            [coalDepositResourceType.name]: {
                pool: makePool({
                    type: coalDepositResourceType,
                    quantity: TOTAL_COAL,
                    renewable: false,
                }),
                claims: [],
            },
            [oilReservoirResourceType.name]: {
                pool: makePool({
                    type: oilReservoirResourceType,
                    quantity: TOTAL_OIL,
                    renewable: false,
                }),
                claims: [],
            },
            [forestResourceType.name]: {
                pool: makePool({
                    type: forestResourceType,
                    quantity: TOTAL_FOREST,
                    renewable: true,
                }),
                claims: [],
            },
            [copperDepositResourceType.name]: {
                pool: makePool({
                    type: copperDepositResourceType,
                    quantity: TOTAL_COPPER,
                    renewable: false,
                }),
                claims: [],
            },
            [sandDepositResourceType.name]: {
                pool: makePool({
                    type: sandDepositResourceType,
                    quantity: TOTAL_SAND,
                    renewable: false,
                }),
                claims: [],
            },
            [limestoneDepositResourceType.name]: {
                pool: makePool({
                    type: limestoneDepositResourceType,
                    quantity: TOTAL_LIMESTONE,
                    renewable: false,
                }),
                claims: [],
            },
            [stoneDepositResourceType.name]: {
                pool: makePool({
                    type: stoneDepositResourceType,
                    quantity: TOTAL_STONE,
                    renewable: false,
                }),
                claims: [],
            },
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

    return { planet: { ...planetBase, recycler: createRecyclerAgent(planetBase.id, planetBase.name) }, agents };
}
