/**
 * workforce/workforceAggregates.ts
 *
 * Shared workforce aggregation helpers used by production, financial, and
 * labor-market subsystems.  Centralised here to avoid duplication and
 * ensure consistent aggregation logic.
 */

import type { EducationLevelType } from '../population/education';
import type { CohortByOccupation, WorkforceCategory } from '../population/population';
import { SKILL } from '../population/population';

/** Sum active workers across all ages and skill levels for a given edu. */
export function totalActiveForEdu(workforce: CohortByOccupation<WorkforceCategory>[], edu: EducationLevelType): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            total += workforce[age][edu][skill].active;
        }
    }
    return total;
}

/** Sum all departing workers across all ages, skill levels, and pipeline slots for a given edu. */
export function totalDepartingForEdu(
    workforce: CohortByOccupation<WorkforceCategory>[],
    edu: EducationLevelType,
): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            for (const d of workforce[age][edu][skill].departing) {
                total += d;
            }
        }
    }
    return total;
}

/** Sum all fired-departing workers across all ages, skill levels, and pipeline slots for a given edu. */
export function totalDepartingFiredForEdu(
    workforce: CohortByOccupation<WorkforceCategory>[],
    edu: EducationLevelType,
): number {
    let total = 0;
    for (let age = 0; age < workforce.length; age++) {
        for (const skill of SKILL) {
            const cat = workforce[age][edu][skill];
            for (const d of cat.departingFired) {
                total += d;
            }
        }
    }
    return total;
}
