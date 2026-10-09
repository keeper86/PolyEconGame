import {
    HR_BUFFER_CAPACITY_MULTIPLIER,
    INPUT_BUFFER_TARGET_TICKS,
    STORAGE_BUFFER_CAPACITY_MULTIPLIER,
    TICKS_PER_YEAR,
} from '../constants';
import { DEFAULT_WAGE_PER_EDU } from '../financial/financialTick';
import { SERVICE_DEFINITIONS } from '../market/serviceDefinitions';

import type { HRFacility } from '../planet/facility';
import {
    makeStorageShell,
    putIntoStorageFacility,
    storageFormKeys,
    type ProductionFacility,
    type Storage,
} from '../planet/facility';
import { authorShellCompartments } from '../planet/automaticProductionScale/shellCompartments';
import {
    createEmptyAccumulator,
    createEmptyDemographicEventCounters,
    type Agent,
    type AgentPlanetAssets,
} from '../planet/planet';
import {
    PRODUCED_HR_QUANTITY,
    PRODUCED_STORAGE_QUANTITY,
    logisticsDepartmentFacilityType,
} from '../planet/specialFacilities';
import {
    MAX_AGE,
    createEmptyPopulationCohort,
    forEachPopulationCohort,
    type Population,
} from '../population/population';
import { makeWorkforceDemography } from '../utils/testHelper';

export function makeStorage(opts: { planetId: string; id: string; scale?: number }): Storage {
    const scale = opts.scale ?? 1;
    const department = logisticsDepartmentFacilityType(opts.planetId, `${opts.id}-department`);
    department.scale = scale;
    department.maxScale = scale;
    return {
        planetId: opts.planetId,
        id: opts.id,
        currentInStorage: {},
        escrow: {},
        shells: {
            solid: makeStorageShell(opts.planetId, `${opts.id}-silo`, 'solid', scale),
            liquid: makeStorageShell(opts.planetId, `${opts.id}-tank`, 'liquid', scale),
            pieces: makeStorageShell(opts.planetId, `${opts.id}-warehouse`, 'pieces', scale),
        },
        department,
    };
}

export function makeAgentPlanetAssets(
    facilities: ProductionFacility[],
    storage: Storage,
    hrDepartment: HRFacility | null,
): AgentPlanetAssets {
    if (hrDepartment && hrDepartment.construction === null) {
        hrDepartment.hrBuffer = PRODUCED_HR_QUANTITY * hrDepartment.maxScale * HR_BUFFER_CAPACITY_MULTIPLIER;
    }
    if (storage.department && storage.department.construction === null) {
        storage.department.transportBuffer =
            PRODUCED_STORAGE_QUANTITY * storage.department.scale * STORAGE_BUFFER_CAPACITY_MULTIPLIER;
    }
    return {
        productionFacilities: facilities,
        shipConstructionFacilities: [],
        storage: storage,
        humanResourcesDepartment: hrDepartment,
        hrProductivityMultiplier: 1,
        transportContracts: [],
        constructionContracts: [],
        shipBuyingOffers: [],
        shipListings: [],
        deposits: 0,
        depositHold: 0,
        activeLoans: [],
        allocatedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        totalSlotCapacity: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        unusedWorkers: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        usedWorkers: 0,
        overqualifiedWorkers: {},
        market: {
            sell: {},
            buy: {},
        },
        wagePerEdu: {
            none: DEFAULT_WAGE_PER_EDU,
            primary: DEFAULT_WAGE_PER_EDU,
            secondary: DEFAULT_WAGE_PER_EDU,
            tertiary: DEFAULT_WAGE_PER_EDU,
        },
        workforceDemography: makeWorkforceDemography(),
        deaths: createEmptyDemographicEventCounters(),
        disabilities: createEmptyDemographicEventCounters(),
        profitShareBonus: 0,
        lastDepreciatedPerTick: {},
        monthAcc: {
            depositsAtMonthStart: 0,
            ...createEmptyAccumulator(),
        },
        lastMonthAcc: createEmptyAccumulator(),
        licenses: {},
    };
}

export function makeAgent(opts: {
    id: string;
    name: string;
    associatedPlanetId: string;
    planetId: string;
    facilities: ProductionFacility[];
    storage: Storage;
    hrDepartment: HRFacility | null;
    logo?: string;
}): Agent {
    const assets = makeAgentPlanetAssets(opts.facilities, opts.storage, opts.hrDepartment);

    assets.licenses = {
        commercial: { acquiredTick: 0, frozen: false },
        workforce: { acquiredTick: 0, frozen: false },
    };
    return {
        id: opts.id,
        name: opts.name,
        logo: opts.logo ?? 'ai_company',
        associatedPlanetId: opts.associatedPlanetId,
        ships: [],
        automated: true,
        automateWorkerAllocation: true,
        foundedTick: 0,
        starterLoanTaken: false,
        assets: { [opts.planetId]: assets },
    };
}

export function prefillAgentStorageFromFacilities(gameState: { agents: Map<string, Agent> }): void {
    for (const agent of gameState.agents.values()) {
        for (const [, rawAssets] of Object.entries(agent.assets)) {
            const assets = rawAssets as AgentPlanetAssets;
            const storage = assets.storage;
            for (const facility of assets.productionFacilities) {
                for (const { resource, quantity } of facility.needs) {
                    if (
                        resource.form === 'services' ||
                        resource.form === 'landBoundResource' ||
                        resource.form === 'currency'
                    ) {
                        continue;
                    }
                    const targetQty = quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;
                    putIntoStorageFacility(storage, resource, targetQty);
                }
                for (const { resource, quantity } of facility.produces) {
                    if (
                        resource.form === 'services' ||
                        resource.form === 'landBoundResource' ||
                        resource.form === 'currency'
                    ) {
                        continue;
                    }
                    const targetQty = quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS;
                    putIntoStorageFacility(storage, resource, targetQty);
                }
            }
        }
    }
}

export function presizeAgentShellForFacilities(gameState: { agents: Map<string, Agent> }): void {
    for (const agent of gameState.agents.values()) {
        for (const [, rawAssets] of Object.entries(agent.assets)) {
            const assets = rawAssets as AgentPlanetAssets;
            const sizing = authorShellCompartments(assets);
            for (const form of storageFormKeys()) {
                const required = sizing[form]?.requiredScale;
                if (!required) {
                    continue;
                }
                const shell = assets.storage.shells[form];
                const target = Math.ceil(required);
                shell.scale = target;
                shell.maxScale = target;
            }
            authorShellCompartments(assets);
        }
    }
}

function addTo(
    pop: Population,
    age: number,
    occ: 'unoccupied' | 'employed' | 'education' | 'unableToWork',
    edu: 'none' | 'primary' | 'secondary' | 'tertiary',
    count: number,
): void {
    pop.demography[age][occ][edu].total += count;
}

export const DEFAULT_GROCERY_BUFFER_MONTHS = 2;

export function createPopulation(total: number, buffer: number = DEFAULT_GROCERY_BUFFER_MONTHS): Population {
    const perAge = Math.floor(total / (MAX_AGE + 1));
    const pop: Population = {
        demography: Array.from({ length: MAX_AGE + 1 }, () => createEmptyPopulationCohort()),
        lastTransferMatrix: [],
    };

    for (let age = 0; age <= MAX_AGE; age++) {
        const ageCount = Math.floor(perAge * 2 * (1 - age / MAX_AGE));
        if (ageCount <= 0) {
            continue;
        }

        if (age === 0) {
            continue;
        }
        if (age < 15) {
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
                category.services.grocery.buffer = buffer * SERVICE_DEFINITIONS.grocery.bufferTargetTicks;
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

export const humanResourcesScaleForWorkers = (neededWorkers: number): number =>
    neededWorkers / ((2 / 3) * PRODUCED_HR_QUANTITY);
