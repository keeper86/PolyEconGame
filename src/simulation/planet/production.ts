import { SERVICE_DEPRECIATION_RATE_PER_TICK, TICKS_PER_MONTH } from '../constants';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { extractFromClaimedResource, queryClaimedResource } from '../utils/entities';
import { stochasticRound } from '../utils/stochasticRound';
import type { WorkforceCategory, WorkforceCohort } from '../workforce/workforce';
import { totalActiveForEdu, totalDepartingForEdu } from '../workforce/workforceAggregates';
import type { Agent, Planet } from './planet';
import { ALL_SERVICE_RESOURCE_TYPE_NAMES } from './services';
import { putIntoStorageFacility, queryStorageFacility, removeFromStorageFacility } from './storage';
import type { WorkerSlot } from './waterFill';
import { waterFill } from './waterFill';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

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

    // services decay very fast and aggressive. This is for two reasons:
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

        // Resource efficiency is facility-local. Pre-compute it so the slot
        // capacities fed into waterFill already reflect resource constraints.
        //
        // For stored resources shared by multiple facilities we must allocate
        // the available stock proportionally; otherwise the first facility to
        // run in the production loop would deplete storage and leave later
        // facilities with nothing despite their efficiency being computed from
        // the full pre-consumption stock.
        type FacilityMeta = { resourceEfficiencyScalar: number; resourceEfficiencyMap: Record<string, number> };

        const totalStorageDemand = new Map<string, number>();
        for (const facility of assets.productionFacilities) {
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

        const facilityMeta: FacilityMeta[] = assets.productionFacilities.map((facility) => {
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

        // Build one flat list of WorkerSlots across all facilities
        const allSlots: WorkerSlot[] = [];
        const effectiveDemandBySlot = new Map<WorkerSlot, number>();
        for (let facilityIndex = 0; facilityIndex < assets.productionFacilities.length; facilityIndex++) {
            const facility = assets.productionFacilities[facilityIndex];
            const { resourceEfficiencyScalar } = facilityMeta[facilityIndex];
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
                    facilityIdx: facilityIndex,
                    jobEdu,
                    jobEduIdx,
                    capacity: Math.max(1, bodies),
                    assigned: 0,
                    effectiveAssigned: 0,
                    assignedByEdu: {},
                    overqualifiedCount: 0,
                };
                allSlots.push(slot);
                // effective demand = req × scale (resource efficiency already baked into capacity)
                effectiveDemandBySlot.set(slot, req * facility.scale);
            }
        }

        const { byFacility } = waterFill(allSlots, workerPool, ageProd, effectiveDemandBySlot);

        // we calculated resource constraints with last round services. We now empty service storage
        // This makes services un-storable but allows producing services and using them next ticks production.
        depreciateServicesStorage(agent, planet);

        assets.productionFacilities.forEach((facility, fi) => {
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

            // Track actual absolute consumption/production
            const actualConsumed: Record<string, number> = {};
            const actualProduced: Record<string, number> = {};

            if (overallEfficiency > 0) {
                planet.environment.pollution.air += facility.pollutionPerTick.air * facility.scale * overallEfficiency;
                planet.environment.pollution.water +=
                    facility.pollutionPerTick.water * facility.scale * overallEfficiency;
                planet.environment.pollution.soil +=
                    facility.pollutionPerTick.soil * facility.scale * overallEfficiency;

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
                        // services are depreciated before, so initial requirements might not be fully met anymore, so we just trust the actual consumption from storage and report that as the "consumed" amount for services. For other resources we expect to consume exactly the calculated amount (barring minor floating-point mismatches), so we report the attempted consumption.
                        const removed = need.resource.form === 'services' ? consumed : consumeInputs;
                        actualConsumed[need.resource.name] = removed;
                        if (removed < consumed - CONSUMPTION_MISMATCH_TOLERANCE) {
                            console.warn(
                                `Unexpected: removed ${removed} of ${need.resource.name}, expected ${consumed}.`,
                                {
                                    planetId: planet.id,
                                    agentId: agent.id,
                                    facilityId: facility.id,
                                },
                            );
                        }
                    }
                });
            } else {
                // If not running, still report zeroes for all needs/produces
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

            // TODO: we know the keys of all these objects. Clean up!
            const isBootstrap = facility.avgTickResults.overallEfficiency === 0 && overallEfficiency !== 0;
            if (isBootstrap) {
                facility.avgTickResults = { ...facility.lastTickResults };
            } else {
                const alpha = 1 / TICKS_PER_MONTH;
                const avg = facility.avgTickResults;
                avg.overallEfficiency = alpha * overallEfficiency + (1 - alpha) * avg.overallEfficiency;

                for (const key of Object.keys({
                    ...workerEfficiency,
                    ...avg.workerEfficiency,
                }) as (keyof typeof workerEfficiency)[]) {
                    const cur = workerEfficiency[key] ?? 0;
                    avg.workerEfficiency[key] = alpha * cur + (1 - alpha) * (avg.workerEfficiency[key] ?? 0);
                }
                for (const key of Object.keys({ ...resourceEfficiencyMap, ...avg.resourceEfficiency })) {
                    const cur = resourceEfficiencyMap[key] ?? 0;
                    avg.resourceEfficiency[key] = alpha * cur + (1 - alpha) * (avg.resourceEfficiency[key] ?? 0);
                }
                for (const key of Object.keys({ ...actualProduced, ...avg.lastProduced })) {
                    const cur = actualProduced[key] ?? 0;
                    avg.lastProduced[key] = alpha * cur + (1 - alpha) * (avg.lastProduced[key] ?? 0);
                }
                for (const key of Object.keys({ ...actualConsumed, ...avg.lastConsumed })) {
                    const cur = actualConsumed[key] ?? 0;
                    avg.lastConsumed[key] = alpha * cur + (1 - alpha) * (avg.lastConsumed[key] ?? 0);
                }
                for (const key of Object.keys({
                    ...exactUsedByEdu,
                    ...avg.exactUsedByEdu,
                }) as (keyof typeof exactUsedByEdu)[]) {
                    const cur = exactUsedByEdu[key] ?? 0;
                    avg.exactUsedByEdu[key] = alpha * cur + (1 - alpha) * (avg.exactUsedByEdu[key] ?? 0);
                }
                for (const key of Object.keys({
                    ...totalUsedByEdu,
                    ...avg.totalUsedByEdu,
                }) as (keyof typeof totalUsedByEdu)[]) {
                    const cur = totalUsedByEdu[key] ?? 0;
                    avg.totalUsedByEdu[key] = alpha * cur + (1 - alpha) * (avg.totalUsedByEdu[key] ?? 0);
                }
                for (const jobEdu of Object.keys({
                    ...overqualifiedWorkers,
                    ...avg.overqualifiedWorkers,
                }) as (keyof typeof overqualifiedWorkers)[]) {
                    avg.overqualifiedWorkers[jobEdu] ??= {};
                    const curJob = overqualifiedWorkers[jobEdu] ?? {};
                    for (const workerEdu of Object.keys({
                        ...curJob,
                        ...avg.overqualifiedWorkers[jobEdu],
                    }) as (keyof typeof curJob)[]) {
                        const cur = curJob[workerEdu] ?? 0;
                        avg.overqualifiedWorkers[jobEdu]![workerEdu] =
                            alpha * cur + (1 - alpha) * (avg.overqualifiedWorkers[jobEdu]![workerEdu] ?? 0);
                    }
                }
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
