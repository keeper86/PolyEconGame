import { SERVICE_DEPRECIATION_RATE_PER_TICK } from '../constants';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import type { TransportShipStatusType } from '../ships/ships';
import { createTransportShip, type TransportShip } from '../ships/ships';
import { stochasticRound } from '../utils/stochasticRound';
import type { WorkforceCategory, WorkforceCohort } from '../workforce/workforce';
import { totalActiveForEdu, totalDepartingForEdu } from '../workforce/workforceAggregates';
import { extractFromClaimedResource, queryClaimedResource } from './claims';
import type { Facility, ManagementFacility, ProductionFacility, ShipyardFacility, StorageFacility } from './facility';
import { putIntoStorageFacility, queryStorageFacility, removeFromStorageFacility } from './facility';
import type { Agent, Planet } from './planet';
import { ALL_SERVICE_RESOURCE_TYPE_NAMES, constructionServiceResourceType } from './services';
import type { WaterFillFacilityResult, WorkerSlot } from './waterFill';
import { waterFill } from './waterFill';

function weightedMeanAgeForEdu(workforce: WorkforceCohort<WorkforceCategory>[], edu: EducationLevelType): number {
    let sumAge = 0;
    let count = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            const active = workforce[age][edu][skill].active;
            if (active > 0) {
                sumAge += age * active;
                count += active;
            }
        }
    }
    return count > 0 ? sumAge / count : 30;
}

const CONSUMPTION_MISMATCH_TOLERANCE = 1e-9;

const depreciateServicesStorage = (agent: Agent, planet: Planet): void => {
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }
    const storage = assets.storageFacility;
    if (!storage) {
        return;
    }

    ALL_SERVICE_RESOURCE_TYPE_NAMES.forEach((serviceName) => {
        if (storage.currentInStorage[serviceName]) {
            const factorToDepreciate =
                storage.currentInStorage[serviceName].quantity < 0.01 ? 1 : SERVICE_DEPRECIATION_RATE_PER_TICK;
            removeFromStorageFacility(
                storage,
                serviceName,
                factorToDepreciate * storage.currentInStorage[serviceName].quantity,
            );
        }
    });
};

// ---- module-level types ----

type EnrichedFacility = {
    facility: Facility;
    resourceEfficiencyMap: Record<string, number>;
    resolvedShip: TransportShip | undefined; // only set for shipyard facilities in maintenance mode
};

function emptyEduRecord(): Record<EducationLevelType, number> {
    return { none: 0, primary: 0, secondary: 0, tertiary: 0 };
}

export function constructionTick(agents: Map<string, Agent>, planet: Planet): void {
    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        const allFacilities: Array<ProductionFacility | StorageFacility | ManagementFacility> = [
            ...assets.productionFacilities,
            assets.storageFacility,
            ...assets.managementFacilities,
        ];

        for (const facility of allFacilities) {
            if (!facility.construction) {
                continue;
            }

            const cs = facility.construction;
            const available = queryStorageFacility(assets.storageFacility, constructionServiceResourceType.name);
            const toConsume = Math.min(cs.maximumConstructionServiceConsumption, available);
            cs.lastTickInvestedConstructionServices = toConsume;

            if (toConsume > 0) {
                removeFromStorageFacility(assets.storageFacility, constructionServiceResourceType.name, toConsume);
                cs.progress += toConsume;
            }

            if (cs.progress >= cs.totalConstructionServiceRequired) {
                facility.maxScale = cs.constructionTargetMaxScale;
                facility.construction = null;
            }
        }
    });
}

export const MAINTENANCE_COST_MULTIPLIER = 0.01;

// ---- resource consumption/production helpers ----

function consumeNeeds(params: ProductionParameters | ManagementParameters): Record<string, number> {
    const { facility, storage, overallEfficiency, planet, agent } = params;
    const needs = facility.needs;
    const scale = facility.scale;
    const efficiency = overallEfficiency;
    const facilityId = facility.id;
    const actualConsumed: Record<string, number> = {};
    if (efficiency <= 0) {
        for (const need of needs) {
            actualConsumed[need.resource.name] = 0;
        }
        return actualConsumed;
    }
    for (const need of needs) {
        const consumed = need.quantity * scale * efficiency;
        if (need.resource.form === 'landBoundResource') {
            const extracted = extractFromClaimedResource(planet, agent, need.resource, consumed);
            actualConsumed[need.resource.name] = extracted;
            if (extracted < consumed - CONSUMPTION_MISMATCH_TOLERANCE) {
                console.warn(`Unexpected: extracted ${extracted} of ${need.resource.name}, expected ${consumed}.`, {
                    planetId: planet.id,
                    agentId: agent.id,
                    facilityId,
                });
            }
        } else {
            const removed = removeFromStorageFacility(storage, need.resource.name, consumed);
            const actual = need.resource.form === 'services' ? consumed : removed;
            actualConsumed[need.resource.name] = actual;
            if (actual < consumed - CONSUMPTION_MISMATCH_TOLERANCE) {
                console.warn(`Unexpected: removed ${actual} of ${need.resource.name}, expected ${consumed}.`, {
                    planetId: planet.id,
                    agentId: agent.id,
                    facilityId,
                });
            }
        }
    }
    return actualConsumed;
}

function produceOutputs(params: ProductionParameters): Record<string, number> {
    const { facility, storage, overallEfficiency } = params;

    const actualProduced: Record<string, number> = {};
    if (overallEfficiency <= 0) {
        for (const output of facility.produces) {
            actualProduced[output.resource.name] = 0;
        }
        return actualProduced;
    }
    for (const output of facility.produces) {
        const produced = output.quantity * facility.scale * overallEfficiency;
        actualProduced[output.resource.name] = produced;
        if (produced > 0) {
            const stored = putIntoStorageFacility(storage, output.resource, produced);
            if (stored < produced - CONSUMPTION_MISMATCH_TOLERANCE) {
                console.warn(`Unexpected: stored ${stored} of ${output.resource.name}, expected ${produced}.`);
            }
        }
    }
    return actualProduced;
}

// ---- demand and efficiency helpers ----

function computeTotalStorageDemand(enrichedFacilities: EnrichedFacility[]): Map<string, number> {
    const totalStorageDemand = new Map<string, number>();
    for (const { facility, resolvedShip } of enrichedFacilities) {
        if (facility.type === 'storage') {
            continue;
        }
        if (facility.type === 'ships') {
            if (facility.mode === 'building') {
                const proportionPerTick = Math.min(1, Math.sqrt(facility.scale) / facility.produces.buildingTime);
                for (const need of facility.produces.buildingCost) {
                    const required = need.quantity * proportionPerTick;
                    totalStorageDemand.set(need.type.name, (totalStorageDemand.get(need.type.name) ?? 0) + required);
                }
            } else if (facility.mode === 'maintenance' && resolvedShip) {
                const maintenancePerTick = Math.min(1, 3 / resolvedShip.type.buildingTime);
                for (const need of resolvedShip.type.buildingCost) {
                    const required = need.quantity * maintenancePerTick * MAINTENANCE_COST_MULTIPLIER;
                    totalStorageDemand.set(need.type.name, (totalStorageDemand.get(need.type.name) ?? 0) + required);
                }
            }
            continue;
        }
        for (const need of facility.needs) {
            if (need.resource.form === 'landBoundResource') {
                continue;
            }
            const required = need.quantity * facility.scale;
            totalStorageDemand.set(need.resource.name, (totalStorageDemand.get(need.resource.name) ?? 0) + required);
        }
    }
    return totalStorageDemand;
}

function computeResourceEfficiencyMap(
    ef: EnrichedFacility,
    totalStorageDemand: Map<string, number>,
    storage: StorageFacility,
    planet: Planet,
    agent: Agent,
): Record<string, number> {
    const { facility, resolvedShip } = ef;
    const resourceEfficiencyMap: Record<string, number> = {};
    if (facility.type === 'storage') {
        return resourceEfficiencyMap;
    }
    if (facility.type === 'ships') {
        if (facility.mode === 'building') {
            for (const need of facility.produces.buildingCost) {
                const required =
                    need.quantity * Math.min(1, Math.sqrt(facility.scale) / facility.produces.buildingTime);
                const available = queryStorageFacility(storage, need.type.name);
                const totalDemand = totalStorageDemand.get(need.type.name) ?? required;
                const fairShare = totalDemand > 0 ? (required / totalDemand) * available : available;
                resourceEfficiencyMap[need.type.name] = required > 0 ? Math.min(1, fairShare / required) : 1;
            }
        } else if (facility.mode === 'maintenance' && resolvedShip) {
            const maintenancePerTick = Math.min(1, 3 / resolvedShip.type.buildingTime);
            for (const need of resolvedShip.type.buildingCost) {
                const required = need.quantity * maintenancePerTick * MAINTENANCE_COST_MULTIPLIER;
                const available = queryStorageFacility(storage, need.type.name);
                const totalDemand = totalStorageDemand.get(need.type.name) ?? required;
                const fairShare = totalDemand > 0 ? (required / totalDemand) * available : available;
                resourceEfficiencyMap[need.type.name] = required > 0 ? Math.min(1, fairShare / required) : 1;
            }
        }
        return resourceEfficiencyMap;
    }
    for (const need of facility.needs) {
        const required = need.quantity * facility.scale;
        if (need.resource.form === 'landBoundResource') {
            resourceEfficiencyMap[need.resource.name] = Math.min(
                1,
                queryClaimedResource(planet, agent, need.resource) / required,
            );
            continue;
        }
        const available = queryStorageFacility(storage, need.resource.name);
        const totalDemand = totalStorageDemand.get(need.resource.name) ?? required;
        const fairShare = totalDemand > 0 ? (required / totalDemand) * available : available;
        resourceEfficiencyMap[need.resource.name] = required > 0 ? Math.min(1, fairShare / required) : 1;
    }
    return resourceEfficiencyMap;
}

// ---- per-facility tick processors ----

type IntermediateResults = {
    storage: StorageFacility;
    overallEfficiency: number;
    workerResults: WaterFillFacilityResult;
    resourceEfficiencyMap: Record<string, number>;
    monthAcc: { productionValue: number; consumptionValue: number };
    planet: Planet;
    agent: Agent;
};

type ProductionParameters = IntermediateResults & {
    facility: ProductionFacility;
};

type ManagementParameters = IntermediateResults & {
    facility: ManagementFacility;
};

type ShipyardParameters = IntermediateResults & {
    facility: ShipyardFacility;
};

type StorageParameters = IntermediateResults & {
    facility: StorageFacility;
};

function processProductionFacility(params: ProductionParameters): void {
    const actualProduced = produceOutputs(params);
    const actualConsumed = consumeNeeds(params);
    const { overallEfficiency, workerResults, resourceEfficiencyMap, monthAcc, planet, facility } = params;
    for (const [name, qty] of Object.entries(actualProduced)) {
        monthAcc.productionValue += qty * (planet.marketPrices[name] ?? 0);
    }
    for (const [name, qty] of Object.entries(actualConsumed)) {
        monthAcc.consumptionValue += qty * (planet.marketPrices[name] ?? 0);
    }
    facility.lastTickResults = {
        overallEfficiency: overallEfficiency,
        workerEfficiency: workerResults.workerEfficiency,
        resourceEfficiency: resourceEfficiencyMap,
        overqualifiedWorkers: workerResults.overqualifiedWorkers,
        totalUsedByEdu: workerResults.totalUsedByEdu,
        exactUsedByEdu: workerResults.exactUsedByEdu,
        lastProduced: actualProduced,
        lastConsumed: actualConsumed,
    };
}

function processManagementFacility(params: ManagementParameters): void {
    const actualConsumed = consumeNeeds(params);
    const { overallEfficiency, workerResults, resourceEfficiencyMap, monthAcc, planet, facility } = params;
    if (overallEfficiency > 0) {
        facility.buffer = Math.min(
            facility.maxBuffer,
            facility.buffer + facility.bufferPerTickPerScale * facility.scale * overallEfficiency,
        );
    }
    for (const [name, qty] of Object.entries(actualConsumed)) {
        monthAcc.consumptionValue += qty * (planet.marketPrices[name] ?? 0);
    }
    facility.lastTickResults = {
        overallEfficiency,
        workerEfficiency: workerResults.workerEfficiency,
        resourceEfficiency: resourceEfficiencyMap,
        overqualifiedWorkers: workerResults.overqualifiedWorkers,
        totalUsedByEdu: workerResults.totalUsedByEdu,
        exactUsedByEdu: workerResults.exactUsedByEdu,
        lastConsumed: actualConsumed,
    };
}

function processShipyardFacility(
    params: ShipyardParameters,
    tick: number,
    resolvedShip: TransportShip | undefined,
    agents: Map<string, Agent>,
): void {
    const { facility, storage, overallEfficiency, workerResults, resourceEfficiencyMap, monthAcc, planet, agent } =
        params;
    const actualConsumed: Record<string, number> = {};
    if (facility.mode === 'building') {
        if (overallEfficiency > 0) {
            const part = Math.min(1, Math.sqrt(facility.scale) / facility.produces.buildingTime);
            for (const need of facility.produces.buildingCost) {
                const required = need.quantity * part;
                const consumed = required * overallEfficiency;
                const removed = removeFromStorageFacility(storage, need.type.name, consumed);
                actualConsumed[need.type.name] = need.type.form === 'services' ? consumed : removed;
            }
            facility.progress += part * overallEfficiency;
            if (facility.progress >= 1) {
                agent.transportShips.push(createTransportShip(facility.produces, tick, facility.shipName, planet));
                // Cast to mutable to reset mode in-place (facility is still the array reference)
                (facility as { mode: string }).mode = 'idle';
            }
        } else {
            for (const need of facility.produces.buildingCost) {
                actualConsumed[need.type.name] = 0;
            }
        }
    } else if (facility.mode === 'maintenance' && resolvedShip && resolvedShip.state.type === 'maintenance') {
        const maintenancePerTick = Math.min(1, 3 / resolvedShip.type.buildingTime);
        if (overallEfficiency > 0) {
            for (const need of resolvedShip.type.buildingCost) {
                const required = need.quantity * maintenancePerTick * MAINTENANCE_COST_MULTIPLIER;
                const consumed = required * overallEfficiency;
                const removed = removeFromStorageFacility(storage, need.type.name, consumed);
                actualConsumed[need.type.name] = need.type.form === 'services' ? consumed : removed;
            }
            resolvedShip.maintainanceStatus = Math.min(
                1,
                resolvedShip.maintainanceStatus + maintenancePerTick * overallEfficiency,
            );
            if (resolvedShip.maintainanceStatus >= 1) {
                resolvedShip.state = {
                    type: 'idle',
                    planetId: resolvedShip.state.planetId,
                };
                (facility as { mode: TransportShipStatusType }).mode = 'idle';

                // Find the matching maintenance offer and mark it fulfilled + transfer payment
                const ownerAgent = agents.get(facility.shipOwner);
                if (ownerAgent) {
                    for (const ownerAssets of Object.values(ownerAgent.assets)) {
                        const offerIndex = ownerAssets.shipMaintenanceOffers.findIndex(
                            (o) =>
                                o.status === 'accepted' &&
                                o.shipName === facility.shipName &&
                                o.maintenanceProviderAgentId === agent.id,
                        );
                        if (offerIndex !== -1) {
                            const offer = ownerAssets.shipMaintenanceOffers[offerIndex];
                            if (offer.status === 'accepted') {
                                ownerAssets.shipMaintenanceOffers[offerIndex] = {
                                    ...offer,
                                    status: 'fulfilled',
                                    maintenanceProviderAgentId: offer.maintenanceProviderAgentId,
                                };
                                // Release escrowed payment: deduct from hold, pay provider
                                ownerAssets.depositHold -= offer.price;
                                agent.assets[planet.id].deposits += offer.price;
                            }
                            break;
                        }
                    }
                }
            }
        } else {
            for (const need of resolvedShip.type.buildingCost) {
                actualConsumed[need.type.name] = 0;
            }
        }
    }
    for (const [name, qty] of Object.entries(actualConsumed)) {
        monthAcc.consumptionValue += qty * (planet.marketPrices[name] ?? 0);
    }
    facility.lastTickResults = {
        overallEfficiency,
        workerEfficiency: workerResults.workerEfficiency,
        resourceEfficiency: resourceEfficiencyMap,
        overqualifiedWorkers: workerResults.overqualifiedWorkers,
        totalUsedByEdu: workerResults.totalUsedByEdu,
        exactUsedByEdu: workerResults.exactUsedByEdu,
        lastConsumed: actualConsumed,
    };
}

function processStorageFacility(params: StorageParameters): void {
    const { facility, overallEfficiency, workerResults } = params;
    facility.lastTickResults = {
        overallEfficiency,
        workerEfficiency: workerResults.workerEfficiency,
        overqualifiedWorkers: workerResults.overqualifiedWorkers,
        totalUsedByEdu: workerResults.totalUsedByEdu,
        exactUsedByEdu: workerResults.exactUsedByEdu,
    };
}

// ---- main tick ----

export function productionTick(agents: Map<string, Agent>, planet: Planet, tick: number): void {
    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        const workforce = assets.workforceDemography;

        const workerPool = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            const active = workforce ? totalActiveForEdu(workforce, edu) : 0;
            const departing = workforce ? totalDepartingForEdu(workforce, edu) : 0;
            workerPool[edu] = active + stochasticRound(departing * DEPARTING_EFFICIENCY);
        }

        const ageProd = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            ageProd[edu] = ageProductivityMultiplier(workforce ? weightedMeanAgeForEdu(workforce, edu) : 30);
        }

        // All active (non-construction) facilities in one flat array.
        const activeFacilities: Array<Facility> = [
            ...assets.productionFacilities.filter((f) => !f.construction),
            ...(assets.storageFacility.construction === null ? [assets.storageFacility] : []),
            ...assets.managementFacilities.filter((f) => !f.construction),
            ...assets.shipyardFacilities.filter((f) => !f.construction),
        ];

        // Pre-resolve ships for maintenance-mode shipyards — eliminates repeated agent/ship lookups.
        const enrichedFacilities: EnrichedFacility[] = activeFacilities.map((facility) => {
            let resolvedShip: TransportShip | undefined;
            if (facility.type === 'ships' && facility.mode === 'maintenance') {
                resolvedShip = agents.get(facility.shipOwner)?.transportShips.find((s) => s.name === facility.shipName);
                if (!resolvedShip) {
                    console.warn(
                        `Ship owner with id ${facility.shipOwner} not found for maintenance. Skipping maintenance consumption.`,
                    );
                }
            }
            return { facility, resourceEfficiencyMap: {}, resolvedShip };
        });

        const totalStorageDemand = computeTotalStorageDemand(enrichedFacilities);
        for (const ef of enrichedFacilities) {
            ef.resourceEfficiencyMap = computeResourceEfficiencyMap(
                ef,
                totalStorageDemand,
                assets.storageFacility,
                planet,
                agent,
            );
        }

        // Build one flat list of WorkerSlots across all active facilities.
        const allSlots: WorkerSlot[] = [];
        const effectiveDemandBySlot = new Map<WorkerSlot, number>();
        for (const { facility } of enrichedFacilities) {
            for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                if (!req || req <= 0) {
                    continue;
                }
                const jobEdu = eduLevel as EducationLevelType;
                const jobEduIdx = educationLevelKeys.indexOf(jobEdu);
                const fullTarget = req * facility.scale;
                const bodies = ageProd[jobEdu] > 0 ? Math.ceil(fullTarget / ageProd[jobEdu]) : 0;
                const slot: WorkerSlot = {
                    facilityId: facility.id,
                    facilityType: facility.type,
                    jobEdu,
                    jobEduIdx,
                    capacity: Math.max(1, bodies),
                    assigned: 0,
                    effectiveAssigned: 0,
                    assignedByEdu: {},
                    overqualifiedCount: 0,
                };
                allSlots.push(slot);
                effectiveDemandBySlot.set(slot, req * facility.scale);
            }
        }

        const { byFacility } = waterFill(allSlots, workerPool, ageProd, effectiveDemandBySlot);

        // We calculated resource constraints with last round's services. We now empty service storage.
        // This makes services un-storable but allows producing services and using them next tick's production.
        depreciateServicesStorage(agent, planet);

        for (const { facility, resourceEfficiencyMap, resolvedShip } of enrichedFacilities) {
            // A facility with no worker slots won't appear in byFacility — treat it as fully efficient.
            const workerResults: WaterFillFacilityResult = byFacility.get(facility.id) ?? {
                workerEfficiency: {},
                workerEfficiencyOverall: 1,
                overqualifiedWorkers: {},
                totalUsedByEdu: emptyEduRecord(),
                exactUsedByEdu: emptyEduRecord(),
            };

            const resourceEfficiencies = Object.values(resourceEfficiencyMap);
            const overallEfficiency = Math.min(
                workerResults.workerEfficiencyOverall,
                ...(resourceEfficiencies.length > 0 ? resourceEfficiencies : [1]),
            );

            if (overallEfficiency > 0) {
                planet.environment.pollution.air += facility.pollutionPerTick.air * facility.scale * overallEfficiency;
                planet.environment.pollution.water +=
                    facility.pollutionPerTick.water * facility.scale * overallEfficiency;
                planet.environment.pollution.soil +=
                    facility.pollutionPerTick.soil * facility.scale * overallEfficiency;
            }

            const productionParameterBase = {
                storage: assets.storageFacility,
                overallEfficiency,
                workerResults,
                resourceEfficiencyMap,
                monthAcc: assets.monthAcc,
                planet,
                agent,
            };

            if (facility.type === 'production') {
                processProductionFacility({ ...productionParameterBase, facility });
            } else if (facility.type === 'management') {
                processManagementFacility({ ...productionParameterBase, facility });
            } else if (facility.type === 'ships') {
                processShipyardFacility({ ...productionParameterBase, facility }, tick, resolvedShip, agents);
            } else {
                processStorageFacility({ ...productionParameterBase, facility });
            }
        }
    });
}

export const DEPARTING_EFFICIENCY = 0.5;
export const ageProductivityMultiplier = (age: number): number => {
    if (age <= 18) {
        return 0.8;
    }
    if (age < 30) {
        return 0.8 + ((age - 18) * 0.2) / 12;
    }
    if (age <= 50) {
        return 1.0;
    }
    if (age < 65) {
        return 1.0 - ((age - 50) * 0.15) / 15;
    }
    return Math.max(0.7, 0.85 - ((age - 65) * 0.15) / 15);
};
