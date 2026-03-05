/**
 * workforce/laborMarketMonthTick.ts
 *
 * Monthly labor-market processing:
 * 1. Snapshot active workers at month start (for UI Δ-month display).
 * 2. Rotate death counters (this month → prev month, reset this month).
 * 3. Pipeline advancement: departing → unoccupied.
 * 4. Retiring pipeline drain: any workers still in the legacy retiring
 *    pipeline are returned to active (retirement is now handled
 *    population-side by applyRetirement + workforceSync).
 */

import type { Agent, EducationLevelType, Occupation, Planet } from '../planet';
import { educationLevelKeys } from '../planet';
import { NOTICE_PERIOD_MONTHS, totalActiveForEdu } from './workforceHelpers';
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
                    // --- Departing pipeline: route to 'unoccupied' ---
                    const departing = cohort.departing[edu][0];
                    if (departing > 0 && planet) {
                        const moved = returnToPopulation(
                            planet,
                            edu,
                            departing,
                            occupation,
                            cohort.departingWealth[edu][0],
                        );
                        if (moved !== departing) {
                            console.warn(
                                `[laborMarketMonthTick] departing mismatch for edu=${edu} on agent=${agent.id}: requested=${departing}, moved=${moved}`,
                            );
                        }
                        cohort.departing[edu][0] = Math.max(0, cohort.departing[edu][0] - moved);
                    }

                    // Shift departing + departingFired pipelines down
                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        cohort.departing[edu][i] = cohort.departing[edu][i + 1];
                        cohort.departingFired[edu][i] = cohort.departingFired[edu][i + 1];
                        cohort.departingWealth[edu][i] = cohort.departingWealth[edu][i + 1];
                    }
                    cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] = 0;
                    cohort.departingFired[edu][NOTICE_PERIOD_MONTHS - 1] = 0;
                    cohort.departingWealth[edu][NOTICE_PERIOD_MONTHS - 1] = { mean: 0, variance: 0 };

                    // --- Retiring pipeline drain (legacy compatibility) ---
                    // Retirement is now handled population-side (applyRetirement
                    // + workforceSync).  Any workers still in the retiring
                    // pipeline from older save-games are returned to active.
                    const retirees = cohort.retiring[edu][0];
                    if (retirees > 0) {
                        cohort.active[edu] += retirees;
                        cohort.retiring[edu][0] = 0;
                    }

                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        cohort.retiring[edu][i] = cohort.retiring[edu][i + 1];
                        cohort.retiringWealth[edu][i] = cohort.retiringWealth[edu][i + 1];
                    }
                    cohort.retiring[edu][NOTICE_PERIOD_MONTHS - 1] = 0;
                    cohort.retiringWealth[edu][NOTICE_PERIOD_MONTHS - 1] = { mean: 0, variance: 0 };
                }
            }
        }
    }
}
