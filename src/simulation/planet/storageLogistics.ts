import {
    STORAGE_BUFFER_CAPACITY_MULTIPLIER,
    SS_RELAXATION_RATE,
    SR_HOLDING_COST_PER_TON,
    SERVICE_DEPRECIATION_RATE_PER_TICK,
} from '../constants';
import type { StorageFacility } from './facility';
import { isStorageStarvationEffectDisabled, queryStorageFacility, removeFromStorageFacility, storagePreservationFactor } from './facility';
import type { Agent, AgentPlanetAssets, Planet } from './planet';
import { hasActiveLicense } from './planet';
import { storageServiceResourceType, ALL_SERVICE_RESOURCE_TYPE_NAMES } from './services';
import { PRODUCED_STORAGE_QUANTITY } from './specialFacilities';

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

function applyStorageDegradation(storage: StorageFacility, planet: Planet, assets: AgentPlanetAssets): void {
    assets.lastDepreciatedPerTick = {};
    const ss = isStorageStarvationEffectDisabled() ? 0 : storage.department?.storageStarvation ?? 1;
    const preservation = storagePreservationFactor(ss);

    for (const [name, entry] of Object.entries(storage.currentInStorage)) {
        if (!entry || entry.quantity <= 0) {
            continue;
        }

        const isService = ALL_SERVICE_RESOURCE_TYPE_NAMES.includes(name);
        let decayFactor: number;
        if (isService) {
            decayFactor = SERVICE_DEPRECIATION_RATE_PER_TICK * (1 + ss);
        } else if (entry.resource.massPerQuantity > 0) {
            decayFactor = 1 - preservation;
        } else {
            continue;
        }

        const decayQty = entry.quantity * decayFactor;
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
