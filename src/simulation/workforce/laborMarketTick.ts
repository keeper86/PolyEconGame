/**
 * workforce/laborMarketTick.ts
 *
 * Monthly pre-production labor-market logic:
 * 1. Voluntary quits — a small fraction of active workers enter the departing pipeline.
 * 2. Hiring — compares active headcount vs allocatedWorkers target per education level.
 *    If understaffed, hires the full gap instantly from the planet's unoccupied pool.
 *    Hired workers are placed into the age-resolved workforce at their exact age.
 * 3. Firing — if overstaffed, fires excess workers starting from the youngest age
 *    cohorts first (proxy for lowest tenure).
 *    Fired workers enter the departing pipeline (notice period).
 */

import type { Agent, Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { NOTICE_PERIOD_MONTHS } from '../constants';
import { hireFromPopulation } from './workforce';
import { forEachWorkforceCohort } from './workforce';
import { stochasticRound } from '../utils/stochasticRound';
import { totalActiveForEdu } from './workforceAggregates';
import { assertPopulationWorkforceConsistency } from '../utils/testHelper';

// Re-export so existing importers continue to work.
export { NOTICE_PERIOD_MONTHS } from '../constants';

/**
 * Fraction of active workers per age cohort per education level that
 * voluntarily quit each tick.
 */
export const VOLUNTARY_QUIT_RATE_PER_MONTH = 0.001;

/**
 * Productivity multiplier for workers in the departing pipeline.
 * Fired/quitting workers still contribute to production but at reduced
 * efficiency during their notice period.
 */
export const DEPARTING_EFFICIENCY = 0.5;

/**
 * Age (years) at which workers retire.
 */
export const RETIREMENT_AGE = 67;

/**
 * Fraction of total hired workforce that may remain idle after all
 * facilities have drawn workers, before the system starts reducing
 * hiring targets.  5 % = a small buffer so that a handful of unassigned
 * workers don't immediately trigger downsizing.
 */
export const ACCEPTABLE_IDLE_FRACTION = 0.05;

// ---------------------------------------------------------------------------
// Age-dependent productivity
// ---------------------------------------------------------------------------

/**
 * Returns a productivity multiplier [0.7, 1.0] based on the age of a
 * worker (or mean age of a group).  Productivity is highest for ages
 * 30–50, gradually lower for young (<30) and older (>50) workers.
 */
export const ageProductivityMultiplier = (age: number): number => {
    if (age <= 18) {
        return 0.8;
    }
    if (age < 30) {
        return 0.8 + ((age - 18) * 0.2) / 12;
    } // 0.80 → 1.00
    if (age <= 50) {
        return 1.0;
    } // peak productivity
    if (age < 65) {
        return 1.0 - ((age - 50) * 0.15) / 15;
    } // 1.00 → 0.85
    return Math.max(0.7, 0.85 - ((age - 65) * 0.15) / 15); // declining after 65
};

// ---------------------------------------------------------------------------
// Main monthly pre-production entry point
// ---------------------------------------------------------------------------

export function preProductionLaborMarketTick(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            if (planetId !== planet.id) {
                continue;
            }
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

            // ------------------------------------------------------------------
            // Phase 1: Voluntary quits
            // ------------------------------------------------------------------
            for (let age = 0; age < workforce.length; age++) {
                forEachWorkforceCohort(workforce[age], (category) => {
                    if (category.active <= 0) {
                        return;
                    }
                    const voluntaryQuitters = stochasticRound(category.active * VOLUNTARY_QUIT_RATE_PER_MONTH);
                    if (voluntaryQuitters > 0) {
                        const actual = Math.min(voluntaryQuitters, category.active);
                        category.active -= actual;
                        category.departing[NOTICE_PERIOD_MONTHS - 1] += actual;
                    }
                });
            }

            // ------------------------------------------------------------------
            // Phase 2: Hiring / Firing per education level
            // ------------------------------------------------------------------
            for (const edu of educationLevelKeys) {
                const target = assets.allocatedWorkers[edu] ?? 0;
                const currentActive = totalActiveForEdu(workforce, edu);

                const gap = target - currentActive;

                if (gap > 0) {
                    // --- Hire the gap, spread across skill levels proportionally ---

                    const result = hireFromPopulation(planet, edu, gap);
                    if (result.count > 0) {
                        // Place hired workers at their exact age in the workforce
                        for (let age = 0; age < result.hiredByAge.length; age++) {
                            for (const skill of SKILL) {
                                const count = result.hiredByAge[age][skill];
                                if (count > 0) {
                                    workforce[age][edu][skill].active += count;
                                }
                            }
                        }
                    }
                } else if (gap < -currentActive * ACCEPTABLE_IDLE_FRACTION) {
                    // --- Fire excess workers (youngest ages first as proxy for lowest tenure) ---
                    let toFire = -gap;

                    for (let age = 0; age < workforce.length && toFire > 0; age++) {
                        for (const skill of SKILL) {
                            if (toFire <= 0) {
                                break;
                            }
                            const cat = workforce[age][edu][skill];
                            const fire = Math.min(toFire, cat.active);
                            if (fire > 0) {
                                cat.active -= fire;
                                cat.departingFired[NOTICE_PERIOD_MONTHS - 1] += fire;
                                cat.departing[NOTICE_PERIOD_MONTHS - 1] += fire;
                                toFire -= fire;
                            }
                        }
                    }
                }
            }
        }
    }

    // Verify population↔workforce consistency after all hiring/firing
    if (process.env.SIM_DEBUG === '1') {
        assertPopulationWorkforceConsistency(agents, planet, 'preProductionLaborMarketTick');
    }
}
