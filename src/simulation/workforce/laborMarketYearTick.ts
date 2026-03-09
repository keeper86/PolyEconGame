/**
 * workforce/laborMarketYearTick.ts
 *
 * Annual labor-market processing:
 * 1. Age all workforce workers by one year: shift workers from age index `a`
 *    to `a+1` (workers at maxAge are dropped — they should have already been
 *    retired/died).
 *
 * With the new age-resolved model, tenure is no longer tracked separately —
 * the age index itself is the natural proxy.
 */

import type { Agent } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { MAX_AGE, SKILL } from '../population/population';
import { NOTICE_PERIOD_MONTHS } from './laborMarketTick';

export function laborMarketYearTick(agents: Map<string, Agent>): void {
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
                        const srcCat = src[edu][skill];
                        const dstCat = dst[edu][skill];

                        // Merge active
                        if (srcCat.active > 0) {
                            dstCat.active += srcCat.active;
                            srcCat.active = 0;
                        }

                        // Merge departing pipeline
                        for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
                            if ((srcCat.departing[m] ?? 0) > 0) {
                                dstCat.departing[m] = (dstCat.departing[m] ?? 0) + srcCat.departing[m];
                                srcCat.departing[m] = 0;
                            }
                            if ((srcCat.departingFired[m] ?? 0) > 0) {
                                dstCat.departingFired[m] = (dstCat.departingFired[m] ?? 0) + srcCat.departingFired[m];
                                srcCat.departingFired[m] = 0;
                            }
                        }
                    }
                }
            }
        }
    }
}
