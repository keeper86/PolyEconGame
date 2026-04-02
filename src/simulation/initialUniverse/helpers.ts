import { GROCERY_BUFFER_TARGET_TICKS, TICKS_PER_YEAR } from '../constants';
import { agriculturalProductionFacility, waterExtractionFacility } from '../planet/facilities';
import type { Resource } from '../planet/planet';
import {
    createEmptyDemographicEventCounters,
    type Agent,
    type AgentPlanetAssets,
    type ResourceClaim,
    type ResourceQuantity,
} from '../planet/planet';
import type { ProductionFacility, StorageFacility } from '../planet/storage';
import {
    MAX_AGE,
    createEmptyPopulationCohort,
    forEachPopulationCohort,
    type Population,
} from '../population/population';
import { makeWorkforceDemography } from '../utils/testHelper';

export type ResourceClaimEntry = ResourceQuantity & ResourceClaim;

export function makeProductionFacility(opts: {
    planetId: string;
    id: string;
    name: string;
    scale: number;
    powerPerTick: number;
    workers: { none?: number; primary?: number; secondary?: number; tertiary?: number };
    pollution: { air: number; water: number; soil: number };
    needs: { resource: Resource; quantity: number }[];
    produces: { resource: Resource; quantity: number }[];
}): ProductionFacility {
    return {
        planetId: opts.planetId,
        id: opts.id,
        name: opts.name,
        maxScale: opts.scale,
        scale: opts.scale,
        powerConsumptionPerTick: opts.powerPerTick,
        workerRequirement: {
            none: opts.workers.none ?? 0,
            primary: opts.workers.primary ?? 0,
            secondary: opts.workers.secondary ?? 0,
            tertiary: opts.workers.tertiary ?? 0,
        },
        pollutionPerTick: opts.pollution,
        needs: opts.needs,
        produces: opts.produces,
        lastTickResults: {
            overallEfficiency: 0,
            workerEfficiency: {},
            resourceEfficiency: {},
            overqualifiedWorkers: {},
            exactUsedByEdu: {},
            totalUsedByEdu: {},
            lastProduced: {},
            lastConsumed: {},
        },
    };
}

export function makeStorage(opts: {
    planetId: string;
    id: string;
    name: string;
    scale?: number;
    volumeCapacity?: number;
    massCapacity?: number;
}): StorageFacility {
    return {
        planetId: opts.planetId,
        id: opts.id,
        name: opts.name,
        maxScale: opts.scale ?? 1,
        scale: opts.scale ?? 1,
        powerConsumptionPerTick: 0.1,
        workerRequirement: { none: 10, primary: 10, secondary: 5, tertiary: 0 },
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        capacity: {
            volume: opts.volumeCapacity ?? 1e11,
            mass: opts.massCapacity ?? 1e13,
        },
        current: { mass: 0, volume: 0 },
        currentInStorage: {},
        escrow: {},
    };
}

export function makeAgentPlanetAssets(
    planetId: string,
    facilities: ProductionFacility[],
    storage: StorageFacility,
    claims: string[],
    tenancies: string[],
): AgentPlanetAssets {
    return {
        resourceClaims: claims,
        resourceTenancies: tenancies,
        productionFacilities: facilities,
        storageFacility: storage,
        deposits: 0,
        depositHold: 0,
        loans: 0,
        allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        workforceDemography: makeWorkforceDemography(),
        deaths: createEmptyDemographicEventCounters(),
        disabilities: createEmptyDemographicEventCounters(),
    };
}

export function makeAgent(opts: {
    id: string;
    name: string;
    associatedPlanetId: string;
    planetId: string;
    facilities: ProductionFacility[];
    storage: StorageFacility;
    claims?: string[];
    tenancies?: string[];
}): Agent {
    const assets = makeAgentPlanetAssets(
        opts.planetId,
        opts.facilities,
        opts.storage,
        opts.claims ?? [],
        opts.tenancies ?? [],
    );
    return {
        id: opts.id,
        name: opts.name,
        associatedPlanetId: opts.associatedPlanetId,
        transportShips: [],
        automated: true,
        automateWorkerAllocation: true,
        assets: { [opts.planetId]: assets },
    };
}

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
    const perAge = Math.floor(total / (MAX_AGE + 1));
    const pop: Population = {
        demography: Array.from({ length: MAX_AGE + 1 }, () => createEmptyPopulationCohort()),
        summedPopulation: createEmptyPopulationCohort(),
        lastTransferMatrix: [],
        lastConsumption: {},
    };
    const remainder = total - perAge * (MAX_AGE + 1);

    for (let age = 0; age <= MAX_AGE; age++) {
        const ageCount = perAge + (age < remainder ? 1 : 0);
        if (ageCount <= 0) {
            continue;
        }

        if (age === 0) {
            // newborns added during first tick's births step
        } else if (age < 15) {
            const noneEdu = Math.floor(ageCount * 0.8);
            addTo(pop, age, 'education', 'none', noneEdu);
            addTo(pop, age, 'education', 'primary', ageCount - noneEdu);
        } else if (age < 25) {
            const primaryEdu = Math.floor(ageCount * 0.2);
            const secondaryEdu = Math.floor(ageCount * 0.6);
            const tertiaryEdu = Math.floor(ageCount * 0.05);
            const unoccupied = ageCount - (primaryEdu + secondaryEdu + tertiaryEdu);
            addTo(pop, age, 'education', 'primary', primaryEdu);
            addTo(pop, age, 'education', 'secondary', secondaryEdu);
            addTo(pop, age, 'education', 'tertiary', tertiaryEdu);
            addTo(pop, age, 'unoccupied', 'primary', unoccupied);
        } else if (age < 45) {
            const noneUnocc = Math.floor(ageCount * 0.1);
            const primaryUnocc = Math.floor(ageCount * 0.27);
            const secondaryUnocc = Math.floor(ageCount * 0.36);
            const tertiaryUnocc = ageCount - noneUnocc - primaryUnocc - secondaryUnocc;
            addTo(pop, age, 'unoccupied', 'none', noneUnocc);
            addTo(pop, age, 'unoccupied', 'primary', primaryUnocc);
            addTo(pop, age, 'unoccupied', 'secondary', secondaryUnocc);
            addTo(pop, age, 'unoccupied', 'tertiary', tertiaryUnocc);
        } else if (age < 65) {
            const noneUnocc = Math.floor(ageCount * 0.1);
            const primaryUnocc = Math.floor(ageCount * 0.36);
            const secondaryUnocc = Math.floor(ageCount * 0.36);
            const tertiaryUnocc = ageCount - noneUnocc - primaryUnocc - secondaryUnocc;
            addTo(pop, age, 'unoccupied', 'none', noneUnocc);
            addTo(pop, age, 'unoccupied', 'primary', primaryUnocc);
            addTo(pop, age, 'unoccupied', 'secondary', secondaryUnocc);
            addTo(pop, age, 'unoccupied', 'tertiary', tertiaryUnocc);
        } else {
            const noneUnable = Math.floor(ageCount * 0.1);
            const primaryUnocc = Math.floor(ageCount * 0.41);
            const secondaryUnocc = Math.floor(ageCount * 0.24);
            const tertiaryUnocc = ageCount - noneUnable - primaryUnocc - secondaryUnocc;
            addTo(pop, age, 'unableToWork', 'none', noneUnable);
            addTo(pop, age, 'unableToWork', 'primary', primaryUnocc);
            addTo(pop, age, 'unableToWork', 'secondary', secondaryUnocc);
            addTo(pop, age, 'unableToWork', 'tertiary', tertiaryUnocc);
        }
    }

    for (const cohort of pop.demography) {
        forEachPopulationCohort(cohort, (category) => {
            if (category.total > 0) {
                // Initialize with a full buffer so the population has 3 months of
                // grocery coverage before starvation can begin.
                category.services.grocery.buffer = GROCERY_BUFFER_TARGET_TICKS * 8;
            }
        });
    }

    return pop;
}

export function makeDefaultEnvironment(opts: {
    air?: number;
    water?: number;
    soil?: number;
    airRegen?: number;
    waterRegen?: number;
    soilRegen?: number;
    earthquakes?: number;
    floods?: number;
    storms?: number;
}): import('../planet/planet').Planet['environment'] {
    return {
        naturalDisasters: {
            earthquakes: opts.earthquakes ?? 0,
            floods: opts.floods ?? 0,
            storms: opts.storms ?? 0,
        },
        pollution: {
            air: opts.air ?? 0,
            water: opts.water ?? 0,
            soil: opts.soil ?? 0,
        },
        regenerationRates: {
            air: {
                constant: opts.airRegen ?? 0.1,
                percentage: (opts.airRegen ?? 0.1) / TICKS_PER_YEAR,
            },
            water: {
                constant: opts.waterRegen ?? 0.05,
                percentage: (opts.waterRegen ?? 0.05) / TICKS_PER_YEAR,
            },
            soil: {
                constant: opts.soilRegen ?? 0.005,
                percentage: (opts.soilRegen ?? 0.005) / TICKS_PER_YEAR,
            },
        },
    };
}

export function makeWaterExtraction(planetId: string, agentId: string, scale: number): ProductionFacility {
    const facility = waterExtractionFacility(planetId, `${agentId}-water-extraction`);
    facility.scale = scale;
    facility.maxScale = scale;
    return facility;
}

export function makeAgriculturalProduction(planetId: string, agentId: string, scale: number): ProductionFacility {
    const facility = agriculturalProductionFacility(planetId, `${agentId}-agricultural`);
    facility.scale = scale;
    facility.maxScale = scale;
    return facility;
}
