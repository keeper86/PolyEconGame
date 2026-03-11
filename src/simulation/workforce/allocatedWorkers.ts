import { MIN_EMPLOYABLE_AGE } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import type { Cohort, PopulationCategory, Occupation } from '../population/population';
import { SKILL } from '../population/population';
import { ACCEPTABLE_IDLE_FRACTION } from './hireWorkforce';
import { DEPARTING_EFFICIENCY } from '../planet/production';

import { totalActiveForEdu, totalDepartingFiredForEdu, totalDepartingForEdu } from './workforceAggregates';

function sumSkills(
    demography: Cohort<PopulationCategory>[],
    age: number,
    occ: Occupation,
    edu: EducationLevelType,
): number {
    let total = 0;
    for (const skill of SKILL) {
        total += demography[age][occ][edu][skill].total;
    }
    return total;
}

export function totalUnoccupiedForEdu(planet: Planet, edu: EducationLevelType): number {
    let total = 0;
    const demography = planet.population.demography;
    for (let age = MIN_EMPLOYABLE_AGE; age < demography.length; age++) {
        total += sumSkills(demography, age, 'unoccupied', edu);
    }
    return total;
}

export function updateAllocatedWorkers(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            if (planetId !== planet.id) {
                continue;
            }
            // 1. Determine per-edu requirement: feedback-based or bootstrap.
            const requirement = {} as Record<EducationLevelType, number>;

            const hasUsageData = assets.workerFeedback !== undefined;

            if (hasUsageData) {
                // Feedback path: derive consumed workers from last production tick.
                const workforce = assets.workforceDemography;
                const consumed = {} as Record<EducationLevelType, number>;
                for (const edu of educationLevelKeys) {
                    const active = workforce ? totalActiveForEdu(workforce, edu) : 0;
                    const departing = workforce ? totalDepartingForEdu(workforce, edu) : 0;
                    const departingFired = workforce ? totalDepartingFiredForEdu(workforce, edu) : 0;
                    // Only voluntary quitters contribute at reduced efficiency;
                    // fired workers are excluded from the pool.
                    // (Retiring pipeline removed — retirements handled via population sync.)
                    const voluntaryDeparting = departing - departingFired;
                    const currentPool = active + Math.floor(voluntaryDeparting * DEPARTING_EFFICIENCY);
                    const unused = assets.workerFeedback!.unusedWorkers[edu] ?? 0;
                    consumed[edu] = currentPool - unused;
                }

                // Redistribute overqualified consumption back to the job slot
                // level that actually needed those workers.
                const oq = assets.workerFeedback!.overqualifiedMatrix;
                if (oq) {
                    for (const [jobEdu, breakdown] of Object.entries(oq)) {
                        if (!breakdown) {
                            continue;
                        }
                        const je = jobEdu as EducationLevelType;
                        for (const [workerEdu, count] of Object.entries(breakdown)) {
                            if (!count || count <= 0) {
                                continue;
                            }
                            const we = workerEdu as EducationLevelType;
                            consumed[we] -= count;
                            consumed[je] += count;
                        }
                    }
                }

                // Compute a facility-based floor to prevent dead-lock
                const facilityFloor = {} as Record<EducationLevelType, number>;
                for (const edu of educationLevelKeys) {
                    facilityFloor[edu] = 0;
                }
                for (const facility of assets.productionFacilities) {
                    for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                        if (!req || req <= 0) {
                            continue;
                        }
                        const edu = eduLevel as EducationLevelType;
                        facilityFloor[edu] += Math.ceil(req * facility.scale);
                    }
                }

                for (const edu of educationLevelKeys) {
                    const feedbackTarget =
                        consumed[edu] > 0 ? Math.ceil(consumed[edu] * (1 + ACCEPTABLE_IDLE_FRACTION)) : 0;
                    if (feedbackTarget > 0) {
                        requirement[edu] = feedbackTarget;
                    } else if (facilityFloor[edu] > 0) {
                        requirement[edu] = Math.ceil(facilityFloor[edu] * (1 + ACCEPTABLE_IDLE_FRACTION));
                    } else {
                        requirement[edu] = 0;
                    }
                }
            } else {
                // Bootstrap path (first tick): use raw facility requirements.
                for (const edu of educationLevelKeys) {
                    requirement[edu] = 0;
                }
                for (const facility of assets.productionFacilities) {
                    for (const [eduLevel, req] of Object.entries(facility.workerRequirement)) {
                        if (!req || req <= 0) {
                            continue;
                        }
                        const edu = eduLevel as EducationLevelType;
                        requirement[edu] += Math.ceil(req * facility.scale);
                    }
                }
                for (const edu of educationLevelKeys) {
                    if (requirement[edu] > 0) {
                        requirement[edu] = Math.ceil(requirement[edu] * (1 + ACCEPTABLE_IDLE_FRACTION));
                    }
                }
            }

            // 2. Cascade unmet demand upward through the education hierarchy.
            for (const edu of educationLevelKeys) {
                assets.allocatedWorkers[edu] = 0;
            }

            if (!planet) {
                for (const edu of educationLevelKeys) {
                    assets.allocatedWorkers[edu] = requirement[edu];
                }
                continue;
            }

            // Walk from lowest to highest education level
            let overflow = 0;
            for (let i = 0; i < educationLevelKeys.length; i++) {
                const edu = educationLevelKeys[i];
                const demand = requirement[edu] + overflow;
                const alreadyHired = assets.workforceDemography
                    ? totalActiveForEdu(assets.workforceDemography, edu)
                    : 0;
                const unoccupied = totalUnoccupiedForEdu(planet, edu);
                const supply = alreadyHired + unoccupied;

                if (supply >= demand) {
                    assets.allocatedWorkers[edu] = demand;
                    overflow = 0;
                } else {
                    assets.allocatedWorkers[edu] = supply;
                    overflow = demand - supply;
                }
            }
            // If there's still overflow after the highest edu level, add it there
            if (overflow > 0) {
                const lastEdu = educationLevelKeys[educationLevelKeys.length - 1];
                if (!assets.allocatedWorkers[lastEdu]) {
                    assets.allocatedWorkers[lastEdu] = 0;
                }
                assets.allocatedWorkers[lastEdu] += overflow;
            }
        }
    }
}
