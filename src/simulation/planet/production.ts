import { SERVICE_DEPRECIATION_RATE_PER_TICK } from '../constants';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { extractFromClaimedResource, queryClaimedResource } from '../utils/entities';
import { stochasticRound } from '../utils/stochasticRound';
import type { WorkforceCategory, WorkforceCohort } from '../workforce/workforce';
import { totalActiveForEdu, totalDepartingForEdu } from '../workforce/workforceAggregates';
import { putIntoStorageFacility, queryStorageFacility, removeFromStorageFacility } from './facility';
import type { ManagementFacility, ProductionFacility, StorageFacility } from './facility';
import type { Agent, Planet } from './planet';
import { constructionServiceResourceType } from './services';
import { ALL_SERVICE_RESOURCE_TYPE_NAMES } from './services';
import type { WorkerSlot } from './waterFill';
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
            removeFromStorageFacility(
                storage,
                serviceName,
                storage.currentInStorage[serviceName].quantity * SERVICE_DEPRECIATION_RATE_PER_TICK,
            );
        }
    });
};

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

export function productionTick(agents: Map<string, Agent>, planet: Planet): void {
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
            const meanAge = workforce ? weightedMeanAgeForEdu(workforce, edu) : 30;
            ageProd[edu] = ageProductivityMultiplier(meanAge);
        }

        // All active (non-construction) facilities in one flat array.
        const activeFacilities: Array<ProductionFacility | StorageFacility | ManagementFacility> = [
            ...assets.productionFacilities.filter((f) => !f.construction),
            ...(assets.storageFacility.construction === null ? [assets.storageFacility] : []),
            ...assets.managementFacilities.filter((f) => !f.construction),
        ];

        type FacilityMeta = { resourceEfficiencyScalar: number; resourceEfficiencyMap: Record<string, number> };

        // Compute resource-availability efficiency for each facility.
        // Storage has no needs → efficiencies = [] → scalar = 1, map = {}.
        const totalStorageDemand = new Map<string, number>();
        for (const facility of activeFacilities) {
            if (facility.type === 'storage') {
                continue;
            }
            for (const need of facility.needs) {
                if (need.resource.form === 'landBoundResource') {
                    continue;
                }
                const required = need.quantity * facility.scale;
                totalStorageDemand.set(
                    need.resource.name,
                    (totalStorageDemand.get(need.resource.name) ?? 0) + required,
                );
            }
        }

        const facilityMeta: FacilityMeta[] = activeFacilities.map((facility) => {
            if (facility.type === 'storage') {
                return { resourceEfficiencyScalar: 1, resourceEfficiencyMap: {} };
            }
            const resourceEfficiencyMap: Record<string, number> = {};
            const efficiencies = facility.needs.map((need) => {
                const required = need.quantity * facility.scale;
                if (need.resource.form === 'landBoundResource') {
                    const eff = Math.min(1, queryClaimedResource(planet, agent, need.resource) / required);
                    resourceEfficiencyMap[need.resource.name] = eff;
                    return eff;
                }
                const available = queryStorageFacility(assets.storageFacility, need.resource.name);
                const totalDemand = totalStorageDemand.get(need.resource.name) ?? required;
                const fairShare = totalDemand > 0 ? (required / totalDemand) * available : available;
                const eff = required > 0 ? Math.min(1, fairShare / required) : 1;
                resourceEfficiencyMap[need.resource.name] = eff;
                return eff;
            });
            return {
                resourceEfficiencyScalar: efficiencies.length > 0 ? Math.min(...efficiencies) : 1,
                resourceEfficiencyMap,
            };
        });

        // Build one flat list of WorkerSlots across all active facilities.
        const allSlots: WorkerSlot[] = [];
        const effectiveDemandBySlot = new Map<WorkerSlot, number>();

        for (let fi = 0; fi < activeFacilities.length; fi++) {
            const facility = activeFacilities[fi];
            const { resourceEfficiencyScalar } = facilityMeta[fi];
            for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                if (!req || req <= 0) {
                    continue;
                }
                const jobEdu = eduLevel as EducationLevelType;
                const jobEduIdx = educationLevelKeys.indexOf(jobEdu);
                const scaledTarget = req * facility.scale * resourceEfficiencyScalar;
                if (scaledTarget <= 0) {
                    continue;
                }
                const bodies = ageProd[jobEdu] > 0 ? Math.ceil(scaledTarget / ageProd[jobEdu]) : 0;
                const slot: WorkerSlot = {
                    facilityIdx: fi,
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

        // we calculated resource constraints with last round services. We now empty service storage.
        // This makes services un-storable but allows producing services and using them next tick's production.
        depreciateServicesStorage(agent, planet);

        activeFacilities.forEach((facility, fi) => {
            const { resourceEfficiencyMap } = facilityMeta[fi];
            const facilityResult = byFacility.get(fi);

            const hasWorkerRequirements = Object.values(facility.workerRequirement).some((v) => v && v > 0);
            const workerEfficiency = facilityResult?.workerEfficiency ?? {};
            const workerEfficiencyOverall = facilityResult?.workerEfficiencyOverall ?? (hasWorkerRequirements ? 0 : 1);
            const totalUsedByEdu = facilityResult?.totalUsedByEdu ?? { none: 0, primary: 0, secondary: 0, tertiary: 0 };
            const exactUsedByEdu = facilityResult?.exactUsedByEdu ?? { none: 0, primary: 0, secondary: 0, tertiary: 0 };
            const overqualifiedWorkers = facilityResult?.overqualifiedWorkers ?? {};

            const resourceEfficiencies = Object.values(resourceEfficiencyMap);
            const overallEfficiency = Math.min(
                workerEfficiencyOverall,
                ...(resourceEfficiencies.length > 0 ? resourceEfficiencies : [1]),
            );

            if (overallEfficiency > 0) {
                planet.environment.pollution.air += facility.pollutionPerTick.air * facility.scale * overallEfficiency;
                planet.environment.pollution.water +=
                    facility.pollutionPerTick.water * facility.scale * overallEfficiency;
                planet.environment.pollution.soil +=
                    facility.pollutionPerTick.soil * facility.scale * overallEfficiency;
            }

            if (facility.type === 'production') {
                const actualConsumed: Record<string, number> = {};
                const actualProduced: Record<string, number> = {};

                if (overallEfficiency > 0) {
                    facility.produces.forEach((output) => {
                        const produced = output.quantity * facility.scale * overallEfficiency;
                        if (produced > 0) {
                            actualProduced[output.resource.name] = produced;
                            putIntoStorageFacility(assets.storageFacility, output.resource, produced);
                        } else {
                            actualProduced[output.resource.name] = 0;
                        }
                    });

                    facility.needs.forEach((need) => {
                        const consumed = need.quantity * facility.scale * overallEfficiency;
                        if (need.resource.form === 'landBoundResource') {
                            const extracted = extractFromClaimedResource(planet, agent, need.resource, consumed);
                            actualConsumed[need.resource.name] = extracted;
                            if (extracted < consumed - CONSUMPTION_MISMATCH_TOLERANCE) {
                                console.warn(
                                    `Unexpected: extracted ${extracted} of ${need.resource.name}, expected ${consumed}.`,
                                    { planetId: planet.id, agentId: agent.id, facilityId: facility.id },
                                );
                            }
                        } else {
                            const consumeInputs = removeFromStorageFacility(
                                assets.storageFacility,
                                need.resource.name,
                                consumed,
                            );
                            const removed = need.resource.form === 'services' ? consumed : consumeInputs;
                            actualConsumed[need.resource.name] = removed;
                            if (removed < consumed - CONSUMPTION_MISMATCH_TOLERANCE) {
                                console.warn(
                                    `Unexpected: removed ${removed} of ${need.resource.name}, expected ${consumed}.`,
                                    { planetId: planet.id, agentId: agent.id, facilityId: facility.id },
                                );
                            }
                        }
                    });
                } else {
                    facility.produces.forEach((output) => {
                        actualProduced[output.resource.name] = 0;
                    });
                    facility.needs.forEach((need) => {
                        actualConsumed[need.resource.name] = 0;
                    });
                }

                facility.lastTickResults = {
                    overallEfficiency,
                    workerEfficiency,
                    resourceEfficiency: resourceEfficiencyMap,
                    overqualifiedWorkers,
                    totalUsedByEdu,
                    exactUsedByEdu,
                    lastProduced: actualProduced,
                    lastConsumed: actualConsumed,
                };
            } else if (facility.type === 'management') {
                const actualConsumed: Record<string, number> = {};

                if (overallEfficiency > 0) {
                    facility.needs.forEach((need) => {
                        const consumed = need.quantity * facility.scale * overallEfficiency;
                        if (need.resource.form === 'landBoundResource') {
                            const extracted = extractFromClaimedResource(planet, agent, need.resource, consumed);
                            actualConsumed[need.resource.name] = extracted;
                        } else {
                            const removed = removeFromStorageFacility(
                                assets.storageFacility,
                                need.resource.name,
                                consumed,
                            );
                            actualConsumed[need.resource.name] = need.resource.form === 'services' ? consumed : removed;
                        }
                    });

                    facility.buffer = Math.min(
                        facility.maxBuffer,
                        facility.buffer + facility.bufferPerTickPerScale * facility.scale * overallEfficiency,
                    );
                } else {
                    facility.needs.forEach((need) => {
                        actualConsumed[need.resource.name] = 0;
                    });
                }

                facility.lastTickResults = {
                    overallEfficiency,
                    workerEfficiency,
                    resourceEfficiency: resourceEfficiencyMap,
                    overqualifiedWorkers,
                    totalUsedByEdu,
                    exactUsedByEdu,
                    lastConsumed: actualConsumed,
                };
            } else {
                // type === 'storage': workers → efficiency → pollution already done above. No inputs/outputs.
                facility.lastTickResults = {
                    overallEfficiency,
                    workerEfficiency,
                    overqualifiedWorkers,
                    totalUsedByEdu,
                    exactUsedByEdu,
                };
            }
        });
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
