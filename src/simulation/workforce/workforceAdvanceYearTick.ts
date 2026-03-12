import { NOTICE_PERIOD_MONTHS } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { MAX_AGE, SKILL } from '../population/population';
import type { WorkforceCategory, WorkforceCohort } from './workforce';
import { nullWorkforceCategory } from './workforce';

/**
 * Move all counts from `source` into `destination` (in-place add), then
 * zero out `source`.  The destination is assumed to already be zeroed by the
 * caller.
 */
const mergeCategories = (destination: WorkforceCategory, source: WorkforceCategory): void => {
    destination.active += source.active;
    source.active = 0;

    for (const type of ['voluntaryDeparting', 'departingFired', 'departingRetired'] as const) {
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            destination[type][m] = (destination[type][m] || 0) + (source[type][m] || 0);
            source[type][m] = 0;
        }
    }
};

/**
 * Zero every leaf WorkforceCategory in a cohort in-place (no allocation).
 */
const zeroCohort = (cohort: WorkforceCohort<WorkforceCategory>): void => {
    for (const edu of educationLevelKeys) {
        for (const skill of SKILL) {
            const cat = cohort[edu][skill];
            cat.active = 0;
            for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                cat.voluntaryDeparting[m] = 0;
                cat.departingFired[m] = 0;
                cat.departingRetired[m] = 0;
            }
        }
    }
};

/**
 * Deep-clone a workforce cohort (allocates new WorkforceCategory objects).
 */
const cloneCohort = (cohort: WorkforceCohort<WorkforceCategory>): WorkforceCohort<WorkforceCategory> => {
    const out = {} as WorkforceCohort<WorkforceCategory>;
    for (const edu of educationLevelKeys) {
        out[edu] = {} as (typeof out)[typeof edu];
        for (const skill of SKILL) {
            const src = cohort[edu][skill];
            const dst = nullWorkforceCategory();
            dst.active = src.active;
            for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                dst.voluntaryDeparting[m] = src.voluntaryDeparting[m] ?? 0;
                dst.departingFired[m] = src.departingFired[m] ?? 0;
                dst.departingRetired[m] = src.departingRetired[m] ?? 0;
            }
            out[edu][skill] = dst;
        }
    }
    return out;
};

export function workforceAdvanceYearTick(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        const workforce = assets.workforceDemography;
        if (!workforce) {
            continue;
        }

        // Workers at MAX_AGE carry forward (they remain at MAX_AGE until they
        // die or retire).  We snapshot them before the loop so that the
        // zero-reset of workforce[MAX_AGE] inside the loop does not lose them.
        const maxAgeSnapshot = cloneCohort(workforce[MAX_AGE]);

        // Descending shift: workforce[age-1] → workforce[age].
        // Processing descending means the destination slot (age) has already
        // been promoted to age+1 in a previous iteration, so zero-resetting
        // it before writing is safe and prevents double-counting.
        for (let age = MAX_AGE; age > 0; age--) {
            const src = workforce[age - 1];
            const dst = workforce[age];
            if (!src || !dst) {
                continue;
            }
            // Zero-reset the destination before writing (mirrors populationAdvanceYear).
            zeroCohort(dst);
            // Re-merge MAX_AGE carry-forward workers when writing into slot MAX_AGE.
            if (age === MAX_AGE) {
                for (const edu of educationLevelKeys) {
                    for (const skill of SKILL) {
                        mergeCategories(dst[edu][skill], maxAgeSnapshot[edu][skill]);
                    }
                }
            }
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    mergeCategories(dst[edu][skill], src[edu][skill]);
                }
            }
        }
        // workforce[0] is already zeroed — mergeCategories zeroed it when it
        // was the source in the age=1 iteration.  Explicitly zero it anyway
        // to mirror populationAdvanceYear and guard against edge cases
        // (e.g. when workforce.length === 1).
        zeroCohort(workforce[0]);
    }
}
