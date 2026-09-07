import { TICKS_PER_MONTH } from '../../constants';
import type { Resource } from '../claims';
import type { ProductionFacility, StorageShell } from '../facility';
import { shellFormOfResource, storageFormKeys, type StorageForm, type Storage } from '../facility';
import type { AgentPlanetAssets } from '../planet';
import { STORAGE_TARGET_MONTHS } from './constants';
import { getStorageTargetMonths } from './runtimeConfig';

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

const liveResource = (resource: Resource): boolean => resource.volumePerQuantity > 0 || resource.massPerQuantity > 0;

// Physical occupancy of `name` derived from the shell ledger so allocations always match what
// putIntoStorageFacility has accepted; never stored separately.
const usedFloor = (shell: StorageShell, name: string): { volume: number; mass: number } => {
    const entry = shell.currentInStorage[name];
    if (!entry || entry.quantity <= 0) {
        return { volume: 0, mass: 0 };
    }
    return {
        volume: entry.quantity * entry.resource.volumePerQuantity,
        mass: entry.quantity * entry.resource.massPerQuantity,
    };
};

// Binding share is the larger of a footprint cell's volume/mass fraction of the shell axis capacities.
const bindingShare = (volume: number, mass: number, volCap: number, massCap: number): number =>
    Math.max(volume > 0 ? volume / volCap : 0, mass > 0 ? mass / massCap : 0);

// Minimum shell scale (in per-unit capacities) at which every footprint target fits simultaneously.
// Kept available so a future growth hook can drive shell.maxScale toward it.
const requiredScaleOf = (footprint: StorageResidency[], volCapPerScale: number, massCapPerScale: number): number => {
    if (volCapPerScale <= 0 || massCapPerScale <= 0) {
        return 0;
    }
    const sum = footprint.reduce((acc, r) => acc + bindingShare(r.volume, r.mass, volCapPerScale, massCapPerScale), 0);
    return Math.max(1, sum);
};

// Distribute one scalar share (0..1) of the shell so a cell gets capacity on both axes.
//
// If every target fits: each claims its binding share, floored by its occupied stock so a production
// mix change never clamps away inventory; the leftover stays un-authored as flexible free space.
//
// Otherwise the current shell is spatially too small for all targets: cells keep the share their stock
// locks in and the genuinely free remainder is waterfilled across the still-growable cells, so no
// headroom idles behind a cell that can no longer accept inflow.
export const allocateShellCells = (
    shell: StorageShell,
    footprint: StorageResidency[],
    scale: number,
): CellAllocation => {
    const live = footprint.filter((r) => liveResource(r.resource));
    const volCapPerScale = shell.capacity.volume;
    const massCapPerScale = shell.capacity.mass;
    if (live.length === 0 || volCapPerScale <= 0 || massCapPerScale <= 0 || scale <= 0) {
        return { shares: {}, feasible: true, requiredScale: 0 };
    }

    const volCap = volCapPerScale * scale;
    const massCap = massCapPerScale * scale;

    const declared = live.map((r) => bindingShare(r.volume, r.mass, volCap, massCap));
    const declaredScale = declared.reduce((a, b) => a + b, 0);
    const feasible = !declared.some((d) => d > 1) && declaredScale <= 1 + 1e-9;

    const shares: Record<string, number> = {};

    const lockedList = live.map((r) => {
        const held = usedFloor(shell, r.name);
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
    const allocation = allocateShellCells(shell, footprint, shell.scale);

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

export const storageResidencyQuantity = (facility: ProductionFacility, resource: Resource): number => {
    const targetMonths = getStorageTargetMonths() ?? STORAGE_TARGET_MONTHS;
    let target = 0;
    for (const output of facility.produces) {
        if (output.resource.name !== resource.name) {
            continue;
        }
        target += targetMonths * TICKS_PER_MONTH * facility.maxScale * output.quantity;
    }
    return target;
};

// Aggregate each produced good that physically lives in a shell into one per-shape footprint entry.
export const footprintPerForm = (assets: AgentPlanetAssets): Partial<Record<StorageForm, StorageResidency[]>> => {
    const grouped: Record<StorageForm, Map<string, StorageResidency>> = {
        solid: new Map(),
        liquid: new Map(),
        pieces: new Map(),
    };
    const bump = (form: StorageForm, resource: Resource, q: number): void => {
        const name = resource.name;
        const existing = grouped[form].get(name);
        if (existing) {
            existing.targetQuantity += q;
            existing.volume += q * resource.volumePerQuantity;
            existing.mass += q * resource.massPerQuantity;
        } else {
            grouped[form].set(name, {
                name,
                resource,
                targetQuantity: q,
                volume: q * resource.volumePerQuantity,
                mass: q * resource.massPerQuantity,
            });
        }
    };

    for (const facility of assets.productionFacilities) {
        for (const output of facility.produces) {
            const form = shellFormOfResource(output.resource);
            if (!form) {
                continue;
            }
            const q = storageResidencyQuantity(facility, output.resource);
            if (q > 0) {
                bump(form, output.resource, q);
            }
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

// Re-partition every produced-goods shell of an agent each tick. Non-produced occupants stay un-authored
// and inherit the flexible leftover share via computeCompartmentShare (see facility.ts).
export const updateAgentShellCompartments = (assets: AgentPlanetAssets): void => {
    const footprint = footprintPerForm(assets);
    for (const form of storageFormKeys()) {
        const residency = footprint[form];
        if (residency && residency.length > 0) {
            resolveFormShell(assets.storage, form, residency);
        }
    }
};
