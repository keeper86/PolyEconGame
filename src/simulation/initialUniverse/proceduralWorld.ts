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
import { ALL_PRODUCTION_FACILITY_ENTRIES, type FacilityType } from '../planet/productionFacilities';
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
    administrativeCenter: { totalScale: 83689, agentCount: Math.ceil(flatTargetFactor * 2) },
    agriculturalFacility: { totalScale: 349861, agentCount: Math.ceil(flatTargetFactor * 4) },
    beveragePlant: { totalScale: 289650, agentCount: Math.ceil(flatTargetFactor * 3) },
    cementPlant: { totalScale: 1032192, agentCount: Math.ceil(flatTargetFactor * 8) },
    clothingFactory: { totalScale: 241375, agentCount: Math.ceil(flatTargetFactor * 3) },
    coalMine: { totalScale: 71191, agentCount: Math.ceil(flatTargetFactor * 2) },
    concretePlant: { totalScale: 1290240, agentCount: Math.ceil(flatTargetFactor * 10) },
    constructionFacility: { totalScale: 2150400, agentCount: Math.ceil(flatTargetFactor * 16) },
    copperMine: { totalScale: 86895, agentCount: Math.ceil(flatTargetFactor * 2) },
    copperSmelter: { totalScale: 144825, agentCount: Math.ceil(flatTargetFactor * 2) },
    cottonFarm: { totalScale: 267826, agentCount: Math.ceil(flatTargetFactor * 3) },
    educationCenter: { totalScale: 43168, agentCount: Math.ceil(flatTargetFactor * 2) },
    electronicsFactory: { totalScale: 362062, agentCount: Math.ceil(flatTargetFactor * 4) },
    foodProcessor: { totalScale: 543093, agentCount: Math.ceil(flatTargetFactor * 5) },
    furnitureFactory: { totalScale: 295640, agentCount: Math.ceil(flatTargetFactor * 3) },
    glassFactory: { totalScale: 231930, agentCount: Math.ceil(flatTargetFactor * 3) },
    groceryChain: { totalScale: 1448248, agentCount: Math.ceil(flatTargetFactor * 11) },
    hospital: { totalScale: 901186, agentCount: Math.ceil(flatTargetFactor * 8) },
    ironMine: { totalScale: 279710, agentCount: Math.ceil(flatTargetFactor * 3) },
    ironSmelter: { totalScale: 745895, agentCount: Math.ceil(flatTargetFactor * 6) },
    itDevicesFactory: { totalScale: 724124, agentCount: Math.ceil(flatTargetFactor * 6) },
    limestoneQuarry: { totalScale: 237362, agentCount: Math.ceil(flatTargetFactor * 3) },
    loggingCamp: { totalScale: 236143, agentCount: Math.ceil(flatTargetFactor * 3) },
    logisticsHub: { totalScale: 1102266, agentCount: Math.ceil(flatTargetFactor * 9) },
    machineryFactory: { totalScale: 45108, agentCount: Math.ceil(flatTargetFactor * 2) },
    maintenanceFacility: { totalScale: 1, agentCount: Math.ceil(flatTargetFactor * 2) },
    oilRefinery: { totalScale: 639802, agentCount: Math.ceil(flatTargetFactor * 6) },
    oilWell: { totalScale: 639802, agentCount: Math.ceil(flatTargetFactor * 6) },
    packagingPlant: { totalScale: 20819, agentCount: Math.ceil(flatTargetFactor * 2) },
    paperMill: { totalScale: 19217, agentCount: Math.ceil(flatTargetFactor * 2) },
    pesticidePlant: { totalScale: 116620, agentCount: Math.ceil(flatTargetFactor * 2) },
    pharmaPlant: { totalScale: 180237, agentCount: Math.ceil(flatTargetFactor * 3) },
    retailChain: { totalScale: 1448248, agentCount: Math.ceil(flatTargetFactor * 11) },
    sandMine: { totalScale: 469028, agentCount: Math.ceil(flatTargetFactor * 5) },
    sawmill: { totalScale: 147820, agentCount: Math.ceil(flatTargetFactor * 2) },
    siliconWaferFactory: { totalScale: 181031, agentCount: Math.ceil(flatTargetFactor * 3) },
    stoneQuarry: { totalScale: 516096, agentCount: Math.ceil(flatTargetFactor * 5) },
    textileMill: { totalScale: 223189, agentCount: Math.ceil(flatTargetFactor * 3) },
    vehicleFactory: { totalScale: 10498, agentCount: Math.ceil(flatTargetFactor * 2) },
    waterFacility: { totalScale: 283563, agentCount: Math.ceil(flatTargetFactor * 3) },
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
            facilities.push(fac);

            const agent = makeAgent({
                id,
                name,
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities,
                storage: makeStorage({ planetId: PROC_PLANET_ID, id: `${id}-storage`, name: `${name} Storage` }),
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
