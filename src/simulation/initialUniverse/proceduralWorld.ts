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
import {
    ALL_PRODUCTION_FACILITY_ENTRIES,
    neededWorkersByFacility,
    type FacilityType,
} from '../planet/productionFacilities';
import {
    ESTIMATED_HR_OVERHEAD,
    HR_WORLD_BUFFER,
    humanResourcesOfficeFacilityType,
    humanResourcesScaleForWorkers,
} from '../planet/specialFacilities';
import { createPopulation, makeAgent, makeDefaultEnvironment, makeStorage } from './helpers';
import { initialMarketPrices } from './initialMarketPrices';
import {
    buildBuyAutoConfigForResource,
    buildSellAutoConfigForResource,
    generateAgentPersonality,
} from './personalities';
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
    administrativeCenter: { totalScale: 337863, agentCount: Math.ceil(flatTargetFactor * 4) },
    agriculturalFacility: { totalScale: 453352, agentCount: Math.ceil(flatTargetFactor * 5) },
    beveragePlant: { totalScale: 332506, agentCount: Math.ceil(flatTargetFactor * 4) },
    cementPlant: { totalScale: 1720320, agentCount: Math.ceil(flatTargetFactor * 13) },
    clothingFactory: { totalScale: 277088, agentCount: Math.ceil(flatTargetFactor * 3) },
    coalMine: { totalScale: 131025, agentCount: Math.ceil(flatTargetFactor * 2) },
    concretePlant: { totalScale: 2150400, agentCount: Math.ceil(flatTargetFactor * 16) },
    constructionFacility: { totalScale: 2150400, agentCount: Math.ceil(flatTargetFactor * 16) },
    copperMine: { totalScale: 99954, agentCount: Math.ceil(flatTargetFactor * 2) },
    copperSmelter: { totalScale: 166591, agentCount: Math.ceil(flatTargetFactor * 3) },
    cottonFarm: { totalScale: 320444, agentCount: Math.ceil(flatTargetFactor * 4) },
    educationCenter: { totalScale: 49555, agentCount: Math.ceil(flatTargetFactor * 2) },
    electronicsFactory: { totalScale: 416477, agentCount: Math.ceil(flatTargetFactor * 4) },
    foodProcessor: { totalScale: 623449, agentCount: Math.ceil(flatTargetFactor * 6) },
    furnitureFactory: { totalScale: 447671, agentCount: Math.ceil(flatTargetFactor * 4) },
    glassFactory: { totalScale: 266751, agentCount: Math.ceil(flatTargetFactor * 3) },
    groceryChain: { totalScale: 1662529, agentCount: Math.ceil(flatTargetFactor * 13) },
    hospital: { totalScale: 1034524, agentCount: Math.ceil(flatTargetFactor * 8) },
    ironMine: { totalScale: 562218, agentCount: Math.ceil(flatTargetFactor * 5) },
    ironSmelter: { totalScale: 1499248, agentCount: Math.ceil(flatTargetFactor * 11) },
    itDevicesFactory: { totalScale: 832954, agentCount: Math.ceil(flatTargetFactor * 7) },
    limestoneQuarry: { totalScale: 379631, agentCount: Math.ceil(flatTargetFactor * 4) },
    loggingCamp: { totalScale: 361365, agentCount: Math.ceil(flatTargetFactor * 4) },
    logisticsHub: { totalScale: 1257127, agentCount: Math.ceil(flatTargetFactor * 10) },
    machineryFactory: { totalScale: 131419, agentCount: Math.ceil(flatTargetFactor * 2) },
    maintenanceFacility: { totalScale: 1, agentCount: Math.ceil(flatTargetFactor * 2) },
    oilRefinery: { totalScale: 1006907, agentCount: Math.ceil(flatTargetFactor * 8) },
    oilWell: { totalScale: 1006907, agentCount: Math.ceil(flatTargetFactor * 8) },
    packagingPlant: { totalScale: 23899, agentCount: Math.ceil(flatTargetFactor * 2) },
    paperMill: { totalScale: 34149, agentCount: Math.ceil(flatTargetFactor * 2) },
    pesticidePlant: { totalScale: 151117, agentCount: Math.ceil(flatTargetFactor * 3) },
    pharmaPlant: { totalScale: 517262, agentCount: Math.ceil(flatTargetFactor * 5) },
    retailChain: { totalScale: 1662529, agentCount: Math.ceil(flatTargetFactor * 13) },
    sandMine: { totalScale: 628334, agentCount: Math.ceil(flatTargetFactor * 6) },
    sawmill: { totalScale: 223836, agentCount: Math.ceil(flatTargetFactor * 3) },
    siliconWaferFactory: { totalScale: 208238, agentCount: Math.ceil(flatTargetFactor * 3) },
    stoneQuarry: { totalScale: 860160, agentCount: Math.ceil(flatTargetFactor * 7) },
    textileMill: { totalScale: 267036, agentCount: Math.ceil(flatTargetFactor * 3) },
    vehicleFactory: { totalScale: 11973, agentCount: Math.ceil(flatTargetFactor * 2) },
    waterFacility: { totalScale: 392153, agentCount: Math.ceil(flatTargetFactor * 4) },
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

            const entry = ALL_PRODUCTION_FACILITY_ENTRIES[facilityType as FacilityType];
            const fac = entry.factory(PROC_PLANET_ID, `${id}-${facilityType}`);
            fac.scale = scale;
            fac.maxScale = scale;

            const hrDepartment = humanResourcesOfficeFacilityType(PROC_PLANET_ID, `${id}-hr-department`);
            const storage = makeStorage({ planetId: PROC_PLANET_ID, id: `${id}-storage`, name: `${name} Storage` });
            const neededWorkers =
                HR_WORLD_BUFFER *
                ESTIMATED_HR_OVERHEAD *
                (neededWorkersByFacility(fac) + neededWorkersByFacility(storage));

            hrDepartment.scale = humanResourcesScaleForWorkers(neededWorkers);
            hrDepartment.maxScale = hrDepartment.scale;
            facilities.push(fac);

            const agent = makeAgent({
                id,
                name,
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities,
                storage,
                hrDepartment,
            });

            const personality = generateAgentPersonality();
            const assets = agent.assets[PROC_PLANET_ID];

            for (const { resource } of fac.produces) {
                if (!assets.market.sell[resource.name]) {
                    assets.market.sell[resource.name] = {
                        resource,
                        automated: true,
                        autoConfig: buildSellAutoConfigForResource(personality.sellAutoConfig, resource),
                    };
                }
            }

            for (const { resource } of fac.needs) {
                if (resource.form === 'landBoundResource') {
                    continue;
                }
                if (!assets.market.buy[resource.name]) {
                    assets.market.buy[resource.name] = {
                        resource,
                        automated: true,
                        autoConfig: buildBuyAutoConfigForResource(personality.buyAutoConfig, resource),
                    };
                }
            }

            agents.push(agent);
        }
    }

    const govAgent = makeAgent({
        id: GOV,
        name: 'Procedural Earth Government',
        associatedPlanetId: PROC_PLANET_ID,
        planetId: PROC_PLANET_ID,
        facilities: [],
        storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'proc-gov-storage', name: 'Gov. Central Storage' }),
        hrDepartment: null,
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
