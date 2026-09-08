import {
    SERVICE_DEPRECIATION_RATE_PER_TICK,
    SERVICE_OUTPUT_SHIELD_FACTOR,
    SR_HOLDING_COST_PER_TON,
    SS_RELAXATION_RATE,
    STORAGE_BUFFER_CAPACITY_MULTIPLIER,
} from '../constants';
import type { Storage } from './facility';
import {
    getWholeStorage,
    queryStorageFacility,
    removeFromStorageFacility,
    storagePreservationFactor,
    totalStoredByShell,
} from './facility';
import type { Agent, AgentPlanetAssets, Planet } from './planet';
import { hasActiveLicense } from './planet';
import { ALL_SERVICE_RESOURCE_TYPE_NAMES, internalLogisticsServiceResourceType } from './services';
import { PRODUCED_STORAGE_QUANTITY } from './specialFacilities';

export function storageLogisticsTick(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets || !hasActiveLicense(assets, 'commercial')) {
            continue;
        }
        processStorageLogistics(assets, planet);
        wasteSurplusOutputs(assets);
    }
}

export function wasteSurplusOutputs(assets: AgentPlanetAssets): void {
    const storage = assets.storage;
    for (const facility of assets.productionFacilities) {
        const wasteTicks = facility.wasteSurplusTicks ?? 0;
        if (wasteTicks <= 0) {
            continue;
        }
        for (const output of facility.produces) {
            if (ALL_SERVICE_RESOURCE_TYPE_NAMES.includes(output.resource.name)) {
                continue;
            }
            const freeQuantity = queryStorageFacility(storage, output.resource.name);
            if (freeQuantity <= 0) {
                continue;
            }
            const keep = wasteTicks * facility.maxScale * output.quantity;
            const excess = freeQuantity - keep;
            if (excess > 1e-9) {
                removeFromStorageFacility(storage, output.resource.name, excess);
            }
        }
    }
}

function processStorageLogistics(assets: AgentPlanetAssets, planet: Planet): void {
    const storage = assets.storage;
    const dept = storage.department;
    if (!dept) {
        return;
    }

    const produced = pullInternalLogisticsServiceFromStorage(storage);
    dept.storageBuffer += produced;

    dept.storageBuffer -= totalStoredByShell(storage).mass * SR_HOLDING_COST_PER_TON;

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

function pullInternalLogisticsServiceFromStorage(storage: Storage): number {
    const available = queryStorageFacility(storage, internalLogisticsServiceResourceType.name);
    if (available <= 0) {
        return 0;
    }
    return removeFromStorageFacility(storage, internalLogisticsServiceResourceType.name, available);
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
    const ss = storage.department?.storageStarvation ?? 1;
    const preservation = storagePreservationFactor(ss);

    for (const [name, entry] of getWholeStorage(storage)) {
        if (!entry || entry.quantity <= 0) {
            continue;
        }

        const isService = ALL_SERVICE_RESOURCE_TYPE_NAMES.includes(name);
        let decayQty: number;
        if (isService) {
            const price = planet.marketPrices[name] ?? 0;
            const shieldedQty = SERVICE_OUTPUT_SHIELD_FACTOR * serviceOutputPerTick(assets, name);
            const excessQty = Math.max(0, entry.quantity - shieldedQty);
            decayQty = excessQty * SERVICE_DEPRECIATION_RATE_PER_TICK * (1 + ss);
            assets.monthAcc.naturalDepreciationValue += excessQty * SERVICE_DEPRECIATION_RATE_PER_TICK * price;
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
