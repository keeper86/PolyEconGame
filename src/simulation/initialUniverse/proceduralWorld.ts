import { createRecyclerAgent } from '../agents/recycler';
import { LOAN_INTEREST_RATE_PER_YEAR } from '../constants';
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
import type { Agent, AutomatedPricingConfig, Planet } from '../planet/planet';
import {
    ALL_PRODUCTION_FACILITY_ENTRIES,
    neededWorkersByFacility,
    type FacilityType,
} from '../planet/productionFacilities';
import { constructionServiceResourceType } from '../planet/services';
import { ESTIMATED_HR_OVERHEAD, HR_WORLD_BUFFER, humanResourcesOfficeFacilityType } from '../planet/specialFacilities';
import {
    createPopulation,
    humanResourcesScaleForWorkers,
    makeAgent,
    makeDefaultEnvironment,
    makeStorage,
} from './helpers';
import { applyStorageSizingForFacilities } from '../planet/automaticProductionScale/shellCompartments';
import { initialMarketPrices } from './initialMarketPrices';
import {
    buildBuyAutoConfigForResource,
    buildSellAutoConfigForResource,
    generateAgentPersonality,
} from './personalities';
import { getNamesFor } from './preConfiguredCompanies';
import { makePool } from './resourceClaimFactory';
import { FACILITY_SCALE_PER_BILLION, TARGET_SCALE_PER_AGENT } from './targets';

export const PROC_PLANET_ID = 'earth';
const GOV = 'earth-government';

const TOTAL_ARABLE = 3_500_000_000;
const TOTAL_WATER = 4_000_000_000;
const TOTAL_IRON_ORE = 5_000_000_00_000;
const TOTAL_COAL = 4_000_000_000_00;
const TOTAL_OIL = 3_000_000_000_00;
const TOTAL_FOREST = 200_000_000_00;
const TOTAL_COPPER = 1_000_500_00_000;
const TOTAL_SAND = 2_000_000_000_00;
const TOTAL_LIMESTONE = 3_000_000_00_000;
const TOTAL_STONE = 4_000_000_000_00;

// TODO: USE stochastic rounds prng here
export function splitScale(total: number, count: number, seed: string): number[] {
    let s = 0;
    for (let i = 0; i < seed.length; i++) {
        s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const rand = () => {
        s = (1664525 * s + 1013904223) >>> 0;
        return s / 0x1_0000_0000;
    };

    if (count <= 0) {
        return [];
    }
    if (count >= total) {
        return Array.from({ length: count }, () => 1);
    }
    const intTotal = Math.round(total);
    if (intTotal <= 0) {
        return Array.from({ length: count }, () => 0);
    }

    const weights = Array.from({ length: count }, () => 0.5 + rand());
    const wSum = weights.reduce((a, b) => a + b, 0);

    let remaining = intTotal;
    const shares: number[] = [];
    for (let i = 0; i < count; i++) {
        if (i === count - 1) {
            shares.push(remaining);
            continue;
        }
        const agentsAfter = count - i - 1;
        const maxAffordable = Math.max(0, remaining - agentsAfter);
        const share = Math.min(maxAffordable, Math.max(1, Math.round((weights[i] / wSum) * intTotal)));
        shares.push(share);
        remaining -= share;
    }
    return shares;
}

interface FacilityTarget {
    totalScale: number;
    agentCount: number;
}

const flatTargetFactor = 0.5;

function computeTargets(population: number): Record<string, FacilityTarget> {
    const popB = population / 1_000_000_000;
    const targets: Record<string, FacilityTarget> = {};
    for (const [key, scalePerB] of Object.entries(FACILITY_SCALE_PER_BILLION)) {
        const totalScale = Math.max(1, Math.round(scalePerB * popB));
        targets[key] = {
            totalScale,
            agentCount: Math.min(
                totalScale,
                Math.max(3, Math.ceil((flatTargetFactor * totalScale) / TARGET_SCALE_PER_AGENT)),
            ),
        };
    }
    return targets;
}

export function buildProceduralWorld(): { planet: Planet; agents: Agent[] } {
    const TARGETS = computeTargets(8_000_000_000);
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
            const storage = makeStorage({ planetId: PROC_PLANET_ID, id: `${id}-storage` });
            applyStorageSizingForFacilities(storage, [fac]);
            const neededWorkers =
                1.1 *
                HR_WORLD_BUFFER *
                ESTIMATED_HR_OVERHEAD *
                (neededWorkersByFacility(fac) + neededWorkersByFacility(storage.department!));

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

            assets.market.buy[constructionServiceResourceType.name] = {
                resource: constructionServiceResourceType,
                automated: true,
                autoConfig: buildBuyAutoConfigForResource(personality.buyAutoConfig, constructionServiceResourceType),
            };

            for (const { resource } of fac.produces) {
                if (!assets.market.sell[resource.name]) {
                    if (resource.form === 'services') {
                        const serviceStrategy: AutomatedPricingConfig = {
                            ...personality.sellAutoConfig,
                            targetSellThrough: 0.9,
                        };
                        assets.market.sell[resource.name] = {
                            resource,
                            automated: true,
                            autoConfig: serviceStrategy,
                        };
                    } else {
                        assets.market.sell[resource.name] = {
                            resource,
                            automated: true,
                            autoConfig: buildSellAutoConfigForResource(personality.sellAutoConfig, resource),
                        };
                    }
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
        storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'proc-gov-storage' }),
        hrDepartment: null,
    });
    agents.unshift(govAgent);

    const planetBase = {
        id: PROC_PLANET_ID,
        name: 'Earth',
        position: { x: 10, y: 0, z: 0 },
        population: createPopulation(8_000_000_000, 4),
        governmentId: GOV,
        bank: {
            loans: 0,
            deposits: 0,
            householdDeposits: 0,
            loanRatePerYear: LOAN_INTEREST_RATE_PER_YEAR,
            depositRatePerYear: 0,
            profit: 0,
            interestCollected: 0,
            writeOffs: 0,
            bankruptcies: 0,
            emergencyLoansGranted: 0,
            policyEquityEma: 0,
        },
        wagePerEdu: { none: 10.0, primary: 10.0, secondary: 10.0, tertiary: 10.0 },
        marketPrices: { ...initialMarketPrices },
        monthTransferVolume: 0,
        governmentSupportVolume: 0,
        transportPipeline: {},
        orderBooks: {},
        lastMarketResult: {},
        avgMarketResult: {},
        monthPriceAcc: {},
        consumedResources: {},
        producedResources: {},
        constructionBalanceEMA: 0,
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
