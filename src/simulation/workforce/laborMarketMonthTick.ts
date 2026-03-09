/**
 * workforce/laborMarketMonthTick.ts
 *
 * Monthly labor-market processing:
 * 1. Rotate death/disability/retirement counters (this month → prev month, reset this month).
 * 2. Pipeline advancement: departing → unoccupied.
 *
 * With age-resolved workforce cohorts, departing workers are returned to
 * the population at their exact age — no Gaussian weighting needed.
 */

import type { Agent, Planet, PerEducation } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { forEachWorkforceCohort } from '../population/population';
import { NOTICE_PERIOD_MONTHS } from './laborMarketTick';
import { returnToPopulationAtAge, assertPopulationWorkforceConsistency } from './populationBridge';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function laborMarketMonthTick(agents: Map<string, Agent>, planets: Map<string, Planet>): void {
    // -----------------------------------------------------------------------
    // Phase 0: snapshots & counter rotation (per-agent)
    // -----------------------------------------------------------------------

    for (const agent of agents.values()) {
        for (const [_planetId, assets] of Object.entries(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            // --- Rotate demographic event counters ---
            // Helper: create zero-filled per-edu record.
            const fresh = (): PerEducation => {
                const r = {} as PerEducation;
                for (const e of educationLevelKeys) {
                    r[e] = 0;
                }
                return r;
            };

            // Deaths
            if (!assets.deaths) {
                assets.deaths = { thisMonth: fresh(), prevMonth: fresh() };
            }
            assets.deaths.prevMonth = assets.deaths.thisMonth;
            assets.deaths.thisMonth = fresh();

            // Disabilities
            if (!assets.disabilities) {
                assets.disabilities = { thisMonth: fresh(), prevMonth: fresh() };
            }
            assets.disabilities.prevMonth = assets.disabilities.thisMonth;
            assets.disabilities.thisMonth = fresh();

            // Retirements
            if (!assets.retirements) {
                assets.retirements = { thisMonth: fresh(), prevMonth: fresh() };
            }
            assets.retirements.prevMonth = assets.retirements.thisMonth;
            assets.retirements.thisMonth = fresh();
        }
    }

    // -----------------------------------------------------------------------
    // Phase 1: Pipeline advancement (per-agent)
    //
    // For each age × edu × skill, drain departing[0] back into the
    // population (unoccupied pool) and then shift the pipeline down by
    // one slot.
    // -----------------------------------------------------------------------
    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            const planet = planets.get(planetId);

            // Return departing[0] workers to the population at their exact age.
            if (planet) {
                for (let age = 0; age < workforce.length; age++) {
                    forEachWorkforceCohort(workforce[age], (category, edu) => {
                        const departingAtAge = category.departing[0] ?? 0;
                        if (departingAtAge > 0) {
                            const moved = returnToPopulationAtAge(planet, edu, departingAtAge, 'employed', age);
                            if (moved !== departingAtAge) {
                                console.warn(
                                    `[laborMarketMonthTick] departing mismatch for edu=${edu} age=${age} on agent=${agent.id}: requested=${departingAtAge}, moved=${moved}`,
                                );
                            }
                        }
                    });
                }
            }

            // --- Shift all departing pipelines down by one slot ---
            for (let age = 0; age < workforce.length; age++) {
                forEachWorkforceCohort(workforce[age], (category) => {
                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        category.departing[i] = category.departing[i + 1] ?? 0;
                        category.departingFired[i] = category.departingFired[i + 1] ?? 0;
                    }
                    category.departing[NOTICE_PERIOD_MONTHS - 1] = 0;
                    category.departingFired[NOTICE_PERIOD_MONTHS - 1] = 0;
                });
            }
        }
    }

    // Verify population↔workforce consistency after pipeline advancement
    if (process.env.SIM_DEBUG === '1') {
        for (const planet of planets.values()) {
            assertPopulationWorkforceConsistency(agents, planet, 'laborMarketMonthTick');
        }
    }
}
