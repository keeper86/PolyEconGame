import { createRecyclerAgent } from '../agents/recycler';
import {
    arableLandResourceType,
    coalDepositResourceType,
    ironOreDepositResourceType,
    waterSourceResourceType,
} from '../planet/landBoundResources';
import type { Planet } from '../planet/planet';
import { createPopulation, makeAgent, makeDefaultEnvironment, makeStorage } from './helpers';
import { initialMarketPrices } from './initialMarketPrices';
import { makePool } from './resourceClaimFactory';

export const AC_ID = 'alpha-centauri';
const GOV = 'ac-government';

const TOTAL_ARABLE = 800_000;
const TOTAL_WATER = 800_000;
const TOTAL_IRON = 500_000;
const TOTAL_COAL = 400_000;

export function buildAlphaCentauri(): { planet: Planet; agents: import('../planet/planet').Agent[] } {
    const agents: import('../planet/planet').Agent[] = [];

    const govAgent = makeAgent({
        id: GOV,
        name: 'Alpha Centauri Government',
        associatedPlanetId: AC_ID,
        planetId: AC_ID,
        facilities: [],
        storage: makeStorage({ planetId: AC_ID, id: 'ac-gov-storage', name: 'AC Gov. Storage' }),
        hrDepartment: null,
    });
    agents.unshift(govAgent);

    const planetBase = {
        id: AC_ID,
        name: 'Alpha Centauri',
        position: { x: 4.37, y: 0, z: 0 },
        population: createPopulation(0, 0),
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
                pool: makePool({ type: arableLandResourceType, quantity: TOTAL_ARABLE, renewable: true }),
                claims: [],
            },
            [waterSourceResourceType.name]: {
                pool: makePool({ type: waterSourceResourceType, quantity: TOTAL_WATER, renewable: true }),
                claims: [],
            },
            [ironOreDepositResourceType.name]: {
                pool: makePool({ type: ironOreDepositResourceType, quantity: TOTAL_IRON, renewable: false }),
                claims: [],
            },
            [coalDepositResourceType.name]: {
                pool: makePool({ type: coalDepositResourceType, quantity: TOTAL_COAL, renewable: false }),
                claims: [],
            },
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

    return {
        planet: {
            ...planetBase,
            recycler: createRecyclerAgent(planetBase.id, planetBase.name),
        },
        agents,
    };
}
