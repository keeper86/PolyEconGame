import { extractFromClaimedResource, queryClaimedResource } from './entities';
import { putIntoStorageFacility, queryStorageFacility, removeFromStorageFacility } from './facilities';
import type { EducationLevelType, GameState } from './planet';
import { educationLevelKeys } from './planet';
import {
    ageProductivityMultiplier,
    DEFAULT_HIRE_AGE_MEAN,
    DEPARTING_EFFICIENCY,
    experienceMultiplier,
    totalActiveForEdu,
    totalDepartingForEdu,
} from './workforce/workforceHelpers';
import { stochasticRound } from './utils/stochasticRound';

export function productionTick(gameState: GameState) {
    gameState.agents.forEach((agent) => {
        gameState.planets.forEach((planet) => {
            const assets = agent.assets[planet.id];

            if (!assets) {
                return; // this agent has no assets on this planet, skip
            }

            // Build remaining worker pool from actual workforce demography
            // (how many are really hired), not from allocatedWorkers (the target).
            // Departing workers (in their notice period) still contribute but at
            // DEPARTING_EFFICIENCY (50%).
            const remainingWorker = {} as Record<EducationLevelType, number>;
            const workforce = assets.workforceDemography;
            for (const edu of educationLevelKeys) {
                const active = workforce ? totalActiveForEdu(workforce, edu) : 0;
                const departing = workforce ? totalDepartingForEdu(workforce, edu) : 0;
                remainingWorker[edu] = active + stochasticRound(departing * DEPARTING_EFFICIENCY);
            }

            // Compute age-dependent productivity multiplier per education level,
            // weighted by the number of active workers in each tenure cohort.
            const workerAgeProductivity = {} as Record<EducationLevelType, number>;
            // Compute tenure (experience) productivity multiplier per education
            // level, weighted by active workers per tenure year.
            const workerTenureProductivity = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                let totalCount = 0;
                let weightedAgeMean = 0;
                let weightedTenureExp = 0;
                if (workforce) {
                    for (let year = 0; year < workforce.length; year++) {
                        const cohort = workforce[year];
                        const count = cohort.active[edu];
                        if (count > 0) {
                            weightedAgeMean += count * cohort.ageMoments[edu].mean;
                            weightedTenureExp += count * experienceMultiplier(year);
                            totalCount += count;
                        }
                    }
                }
                const overallMean = totalCount > 0 ? weightedAgeMean / totalCount : DEFAULT_HIRE_AGE_MEAN;
                workerAgeProductivity[edu] = ageProductivityMultiplier(overallMean);
                workerTenureProductivity[edu] = totalCount > 0 ? weightedTenureExp / totalCount : 1.0;
            }
            assets.productionFacilities.forEach((facility) => {
                // --- Two-pass worker allocation ---
                //
                // Pass 1 (exact match): each education slot takes only workers
                //         of exactly that level.  This guarantees that a
                //         "primary" slot gets its primary workers before "none"
                //         can cascade-steal them.
                //
                // Pass 2 (cascade):     any remaining shortfall per slot walks
                //         *upward* through higher education levels, drawing
                //         overqualified workers from whatever is still in the
                //         pool after pass 1.
                //
                // Worker requirements scale with the facility just like resource
                // needs (e.g. workerRequirement.none=60, scale=20000 → 1,200,000).

                const workerAllocation: Record<
                    EducationLevelType,
                    {
                        total: number;
                        overqualified: number;
                        efficiency: number;
                        /** Per-workerEdu breakdown of how many bodies were taken for this jobEdu slot. */
                        takenByEdu: Partial<Record<EducationLevelType, number>>;
                    }
                > = {
                    none: { total: 0, overqualified: 0, efficiency: 1, takenByEdu: {} },
                    primary: { total: 0, overqualified: 0, efficiency: 1, takenByEdu: {} },
                    secondary: { total: 0, overqualified: 0, efficiency: 1, takenByEdu: {} },
                    tertiary: { total: 0, overqualified: 0, efficiency: 1, takenByEdu: {} },
                    quaternary: { total: 0, overqualified: 0, efficiency: 1, takenByEdu: {} },
                };

                // Collect scaled requirements for slots that actually need workers.
                const activeSlots: { jobEdu: EducationLevelType; jobEduIdx: number; effectiveTarget: number }[] = [];
                for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                    if (!req || req <= 0) {
                        continue;
                    }
                    const jobEdu = eduLevel as EducationLevelType;
                    activeSlots.push({
                        jobEdu,
                        jobEduIdx: educationLevelKeys.indexOf(jobEdu),
                        effectiveTarget: req * facility.scale,
                    });
                }

                // Per-slot accumulators surviving across both passes.
                const slotFilled = new Map<
                    EducationLevelType,
                    {
                        effectiveFilled: number;
                        totalFilled: number;
                        overqualified: number;
                        takenByEdu: Partial<Record<EducationLevelType, number>>;
                    }
                >();
                for (const s of activeSlots) {
                    slotFilled.set(s.jobEdu, { effectiveFilled: 0, totalFilled: 0, overqualified: 0, takenByEdu: {} });
                }

                // --- Pre-compute resource availability so worker allocation can
                // scale down when inputs are missing. This prevents allocating
                // workers as if resources were available at 100% when they are
                // actually scarce.
                const resourceEfficiencyMap: Record<string, number> = {};
                const resourceEfficiencies = facility.needs.map((need) => {
                    const requiredAmount = need.quantity * facility.scale;

                    if (need.resource.type === 'landBoundResource') {
                        const total = queryClaimedResource(planet, agent, need.resource);
                        const eff = Math.min(1, total / requiredAmount);
                        resourceEfficiencyMap[need.resource.name] = eff;
                        return eff;
                    }

                    const available = queryStorageFacility(assets.storageFacility, need.resource.name);
                    const eff = Math.min(1, available / requiredAmount);
                    resourceEfficiencyMap[need.resource.name] = eff;
                    return eff;
                });

                // If there are no needs then resource efficiency is effectively 1.
                const resourceEfficiencyScalar =
                    resourceEfficiencies.length > 0 ? Math.min(...resourceEfficiencies) : 1;

                // ── Pass 1: exact-match only ──────────────────────────────
                for (const { jobEdu, effectiveTarget } of activeSlots) {
                    const acc = slotFilled.get(jobEdu)!;
                    const ageProd = workerAgeProductivity[jobEdu];
                    const tenureProd = workerTenureProductivity[jobEdu];
                    const combinedProd = ageProd * tenureProd;
                    const available = remainingWorker[jobEdu] || 0;
                    // Note: scale the effective target down according to resource availability
                    // so we don't allocate workers for production that can't happen.
                    const scaledEffectiveTarget = effectiveTarget * resourceEfficiencyScalar;
                    const effectiveGapScaled = scaledEffectiveTarget - acc.effectiveFilled;
                    const bodiesNeeded =
                        combinedProd > 0 ? Math.ceil(Math.max(0, effectiveGapScaled) / combinedProd) : available;
                    const take = Math.min(bodiesNeeded, available);
                    if (take > 0) {
                        remainingWorker[jobEdu] -= bodiesNeeded;
                        acc.totalFilled += take;
                        acc.effectiveFilled += take * combinedProd;
                        acc.takenByEdu[jobEdu] = (acc.takenByEdu[jobEdu] ?? 0) + take;
                    }
                }

                // ── Pass 2: cascade remaining shortfalls upward ───────────
                for (const { jobEdu, jobEduIdx, effectiveTarget } of activeSlots) {
                    const acc = slotFilled.get(jobEdu)!;
                    const scaledEffectiveTarget = effectiveTarget * resourceEfficiencyScalar;
                    if (acc.effectiveFilled >= scaledEffectiveTarget) {
                        continue; // already satisfied in pass 1 (scaled by resource availability)
                    }
                    // Start one level above the exact match (already consumed in pass 1)
                    for (
                        let i = jobEduIdx + 1;
                        i < educationLevelKeys.length && acc.effectiveFilled < scaledEffectiveTarget;
                        i++
                    ) {
                        const candidateEdu = educationLevelKeys[i];
                        const ageProd = workerAgeProductivity[candidateEdu];
                        const tenureProd = workerTenureProductivity[candidateEdu];
                        const combinedProd = ageProd * tenureProd;
                        const available = remainingWorker[candidateEdu] || 0;
                        const effectiveGap = scaledEffectiveTarget - acc.effectiveFilled;
                        const bodiesNeeded =
                            combinedProd > 0 ? Math.ceil(Math.max(0, effectiveGap) / combinedProd) : available;
                        const take = Math.min(bodiesNeeded, available);
                        if (take > 0) {
                            remainingWorker[candidateEdu] -= bodiesNeeded;
                            acc.totalFilled += take;
                            acc.effectiveFilled += take * combinedProd;
                            acc.overqualified += take;
                            acc.takenByEdu[candidateEdu] = (acc.takenByEdu[candidateEdu] ?? 0) + take;
                        }
                    }
                }

                // ── Finalize workerAllocation & efficiency ────────────────
                let reducedEfficiencyDueToWorkers = 1;
                for (const { jobEdu, effectiveTarget } of activeSlots) {
                    const acc = slotFilled.get(jobEdu)!;
                    const levelEff = Math.min(1, acc.effectiveFilled / effectiveTarget);
                    workerAllocation[jobEdu] = {
                        total: acc.totalFilled,
                        overqualified: acc.overqualified,
                        efficiency: levelEff,
                        takenByEdu: acc.takenByEdu,
                    };
                    reducedEfficiencyDueToWorkers = Math.min(reducedEfficiencyDueToWorkers, levelEff);
                }

                // resourceEfficiencyMap and resourceEfficiencies were computed earlier
                const overallEfficiency = Math.min(reducedEfficiencyDueToWorkers, ...resourceEfficiencies);
                facility.lastTickEfficiencyInPercent = Math.round(overallEfficiency * 100);

                // Build per-edu worker efficiency map (effective fill rate including
                // age-productivity compensation – the facility over-draws bodies so
                // that efficiency stays 1.0 when enough workers are available).
                const workerEfficiencyMap: { [edu in EducationLevelType]?: number } = {};
                for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                    if (!req || req <= 0) {
                        continue;
                    }
                    const jobEdu = eduLevel as EducationLevelType;
                    workerEfficiencyMap[jobEdu] = workerAllocation[jobEdu].efficiency;
                }

                // Record overqualified worker usage as a matrix: jobEdu → workerEdu → count
                type OverqualifiedMatrix = {
                    [jobEdu in EducationLevelType]?: { [workerEdu in EducationLevelType]?: number };
                };
                const overqualifiedMatrix: OverqualifiedMatrix = {};
                const overqualifiedFlat: { [edu in EducationLevelType]?: number } = {};
                for (const edu of educationLevelKeys) {
                    const alloc = workerAllocation[edu];
                    if (alloc.overqualified > 0) {
                        overqualifiedFlat[edu] = alloc.overqualified;
                        // Build per-workerEdu breakdown (only entries where workerEdu > jobEdu)
                        const jobIdx = educationLevelKeys.indexOf(edu);
                        const breakdown: { [workerEdu in EducationLevelType]?: number } = {};
                        for (const [workerEdu, count] of Object.entries(alloc.takenByEdu)) {
                            const wEdu = workerEdu as EducationLevelType;
                            if (educationLevelKeys.indexOf(wEdu) > jobIdx && count && count > 0) {
                                breakdown[wEdu] = count;
                            }
                        }
                        if (Object.keys(breakdown).length > 0) {
                            overqualifiedMatrix[edu] = breakdown;
                        }
                    }
                }
                facility.lastTickOverqualifiedWorkers =
                    Object.keys(overqualifiedFlat).length > 0 ? overqualifiedFlat : undefined;

                // Populate detailed lastTickResults
                facility.lastTickResults = {
                    overallEfficiency,
                    workerEfficiency: workerEfficiencyMap,
                    workerEfficiencyOverall: reducedEfficiencyDueToWorkers,
                    resourceEfficiency: resourceEfficiencyMap,
                    overqualifiedWorkers: overqualifiedMatrix,
                };

                if (overallEfficiency <= 0) {
                    return; // facility cannot operate, skip
                }

                planet.environment.pollution.air += facility.pollutionPerTick.air * facility.scale * overallEfficiency;
                planet.environment.pollution.water +=
                    facility.pollutionPerTick.water * facility.scale * overallEfficiency;
                planet.environment.pollution.soil +=
                    facility.pollutionPerTick.soil * facility.scale * overallEfficiency;

                // Produce outputs scaled by overall efficiency
                facility.produces.forEach((output) => {
                    const producedAmount = stochasticRound(output.quantity * facility.scale * overallEfficiency);
                    if (producedAmount <= 0) {
                        return; // nothing produced, skip
                    }
                    putIntoStorageFacility(assets.storageFacility, output.resource, producedAmount);
                });

                // Consume inputs scaled by overall efficiency. For land-bound resources we
                // remove from the planet's resource claim (only if this agent is the tenant).
                facility.needs.forEach((need) => {
                    const consumedAmount = Math.ceil(need.quantity * facility.scale * overallEfficiency);

                    if (need.resource.type === 'landBoundResource') {
                        const extractedAmount = extractFromClaimedResource(
                            planet,
                            agent,
                            need.resource,
                            consumedAmount,
                        );
                        if (extractedAmount < consumedAmount) {
                            console.warn(
                                `Unexpected: extracted ${extractedAmount} from land-bound resource ${need.resource.name} but expected to consume ${consumedAmount}. This should not happen since efficiency is scaled based on available quantity.`,
                                {
                                    planetId: planet.id,
                                    agentId: agent.id,
                                    facilityId: facility.id,
                                    needResource: need.resource.name,
                                },
                            );
                        }
                    } else {
                        const removedAmount = removeFromStorageFacility(
                            assets.storageFacility,
                            need.resource.name,
                            consumedAmount,
                        );
                        if (removedAmount < consumedAmount) {
                            console.warn(
                                `Unexpected: removed ${removedAmount} from storage for resource ${need.resource.name} but expected to consume ${consumedAmount}. This should not happen since efficiency is scaled based on available quantity.`,
                                {
                                    planetId: planet.id,
                                    agentId: agent.id,
                                    facilityId: facility.id,
                                    needResource: need.resource.name,
                                },
                            );
                        }
                    }
                });
            });

            // Persist idle-worker statistics so that updateAllocatedWorkers
            // (next tick) can reduce hiring targets when too many workers
            // sit unused.  totalHired includes departing workers at reduced
            // efficiency, consistent with how remainingWorker was built.
            const totalHired = educationLevelKeys.reduce((sum, edu) => {
                const active = workforce ? totalActiveForEdu(workforce, edu) : 0;
                const departing = workforce ? totalDepartingForEdu(workforce, edu) : 0;
                return sum + active + stochasticRound(departing * DEPARTING_EFFICIENCY);
            }, 0);
            const totalUnused = educationLevelKeys.reduce((sum, edu) => sum + (remainingWorker[edu] || 0), 0);
            assets.unusedWorkers = { ...remainingWorker } as Record<EducationLevelType, number>;
            assets.unusedWorkerFraction = totalHired > 0 ? totalUnused / totalHired : 0;

            // Aggregate overqualified matrix across all facilities on this planet
            type OQMatrix = { [jobEdu in EducationLevelType]?: { [workerEdu in EducationLevelType]?: number } };
            const aggMatrix: OQMatrix = {};
            for (const facility of assets.productionFacilities) {
                const fm = facility.lastTickResults?.overqualifiedWorkers;
                if (!fm) {
                    continue;
                }
                for (const [jobEdu, breakdown] of Object.entries(fm)) {
                    const je = jobEdu as EducationLevelType;
                    if (!breakdown) {
                        continue;
                    }
                    if (!aggMatrix[je]) {
                        aggMatrix[je] = {};
                    }
                    for (const [workerEdu, count] of Object.entries(breakdown)) {
                        const we = workerEdu as EducationLevelType;
                        aggMatrix[je]![we] = (aggMatrix[je]![we] ?? 0) + (count ?? 0);
                    }
                }
            }
            assets.overqualifiedMatrix = Object.keys(aggMatrix).length > 0 ? aggMatrix : undefined;
        });
    });
}
