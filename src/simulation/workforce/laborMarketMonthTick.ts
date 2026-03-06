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

            // --- Rotate disability counters: this month → prev month, reset this month ---
            assets.disabilitiesPrevMonth = assets.disabilitiesThisMonth ?? ({} as Record<EducationLevelType, number>);
            const freshDisabilities = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                if (!assets.disabilitiesPrevMonth[edu]) {
                    assets.disabilitiesPrevMonth[edu] = 0;
                }
                freshDisabilities[edu] = 0;
            }
            assets.disabilitiesThisMonth = freshDisabilities;

            // --- Rotate retirement counters: this month → prev month, reset this month ---
            assets.retirementsPrevMonth = assets.retirementsThisMonth ?? ({} as Record<EducationLevelType, number>);
            const freshRetirements = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                if (!assets.retirementsPrevMonth[edu]) {
                    assets.retirementsPrevMonth[edu] = 0;
                }
                freshRetirements[edu] = 0;
            }
            assets.retirementsThisMonth = freshRetirements;
        }
    }

    // -----------------------------------------------------------------------
    // Phase 1: Pipeline advancement (per-agent)
    //
    // For each cohort × edu, drain departing[0] back into the population
    // (unoccupied pool) and then shift the pipeline down by one slot.
    // -----------------------------------------------------------------------
    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            const planet = planets.get(planetId);
            const occupation: Occupation = planet && planet.governmentId === agent.id ? 'government' : 'company';

            for (const edu of educationLevelKeys) {
                // Sum departing[0] across all tenure cohorts for this edu,
                // merging their compact AgeMoments so returnToPopulation can
                // Gaussian-weight the removal towards the correct age profile.
                let departingCount = 0;
                let departingSumAge = 0;
                let departingSumAgeSq = 0;
                for (const cohort of workforce) {
                    const slot = cohort.departing[edu][0];
                    departingCount += slot.count;
                    departingSumAge += slot.sumAge;
                    departingSumAgeSq += slot.sumAgeSq;
                }

                // Transfer workers from the employed occupation back to unoccupied
                if (departingCount > 0 && planet) {
                    const moved = returnToPopulation(planet, edu, departingCount, occupation, {
                        count: departingCount,
                        sumAge: departingSumAge,
                        sumAgeSq: departingSumAgeSq,
                    });
                    if (moved !== departingCount) {
                        console.warn(
                            `[laborMarketMonthTick] departing mismatch for edu=${edu} on agent=${agent.id}: requested=${departingCount}, moved=${moved}`,
                        );
                    }
                }
            }

            // --- Shift all departing pipelines down by one slot ---
            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
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
