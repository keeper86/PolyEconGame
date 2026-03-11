import { NOTICE_PERIOD_MONTHS } from '../constants';
import type { Agent } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { MAX_AGE, SKILL } from '../population/population';
import type { WorkforceCategory } from './workforce';

const mergeCategories = (destination: WorkforceCategory, source: WorkforceCategory): void => {
    // Merge active
    if (source.active > 0) {
        destination.active += source.active;
        source.active = 0;
    }

    for (const type of ['voluntaryDeparting', 'departingFired', 'departingRetired'] as const) {
        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
            if (source[type][m]) {
                destination[type][m] = (destination[type][m] || 0) + source[type][m];
                source[type][m] = 0;
            }
        }
    }
};

export function workforceAdvanceYearTick(agents: Map<string, Agent>): void {
    for (const agent of agents.values()) {
        for (const assets of Object.values(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            // Shift from highest age down to avoid double-counting.
            // Workers at maxAge are dropped (overflow — should be rare
            // since retirement/mortality should have removed them).
            for (let age = MAX_AGE; age > 0; age--) {
                const src = workforce[age - 1];
                const dst = workforce[age];
                if (!src || !dst) {
                    continue;
                }
                for (const edu of educationLevelKeys) {
                    for (const skill of SKILL) {
                        mergeCategories(dst[edu][skill], src[edu][skill]);
                    }
                }
            }
        }
    }
}
