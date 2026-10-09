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

// One priority tier of a per-form footprint. Index 0 is filled first and keeps its whole share even
// while the shell is still growing; later tiers only get what is left.
export type ResidencyLayer = Partial<Record<StorageForm, StorageResidency[]>>;

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

// A resource that appears in more than one tier is owned by the highest-priority tier that names it;
// later tiers add their demand onto that owner so a facility's buffer and a free-buy floor stack.
const foldResidencyLayers = (layers: StorageResidency[][]): StorageResidency[][] => {
    const owner = new Map<string, StorageResidency>();
    const folded = layers.map(() => [] as StorageResidency[]);
    layers.forEach((layer, index) => {
        for (const entry of layer) {
            const first = owner.get(entry.name);
            if (!first) {
                owner.set(entry.name, entry);
                folded[index].push(entry);
            } else if (first !== entry) {
                first.targetQuantity += entry.targetQuantity;
                first.volume += entry.volume;
                first.mass += entry.mass;
            }
        }
    });
    return folded;
};

export const allocateShellCells = (shell: StorageFacility, layers: StorageResidency[][]): CellAllocation => {
    const folded = foldResidencyLayers(layers);
    const flat = folded.flat();
    const volCapPerScale = shell.capacity.volume;
    const massCapPerScale = shell.capacity.mass;
    const live = flat.filter((r) => r.resource.volumePerQuantity > 0 || r.resource.massPerQuantity > 0);
    if (live.length === 0 || volCapPerScale <= 0 || massCapPerScale <= 0 || shell.maxScale <= 0) {
        return { shares: {}, feasible: true, requiredScale: 0 };
    }

    const required = requiredScaleOf(flat, volCapPerScale, massCapPerScale);
    const capacityScale = Math.min(shell.maxScale, required);
    const volCap = volCapPerScale * capacityScale;
    const massCap = massCapPerScale * capacityScale;

    const rawOf = (r: StorageResidency): number => bindingShare(r.volume, r.mass, volCapPerScale, massCapPerScale);
    const lockedOf = (r: StorageResidency): number => {
        const entry = shell.currentInStorage[r.name];
        if (!entry || entry.quantity <= 0) {
            return 0;
        }
        return Math.min(
            1,
            bindingShare(
                entry.quantity * entry.resource.volumePerQuantity,
                entry.quantity * entry.resource.massPerQuantity,
                volCap,
                massCap,
            ),
        );
    };

    const shares: Record<string, number> = {};
    for (const r of flat) {
        shares[r.name] = lockedOf(r);
    }

    let available = capacityScale;
    for (const layer of folded) {
        const demand = layer.reduce((acc, r) => acc + rawOf(r), 0);
        const granted = Math.min(demand, available);
        const factor = demand > 0 ? granted / demand : 0;
        for (const r of layer) {
            const grant = rawOf(r) * factor;
            shares[r.name] = Math.min(1, Math.max(grant / capacityScale, shares[r.name]));
        }
        available -= granted;
    }

    const total = Object.values(shares).reduce((a, b) => a + b, 0);
    return { shares, feasible: total <= 1 + 1e-9, requiredScale: required };
};

export const resolveFormShell = (storage: Storage, form: StorageForm, layers: StorageResidency[][]): CellAllocation => {
    const shell = storage.shells[form];
    const allocation = allocateShellCells(shell, layers);

    const footprint = layers.flat();
    const footprintNames = new Set(footprint.map((r) => r.name));
    for (const name of Object.keys(shell.compartments)) {
        if (!footprintNames.has(name)) {
            delete shell.compartments[name];
        }
    }
    for (const res of footprint) {
        shell.compartments[res.name] = allocation.shares[res.name] ?? 0;
    }
    if (allocation.requiredScale > 0) {
        shell.allocationScale = allocation.requiredScale;
    }
    return allocation;
};

// Target months of a resource a shell must hold to cover what a facility touches per tick, applied to
// every physical resource a facility stores while it runs: production inputs AND outputs, and a
// ship-builder's material inputs (a ship itself is not a stored good). Reserving both directions keeps
// the seed-time prefill and steady-state production from overflowing an output-only-sized shell.
export const residencyMonthsTicks = (): number =>
    (getStorageCapacityMonths() ?? getStorageTargetMonths() ?? STORAGE_CAPACITY_MONTHS) * TICKS_PER_MONTH;

const addResidencyQuantity = (
    grouped: Record<StorageForm, Map<string, StorageResidency>>,
    resource: Resource,
    targetQuantity: number,
): void => {
    const form = shellFormOfResource(resource);
    if (!form || targetQuantity <= 0) {
        return;
    }
    const existing = grouped[form].get(resource.name);
    if (existing) {
        existing.targetQuantity += targetQuantity;
        existing.volume += targetQuantity * resource.volumePerQuantity;
        existing.mass += targetQuantity * resource.massPerQuantity;
    } else {
        grouped[form].set(resource.name, {
            name: resource.name,
            resource,
            targetQuantity,
            volume: targetQuantity * resource.volumePerQuantity,
            mass: targetQuantity * resource.massPerQuantity,
        });
    }
};

const addResidency = (
    grouped: Record<StorageForm, Map<string, StorageResidency>>,
    resource: Resource,
    flowQuantityPerTick: number,
): void => {
    addResidencyQuantity(grouped, resource, residencyMonthsTicks() * flowQuantityPerTick);
};

const emptyGroups = (): Record<StorageForm, Map<string, StorageResidency>> => ({
    solid: new Map(),
    liquid: new Map(),
    pieces: new Map(),
});

const groupedToFootprint = (
    grouped: Record<StorageForm, Map<string, StorageResidency>>,
): Partial<Record<StorageForm, StorageResidency[]>> => {
    const result: Partial<Record<StorageForm, StorageResidency[]>> = {};
    for (const form of storageFormKeys()) {
        const values = [...grouped[form].values()];
        if (values.length > 0) {
            result[form] = values;
        }
    }
    return result;
};

// Aggregate every physical resource a facility holds (inputs and outputs/flow sources) into one
// per-shape footprint entry, so a shell is sized to keep each resource it stores, not just its outputs.
export const footprintForFacilities = (
    productionFacilities: ProductionFacility[],
    shipConstructionFacilities: ShipConstructionFacility[],
): Partial<Record<StorageForm, StorageResidency[]>> => {
    const grouped = emptyGroups();

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

    return groupedToFootprint(grouped);
};

export const footprintPerForm = (assets: AgentPlanetAssets): Partial<Record<StorageForm, StorageResidency[]>> =>
    footprintForFacilities(assets.productionFacilities, assets.shipConstructionFacilities);

// Free-buy inventory floors live on the buy config, not on any facility, so a resource an agent never
// needs or produces still has to be authored into a shell's compartments or its bid is capped to zero.
export const footprintForFreeBuys = (assets: AgentPlanetAssets): Partial<Record<StorageForm, StorageResidency[]>> => {
    const grouped = emptyGroups();
    for (const bid of Object.values(assets.market.buy)) {
        const freeBuyQuantity = bid.autoConfig?.freeBuyQuantity ?? 0;
        if (!bid.automated || freeBuyQuantity <= 0) {
            continue;
        }
        addResidencyQuantity(grouped, bid.resource, freeBuyQuantity);
    }
    return groupedToFootprint(grouped);
};

// Re-partition every physical shell of an agent each tick, returning the final cell allocation per shell
// so the caller can grow or shrink a shell via construction once its installed scale drops shy or
// overshoots the held footprint. Layers are filled in priority order: the facility footprint first, then
// the free-buy footprint. Only resources in the authored footprint receive a compartment; anything else
// has no allocated capacity until it is explicitly authored (see facility.ts computeCompartmentShare).
export const authorShellCompartments = (
    assets: AgentPlanetAssets,
    layers?: ResidencyLayer[],
): Partial<Record<StorageForm, CellAllocation>> => {
    const effectiveLayers = layers ?? [footprintPerForm(assets)];
    const result: Partial<Record<StorageForm, CellAllocation>> = {};
    for (const form of storageFormKeys()) {
        const formLayers = effectiveLayers.map((layer) => layer[form] ?? []);
        if (formLayers.every((layer) => layer.length === 0)) {
            continue;
        }
        result[form] = resolveFormShell(assets.storage, form, formLayers);
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
