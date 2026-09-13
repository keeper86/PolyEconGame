import {
    SERVICE_DEPRECIATION_RATE_PER_TICK,
    SERVICE_OUTPUT_SHIELD_FACTOR,
    SR_HOLDING_COST_PER_TON,
    SS_RELAXATION_RATE,
    STORAGE_BUFFER_CAPACITY_MULTIPLIER,
} from '../constants';
import {
    getWholeStorage,
    queryStorageFacility,
    removeFromStorageFacility,
    shellFormOfResource,
    storageFormKeys,
    storagePreservationFactor,
    usageOfShell,
    type Storage,
    type StorageForm,
    SHELL_STORAGE_SERVICE_QUANTITY,
} from './facility';
import {
    ALL_SERVICE_RESOURCE_TYPE_NAMES,
    getStorageResourceByForm,
    internalLogisticsServiceResourceType,
} from './services';
import type { Agent, AgentPlanetAssets, Planet } from './planet';
import { hasActiveLicense } from './planet';
import { PRODUCED_STORAGE_QUANTITY } from './specialFacilities';

export function storageLogisticsTick(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets || !hasActiveLicense(assets, 'commercial')) {
            continue;
        }
        const storage = assets.storage;
        processTransportLogistics(storage);
        for (const form of storageFormKeys()) {
            processFormStorageLogistics(storage, form);
        }
        applyStorageDegradation(storage, planet, assets);
    }
}

function relaxStarvation(current: number, deficitRatio: number): number {
    const next = current + (deficitRatio - current) * (1 - SS_RELAXATION_RATE);
    return Math.max(0, Math.min(1, next));
}

function settleBuffer(
    buffer: number,
    starvation: number,
    producedQuantity: number,
    debugKey: string,
): { buffer: number; starvation: number } {
    if (buffer < 0) {
        const deficitRatio = Math.min(1, -buffer / producedQuantity);
        starvation = relaxStarvation(starvation, deficitRatio);
        buffer = 0;
        if (process.env.SIM_DEBUG === '1' && starvation > 0.7) {
            console.warn('high starvation', debugKey, starvation, producedQuantity, deficitRatio);
        }
    } else {
        starvation *= SS_RELAXATION_RATE;
    }
    buffer = Math.max(0, Math.min(producedQuantity * STORAGE_BUFFER_CAPACITY_MULTIPLIER, buffer));
    starvation = Math.max(0, Math.min(1, starvation));
    return { buffer, starvation };
}

function processTransportLogistics(storage: Storage): void {
    const dept = storage.department;
    if (!dept) {
        return;
    }
    const produced = pullService(storage, internalLogisticsServiceResourceType.name);
    dept.transportBuffer += produced;
    dept.transportBuffer -= totalStoredMass(storage) * SR_HOLDING_COST_PER_TON;
    const producedQuantity = Math.max(1, dept.scale) * PRODUCED_STORAGE_QUANTITY;
    const settled = settleBuffer(dept.transportBuffer, dept.transportStarvation, producedQuantity, 'transport');
    dept.transportBuffer = settled.buffer;
    dept.transportStarvation = settled.starvation;
}

function processFormStorageLogistics(storage: Storage, form: StorageForm): void {
    const shell = storage.shells[form];
    const resource = getStorageResourceByForm(form);
    const produced = pullService(storage, resource.name);
    shell.storageBuffer += produced;
    shell.storageBuffer -= usageOfShell(shell).mass * SR_HOLDING_COST_PER_TON;
    const producedQuantity = Math.max(1, shell.scale) * SHELL_STORAGE_SERVICE_QUANTITY;
    const settled = settleBuffer(shell.storageBuffer, shell.storageStarvation, producedQuantity, form);
    shell.storageBuffer = settled.buffer;
    shell.storageStarvation = settled.starvation;
}

function totalStoredMass(storage: Storage): number {
    let mass = 0;
    for (const form of storageFormKeys()) {
        mass += usageOfShell(storage.shells[form]).mass;
    }
    return mass;
}

function pullService(storage: Storage, resourceName: string): number {
    const available = queryStorageFacility(storage, resourceName);
    if (available <= 0) {
        return 0;
    }
    return removeFromStorageFacility(storage, resourceName, available);
}

function serviceOutputPerTick(assets: AgentPlanetAssets, name: string): number {
    let total = 0;
    for (const facility of assets.productionFacilities) {
        total += facility.lastTickResults?.lastProduced?.[name] ?? 0;
    }
    if (assets.humanResourcesDepartment) {
        total += assets.humanResourcesDepartment.lastTickResults?.lastProduced?.[name] ?? 0;
    }
    const dept = assets.storage.department;
    if (dept) {
        total += dept.lastTickResults?.lastProduced?.[name] ?? 0;
    }
    return total;
}

function applyStorageDegradation(storage: Storage, planet: Planet, assets: AgentPlanetAssets): void {
    assets.lastDepreciatedPerTick = {};
    const transportSs = storage.department?.transportStarvation ?? 0;
    for (const [name, entry] of getWholeStorage(storage)) {
        if (!entry || entry.quantity <= 0) {
            continue;
        }
        const isService = ALL_SERVICE_RESOURCE_TYPE_NAMES.includes(name);
        const form = shellFormOfResource(entry.resource);
        const ss = isService ? transportSs : form !== null ? storage.shells[form].storageStarvation : transportSs;
        let decayQty: number;
        if (isService) {
            const price = planet.marketPrices[name] ?? 0;
            const shieldedQty = SERVICE_OUTPUT_SHIELD_FACTOR * serviceOutputPerTick(assets, name);
            const excessQty = Math.max(0, entry.quantity - shieldedQty);
            decayQty = excessQty * SERVICE_DEPRECIATION_RATE_PER_TICK * (1 + ss);
            assets.monthAcc.naturalDepreciationValue += excessQty * SERVICE_DEPRECIATION_RATE_PER_TICK * price;
        } else if (entry.resource.massPerQuantity > 0) {
            const preservation = storagePreservationFactor(ss);
            decayQty = entry.quantity * (1 - preservation);
        } else {
            continue;
        }
        if (decayQty < 1e-10) {
            continue;
        }
        removeFromStorageFacility(storage, name, decayQty);
        planet.consumedResources[name] = (planet.consumedResources[name] ?? 0) + decayQty;
        assets.monthAcc.depreciatedServices[name] = {
            quantity: (assets.monthAcc.depreciatedServices[name]?.quantity ?? 0) + decayQty,
            value:
                (assets.monthAcc.depreciatedServices[name]?.value ?? 0) + decayQty * (planet.marketPrices[name] ?? 0),
        };
        assets.lastDepreciatedPerTick[name] = decayQty;
    }
}
