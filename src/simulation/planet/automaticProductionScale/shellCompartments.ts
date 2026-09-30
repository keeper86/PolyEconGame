import { SR_HOLDING_COST_PER_TON, TICKS_PER_MONTH } from '../../constants';
import { PRODUCED_STORAGE_QUANTITY } from '../specialFacilities';
import type { Resource } from '../claims';
import type { ProductionFacility, ShipConstructionFacility, Storage, StorageFacility } from '../facility';
import {
    STORAGE_SHELL_CAPACITY,
    computeCompartmentShare,
    shellFormOfResource,
    storageFormKeys,
    type StorageForm,
} from '../facility';
import type { AgentPlanetAssets } from '../planet';
import { STORAGE_CAPACITY_MONTHS } from './constants';
import { getStorageCapacityMonths, getStorageTargetMonths } from './runtimeConfig';

export type StorageResidency = {
    name: string;
    resource: Resource;
    targetQuantity: number;
    volume: number;
    mass: number;
};

export type CellAllocation = {
    shares: Record<string, number>;
    feasible: boolean;
    requiredScale: number;
};

const bindingShare = (volume: number, mass: number, volCap: number, massCap: number): number =>
    Math.max(volume > 0 ? volume / volCap : 0, mass > 0 ? mass / massCap : 0);

// Minimum shell scale (in per-unit capacities) at which every footprint target fits simultaneously.
// Kept available so a future growth hook can drive shell.maxScale toward it.
export const requiredScaleOf = (
    footprint: StorageResidency[],
    volCapPerScale: number,
    massCapPerScale: number,
): number => {
    if (volCapPerScale <= 0 || massCapPerScale <= 0) {
        return 0;
    }
    const sum = footprint.reduce((acc, r) => acc + bindingShare(r.volume, r.mass, volCapPerScale, massCapPerScale), 0);
    return Math.max(1, sum);
};

export const allocateShellCells = (
    shell: StorageFacility,
    footprint: StorageResidency[],
    scale: number,
): CellAllocation => {
    const live = footprint.filter((r) =>
        ((resource: Resource): boolean => resource.volumePerQuantity > 0 || resource.massPerQuantity > 0)(r.resource),
    );
    const volCapPerScale = shell.capacity.volume;
    const massCapPerScale = shell.capacity.mass;
    if (live.length === 0 || volCapPerScale <= 0 || massCapPerScale <= 0 || scale <= 0) {
        return { shares: {}, feasible: true, requiredScale: 0 };
    }

    const required = requiredScaleOf(footprint, volCapPerScale, massCapPerScale);
    const volCap = volCapPerScale * required;
    const massCap = massCapPerScale * required;

    const declared = live.map((r) => bindingShare(r.volume, r.mass, volCap, massCap));
    const declaredScale = declared.reduce((a, b) => a + b, 0);
    const feasible = declaredScale <= 1;

    const shares: Record<string, number> = {};

    const lockedList = live.map((r) => {
        const held = ((shell: StorageFacility, name: string): { volume: number; mass: number } => {
            const entry = shell.currentInStorage[name];
            if (!entry || entry.quantity <= 0) {
                return { volume: 0, mass: 0 };
            }
            return {
                volume: entry.quantity * entry.resource.volumePerQuantity,
                mass: entry.quantity * entry.resource.massPerQuantity,
            };
        })(shell, r.name);
        return Math.min(1, bindingShare(held.volume, held.mass, volCap, massCap));
    });

    if (feasible) {
        for (let i = 0; i < live.length; i++) {
            shares[live[i].name] = Math.min(1, Math.max(declared[i], lockedList[i]));
        }
        return { shares, feasible, requiredScale: requiredScaleOf(footprint, volCapPerScale, massCapPerScale) };
    }

    const sharedCap = Math.max(0, 1 - lockedList.reduce((a, b) => a + b, 0));
    const growableCount = lockedList.reduce((acc, s) => acc + (s < 1 ? 1 : 0), 0);
    const equalExtra = growableCount > 0 ? sharedCap / growableCount : 0;
    for (let i = 0; i < live.length; i++) {
        shares[live[i].name] = lockedList[i] < 1 ? Math.min(1, lockedList[i] + equalExtra) : lockedList[i];
    }
    return { shares, feasible, requiredScale: requiredScaleOf(footprint, volCapPerScale, massCapPerScale) };
};

export const resolveFormShell = (
    storage: Storage,
    form: StorageForm,
    footprint: StorageResidency[],
): CellAllocation => {
    const shell = storage.shells[form];
    const allocation = allocateShellCells(shell, footprint, shell.maxScale);

    const footprintNames = new Set(footprint.map((r) => r.name));
    for (const name of Object.keys(shell.compartments)) {
        if (!footprintNames.has(name)) {
            delete shell.compartments[name];
        }
    }
    for (const res of footprint) {
        shell.compartments[res.name] = allocation.shares[res.name] ?? 0;
    }
    return allocation;
};

// Target months of a resource a shell must hold to cover what a facility touches per tick, applied to
// every physical resource a facility stores while it runs: production inputs AND outputs, and a
// ship-builder's material inputs (a ship itself is not a stored good). Reserving both directions keeps
// the seed-time prefill and steady-state production from overflowing an output-only-sized shell.
export const residencyMonthsTicks = (): number =>
    (getStorageCapacityMonths() ?? getStorageTargetMonths() ?? STORAGE_CAPACITY_MONTHS) * TICKS_PER_MONTH;

const addResidency = (
    grouped: Record<StorageForm, Map<string, StorageResidency>>,
    resource: Resource,
    flowQuantityPerTick: number,
): void => {
    const form = shellFormOfResource(resource);
    if (!form || flowQuantityPerTick <= 0) {
        return;
    }
    const target = residencyMonthsTicks() * flowQuantityPerTick;
    if (target <= 0) {
        return;
    }
    const existing = grouped[form].get(resource.name);
    if (existing) {
        existing.targetQuantity += target;
        existing.volume += target * resource.volumePerQuantity;
        existing.mass += target * resource.massPerQuantity;
    } else {
        grouped[form].set(resource.name, {
            name: resource.name,
            resource,
            targetQuantity: target,
            volume: target * resource.volumePerQuantity,
            mass: target * resource.massPerQuantity,
        });
    }
};

// Aggregate every physical resource a facility holds (inputs and outputs/flow sources) into one
// per-shape footprint entry, so a shell is sized to keep each resource it stores, not just its outputs.
export const footprintForFacilities = (
    productionFacilities: ProductionFacility[],
    shipConstructionFacilities: ShipConstructionFacility[],
): Partial<Record<StorageForm, StorageResidency[]>> => {
    const grouped: Record<StorageForm, Map<string, StorageResidency>> = {
        solid: new Map(),
        liquid: new Map(),
        pieces: new Map(),
    };

    for (const facility of productionFacilities) {
        const plannedScale = facility.construction?.constructionTargetMaxScale ?? facility.maxScale;
        for (const need of facility.needs) {
            addResidency(grouped, need.resource, need.quantity * plannedScale);
        }
        for (const output of facility.produces) {
            addResidency(grouped, output.resource, output.quantity * plannedScale);
        }
    }

    for (const facility of shipConstructionFacilities) {
        const ship = facility.produces;
        if (!ship || ship.buildingTime <= 0) {
            continue;
        }
        const proportionPerTick = Math.min(1, Math.sqrt(facility.scale) / ship.buildingTime);
        for (const cost of ship.buildingCost) {
            addResidency(grouped, cost.resource, cost.quantity * proportionPerTick);
        }
    }

    const result: Partial<Record<StorageForm, StorageResidency[]>> = {};
    for (const form of storageFormKeys()) {
        const values = [...grouped[form].values()];
        if (values.length > 0) {
            result[form] = values;
        }
    }
    return result;
};

export const footprintPerForm = (assets: AgentPlanetAssets): Partial<Record<StorageForm, StorageResidency[]>> =>
    footprintForFacilities(assets.productionFacilities, assets.shipConstructionFacilities);

// Re-partition every physical shell of an agent each tick, returning the final cell allocation per shell
// so the caller can grow or shrink a shell via construction once its installed scale drops shy or
// overshoots the held footprint. Only resources in the authored footprint receive a compartment; anything
// else has no allocated capacity until it is explicitly authored (see facility.ts computeCompartmentShare).
export const updateAgentShellCompartments = (
    assets: AgentPlanetAssets,
): Partial<Record<StorageForm, CellAllocation>> => {
    const result: Partial<Record<StorageForm, CellAllocation>> = {};
    const footprint = footprintPerForm(assets);
    for (const form of storageFormKeys()) {
        const residency = footprint[form];
        if (residency && residency.length > 0) {
            result[form] = resolveFormShell(assets.storage, form, residency);
        }
    }
    return result;
};

export type StorageSizing = {
    shells: Record<StorageForm, number>;
    department: number;
};

export const shellScalesForFootprint = (
    footprint: Partial<Record<StorageForm, StorageResidency[]>>,
): Record<StorageForm, number> => {
    const scales: Record<StorageForm, number> = { solid: 1, liquid: 1, pieces: 1 };
    for (const form of storageFormKeys()) {
        const residency = footprint[form];
        if (residency && residency.length > 0) {
            scales[form] = requiredScaleOf(residency, STORAGE_SHELL_CAPACITY.volume, STORAGE_SHELL_CAPACITY.mass);
        }
    }
    return scales;
};

const logisticsScaleForFootprint = (footprint: Partial<Record<StorageForm, StorageResidency[]>>): number => {
    const monthsTicks = residencyMonthsTicks();
    let throughputPerTick = 0;
    for (const form of storageFormKeys()) {
        for (const residency of footprint[form] ?? []) {
            const weightPerTick = (residency.mass > 0 ? residency.mass : residency.volume) / monthsTicks;
            throughputPerTick += weightPerTick;
        }
    }
    const movement = 2 * throughputPerTick;
    const holding = throughputPerTick * TICKS_PER_MONTH * SR_HOLDING_COST_PER_TON;
    return Math.max(1, Math.ceil((movement + holding) / PRODUCED_STORAGE_QUANTITY));
};

export const storageSizingForFacilities = (
    productionFacilities: ProductionFacility[],
    shipConstructionFacilities: ShipConstructionFacility[] = [],
): StorageSizing => {
    const footprint = footprintForFacilities(productionFacilities, shipConstructionFacilities);
    return {
        shells: shellScalesForFootprint(footprint),
        department: logisticsScaleForFootprint(footprint),
    };
};

export const scaleToHoldContents = (storage: Storage): Record<StorageForm, number> => {
    const required: Record<StorageForm, number> = { solid: 1, liquid: 1, pieces: 1 };
    for (const form of storageFormKeys()) {
        const shell = storage.shells[form];
        for (const entry of Object.values(shell.currentInStorage)) {
            const share = computeCompartmentShare(shell, entry.resource);
            if (share <= 0 || entry.quantity <= 0) {
                continue;
            }
            const byVolume = (entry.quantity * entry.resource.volumePerQuantity) / (shell.capacity.volume * share);
            const byMass = (entry.quantity * entry.resource.massPerQuantity) / (shell.capacity.mass * share);
            required[form] = Math.max(required[form], Math.ceil(Math.max(byVolume, byMass)));
        }
    }
    return required;
};

export const applyStorageSizingForFacilities = (
    storage: Storage,
    productionFacilities: ProductionFacility[],
    shipConstructionFacilities: ShipConstructionFacility[] = [],
): void => {
    const sizing = storageSizingForFacilities(productionFacilities, shipConstructionFacilities);
    const stockFloor = scaleToHoldContents(storage);
    for (const form of storageFormKeys()) {
        const shell = storage.shells[form];
        const target = Math.max(sizing.shells[form], stockFloor[form]);
        shell.scale = target;
        shell.maxScale = target;
    }
    const department = storage.department;
    if (department) {
        department.scale = sizing.department;
        department.maxScale = sizing.department;
    }
};
