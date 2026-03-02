import type { StorageFacility } from '../facilities';
import { agriculturalProductResourceType } from '../facilities';
import type { Planet, Population } from '../planet';

export function createStorageFacility(initialQuantity: number): StorageFacility {
    return {
        planetId: 'p',
        id: 's1',
        name: 'storage',
        scale: 1,
        powerConsumptionPerTick: 0,
        workerRequirement: {},
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: { volume: 1000, mass: 1000 },
        current: { volume: 0, mass: 0 },
        currentInStorage: {
            [agriculturalProductResourceType.name]: {
                resource: agriculturalProductResourceType,
                quantity: initialQuantity,
            },
        },
    };
}

export function createPopulation(starvationLevel = 0): Population {
    return { demography: [], starvationLevel };
}

export function createPlanetWithStorage(storage: StorageFacility, population: Population): Planet {
    return {
        id: 'p',
        name: 'p',
        position: { x: 0, y: 0, z: 0 },
        population,
        resources: {},
        government: {
            id: 'gov',
            name: 'gov',
            associatedPlanetId: 'p',
            wealth: 0,
            transportShips: [],
            assets: {
                p: {
                    resourceClaims: [],
                    resourceTenancies: [],
                    productionFacilities: [],
                    storageFacility: storage,
                    allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0, quaternary: 0 },
                },
            },
        },
        infrastructure: {
            primarySchools: 0,
            secondarySchools: 0,
            universities: 0,
            hospitals: 0,
            mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
            energy: { production: 0 },
        },
        environment: {
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            pollution: { air: 0, water: 0, soil: 0 },
            regenerationRates: {
                air: { constant: 0, percentage: 0 },
                water: { constant: 0, percentage: 0 },
                soil: { constant: 0, percentage: 0 },
            },
        },
    };
}
