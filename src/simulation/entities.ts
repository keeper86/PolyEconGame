import { TICKS_PER_YEAR } from './constants';
import type { ProductionFacility, Resource, StorageFacility } from './facilities';
import {
    agriculturalProductResourceType,
    arableLandResourceType,
    ironOreDepositResourceType,
    waterResourceType,
    waterSourceResourceType,
} from './facilities';
import type { Agent, Planet, Population } from './planet';
import { maxAge } from './planet';
import { emptyCohort } from './populationHelpers';

export const agriculturalProductionFacility: ProductionFacility = {
    planetId: 'earth',
    id: 'earth-agricultural',
    name: 'Agricultural Facility',
    scale: 20000,
    lastTickEfficiencyInPercent: 0,
    powerConsumptionPerTick: 1,
    workerRequirement: {
        none: 60,
        primary: 30,
        secondary: 10,
        tertiary: 1,
        quaternary: 0,
    },
    pollutionPerTick: {
        air: 0.00001,
        water: 0.00001,
        soil: 0.00001,
    },
    needs: [
        { resource: waterResourceType, quantity: 1000 },
        { resource: arableLandResourceType, quantity: 1000 },
    ],
    produces: [{ resource: agriculturalProductResourceType, quantity: 1000 }],
};

export const waterExtractionFacility: ProductionFacility = {
    planetId: 'earth',
    id: 'earth-water-extraction',
    name: 'Water Extraction Facility',
    scale: 20000,
    lastTickEfficiencyInPercent: 0,
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 4,
        primary: 2,
        secondary: 0,
        tertiary: 0,
        quaternary: 0,
    },
    pollutionPerTick: {
        air: 0.00000005,
        water: 0.00001,
        soil: 0.00000001,
    },
    needs: [{ resource: waterSourceResourceType, quantity: 1000 }],
    produces: [{ resource: waterResourceType, quantity: 1000 }],
};

export const earthStorage: StorageFacility = {
    planetId: 'earth',
    id: 'earth-storage',
    name: 'Governmental Storage',
    scale: 1,
    powerConsumptionPerTick: 0.1,
    workerRequirement: {
        none: 10,
        primary: 10,
        secondary: 5,
        tertiary: 0,
        quaternary: 0,
    },
    pollutionPerTick: {
        air: 0,
        water: 0,
        soil: 0,
    },
    capacity: {
        volume: 100000000000, // in cubic meters
        mass: 10000000000000, // in tons
    },
    current: {
        mass: 0,
        volume: 0,
    },
    currentInStorage: {},
};

export const earthGovernment: Agent = {
    id: 'earth-government',
    name: 'Earth Government',
    associatedPlanetId: 'earth',
    transportShips: [],
    assets: {
        earth: {
            resourceClaims: ['earth-agricultural', 'earth-iron', 'earth-water'],
            resourceTenancies: ['earth-agricultural', 'earth-water'],
            productionFacilities: [agriculturalProductionFacility, waterExtractionFacility],
            storageFacility: earthStorage,
            allocatedWorkers: {
                none: 10000000,
                primary: 5000000,
                secondary: 1000000,
                tertiary: 100000,
                quaternary: 100000,
            },
        },
    },
    wealth: 1000000000, // in coins
};

export const earth: Planet = {
    id: 'earth',
    name: 'Earth',
    position: { x: 0, y: 0, z: 0 },
    population: createPopulation(8000000000), // 8 billion people

    government: earthGovernment,

    resources: {
        [ironOreDepositResourceType.name]: [
            {
                id: 'earth-iron',
                type: ironOreDepositResourceType,
                quantity: 5000000,
                regenerationRate: 0,
                maximumCapacity: 5000000,
                claim: earthGovernment,
                tenant: null,
                tenantCostInCoins: 0,
            },
        ],
        [waterSourceResourceType.name]: [
            {
                id: 'earth-water',
                type: waterSourceResourceType,
                quantity: 2000000,
                regenerationRate: 20000000,
                maximumCapacity: 20000000,
                claim: earthGovernment,
                tenant: earthGovernment,
                tenantCostInCoins: 0,
            },
        ],
        [arableLandResourceType.name]: [
            {
                id: 'earth-agricultural',
                type: arableLandResourceType,
                quantity: 20000000, // in tons, population needs 1 ton / person / year on average
                regenerationRate: 20000000,
                maximumCapacity: 20000000,
                claim: earthGovernment,
                tenant: earthGovernment,
                tenantCostInCoins: 0,
            },
        ],
    },

    infrastructure: {
        primarySchools: 10000,
        secondarySchools: 5000,
        universities: 2000,
        hospitals: 3000,
        mobility: {
            roads: 100000, // km
            railways: 50000, // km
            airports: 1000,
            seaports: 500,
            spaceports: 10,
        },
        energy: {
            production: 1000000, // in MW -> 1 TW
        },
    },
    environment: {
        naturalDisasters: {
            earthquakes: 10, // per year
            floods: 20, // per year
            storms: 30, // per year
        },
        pollution: {
            air: 5, // scale 0-100 (AQI-like)
            water: 2,
            soil: 1,
        },
        regenerationRates: {
            air: {
                constant: 1, // small natural improvement on air index per year
                percentage: 1 / TICKS_PER_YEAR, // small natural improvement on air index per year
            },
            water: {
                constant: 1,
                percentage: 1 / TICKS_PER_YEAR, // water regenerates faster than air due to natural cycles, but pollution also has a stronger effect on water regeneration
            },
            soil: {
                constant: 1,
                percentage: 0.1 / TICKS_PER_YEAR, // soil regenerates very slowly ~ 100 years to regenerate from heavy damage
            },
        },
    },
};

export const queryClaimedResource = (planet: Planet, agent: Agent, resource: Resource): number => {
    const resourceEntries = planet.resources[resource.name];
    if (!resourceEntries) {
        console.warn(`Resource ${resource.name} not found on planet ${planet.name}`);
        return 0;
    }
    const tenantEntries = resourceEntries.filter((entry) => entry.tenant?.id === agent.id);
    if (!tenantEntries.length) {
        console.warn(`Agent ${agent.name} is not tenant of resource ${resource.name} on planet ${planet.name}`);
        return 0;
    }
    return tenantEntries.reduce((sum, entry) => sum + entry.quantity, 0);
};

export const extractFromClaimedResource = (
    planet: Planet,
    agent: Agent,
    resource: Resource,
    quantity: number,
): number => {
    const resourceEntries = planet.resources[resource.name];
    if (!resourceEntries) {
        console.warn(`Resource ${resource.name} not found on planet ${planet.name}`);
        return 0;
    }
    const tenantEntries = resourceEntries.filter((entry) => entry.tenant?.id === agent.id);
    if (!tenantEntries.length) {
        console.warn(`Agent ${agent.name} is not tenant of resource ${resource.name} on planet ${planet.name}`);
        return 0;
    }

    let extracted = 0;
    for (const entry of tenantEntries) {
        const available = entry.quantity;
        const toExtract = Math.min(available, quantity - extracted);
        entry.quantity -= toExtract;
        extracted += toExtract;
        if (extracted >= quantity) {
            break;
        }
    }
    return extracted;
};

export const regenerateRenewableResources = (planet: Planet): void => {
    for (const resourceEntries of Object.values(planet.resources)) {
        for (const entry of resourceEntries) {
            if (entry.regenerationRate > 0) {
                const toRegenerate = Math.min(entry.regenerationRate, entry.maximumCapacity - entry.quantity);
                entry.quantity += toRegenerate;
            }
        }
    }
};

export const alphaCentauri: Planet = {
    id: 'alpha-centauri',
    name: 'Alpha Centauri',
    position: { x: 4.37, y: 0, z: 0 }, // in light years
    population: createPopulation(100000), // 100k people
    government: earthGovernment,
    resources: {
        [waterSourceResourceType.name]: [
            {
                id: 'alpha-centauri-water',
                type: waterSourceResourceType,
                quantity: 5000,
                regenerationRate: 0,
                maximumCapacity: 5000,
                claim: null,
                tenant: null,
                tenantCostInCoins: 10,
            },
        ],
        [arableLandResourceType.name]: [
            {
                id: 'alpha-centauri-agricultural',
                type: agriculturalProductResourceType,
                quantity: 50000, // in tons, population needs 1 ton / person / year on average
                regenerationRate: 10000, // 10k tons of agricultural products can be produced per year
                maximumCapacity: 50000,
                claim: null,
                tenant: null,
                tenantCostInCoins: 30,
            },
        ],
    },
    infrastructure: {
        primarySchools: 1,
        secondarySchools: 1,
        universities: 1,
        hospitals: 1,
        mobility: {
            roads: 10, // km
            railways: 5, // km
            airports: 1,
            seaports: 0,
            spaceports: 1,
        },
        energy: {
            production: 10000, // MWh
        },
    },
    environment: {
        naturalDisasters: {
            earthquakes: 0,
            floods: 0,
            storms: 5,
        },
        pollution: {
            air: 10,
            water: 5,
            soil: 5,
        },
        regenerationRates: {
            air: {
                constant: 0.1, // small natural improvement on air index per year
                percentage: 0.1 / TICKS_PER_YEAR, // small natural improvement on air index per year
            },
            water: {
                constant: 0.05,
                percentage: 0.05 / TICKS_PER_YEAR, // water regenerates faster than air due to natural cycles, but pollution also has a stronger effect on water regeneration
            },
            soil: {
                constant: 0.005,
                percentage: 0.005 / TICKS_PER_YEAR, // soil regenerates very slowly ~ 100 years to regenerate from heavy damage
            },
        },
    },
};

// ----------------------------------------------------------------------
// Initialisation
// ----------------------------------------------------------------------
export function createPopulation(total: number): Population {
    // Create empty cohorts for ages 0..maxAge
    const pop: Population = {
        demography: Array.from({ length: maxAge + 1 }, () => emptyCohort()),
        starvationLevel: 0,
    };
    // Distribute total across ages using a stable population assumption
    // (for simplicity, we use a uniform distribution 0‑maxAge)
    const perAge = Math.floor(total / (maxAge + 1));
    const remainder = total - perAge * (maxAge + 1);

    for (let age = 0; age <= maxAge; age++) {
        const ageCount = perAge + (age < remainder ? 1 : 0);
        // Assign a typical education/occupation distribution for that age
        // (you can replace this with your own initialisation logic)
        if (age === 0) {
            // Newborns: all in 'none' education, 'unableToWork' occupation
            pop.demography[age].none.unableToWork = 0;
        } else if (age < 15) {
            // Children: mostly in education
            pop.demography[age].none.education = Math.floor(ageCount * 0.8);
            pop.demography[age].primary.education = ageCount - pop.demography[age].none.education;
        } else if (age < 25) {
            // Youth
            pop.demography[age].primary.education = Math.floor(ageCount * 0.2);
            pop.demography[age].secondary.education = Math.floor(ageCount * 0.6);
            pop.demography[age].tertiary.education = Math.floor(ageCount * 0.05);
            pop.demography[age].primary.unoccupied =
                ageCount -
                (pop.demography[age].primary.education +
                    pop.demography[age].secondary.education +
                    pop.demography[age].tertiary.education);
        } else if (age < 45) {
            // Young adults – simplified distribution
            pop.demography[age].primary.company = Math.floor(ageCount * 0.21);
            pop.demography[age].primary.government = Math.floor(ageCount * 0.06);
            pop.demography[age].primary.unoccupied = Math.floor(ageCount * 0.03);
            pop.demography[age].secondary.company = Math.floor(ageCount * 0.28);
            pop.demography[age].secondary.government = Math.floor(ageCount * 0.08);
            pop.demography[age].secondary.unoccupied = Math.floor(ageCount * 0.04);
            pop.demography[age].tertiary.company = Math.floor(ageCount * 0.21);
            pop.demography[age].tertiary.government = Math.floor(ageCount * 0.06);
            pop.demography[age].tertiary.unoccupied =
                ageCount -
                (pop.demography[age].primary.company +
                    pop.demography[age].primary.government +
                    pop.demography[age].primary.unoccupied +
                    pop.demography[age].secondary.company +
                    pop.demography[age].secondary.government +
                    pop.demography[age].secondary.unoccupied +
                    pop.demography[age].tertiary.company +
                    pop.demography[age].tertiary.government);
        } else if (age < 65) {
            // Old adults – similar, adjust
            pop.demography[age].primary.company = Math.floor(ageCount * 0.24);
            pop.demography[age].primary.government = Math.floor(ageCount * 0.12);
            pop.demography[age].primary.unoccupied = Math.floor(ageCount * 0.04);
            pop.demography[age].secondary.company = Math.floor(ageCount * 0.24);
            pop.demography[age].secondary.government = Math.floor(ageCount * 0.12);
            pop.demography[age].secondary.unoccupied = Math.floor(ageCount * 0.04);
            pop.demography[age].tertiary.company = Math.floor(ageCount * 0.12);
            pop.demography[age].tertiary.government = Math.floor(ageCount * 0.06);
            pop.demography[age].tertiary.unoccupied =
                ageCount -
                (pop.demography[age].primary.company +
                    pop.demography[age].primary.government +
                    pop.demography[age].primary.unoccupied +
                    pop.demography[age].secondary.company +
                    pop.demography[age].secondary.government +
                    pop.demography[age].secondary.unoccupied +
                    pop.demography[age].tertiary.company +
                    pop.demography[age].tertiary.government);
        } else {
            // Seniors
            pop.demography[age].primary.unoccupied = Math.floor(ageCount * 0.45);
            pop.demography[age].primary.company = Math.floor(ageCount * 0.025);
            pop.demography[age].primary.government = Math.floor(ageCount * 0.025);
            pop.demography[age].secondary.unoccupied = Math.floor(ageCount * 0.27);
            pop.demography[age].secondary.company = Math.floor(ageCount * 0.015);
            pop.demography[age].secondary.government = Math.floor(ageCount * 0.015);
            pop.demography[age].tertiary.unoccupied =
                ageCount -
                (pop.demography[age].primary.unoccupied +
                    pop.demography[age].primary.company +
                    pop.demography[age].primary.government +
                    pop.demography[age].secondary.unoccupied +
                    pop.demography[age].secondary.company +
                    pop.demography[age].secondary.government);
        }
    }
    return pop;
}
