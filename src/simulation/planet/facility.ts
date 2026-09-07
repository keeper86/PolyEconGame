import { FACILITY_CONDITION_EFFICIENCY_EXPONENT } from '../constants';
import type { EducationLevelType } from '../population/education';
import type { ShipType } from '../ships/ships';
import type { Resource, ResourceQuantity, TradableResourceProcessLevel } from './claims';
import type { AgentPlanetAssets, PlanetaryId } from './planet';
import type { RESOURCE_LEVELS } from './resourceCatalog';
import { administrativeServiceResourceType } from './services';

type ConstructionState = {
    type: 'new' | 'expansion';
    constructionTargetMaxScale: number;
    totalConstructionServiceRequired: number;
    maximumConstructionServiceConsumption: number;
    progress: number;
    lastTickInvestedConstructionServices: number;
} | null;

export type FacilityType = (typeof RESOURCE_LEVELS)[number] | 'management' | 'ship_construction' | 'storage';
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
    storage: 0.1,
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
    type: 'production' | 'management' | 'ship_construction' | 'storage';
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

type ResourceAmountLedger = {
    currentInStorage: {
        [resourceName in string]: ResourceQuantity;
    };
    escrow: { [resourceName in string]: number };
};

export type Storage = PlanetaryId &
    ResourceAmountLedger & {
        shells: {
            solid: StorageShell;
            liquid: StorageShell;
            pieces: StorageShell;
        };

        department: StorageDepartment | null;
    };

export const getStorageScaleBasis = (storage: Storage): number => storage.department?.maxScale ?? 0;

export type StorageForm = 'solid' | 'liquid' | 'pieces';

// Solid/liquid/pieces are physically stored in the matching shell's own ledger. Everything else
// (services, currency, internal, landBoundResource) has ~zero volume/mass and lives in the
// Storage-level (no-form) ledger.
export const storageFormKeys: () => StorageForm[] = () => ['solid', 'liquid', 'pieces'];

export const STORAGE_SHELL_FORM_NAMES: Record<StorageForm, string> = {
    solid: 'Silo',
    liquid: 'Tank',
    pieces: 'Warehouse',
};

export type StorageShell = FacilityBase &
    ResourceAmountLedger & {
        type: 'storage';
        form: StorageForm;
        capacity: {
            volume: number;
            mass: number;
        };
        compartments: { [resourceName: string]: number };
        needs: ResourceQuantity[];
        produces: ResourceQuantity[];
        lastTickResults: LastManagementTickResults;
    };

export const shellFormOfResource = (resource: Pick<Resource, 'form'>): StorageForm | null => {
    if (resource.form === 'solid' || resource.form === 'liquid' || resource.form === 'pieces') {
        return resource.form;
    }
    return null;
};

// services, currency, internal and landBoundResource are not stored in a physical shell; they have
// ~zero volume/mass and live in the Storage-level (no-form) ledger. Solid/liquid/pieces hold their
// own ledger on the matching shell.
export const makeStorageShell = (planetId: string, id: string, form: StorageForm, scale = 1): StorageShell => {
    const cap = { volume: 200000, mass: 50000 };
    return {
        planetId,
        id,
        type: 'storage',
        form,
        name: STORAGE_SHELL_FORM_NAMES[form],
        maxScale: scale,
        scale,
        capacity: { ...cap },
        currentInStorage: {},
        escrow: {},
        compartments: {},

        construction: null,
        lastConstructionCompletedTick: 0,
        maintenanceStatus: 1,
        maxMaintenance: 1,
        cumulativeRepairAcc: 0,
        lastTickMaintenanceConsumption: 0,
        lastTickRestorationConsumption: 0,
        powerConsumptionPerTick: 0.5,
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        workerRequirement: { none: 2, primary: 0, secondary: 0, tertiary: 0 },

        needs: [{ resource: administrativeServiceResourceType, quantity: 40 }],
        produces: [],
        lastTickResults: {
            ...createLastTickResults(),
            lastProduced: {},
        },
    };
};

export type UsedSpace = {
    volume: number;
    mass: number;
};

// Physical shell occupancy is not stored separately; it is always derived by folding the shell's own
// per-resource ledger through each resource's constant volume/mass-per-quantity. Keeping it implicit
// means capacity and usage can never drift apart.
const usageOf = (holder: Pick<StorageShell, 'currentInStorage'>): UsedSpace => {
    const used: UsedSpace = { volume: 0, mass: 0 };
    for (const entry of Object.values(holder.currentInStorage)) {
        used.volume += entry.quantity * entry.resource.volumePerQuantity;
        used.mass += entry.quantity * entry.resource.massPerQuantity;
    }
    return used;
};

export const usageOfShell = (shell: StorageShell): UsedSpace => usageOf(shell);

// Aggregate stored volume/mass across the three physical shells. Used by form-agnostic consumers
// (e.g. holding costs) that do not care about a single resource's form.
export const totalStoredByShell = (storage: Storage): UsedSpace => {
    const solid = usageOf(storage.shells.solid);
    const liquid = usageOf(storage.shells.liquid);
    const pieces = usageOf(storage.shells.pieces);
    return {
        volume: solid.volume + liquid.volume + pieces.volume,
        mass: solid.mass + liquid.mass + pieces.mass,
    };
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

export type ShipConstructionFacility = FacilityBase & {
    type: 'ship_construction';
    shipName: string;
    produces: ShipType | null;
    progress: number;
    lastTickResults: LastTickResults;
};

export type Facility = ProductionFacility | ManagementFacility | StorageShell | ShipConstructionFacility;

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

type LedgerHolder = StorageShell | Storage;

const ledgerForResource = (storage: Storage, resource: Pick<Resource, 'form'>): LedgerHolder => {
    const form = shellFormOfResource(resource);
    return form ? storage.shells[form] : storage;
};

const storageLedgerHolding = (storage: Storage, resourceName: string): LedgerHolder => {
    for (const form of storageFormKeys()) {
        const shell = storage.shells[form];
        if (shell.currentInStorage[resourceName] || shell.escrow[resourceName] !== undefined) {
            return shell;
        }
    }
    return storage;
};

export const putIntoStorageFacility = (storage: Storage, resource: Resource, additionalQuantity: number): number => {
    const ss = getStorageStarvation(storage);
    const effectiveQuantity = additionalQuantity * inflowPreservation(ss);

    const holder = ledgerForResource(storage, resource);

    const current = holder.currentInStorage[resource.name]?.quantity || 0;

    const state = getStorageCapacityState(storage, resource);

    const freeVolume = state.free.volume;
    const freeMass = state.free.mass;

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

    holder.currentInStorage[resource.name] = {
        resource,
        quantity: current + stored,
    };

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

export const queryStorageFacility = (
    storage: Storage | undefined,
    resourceName: string,
    subtractEscrow: boolean = true,
): number => {
    if (!storage) {
        return 0;
    }
    const holder = storageLedgerHolding(storage, resourceName);
    const total = holder.currentInStorage[resourceName]?.quantity ?? 0;
    const escrowed = subtractEscrow ? (holder.escrow[resourceName] ?? 0) : 0;
    return Math.max(0, total - escrowed);
};

export const getWholeStorage = (storage: Storage): [string, ResourceQuantity][] => {
    const entries: [string, ResourceQuantity][] = [];
    for (const [name, entry] of Object.entries(storage.currentInStorage)) {
        entries.push([name, entry]);
    }
    for (const form of storageFormKeys()) {
        for (const [name, entry] of Object.entries(storage.shells[form].currentInStorage)) {
            entries.push([name, entry]);
        }
    }
    return entries;
};

export type StorageCapacityState = {
    form: StorageForm | null;
    capacity: { volume: number; mass: number };
    used: { volume: number; mass: number };
    free: { volume: number; mass: number };
    freeQuantity: number;
};

export const getShellHeldResourceNames = (storage: Storage, form: StorageForm): string[] => {
    return Object.keys(storage.shells[form].currentInStorage);
};

export const computeCompartmentShare = (storage: Storage, shell: StorageShell, resource: Resource): number => {
    const authored = shell.compartments[resource.name];
    if (authored !== undefined) {
        return Math.max(0, Math.min(1, authored));
    }
    const held = getShellHeldResourceNames(storage, shell.form).filter((name) => name !== resource.name);
    const claimed = held.reduce((sum, name) => sum + (shell.compartments[name] ?? 0), 0);
    const leftover = Math.max(0, 1 - claimed);
    const uncontended = held.filter((name) => shell.compartments[name] === undefined).length;
    const unsharded = uncontended + 1; // this product plus any other un-partitioned held products
    return unsharded > 0 ? Math.max(0, Math.min(1, leftover / unsharded)) : 0;
};

export const getStorageCapacityState = (storage: Storage, resource: Resource): StorageCapacityState => {
    const form = shellFormOfResource(resource);

    const capacity = { volume: Infinity, mass: Infinity };
    const used = { volume: 0, mass: 0 };

    if (form) {
        const shell = storage.shells[form];
        const ownQuantity = shell.currentInStorage[resource.name]?.quantity ?? 0;
        const share = computeCompartmentShare(storage, shell, resource);
        const shellVolume = shell.capacity.volume * shell.scale;
        const shellMass = shell.capacity.mass * shell.scale;
        capacity.volume = shellVolume * share;
        capacity.mass = shellMass * share;
        used.volume = Math.max(0, ownQuantity * resource.volumePerQuantity);
        used.mass = Math.max(0, ownQuantity * resource.massPerQuantity);
    }

    const freeVolume = Math.max(0, capacity.volume - used.volume);
    const freeMass = Math.max(0, capacity.mass - used.mass);

    const byVolume = resource.volumePerQuantity > 0 ? freeVolume / resource.volumePerQuantity : Infinity;
    const byMass = resource.massPerQuantity > 0 ? freeMass / resource.massPerQuantity : Infinity;
    const freeQuantity = Math.max(0, Math.min(byVolume, byMass));

    return {
        form,
        capacity: { volume: capacity.volume, mass: capacity.mass },
        used: { volume: used.volume, mass: used.mass },
        free: { volume: freeVolume, mass: freeMass },
        freeQuantity,
    };
};

/** Quantity of `resource` that still fits given the single per-form shell it would occupy. */
export const getAvailableStorageCapacity = (storage: Storage, resource: Resource): number =>
    getStorageCapacityState(storage, resource).freeQuantity;

// returns the quantity actually removed
export const removeFromStorageFacility = (
    storage: Storage | undefined,
    resourceName: string,
    quantityToRemove: number,
): number => {
    if (!storage) {
        return 0;
    }
    const holder = storageLedgerHolding(storage, resourceName);
    const currentEntry = holder.currentInStorage[resourceName];
    if (!currentEntry) {
        return 0;
    }
    const quantityRemoved = Math.min(currentEntry.quantity, quantityToRemove);
    currentEntry.quantity -= quantityRemoved;

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
    const holder = storageLedgerHolding(storage, resourceName);
    holder.escrow[resourceName] = (holder.escrow[resourceName] ?? 0) + locked;
    return locked;
};

export const getEscrow = (storage: Storage, resourceName: string): number =>
    storageLedgerHolding(storage, resourceName).escrow[resourceName] ?? 0;

export const releaseFromEscrow = (storage: Storage, resourceName: string, quantity: number): void => {
    const holder = storageLedgerHolding(storage, resourceName);
    const current = holder.escrow[resourceName] ?? 0;
    holder.escrow[resourceName] = Math.max(0, current - quantity);
};

export const transferFromEscrow = (storage: Storage, resourceName: string, quantity: number): number => {
    const holder = storageLedgerHolding(storage, resourceName);
    const escrowed = holder.escrow[resourceName] ?? 0;
    const transferred = Math.min(escrowed, quantity);
    if (transferred <= 0) {
        return 0;
    }
    holder.escrow[resourceName] = escrowed - transferred;
    removeFromStorageFacility(storage, resourceName, transferred);
    return transferred;
};
