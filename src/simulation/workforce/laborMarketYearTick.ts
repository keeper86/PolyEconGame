/**
 * workforce/laborMarketYearTick.ts
 *
 * Annual labor-market processing:
 * Advances tenure by one year for all active workers and their departing
 * pipeline, shifting every cohort from year N-1 into year N.
 * Active AgeMoments are aged by +1 year and merged during the shift.
 *
 * Retirement is handled population-side (applyRetirement + workforceSync).
 */

import type { Agent } from '../planet';
import { educationLevelKeys } from '../planet';
import {
    emptyAgeMoments,
    MAX_TENURE_YEARS,
    NOTICE_PERIOD_MONTHS,
    mergeAgeMoments,
    ageAgeMomentsByOneYear,
} from './workforceHelpers';

export function laborMarketYearTick(agents: Map<string, Agent>): void {
    for (const agent of agents.values()) {
        for (const assets of Object.values(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }
            // Shift from highest tenure down to avoid double-counting.
            for (let year = MAX_TENURE_YEARS; year > 0; year--) {
                const src = workforce[year - 1];
                const dst = workforce[year];
                for (const edu of educationLevelKeys) {
                    const srcMoments = src.active[edu];
                    const dstMoments = dst.active[edu];

                    if (srcMoments.count > 0 && dstMoments.count > 0) {
                        // Both cohorts have workers — age both +1 year, then merge.
                        dst.active[edu] = mergeAgeMoments(
                            ageAgeMomentsByOneYear(dstMoments),
                            ageAgeMomentsByOneYear(srcMoments),
                        );
                    } else if (srcMoments.count > 0) {
                        dst.active[edu] = ageAgeMomentsByOneYear(srcMoments);
                    } else if (dstMoments.count > 0) {
                        dst.active[edu] = ageAgeMomentsByOneYear(dstMoments);
                    }
                    // else both empty — leave dst as-is (already empty)

                    // Clear src active
                    src.active[edu] = emptyAgeMoments();

                    // Shift departing + departingFired pipelines
                    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                        const srcDep = src.departing[edu][m];
                        if (srcDep.count > 0) {
                            dst.departing[edu][m] = mergeAgeMoments(dst.departing[edu][m], srcDep);
                            src.departing[edu][m] = emptyAgeMoments();
                        }
                        dst.departingFired[edu][m] += src.departingFired[edu][m];
                        src.departingFired[edu][m] = 0;
                    }
                }
            }
        }
    }
}
