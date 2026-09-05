import { FACILITY_CONDITION_EFFICIENCY_EXPONENT } from '../constants';
import type { EducationLevelType } from '../population/education';
import type { ShipType } from '../ships/ships';
import type { Resource, ResourceQuantity, TradableResourceProcessLevel } from './claims';
import type { AgentPlanetAssets, PlanetaryId } from './planet';
import type { RESOURCE_LEVELS } from './resourceCatalog';

type ConstructionState = {
    type: 'new' | 'expansion';
    constructionTargetMaxScale: number;
    totalConstructionServiceRequired: number;
    maximumConstructionServiceConsumption: number;
    progress: number;
    lastTickInvestedConstructionServices: number;
} | null;

export type FacilityType = (typeof RESOURCE_LEVELS)[number] | 'management' | 'ship_construction';
export const getFacilityType = (facility: Facility): FacilityType => {
    if (facility.type === 'production') {
        return facility.produces.reduce((prev, curr) => {
            if (curr.resource.level === 'services' || prev === 'services') {
                return 'services';
            }
            if (curr.resource.level === 'manufactured' || prev === 'manufactured') {
                return 'manufactured';
            }
            if (curr.resource.level === 'refined' || prev === 'refined') {
                return 'refined';
            }
            return 'raw';
        }, 'raw' as TradableResourceProcessLevel);
    }
    return facility.type;
};

export function computeFacilityConditionEfficiency(maintenanceStatus: number): number {
    const condition = Math.max(0, Math.min(1, maintenanceStatus));
    return 1 - Math.pow(1 - condition, FACILITY_CONDITION_EFFICIENCY_EXPONENT);
}

export const isFacilityOperating = (facility: Facility): boolean => facility.construction?.type !== 'new';

export const MINIMUM_CONSTRUCTION_TIME_IN_TICKS = 40;
const constructionCostFactor = 20000;
const facilityConstructionMultiplier: Record<FacilityType, number> = {
    raw: 1,
    refined: 2,
    manufactured: 3,
    services: 4,
    management: 0.1,
    ship_construction: 5,
};

export const calculateCostsForConstruction = (
    facilityType: FacilityType,
    currentScale: number,
    targetScale: number,
): { cost: number; time: number } => {
    if (targetScale <= currentScale) {
        return { cost: 0, time: 0 };
    }

    const m = facilityConstructionMultiplier[facilityType];
    const linearTerm = targetScale - currentScale;

    const minimumTime = MINIMUM_CONSTRUCTION_TIME_IN_TICKS * (facilityType === 'management' ? 0.5 : 1);
    return {
        cost: Math.round(m * constructionCostFactor * linearTerm),
        time: minimumTime + 30 * m * Math.log(targetScale - currentScale),
    };
};

export type FacilityBase = PlanetaryId & {
    type: 'production' | 'management' | 'ship_construction';
    name: string;
    maxScale: number;
    scale: number;
    construction: ConstructionState;
    lastConstructionCompletedTick: number;
    maintenanceStatus: number;
    maxMaintenance: number;
    cumulativeRepairAcc: number;
    lastTickMaintenanceConsumption: number;
    lastTickRestorationConsumption: number;

    powerConsumptionPerTick: number;
    workerRequirement: {
        [EduLevel in EducationLevelType]?: number;
    };
    pollutionPerTick: {
        air: number;
        water: number;
        soil: number;
    };
};

export type FacilityCategory = FacilityBase['type'];

export type LastTickResults = {
    overallEfficiency: number;
    workerEfficiency: { [edu in EducationLevelType]?: number };

    exactUsedByEdu: { [jobEdu in EducationLevelType]?: number };
    totalUsedByEdu: { [workerEdu in EducationLevelType]?: number };

    overqualifiedWorkers: {
        [jobEdu in EducationLevelType]?: {
            [workerEdu in EducationLevelType]?: number;
        };
    };

    wageCosts: number;
    inputCosts: number;
    costBalance: number;

    resourceEfficiency: { [resourceName: string]: number };
    lastConsumed: { [resourceName: string]: number };
};

export type LastManagementTickResults = LastTickResults & {
    lastProduced: { [resourceName: string]: number };
};

type LastProductionTickResults = LastManagementTickResults & {
    revenue: number;
};

export type PidState = {
    integral: number;
    prevError: number;
    filteredError: number;
    expansionIntegral: number;
    contractionIntegral: number;
    smoothedSignal: number;
    flowProducedEMA?: number;
    flowClearedEMA?: number;
    flowUnfilledEMA?: number;
    flowDecayedEMA?: number;
};

export type ProductionFacility = FacilityBase & {
    type: 'production';
    needs: ResourceQuantity[];
    produces: ResourceQuantity[];
    outputFlexible?: boolean;
    productionMix?: { [resourceName: string]: number };
    wasteSurplusTicks?: number;

    lastTickResults: LastProductionTickResults;
    pidState?: PidState | null;
};

export type Storage = PlanetaryId & {
    capacity: {
        volume: number;
        mass: number;
    };
    current: {
        volume: number;
        mass: number;
    };
    currentInStorage: {
        [resourceName in string]: ResourceQuantity;
    };

    escrow: { [resourceName in string]: number };

    shells: {
        solid: StorageShell;
        liquid: StorageShell;
        pieces: StorageShell;
    };

    department: StorageDepartment | null;
};

export const getStorageScaleBasis = (storage: Storage): number => storage.department?.maxScale ?? 0;

export type StorageForm = 'solid' | 'liquid' | 'pieces';

export const STORAGE_SHELL_FORM_NAMES: Record<StorageForm, string> = {
    solid: 'Silo',
    liquid: 'Tank',
    pieces: 'Warehouse',
};

export type StorageShell = PlanetaryId & {
    type: 'storage_shell';
    form: StorageForm;
    name: string;
    maxScale: number;
    scale: number;
    capacity: {
        volume: number;
        mass: number;
    };
    current: {
        volume: number;
        mass: number;
    };
};

export const shellFormOfResource = (resource: Pick<Resource, 'form'>): StorageForm | null => {
    if (resource.form === 'solid' || resource.form === 'liquid' || resource.form === 'pieces') {
        return resource.form;
    }
    return null;
};

// services, currency, internal and landBoundResource are not stored in a physical shell; they have
// ~zero volume/mass. Solid/liquid/pieces route to the matching shell.
export const makeStorageShell = (
    planetId: string,
    id: string,
    form: StorageForm,
    capacity?: { volume: number; mass: number },
    scale = 1,
): StorageShell => {
    const cap = capacity ?? { volume: 1e13, mass: 1e13 };
    return {
        planetId,
        id,
        type: 'storage_shell',
        form,
        name: STORAGE_SHELL_FORM_NAMES[form],
        maxScale: scale,
        scale,
        capacity: { ...cap },
        current: { volume: 0, mass: 0 },
    };
};

export type ManagementFacility = FacilityBase & {
    type: 'management';
    needs: ResourceQuantity[];
    produces: ResourceQuantity[];

    lastTickResults: LastManagementTickResults;
    pidState?: PidState | null;
};

export type WagePidCell = {
    integral: number;
    prevError: number;
};

export type WagePidState = {
    fill: WagePidCell;
    turnover: WagePidCell;
};

const nullWagePidCell = (): WagePidCell => ({ integral: 0, prevError: 0 });

const nullWagePid = (): WagePidState => ({ fill: nullWagePidCell(), turnover: nullWagePidCell() });

export const nullWagePidState = (): Record<EducationLevelType, WagePidState> => ({
    none: nullWagePid(),
    primary: nullWagePid(),
    secondary: nullWagePid(),
    tertiary: nullWagePid(),
});

export type HRFacility = ManagementFacility & {
    hrBuffer: number;
    wagePidState: Record<EducationLevelType, WagePidState>;
};
export type StorageDepartment = ManagementFacility & {
    storageBuffer: number;
    storageStarvation: number;
};

export type TrainingsDepartment = ManagementFacility & {
    trainingsBuffer: number;
};

export function getStorageStarvation(storage: Storage): number {
    return storage.department?.storageStarvation ?? 1.0;
}

export function inflowPreservation(ss: number): number {
    const base = 0.5;
    return 1.0 - 0.9 * base * Math.pow(ss, 6) - 0.1 * base * ss;
}

export function storagePreservationFactor(ss: number): number {
    return 1 - 0.05 * Math.pow(ss, 6);
}

export type ShipConstructionFacility = FacilityBase & {
    type: 'ship_construction';
    shipName: string;
    produces: ShipType | null;
    progress: number;
    lastTickResults: LastTickResults;
};

export type Facility = ProductionFacility | ManagementFacility | ShipConstructionFacility;

export const createLastTickResults = (): LastTickResults => ({
    overallEfficiency: 0,
    workerEfficiency: {},
    resourceEfficiency: {},
    overqualifiedWorkers: {},
    exactUsedByEdu: {},
    totalUsedByEdu: {},
    wageCosts: 0,
    inputCosts: 0,
    costBalance: 0,
    lastConsumed: {},
});

export const putIntoStorageFacility = (storage: Storage, resource: Resource, additionalQuantity: number): number => {
    const ss = getStorageStarvation(storage);
    const effectiveQuantity = additionalQuantity * inflowPreservation(ss);

    const current = storage.currentInStorage[resource.name]?.quantity || 0;

    const scale = getStorageScaleBasis(storage);

    const aggregateFreeVolume = storage.capacity.volume * scale - storage.current.volume;
    const aggregateFreeMass = storage.capacity.mass * scale - storage.current.mass;

    const form = shellFormOfResource(resource);
    const shell = form ? storage.shells[form] : null;

    const shellFreeVolume = shell ? shell.capacity.volume * shell.scale - shell.current.volume : Infinity;
    const shellFreeMass = shell ? shell.capacity.mass * shell.scale - shell.current.mass : Infinity;

    const freeVolume = Math.min(aggregateFreeVolume, shellFreeVolume);
    const freeMass = Math.min(aggregateFreeMass, shellFreeMass);

    const volumeRestriction =
        resource.volumePerQuantity > 0
            ? Math.max(0, Math.min(1, freeVolume / (effectiveQuantity * resource.volumePerQuantity)))
            : 1;

    const massRestriction =
        resource.massPerQuantity > 0
            ? Math.max(0, Math.min(1, freeMass / (effectiveQuantity * resource.massPerQuantity)))
            : 1;

    const overallRestriction = Math.min(volumeRestriction, massRestriction);
    const stored = effectiveQuantity * overallRestriction;

    storage.currentInStorage[resource.name] = {
        resource,
        quantity: current + stored,
    };

    storage.current.volume += stored * resource.volumePerQuantity;
    storage.current.mass += stored * resource.massPerQuantity;

    if (shell) {
        shell.current.volume += stored * resource.volumePerQuantity;
        shell.current.mass += stored * resource.massPerQuantity;
    }

    if (storage.department) {
        storage.department.storageBuffer -= stored * resource.massPerQuantity;
    }

    return additionalQuantity * overallRestriction;
};

// TODO: gather these on the fly where it happens, not reconstructed after the fact.
export const computeStorageThroughputMass = (assets: AgentPlanetAssets): number => {
    let throughput = 0;

    for (const f of assets.productionFacilities) {
        for (const p of f.produces) {
            if (p.resource.massPerQuantity <= 0) {
                continue;
            }
            throughput += p.quantity * p.resource.massPerQuantity * f.scale;
        }
        for (const n of f.needs) {
            if (n.resource.massPerQuantity <= 0) {
                continue;
            }
            if (n.resource.form === 'landBoundResource') {
                continue;
            }
            throughput += n.quantity * n.resource.massPerQuantity * f.scale;
        }
    }

    for (const f of assets.shipConstructionFacilities) {
        if (!f.produces) {
            continue;
        }
        const proportionPerTick = Math.min(1, Math.sqrt(f.scale) / f.produces.buildingTime);
        for (const n of f.produces.buildingCost) {
            if (n.resource.massPerQuantity <= 0) {
                continue;
            }
            throughput += n.quantity * n.resource.massPerQuantity * proportionPerTick;
        }
    }

    if (assets.humanResourcesDepartment) {
        for (const n of assets.humanResourcesDepartment.needs) {
            if (n.resource.massPerQuantity <= 0) {
                continue;
            }
            throughput += n.quantity * n.resource.massPerQuantity * assets.humanResourcesDepartment.scale;
        }
    }

    const storageDept = assets.storage.department;
    if (storageDept) {
        for (const n of storageDept.needs) {
            if (n.resource.massPerQuantity <= 0) {
                continue;
            }
            throughput += n.quantity * n.resource.massPerQuantity * storageDept.scale;
        }
    }

    return throughput;
};

export const queryStorageFacility = (storage: Storage | undefined, resourceName: string): number => {
    if (!storage) {
        return 0;
    }
    const total = storage.currentInStorage[resourceName]?.quantity ?? 0;
    const escrowed = storage.escrow[resourceName] ?? 0;
    return Math.max(0, total - escrowed);
};

export const getAvailableStorageCapacity = (storage: Storage, resource: Resource): number => {
    const scale = getStorageScaleBasis(storage);
    const aggregateFreeVolume = storage.capacity.volume * scale - storage.current.volume;
    const aggregateFreeMass = storage.capacity.mass * scale - storage.current.mass;

    const form = shellFormOfResource(resource);
    const shell = form ? storage.shells[form] : null;

    const shellFreeVolume = shell ? shell.capacity.volume * shell.scale - shell.current.volume : Infinity;
    const shellFreeMass = shell ? shell.capacity.mass * shell.scale - shell.current.mass : Infinity;

    const freeVolume = Math.min(aggregateFreeVolume, shellFreeVolume);
    const freeMass = Math.min(aggregateFreeMass, shellFreeMass);

    const byVolume = resource.volumePerQuantity > 0 ? freeVolume / resource.volumePerQuantity : Infinity;
    const byMass = resource.massPerQuantity > 0 ? freeMass / resource.massPerQuantity : Infinity;
    return Math.max(0, Math.min(byVolume, byMass));
};

// returns the quantity actually removed
export const removeFromStorageFacility = (
    storage: Storage | undefined,
    resourceName: string,
    quantityToRemove: number,
): number => {
    if (!storage) {
        return 0;
    }
    const currentEntry = storage.currentInStorage[resourceName];
    if (!currentEntry) {
        return 0;
    }
    const quantityRemoved = Math.min(currentEntry.quantity, quantityToRemove);
    currentEntry.quantity -= quantityRemoved;
    storage.current.volume -= quantityRemoved * currentEntry.resource.volumePerQuantity;
    storage.current.mass -= quantityRemoved * currentEntry.resource.massPerQuantity;

    const form = shellFormOfResource(currentEntry.resource);
    if (form) {
        const shell = storage.shells[form];
        shell.current.volume = Math.max(
            0,
            shell.current.volume - quantityRemoved * currentEntry.resource.volumePerQuantity,
        );
        shell.current.mass = Math.max(0, shell.current.mass - quantityRemoved * currentEntry.resource.massPerQuantity);
    }

    if (storage.department) {
        storage.department.storageBuffer -= quantityRemoved * currentEntry.resource.massPerQuantity;
    }

    return quantityRemoved;
};

export const lockIntoEscrow = (storage: Storage, resourceName: string, quantity: number): number => {
    const locked = Math.min(queryStorageFacility(storage, resourceName), quantity);
    if (locked <= 0) {
        return 0;
    }
    storage.escrow[resourceName] = (storage.escrow[resourceName] ?? 0) + locked;
    return locked;
};

export const releaseFromEscrow = (storage: Storage, resourceName: string, quantity: number): void => {
    const current = storage.escrow[resourceName] ?? 0;
    storage.escrow[resourceName] = Math.max(0, current - quantity);
};

export const transferFromEscrow = (storage: Storage, resourceName: string, quantity: number): number => {
    const escrowed = storage.escrow[resourceName] ?? 0;
    const transferred = Math.min(escrowed, quantity);
    if (transferred <= 0) {
        return 0;
    }
    storage.escrow[resourceName] = escrowed - transferred;
    removeFromStorageFacility(storage, resourceName, transferred);
    return transferred;
};
