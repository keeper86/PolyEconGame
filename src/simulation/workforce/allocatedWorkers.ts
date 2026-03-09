/**
 * workforce/allocatedWorkers.ts
 *
 * Feedback-based hiring-target computation.
 *
 * `updateAllocatedWorkers` recomputes the hiring targets for every agent on
 * every planet. After the first tick, the production system stores per-education
 * `unusedWorkers` counts.  This function derives how many workers were actually
 * consumed by production facilities and sets `allocatedWorkers` accordingly,
 * cascading unmet demand upward through the education hierarchy.
 */

import type { Agent, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { ACCEPTABLE_IDLE_FRACTION, DEPARTING_EFFICIENCY } from './laborMarketTick';
import { totalUnoccupiedForEdu } from './populationBridge';
import { totalActiveForEdu, totalDepartingForEdu, totalDepartingFiredForEdu } from './workforceAggregates';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * updateAllocatedWorkers — recomputes the hiring targets for every agent
 * on every planet using a **feedback-based** approach.
 *
 * After the first tick, the production system stores per-education
 * `unusedWorkers` counts (which can be negative when demand exceeds supply).
 * This function uses those values to derive how many workers were actually
 * consumed by production facilities:
 *
 *   consumed[edu] = currentPool[edu] − unusedWorkers[edu]
 *
 * where `currentPool` is the effective hired workforce, computed as:
 *
 *   currentPool = active
 *               + floor(voluntaryDeparting × DEPARTING_EFFICIENCY)
 *
 * Only voluntary quitters (departing minus departingFired) contribute at
 * reduced efficiency.  Fired workers are excluded
 * entirely because they are already committed to leaving the workforce.
 * Without this correction the pool would be inflated by soon-to-leave
 * workers, causing the hiring target to overshoot the intended 5 % buffer.
 *
 * A negative `unusedWorkers` value means facilities needed *more* workers
 * than were available, so `consumed` exceeds the pool.
 *
 * **Overqualified-worker correction:**  The production cascade allows
 * higher-educated workers to fill lower-level slots.  The aggregated
 * `overqualifiedMatrix[jobEdu][workerEdu]` tells how many `workerEdu`
 * workers were used for `jobEdu` slots.  This function redistributes
 * that consumption back to the *job* level: it subtracts the count from
 * `workerEdu`'s consumed tally and adds it to `jobEdu`'s.  This ensures
 * the hiring system targets the education level the facilities actually
 * need, rather than perpetually chasing the higher-educated substitutes.
 *
 * **Facility-based floor:**  When the feedback-derived target for an
 * education level drops to zero but facilities still declare non-zero
 * `workerRequirement` for that level, the system falls back to the raw
 * facility requirement (workerRequirement × scale × buffer).  This
 * prevents a dead-lock where a cascade shock fires all workers of an
 * education level, consumed drops to 0, and the system never requests
 * new hires.  When feedback is positive it remains fully in control,
 * allowing the system to rightfully lower targets below the raw facility
 * requirement (e.g. due to age-productivity gains).
 *
 * The hiring target is therefore:
 *   - feedback > 0:  ceil(consumed × 1.05)
 *   - feedback = 0 but facilities need workers:  ceil(facilityFloor × 1.05)
 *   - otherwise: 0
 *
 * On the very first tick (no `unusedWorkers` data yet), the function falls
 * back to summing `workerRequirement × scale` from all facilities with the
 * same 5 % buffer.
 *
 * After computing raw targets, unmet demand is cascaded upward through higher
 * education levels (mirroring the cascade in `productionTick`).
 *
 * Call this once per tick **before** `preProductionLaborMarketTick` so that the hiring
 * logic always chases up-to-date requirements.
 */
export function updateAllocatedWorkers(agents: Map<string, Agent>, planets: Map<string, Planet>): void {
    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
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
            const planet = planets.get(planetId);
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
                assets.allocatedWorkers[lastEdu] += overflow;
            }
        }
    }
}
