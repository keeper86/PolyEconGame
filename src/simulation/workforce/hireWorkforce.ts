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

import { NOTICE_PERIOD_MONTHS } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { assertPopulationWorkforceConsistency } from '../utils/testHelper';
import { hireFromPopulation } from './workforce';
import { totalActiveForEdu } from './workforceAggregates';

/**
 * Fraction of total hired workforce that may remain idle after all
 * facilities have drawn workers, before the system starts reducing
 * hiring targets.  5 % = a small buffer so that a handful of unassigned
 * workers don't immediately trigger downsizing.
 */
export const ACCEPTABLE_IDLE_FRACTION = 0.05;

export function hireWorkforce(agents: Map<string, Agent>, planet: Planet): void {
    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            if (planetId !== planet.id) {
                continue;
            }
            const workforce = assets.workforceDemography;
            if (!workforce) {
                continue;
            }

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
                                toFire -= fire;
                            }
                        }
                    }
                }
            }
        }
    }

    if (process.env.SIM_DEBUG === '1') {
        assertPopulationWorkforceConsistency(agents, planet, 'preProductionLaborMarketTick');
    }
}
