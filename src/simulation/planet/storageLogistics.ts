import {
    SERVICE_DEPRECIATION_RATE_PER_TICK,
    SERVICE_SHIELD_FRACTION,
    SR_HOLDING_COST_PER_TON,
    SS_RELAXATION_RATE,
    STORAGE_BUFFER_CAPACITY_MULTIPLIER,
} from '../constants';
import type { StorageFacility } from './facility';
import {
    isStorageStarvationEffectDisabled,
    queryStorageFacility,
    removeFromStorageFacility,
    storagePreservationFactor,
} from './facility';
import type { Agent, AgentPlanetAssets, Planet } from './planet';
import { hasActiveLicense } from './planet';
import { storageServiceResourceType, ALL_SERVICE_RESOURCE_TYPE_NAMES } from './services';
import { PRODUCED_STORAGE_QUANTITY } from './specialFacilities';

let serviceDepreciationRateOverride: number | null = null;
let serviceBufferShieldTicks = 0;

export function setServiceDepreciationRate(rate: number): void {
    serviceDepreciationRateOverride = rate;
}

export function resetServiceDepreciationRate(): void {
    serviceDepreciationRateOverride = null;
}

export function getServiceDepreciationRate(): number {
    return serviceDepreciationRateOverride ?? SERVICE_DEPRECIATION_RATE_PER_TICK * (1 - SERVICE_SHIELD_FRACTION);
}

export function setServiceBufferShieldTicks(ticks: number): void {
    serviceBufferShieldTicks = ticks;
}

export function resetServiceBufferShieldTicks(): void {
    serviceBufferShieldTicks = 0;
}

export function getServiceBufferShieldTicks(): number {
    return serviceBufferShieldTicks;
}

export function storageLogisticsTick(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets || !hasActiveLicense(assets, 'commercial')) {
            continue;
        }
        processStorageLogistics(assets, planet);
    }
}

function processStorageLogistics(assets: AgentPlanetAssets, planet: Planet): void {
    const storage = assets.storageFacility;
    const dept = storage.department;
    if (!dept) {
        return;
    }

    const produced = pullStorageServiceFromStorage(storage);
    dept.storageBuffer += produced;

    dept.storageBuffer -= storage.current.mass * SR_HOLDING_COST_PER_TON;

    const deptScale = Math.max(1, dept.scale);
    const producedQuantity = deptScale * PRODUCED_STORAGE_QUANTITY;

    if (dept.storageBuffer < 0) {
        const deficitRatio = Math.min(1, -dept.storageBuffer / producedQuantity);
        dept.storageStarvation += (deficitRatio - dept.storageStarvation) * (1 - SS_RELAXATION_RATE);
        dept.storageBuffer = 0;
        if (process.env.SIM_DEBUG === '1' && dept.storageStarvation > 0.7) {
            console.warn(
                'high starvation',
                dept.storageStarvation,
                dept.storageBuffer,
                producedQuantity,
                deficitRatio,
                JSON.stringify(dept.lastTickResults, null, 2),
            );
        }
    } else {
        dept.storageStarvation *= SS_RELAXATION_RATE;
    }

    dept.storageBuffer = Math.max(
        0,
        Math.min(producedQuantity * STORAGE_BUFFER_CAPACITY_MULTIPLIER, dept.storageBuffer),
    );

    dept.storageStarvation = Math.max(0, Math.min(1, dept.storageStarvation));

    applyStorageDegradation(storage, planet, assets);
}

function pullStorageServiceFromStorage(storage: StorageFacility): number {
    const available = queryStorageFacility(storage, storageServiceResourceType.name);
    if (available <= 0) {
        return 0;
    }
    return removeFromStorageFacility(storage, storageServiceResourceType.name, available);
}

function serviceFlowPerTick(assets: AgentPlanetAssets, name: string): number {
    let total = 0;
    for (const facility of assets.productionFacilities) {
        total +=
            (facility.lastTickResults?.lastProduced?.[name] ?? 0) +
            (facility.lastTickResults?.lastConsumed?.[name] ?? 0);
    }
    if (assets.humanResourcesDepartment) {
        total +=
            (assets.humanResourcesDepartment.lastTickResults?.lastProduced?.[name] ?? 0) +
            (assets.humanResourcesDepartment.lastTickResults?.lastConsumed?.[name] ?? 0);
    }
    const dept = assets.storageFacility.department;
    if (dept) {
        total += (dept.lastTickResults?.lastProduced?.[name] ?? 0) + (dept.lastTickResults?.lastConsumed?.[name] ?? 0);
    }
    return total;
}

function applyStorageDegradation(storage: StorageFacility, planet: Planet, assets: AgentPlanetAssets): void {
    assets.lastDepreciatedPerTick = {};
    const ss = isStorageStarvationEffectDisabled() ? 0 : (storage.department?.storageStarvation ?? 1);
    const preservation = storagePreservationFactor(ss);

    for (const [name, entry] of Object.entries(storage.currentInStorage)) {
        if (!entry || entry.quantity <= 0) {
            continue;
        }

        const isService = ALL_SERVICE_RESOURCE_TYPE_NAMES.includes(name);
        let decayQty: number;
        if (isService) {
            const baseRate = getServiceDepreciationRate();
            const price = planet.marketPrices[name] ?? 0;
            if (serviceBufferShieldTicks > 0) {
                const shieldedQty = serviceBufferShieldTicks * serviceFlowPerTick(assets, name);
                const excessQty = Math.max(0, entry.quantity - shieldedQty);
                decayQty = excessQty * baseRate * (1 + ss);
                assets.monthAcc.naturalDepreciationValue += excessQty * baseRate * price;
            } else {
                decayQty = entry.quantity * baseRate * (1 + ss);
                assets.monthAcc.naturalDepreciationValue += entry.quantity * baseRate * price;
            }
        } else if (entry.resource.massPerQuantity > 0) {
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
