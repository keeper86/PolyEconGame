/**
 * workforce/laborMarketMonthTick.ts
 *
 * Monthly labor-market processing:
 * 1. Snapshot active workers at month start (for UI Δ-month display).
 * 2. Rotate death counters (this month → prev month, reset this month).
 * 3. Monthly retirement trigger: proportional, spread over 12 months.
 * 4. Pipeline advancement: departing → unoccupied, retiring → unableToWork.
 */

import { MONTHS_PER_YEAR } from '../constants';
import type { Agent, EducationLevelType, Occupation, Planet } from '../planet';
import { educationLevelKeys } from '../planet';
import {
    DEFAULT_HIRE_AGE_MEAN,
    NOTICE_PERIOD_MONTHS,
    RETIREMENT_AGE,
    normalCdf,
    totalActiveForEdu,
} from './workforceHelpers';
import { mergeWealthMoments } from '../population/populationHelpers';
import { returnToPopulation, retireToPopulation } from './populationBridge';

export function laborMarketMonthTick(agents: Map<string, Agent>, planets: Map<string, Planet>): void {
    for (const agent of agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
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

            const planet = planets.get(planetId);
            const occupation: Occupation = planet && planet.governmentId === agent.id ? 'government' : 'company';

            // --- Monthly retirement trigger (proportional, spread over 12 months) ---
            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
                    const active = cohort.active[edu];
                    if (active <= 0) {
                        continue;
                    }

                    const { mean, variance } = cohort.ageMoments[edu];

                    let annualFraction: number;
                    if (variance < 1 || active <= 1) {
                        // Delta distribution or single worker — deterministic
                        annualFraction = mean >= RETIREMENT_AGE ? 1 : 0;
                    } else {
                        const stdDev = Math.sqrt(variance);
                        const z = (RETIREMENT_AGE - mean) / stdDev;
                        annualFraction = 1 - normalCdf(z);
                    }

                    if (annualFraction <= 0) {
                        continue;
                    }

                    // Convert annual fraction to a monthly rate
                    const monthlyRate = annualFraction >= 1 ? 1 : 1 - Math.pow(1 - annualFraction, 1 / MONTHS_PER_YEAR);
                    let toRetire = Math.round(active * monthlyRate);
                    if (toRetire > 0) {
                        toRetire = Math.min(toRetire, active);
                        cohort.active[edu] -= toRetire;
                        const slot = NOTICE_PERIOD_MONTHS - 1;
                        const prevRetiringCount = cohort.retiring[edu][slot];
                        cohort.retiring[edu][slot] += toRetire;

                        // Wealth: retirees carry same per-person wealth as active (random sample).
                        cohort.retiringWealth[edu][slot] = mergeWealthMoments(
                            prevRetiringCount,
                            cohort.retiringWealth[edu][slot],
                            toRetire,
                            cohort.wealthMoments[edu],
                        );
                        // Remaining active workers keep same wealth_mean (random sample).
                        if (cohort.active[edu] === 0) {
                            cohort.wealthMoments[edu] = { mean: 0, variance: 0 };
                        }

                        // Update age moments: retirees are the upper tail of the
                        // distribution; the remaining workers form a truncated normal.
                        const remaining = cohort.active[edu];
                        if (remaining > 0 && variance >= 1) {
                            const stdDev = Math.sqrt(variance);
                            const z = (RETIREMENT_AGE - mean) / stdDev;
                            const phiZ = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
                            const PhiZ = normalCdf(z);
                            if (PhiZ > 1e-8) {
                                const lambda = phiZ / PhiZ;
                                cohort.ageMoments[edu] = {
                                    mean: mean - stdDev * lambda,
                                    variance: Math.max(0, variance * (1 - z * lambda - lambda * lambda)),
                                };
                            }
                        } else if (remaining === 0) {
                            cohort.ageMoments[edu] = { mean: DEFAULT_HIRE_AGE_MEAN, variance: 0 };
                        }
                    }
                }
            }

            // --- Pipeline advancement ---
            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
                    // --- Departing pipeline: route to 'unoccupied' ---
                    const departing = cohort.departing[edu][0];
                    if (departing > 0 && planet) {
                        // Attempt to return departing workers to the population.
                        // Use the actual moved count to keep the workforce pipeline
                        // consistent if the population couldn't absorb the full
                        // requested amount (should be rare).  Log mismatches so
                        // we can diagnose any upstream inconsistencies.
                        const moved = returnToPopulation(
                            planet,
                            edu,
                            departing,
                            occupation,
                            cohort.departingWealth[edu][0],
                        );
                        if (moved !== departing) {
                            // Informational: this shouldn't normally happen. If it
                            // does, it indicates a mismatch between workforce and
                            // population accounting earlier in the tick.
                            console.warn(
                                `[laborMarketMonthTick] departing mismatch for edu=${edu} on agent=${agent.id}: requested=${departing}, moved=${moved}`,
                            );
                        }
                        // Subtract the actually moved workers from the slot so the
                        // in-memory workforce state accurately reflects reality
                        // before we rotate the pipeline.
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

                    // --- Retiring pipeline: route to 'unableToWork' ---
                    const retirees = cohort.retiring[edu][0];
                    if (retirees > 0 && planet) {
                        const movedRet = retireToPopulation(
                            planet,
                            edu,
                            retirees,
                            occupation,
                            cohort.retiringWealth[edu][0],
                        );
                        if (movedRet !== retirees) {
                            console.warn(
                                `[laborMarketMonthTick] retiring mismatch for edu=${edu} on agent=${agent.id}: requested=${retirees}, moved=${movedRet}`,
                            );
                        }
                        cohort.retiring[edu][0] = Math.max(0, cohort.retiring[edu][0] - movedRet);
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
