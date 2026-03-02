/**
 * workforce/laborMarketYearTick.ts
 *
 * Annual labor-market processing:
 * Advances tenure by one year for all active workers and their departing
 * and retiring pipelines, shifting every cohort from year N-1 into year N.
 * Age moments are aged +1 during the shift.
 *
 * Retirement is handled monthly in `laborMarketMonthTick` to avoid a
 * single annual spike.
 */

import type { Agent } from '../planet';
import { educationLevelKeys } from '../planet';
import { DEFAULT_HIRE_AGE_MEAN, MAX_TENURE_YEARS, NOTICE_PERIOD_MONTHS } from './workforceHelpers';

export function laborMarketYearTick(agents: Agent[]): void {
    for (const agent of agents) {
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
                    const srcCount = src.active[edu];
                    const dstCount = dst.active[edu];

                    if (srcCount > 0 && dstCount > 0) {
                        // Both cohorts have workers — both age 1 year; pool into dst using the
                        // parallel-axis (pooled variance) formula to combine the two distributions.
                        const srcMeanAged = src.ageMoments[edu].mean + 1;
                        const dstMeanAged = dst.ageMoments[edu].mean + 1;
                        const totalCount = srcCount + dstCount;
                        const pooledMean = (srcCount * srcMeanAged + dstCount * dstMeanAged) / totalCount;
                        dst.ageMoments[edu] = {
                            mean: pooledMean,
                            variance:
                                (srcCount * (src.ageMoments[edu].variance + (srcMeanAged - pooledMean) ** 2) +
                                    dstCount * (dst.ageMoments[edu].variance + (dstMeanAged - pooledMean) ** 2)) /
                                totalCount,
                        };
                    } else if (srcCount > 0) {
                        dst.ageMoments[edu] = {
                            mean: src.ageMoments[edu].mean + 1,
                            variance: src.ageMoments[edu].variance,
                        };
                    } else if (dstCount > 0) {
                        dst.ageMoments[edu] = {
                            mean: dst.ageMoments[edu].mean + 1,
                            variance: dst.ageMoments[edu].variance,
                        };
                    }

                    dst.active[edu] += srcCount;
                    src.active[edu] = 0;
                    // Reset src moments to default after clearing
                    src.ageMoments[edu] = { mean: DEFAULT_HIRE_AGE_MEAN, variance: 0 };

                    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                        dst.departing[edu][m] += src.departing[edu][m];
                        src.departing[edu][m] = 0;
                        dst.departingFired[edu][m] += src.departingFired[edu][m];
                        src.departingFired[edu][m] = 0;
                        dst.retiring[edu][m] += src.retiring[edu][m];
                        src.retiring[edu][m] = 0;
                    }
                }
            }
        }
    }
}
