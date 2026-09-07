import { TICKS_PER_MONTH } from '../../constants';
import type { Resource } from '../claims';
import type { ProductionFacility } from '../facility';
import { shellFormOfResource, type StorageForm } from '../facility';
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
