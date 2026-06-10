import { NOTICE_PERIOD_MONTHS } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { MAX_AGE, SKILL } from '../population/population';
import type { WorkforceCategory, WorkforceCohort } from './workforce';
import { nullWorkforceCategory } from './workforce';

const mergeCategories = (destination: WorkforceCategory, source: WorkforceCategory): void => {
    destination.active += source.active;
    source.active = 0;

    destination.workforceExperience += source.workforceExperience;
    source.workforceExperience = 0;

    for (const type of ['voluntaryDeparting', 'departingFired', 'departingRetired'] as const) {
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            destination[type][m] = (destination[type][m] || 0) + (source[type][m] || 0);
            source[type][m] = 0;
        }
    }

    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
        destination.onboarding[m] = (destination.onboarding[m] || 0) + (source.onboarding[m] || 0);
        source.onboarding[m] = 0;
    }
};

const zeroCohort = (cohort: WorkforceCohort<WorkforceCategory>): void => {
    for (const edu of educationLevelKeys) {
        for (const skill of SKILL) {
            const cat = cohort[edu][skill];
            cat.active = 0;
            cat.workforceExperience = 0;
            for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                cat.voluntaryDeparting[m] = 0;
                cat.departingFired[m] = 0;
                cat.departingRetired[m] = 0;
                cat.onboarding[m] = 0;
            }
        }
    }
};

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
                dst.onboarding[m] = src.onboarding[m] ?? 0;
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

        const maxAgeSnapshot = cloneCohort(workforce[MAX_AGE]);

        for (let age = MAX_AGE; age > 0; age--) {
            const src = workforce[age - 1];
            const dst = workforce[age];
            if (!src || !dst) {
                continue;
            }

            zeroCohort(dst);

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

        zeroCohort(workforce[0]);
    }
}
