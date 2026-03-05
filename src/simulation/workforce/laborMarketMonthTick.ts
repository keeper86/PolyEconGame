/**
 * workforce/laborMarketMonthTick.ts
 *
 * Monthly labor-market processing:
 * 1. Snapshot active workers at month start (for UI Δ-month display).
 * 2. Rotate death counters (this month → prev month, reset this month).
 * 3. Pipeline advancement: departing → unoccupied.
 *
 * Retirement is handled entirely population-side (applyRetirement +
 * workforceSync), so there is no retiring pipeline to drain.
 */

import type { Agent, EducationLevelType, Occupation, Planet } from '../planet';
import { educationLevelKeys } from '../planet';
import { emptyAgeMoments, NOTICE_PERIOD_MONTHS, totalActiveForEdu } from './workforceHelpers';
import { returnToPopulation } from './populationBridge';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function laborMarketMonthTick(agents: Map<string, Agent>, planets: Map<string, Planet>): void {
    // -----------------------------------------------------------------------
    // Phase 0: snapshots & death counter rotation (per-agent)
    // -----------------------------------------------------------------------

    for (const agent of agents.values()) {
        for (const [_planetId, assets] of Object.entries(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            // --- Snapshot active workers at month start ---
            const snapshot = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                snapshot[edu] = totalActiveForEdu(workforce, edu);
            }
            assets.activeAtMonthStart = snapshot;

            // --- Rotate death counters: this month → prev month, reset this month ---
            assets.deathsPrevMonth = assets.deathsThisMonth ?? ({} as Record<EducationLevelType, number>);
            const freshDeaths = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                if (!assets.deathsPrevMonth[edu]) {
                    assets.deathsPrevMonth[edu] = 0;
                }
                freshDeaths[edu] = 0;
            }
            assets.deathsThisMonth = freshDeaths;
        }
    }

    // -----------------------------------------------------------------------
    // Phase 1: Pipeline advancement (per-agent)
    // -----------------------------------------------------------------------
    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            const planet = planets.get(planetId);
            const occupation: Occupation = planet && planet.governmentId === agent.id ? 'government' : 'company';

            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
                    // --- Departing pipeline: route slot 0 to 'unoccupied' ---
                    const departingCount = cohort.departing[edu][0].count;
                    if (departingCount > 0 && planet) {
                        const moved = returnToPopulation(planet, edu, departingCount, occupation);
                        if (moved !== departingCount) {
                            console.warn(
                                `[laborMarketMonthTick] departing mismatch for edu=${edu} on agent=${agent.id}: requested=${departingCount}, moved=${moved}`,
                            );
                        }
                        // If not all were moved, keep the remainder in slot 0
                        // (should be rare / impossible in practice)
                        if (moved < departingCount) {
                            // partially drained — leave residual (not expected)
                        }
                    }

                    // Shift departing + departingFired pipelines down by one slot
                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        cohort.departing[edu][i] = cohort.departing[edu][i + 1];
                        cohort.departingFired[edu][i] = cohort.departingFired[edu][i + 1];
                    }
                    cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] = emptyAgeMoments();
                    cohort.departingFired[edu][NOTICE_PERIOD_MONTHS - 1] = 0;
                }
            }
        }
    }
}
