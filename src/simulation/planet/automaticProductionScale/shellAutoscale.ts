import { TICKS_PER_MONTH } from '../../constants';
import type { Resource } from '../claims';
import type { ProductionFacility } from '../facility';
import { shellFormOfResource, storageFormKeys, type StorageForm, type Storage } from '../facility';
import type { AgentPlanetAssets } from '../planet';
import { STORAGE_TARGET_MONTHS } from './constants';
import { getStorageTargetMonths } from './runtimeConfig';
import { compartmentNeedsFromFootprint, resolveShellCells, type ShellCellResolution } from './compartmentAllocator';

export type StorageResidency = {
    name: string;
    resource: Resource;
    targetQuantity: number;
    volume: number;
    mass: number;
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
            const q = storageResidencyQuantity(facility, output.resource);
            if (q <= 0) {
                continue;
            }
            const entry = grouped[form].get(output.resource.name) ?? {
                name: output.resource.name,
                resource: output.resource,
                targetQuantity: 0,
                volume: 0,
                mass: 0,
            };
            entry.targetQuantity += q;
            entry.volume += q * output.resource.volumePerQuantity;
            entry.mass += q * output.resource.massPerQuantity;
            grouped[form].set(output.resource.name, entry);
        }
    }

    const result: Partial<Record<StorageForm, StorageResidency[]>> = {};
    for (const form of Object.keys(grouped) as StorageForm[]) {
        const entries = [...grouped[form].values()];
        if (entries.length > 0) {
            result[form] = entries;
        }
    }
    return result;
};

export type ShellPlan = {
    requiredScale: number;
    cellShares: Record<string, number>;
};

export const planShell = (residency: StorageResidency[], baseVolume: number, baseMass: number): ShellPlan => {
    if (residency.length === 0 || baseVolume <= 0 || baseMass <= 0) {
        return { requiredScale: 0, cellShares: {} };
    }
    const neededDeclared = residency.map((r) => Math.max(r.volume / baseVolume, r.mass / baseMass));
    const declaredScale = neededDeclared.reduce((a, b) => a + b, 0);

    const requiredScale = Math.max(1, declaredScale);
    const cellShares: Record<string, number> = {};
    for (let i = 0; i < residency.length; i++) {
        cellShares[residency[i].name] = neededDeclared[i] / requiredScale;
    }
    return { requiredScale, cellShares };
};

// Apply the compartment strategy to one physical shell. Only the produced-goods footprint gets an
// authored compartment; any other occupant (imports, market buys, buffered inputs without a producer
// on this agent) stays `undefined` so it keeps the flexible leftover share in computeCompartmentShare
// and never reserves headroom it cannot actually fill.
//
// `requiredScale` is the minimum shell scale at which every declared produced-good target fits; the
// caller drives `maxScale` toward it the same way it grows any other facility. Compartments whose
// producer left the agent are dropped so the leftover pool expands.
export const resolveFormShell = (
    storage: Storage,
    form: StorageForm,
    footprint: StorageResidency[],
): { resolution: ShellCellResolution; requiredScale: number } => {
    const shell = storage.shells[form];
    const needs = compartmentNeedsFromFootprint(shell, footprint);
    const resolution = resolveShellCells(needs, shell.capacity.volume, shell.capacity.mass, shell.scale);

    const footprintNames = new Set(footprint.map((r) => r.name));
    for (const name of Object.keys(shell.compartments)) {
        if (!footprintNames.has(name)) {
            delete shell.compartments[name];
        }
    }
    for (const res of footprint) {
        shell.compartments[res.name] = resolution.shares[res.name] ?? 0;
    }

    const requiredScale = planShell(footprint, shell.capacity.volume, shell.capacity.mass).requiredScale;
    return { resolution, requiredScale };
};

// Apply the storage compartment strategy for one agent every tick: every physical shell that holds
// a produced good is re-partitioned so targets get a reserved cell when the current physical space
// can actually host them, or (when not) free space is confiscated and waterfilled rather than left to
// waste behind an unreachable ambition. Non-produced occupants keep the flexible leftover share in
// computeCompartmentShare and are never over-reserved.
export const updateAgentShellCompartments = (
    assets: AgentPlanetAssets,
    resultPerForm?: Partial<Record<StorageForm, { feasible: boolean; requiredScale: number }>>,
): Partial<Record<StorageForm, { feasible: boolean; requiredScale: number }>> => {
    const footprint = footprintPerForm(assets);
    for (const form of storageFormKeys()) {
        const residency = footprint[form];
        if (!residency || residency.length === 0) {
            continue;
        }
        const { resolution, requiredScale } = resolveFormShell(assets.storage, form, residency);
        if (resultPerForm) {
            resultPerForm[form] = { feasible: resolution.feasible, requiredScale };
        }
    }
    return resultPerForm ?? {};
};
