import { createRecyclerAgent } from '../agents/recycler';
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
import type { Agent, Planet } from '../planet/planet';
import { agriculturalFacility, neededWorkersByFacility, waterFacility } from '../planet/productionFacilities';
import { humanResourcesOfficeFacilityType } from '../planet/specialFacilities';
import { humanResourcesScaleForWorkers } from './helpers';
import { createPopulation, makeAgent, makeDefaultEnvironment, makeStorage } from './helpers';
import { initialMarketPrices } from './initialMarketPrices';
import { makePool } from './resourceClaimFactory';

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
    industrialAgents: import('../planet/planet').Agent[];
    infrastructure: Planet['infrastructure'];
    environment: Planet['environment'];
    extraPools?: Array<{
        resource:
            | typeof arableLandResourceType
            | typeof waterSourceResourceType
            | typeof coalDepositResourceType
            | typeof copperDepositResourceType
            | typeof forestResourceType
            | typeof ironOreDepositResourceType
            | typeof oilReservoirResourceType
            | typeof sandDepositResourceType;
        quantity: number;
        renewable: boolean;
    }>;
}

function buildSmallPlanet(spec: SmallPlanetSpec): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];
    const govId = `${spec.id}-government`;
    const utilId = `${spec.id}-utilities`;

    for (const company of spec.agriCompanies) {
        const buildWaterFacility = waterFacility(spec.id, `${company.id}-water`);
        const scale = company.arableLand / 1000;
        buildWaterFacility.scale = scale;
        buildWaterFacility.maxScale = scale;

        const agriFacility = agriculturalFacility(spec.id, `${company.id}-agri`);
        agriFacility.scale = scale;
        agriFacility.maxScale = scale;

        const hrDepartment = humanResourcesOfficeFacilityType(spec.id, `${company.id}-hr-department`);
        hrDepartment.scale = humanResourcesScaleForWorkers(
            neededWorkersByFacility(buildWaterFacility) + neededWorkersByFacility(agriFacility),
        );
        hrDepartment.maxScale = hrDepartment.scale;

        agents.push(
            makeAgent({
                id: company.id,
                name: company.name,
                associatedPlanetId: spec.id,
                planetId: spec.id,
                facilities: [buildWaterFacility, agriFacility],
                storage: makeStorage({
                    planetId: spec.id,
                    id: `${company.id}-storage`,
                }),
                hrDepartment: null,
            }),
        );
    }

    agents.push(...spec.industrialAgents);

    const utilWaterFacility = waterFacility(spec.id, `${spec.id}-util-water-fac`);
    utilWaterFacility.scale = spec.govAgriScale;
    utilWaterFacility.maxScale = spec.govAgriScale;
    const utilAgriFacility = agriculturalFacility(spec.id, `${spec.id}-util-agri-fac`);
    utilAgriFacility.scale = spec.govAgriScale;
    utilAgriFacility.maxScale = spec.govAgriScale;
    const utilAgent = makeAgent({
        id: utilId,
        name: `${spec.name} Utilities`,
        associatedPlanetId: spec.id,
        planetId: spec.id,
        facilities: [utilWaterFacility, utilAgriFacility],
        storage: makeStorage({
            planetId: spec.id,
            id: `${spec.id}-util-storage`,
        }),
        hrDepartment: null,
    });
    agents.push(utilAgent);

    const govAgent = makeAgent({
        id: govId,
        name: `${spec.name} Government`,
        associatedPlanetId: spec.id,
        planetId: spec.id,
        facilities: [],
        storage: makeStorage({ planetId: spec.id, id: `${spec.id}-gov-storage` }),
        hrDepartment: null,
    });
    agents.unshift(govAgent);

    const resources: Planet['resources'] = {
        [arableLandResourceType.name]: {
            pool: makePool({ type: arableLandResourceType, quantity: spec.totalArable, renewable: true }),
            claims: [],
        },
        [waterSourceResourceType.name]: {
            pool: makePool({ type: waterSourceResourceType, quantity: spec.totalWater, renewable: true }),
            claims: [],
        },
    };

    for (const extra of spec.extraPools ?? []) {
        const name = extra.resource.name;
        if (!resources[name]) {
            resources[name] = {
                pool: makePool({ type: extra.resource, quantity: extra.quantity, renewable: extra.renewable }),
                claims: [],
            };
        }
    }

    const planetBase = {
        id: spec.id,
        name: spec.name,
        position: spec.position,
        population: createPopulation(0, 0),
        governmentId: govId,
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
        resources,
        infrastructure: spec.infrastructure,
        environment: spec.environment,
    };

    return { planet: { ...planetBase, recycler: createRecyclerAgent(planetBase.id, planetBase.name) }, agents };
}

export function buildSmallPlanets(): { planet: Planet; agents: import('../planet/planet').Agent[] }[] {
    return [
        buildSmallPlanet({
            id: 'gune',
            name: 'Gune',
            population: 500_000,
            position: { x: 8.5, y: 1.2, z: -0.5 },
            totalArable: 40000,
            totalWater: 40000,
            govAgriScale: 10,
            agriCompanies: [],
            extraPools: [{ resource: forestResourceType, quantity: 50000, renewable: true }],
            industrialAgents: [],
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
            agriCompanies: [],
            extraPools: [{ resource: coalDepositResourceType, quantity: 200000, renewable: false }],
            industrialAgents: [],
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
            agriCompanies: [],
            extraPools: [{ resource: ironOreDepositResourceType, quantity: 500000, renewable: false }],
            industrialAgents: [],
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
            agriCompanies: [],
            extraPools: [
                { resource: oilReservoirResourceType, quantity: 300000, renewable: false },
                { resource: sandDepositResourceType, quantity: 200000, renewable: false },
            ],
            industrialAgents: [],
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
            agriCompanies: [],
            extraPools: [{ resource: copperDepositResourceType, quantity: 300000, renewable: false }],
            industrialAgents: [],
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
