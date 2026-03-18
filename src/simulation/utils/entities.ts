import { TICKS_PER_YEAR } from '../constants';
import type { ProductionFacility, Resource, StorageFacility } from '../planet/facilities';
import {
    agriculturalProductResourceType,
    arableLandResourceType,
    ironOreDepositResourceType,
    ironOreResourceType,
    waterResourceType,
    waterSourceResourceType,
} from '../planet/facilities';
import { createEmptyDemographicEventCounters, type Agent, type Planet } from '../planet/planet';
import type { Population } from '../population/population';
import { createEmptyPopulationCohort, MAX_AGE } from '../population/population';
import { makeWorkforceDemography } from './testHelper';

export const agriculturalProductionFacility: ProductionFacility = {
    planetId: 'earth',
    id: 'earth-agricultural',
    name: 'Agricultural Facility',
    maxScale: 2000,
    scale: 2000,
    powerConsumptionPerTick: 1,
    workerRequirement: {
        none: 20000,
        primary: 50000,
        secondary: 35000,
        tertiary: 100,
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
    lastTickResults: {
        overallEfficiency: 1,
        workerEfficiency: {},
        resourceEfficiency: {},
        overqualifiedWorkers: {},
        exactUsedByEdu: {},
        totalUsedByEdu: {},
    },
};

export const waterExtractionFacility: ProductionFacility = {
    planetId: 'earth',
    id: 'earth-water-extraction',
    name: 'Water Extraction Facility',
    maxScale: 2000,
    scale: 2000,
    lastTickResults: {
        overallEfficiency: 1,
        workerEfficiency: {},
        resourceEfficiency: {},
        overqualifiedWorkers: {},
        exactUsedByEdu: {},
        totalUsedByEdu: {},
    },
    powerConsumptionPerTick: 0.5,
    workerRequirement: {
        none: 4,
        primary: 2,
        secondary: 0,
        tertiary: 0,
    },
    pollutionPerTick: {
        air: 0.00000005,
        water: 0.00001,
        soil: 0.00000001,
    },
    needs: [{ resource: waterSourceResourceType, quantity: 1000 }],
    produces: [{ resource: waterResourceType, quantity: 1000 }],
};

export const ironExtractionFacility: ProductionFacility = {
    planetId: 'earth',
    id: 'earth-iron-extraction',
    name: 'Iron Extraction Facility',
    maxScale: 1,
    scale: 1,
    lastTickResults: {
        overallEfficiency: 1,
        workerEfficiency: {},
        resourceEfficiency: {},
        overqualifiedWorkers: {},
        exactUsedByEdu: {},
        totalUsedByEdu: {},
    },
    powerConsumptionPerTick: 0.8,
    workerRequirement: {
        none: 0,
        primary: 0,
        secondary: 1,
        tertiary: 0,
    },
    pollutionPerTick: {
        air: 0.000001,
        water: 0.00001,
        soil: 0.000001,
    },
    needs: [{ resource: ironOreDepositResourceType, quantity: 1000 }],
    produces: [{ resource: ironOreResourceType, quantity: 1000 }],
};

export const testCompanyStorage: StorageFacility = {
    planetId: 'earth',
    id: 'test-company-storage',
    name: 'Test Company Storage',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.1,
    workerRequirement: {
        none: 10,
        primary: 10,
        secondary: 5,
        tertiary: 0,
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

export const earthStorage: StorageFacility = {
    planetId: 'earth',
    id: 'earth-storage',
    name: 'Governmental Storage',
    maxScale: 1,
    scale: 1,
    powerConsumptionPerTick: 0.1,
    workerRequirement: {
        none: 10,
        primary: 10,
        secondary: 5,
        tertiary: 0,
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
    automated: true,
    automateWorkerAllocation: true,
    automatePricing: true,
    assets: {
        earth: {
            resourceClaims: ['earth-agricultural', 'earth-iron', 'earth-water'],
            resourceTenancies: ['earth-agricultural', 'earth-water'],
            productionFacilities: [waterExtractionFacility, agriculturalProductionFacility],
            storageFacility: earthStorage,
            deposits: 0,
            loans: 0,
            allocatedWorkers: {
                none: 0,
                primary: 0,
                secondary: 0,
                tertiary: 0,
            },
            workforceDemography: makeWorkforceDemography(),
            deaths: createEmptyDemographicEventCounters(),
            disabilities: createEmptyDemographicEventCounters(),
        },
    },
};

export const testCompany: Agent = {
    id: 'test-company',
    name: 'Test Company',
    associatedPlanetId: 'earth',
    transportShips: [],
    automated: true,
    automateWorkerAllocation: true,
    automatePricing: true,
    assets: {
        earth: {
            resourceClaims: [],
            resourceTenancies: ['earth-iron'],
            productionFacilities: [ironExtractionFacility],
            storageFacility: testCompanyStorage,
            deposits: 0,
            loans: 0,
            allocatedWorkers: {
                none: 0,
                primary: 0,
                secondary: 0,
                tertiary: 0,
            },
            workforceDemography: makeWorkforceDemography(),
            deaths: createEmptyDemographicEventCounters(),
            disabilities: createEmptyDemographicEventCounters(),
        },
    },
};

export const earth: Planet = {
    id: 'earth',
    name: 'Earth',
    position: { x: 0, y: 0, z: 0 },
    population: createPopulation(8000000000), // 8 billion people

    governmentId: earthGovernment.id,

    bank: {
        loans: 0,
        deposits: 0,
        householdDeposits: 0,
        equity: 0,
        loanRate: 0,
        depositRate: 0,
    },

    wagePerEdu: {
        none: 1.0,
        primary: 1.0,
        secondary: 1.0,
        tertiary: 1.0,
    },

    marketPrices: { [agriculturalProductResourceType.name]: 1.0 },
    lastMarketResult: {},

    resources: {
        [waterSourceResourceType.name]: [
            {
                id: 'earth-water',
                type: waterSourceResourceType,
                quantity: 2000000,
                regenerationRate: 20000000,
                maximumCapacity: 20000000,
                claimAgentId: earthGovernment.id,
                tenantAgentId: earthGovernment.id,
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
                claimAgentId: earthGovernment.id,
                tenantAgentId: earthGovernment.id,
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

/**
 * Collapse all resource-claim entries for `resourceName` on `planet` that
 * have no tenant (tenantAgentId === null) into a single entry.
 *
 * The surviving entry keeps the id of the first untenanted entry found (or
 * uses the provided `collapsedId` if given) and accumulates the total
 * quantity / regenerationRate / maximumCapacity from all the merged entries.
 * Any extra untenanted entries are removed from the array.
 *
 * This is called before assigning a new tenant so that we always have exactly
 * one "pool" block to split from, regardless of how fragmented the claim list
 * has become over time.
 *
 * @returns The single collapsed entry, or `null` if there are no untenanted
 *          entries for this resource on this planet.
 */
export function collapseUntenantedClaims(
    planet: Planet,
    resourceName: string,
    collapsedId?: string,
): (import('../planet/planet').ResourceClaim & import('../planet/planet').ResourceQuantity) | null {
    const entries = planet.resources[resourceName];
    if (!entries) {
        return null;
    }

    const untenanted = entries.filter((e) => e.tenantAgentId === null);
    if (untenanted.length === 0) {
        return null;
    }

    // Sum all untenanted quantities
    const totalQuantity = untenanted.reduce((s, e) => s + e.quantity, 0);
    const totalRegen = untenanted.reduce((s, e) => s + e.regenerationRate, 0);
    const totalCap = untenanted.reduce((s, e) => s + e.maximumCapacity, 0);

    // Use the id of the first untenanted entry (or the provided collapsedId)
    const survivorId = collapsedId ?? untenanted[0].id;
    const claimAgentId = untenanted[0].claimAgentId;

    // Remove ALL untenanted entries
    const filtered = entries.filter((e) => e.tenantAgentId !== null);

    // Push back the single collapsed entry
    const collapsed = {
        ...untenanted[0],
        id: survivorId,
        claimAgentId,
        tenantAgentId: null,
        tenantCostInCoins: 0,
        quantity: totalQuantity,
        regenerationRate: totalRegen,
        maximumCapacity: totalCap,
    };
    filtered.push(collapsed);
    planet.resources[resourceName] = filtered;

    return collapsed;
}

export const queryClaimedResource = (planet: Planet, agent: Agent, resource: Resource): number => {
    const resourceEntries = planet.resources[resource.name];
    if (!resourceEntries) {
        console.warn(`Resource ${resource.name} not found on planet ${planet.name}`);
        return 0;
    }
    const tenantEntries = resourceEntries.filter((entry) => entry.tenantAgentId === agent.id);
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
    const tenantEntries = resourceEntries.filter((entry) => entry.tenantAgentId === agent.id);
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

export const alphaCentauri: Planet = {
    id: 'alpha-centauri',
    name: 'Alpha Centauri',
    position: { x: 4.37, y: 0, z: 0 }, // in light years
    population: createPopulation(100000), // 100k people
    governmentId: earthGovernment.id,

    bank: {
        loans: 0,
        deposits: 0,
        householdDeposits: 0,
        equity: 0,
        loanRate: 0,
        depositRate: 0,
    },

    wagePerEdu: {
        none: 1.0,
        primary: 1.0,
        secondary: 1.0,
        tertiary: 1.0,
    },

    marketPrices: { [agriculturalProductResourceType.name]: 1.0 },
    lastMarketResult: {},

    resources: {
        [waterSourceResourceType.name]: [
            {
                id: 'alpha-centauri-water',
                type: waterSourceResourceType,
                quantity: 5000,
                regenerationRate: 0,
                maximumCapacity: 5000,
                claimAgentId: null,
                tenantAgentId: null,
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
                claimAgentId: null,
                tenantAgentId: null,
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

/**
 * Helper to add `count` people to a specific (age, occupation, education)
 * cell.  All initial population is placed into the 'novice' skill bucket.
 */
function addTo(
    pop: Population,
    age: number,
    occ: 'unoccupied' | 'employed' | 'education' | 'unableToWork',
    edu: 'none' | 'primary' | 'secondary' | 'tertiary',
    count: number,
): void {
    pop.demography[age][occ][edu].novice.total += count;
}

export function createPopulation(total: number): Population {
    // Distribute total across ages using a stable population assumption
    // (for simplicity, we use a uniform distribution 0‑maxAge)
    const perAge = Math.floor(total / (MAX_AGE + 1));
    // Create empty cohorts for ages 0..maxAge
    // New model: demography[age][occ][edu][skill] → PopulationCategory
    const pop: Population = {
        demography: Array.from({ length: MAX_AGE + 1 }, () => createEmptyPopulationCohort()),
        summedPopulation: createEmptyPopulationCohort(),
        lastTransferMatrix: [],
    };
    const remainder = total - perAge * (MAX_AGE + 1);

    for (let age = 0; age <= MAX_AGE; age++) {
        const ageCount = perAge + (age < remainder ? 1 : 0);
        if (ageCount <= 0) {
            continue;
        }

        if (age === 0) {
            // empty, start of a year, so newborns will be added in the next tick's births step
        } else if (age < 15) {
            // Children: mostly in education
            const noneEdu = Math.floor(ageCount * 0.8);
            addTo(pop, age, 'education', 'none', noneEdu);
            addTo(pop, age, 'education', 'primary', ageCount - noneEdu);
        } else if (age < 25) {
            // Youth: mix of education and unoccupied
            const primaryEdu = Math.floor(ageCount * 0.2);
            const secondaryEdu = Math.floor(ageCount * 0.6);
            const tertiaryEdu = Math.floor(ageCount * 0.05);
            const unoccupied = ageCount - (primaryEdu + secondaryEdu + tertiaryEdu);
            addTo(pop, age, 'education', 'primary', primaryEdu);
            addTo(pop, age, 'education', 'secondary', secondaryEdu);
            addTo(pop, age, 'education', 'tertiary', tertiaryEdu);
            addTo(pop, age, 'unoccupied', 'primary', unoccupied);
        } else if (age < 45) {
            // Young adults – simplified: all unoccupied (no one is employed yet at init)
            const primaryUnocc = Math.floor(ageCount * 0.3);
            const secondaryUnocc = Math.floor(ageCount * 0.4);
            const tertiaryUnocc = ageCount - primaryUnocc - secondaryUnocc;
            addTo(pop, age, 'unoccupied', 'primary', primaryUnocc);
            addTo(pop, age, 'unoccupied', 'secondary', secondaryUnocc);
            addTo(pop, age, 'unoccupied', 'tertiary', tertiaryUnocc);
        } else if (age < 65) {
            // Older adults
            const primaryUnocc = Math.floor(ageCount * 0.4);
            const secondaryUnocc = Math.floor(ageCount * 0.4);
            const tertiaryUnocc = ageCount - primaryUnocc - secondaryUnocc;
            addTo(pop, age, 'unoccupied', 'primary', primaryUnocc);
            addTo(pop, age, 'unoccupied', 'secondary', secondaryUnocc);
            addTo(pop, age, 'unoccupied', 'tertiary', tertiaryUnocc);
        } else {
            // Seniors
            const primaryUnocc = Math.floor(ageCount * 0.45);
            const secondaryUnocc = Math.floor(ageCount * 0.27);
            const tertiaryUnocc = ageCount - primaryUnocc - secondaryUnocc;
            addTo(pop, age, 'unableToWork', 'primary', primaryUnocc);
            addTo(pop, age, 'unableToWork', 'secondary', secondaryUnocc);
            addTo(pop, age, 'unableToWork', 'tertiary', tertiaryUnocc);
        }
    }
    return pop;
}
