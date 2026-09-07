import { TICKS_PER_MONTH } from '../../constants';
import type { Resource } from '../claims';
import type { ProductionFacility, Storage, StorageShell } from '../facility';
import { shellFormOfResource, storageFormKeys, type StorageForm } from '../facility';
import type { AgentPlanetAssets } from '../planet';
import { STORAGE_CAPACITY_MONTHS } from './constants';
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

export const allocateShellCells = (
    shell: StorageShell,
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

    const volCap = volCapPerScale * scale;
    const massCap = massCapPerScale * scale;

    const declared = live.map((r) => bindingShare(r.volume, r.mass, volCap, massCap));
    const declaredScale = declared.reduce((a, b) => a + b, 0);
    const feasible = declaredScale <= 1;

    const shares: Record<string, number> = {};

    const lockedList = live.map((r) => {
        const held = ((shell: StorageShell, name: string): { volume: number; mass: number } => {
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

export const storageResidencyTarget = (facility: ProductionFacility, resource: Resource): number => {
    const targetMonths = getStorageTargetMonths() ?? STORAGE_CAPACITY_MONTHS;
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

    for (const facility of assets.productionFacilities) {
        for (const output of facility.produces) {
            const form = shellFormOfResource(output.resource);
            if (!form) {
                continue;
            }
            const target = storageResidencyTarget(facility, output.resource);
            if (target > 0) {
                const name = output.resource.name;
                const existing = grouped[form].get(name);
                if (existing) {
                    existing.targetQuantity += target;
                    existing.volume += target * output.resource.volumePerQuantity;
                    existing.mass += target * output.resource.massPerQuantity;
                } else {
                    grouped[form].set(name, {
                        name,
                        resource: output.resource,
                        targetQuantity: target,
                        volume: target * output.resource.volumePerQuantity,
                        mass: target * output.resource.massPerQuantity,
                    });
                }
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
