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
import { returnToPopulation, retireToPopulation } from './populationBridge';

export function laborMarketMonthTick(agents: Agent[], planets: Planet[]): void {
    const planetMap = new Map<string, Planet>();
    for (const planet of planets) {
        planetMap.set(planet.id, planet);
    }

    for (const agent of agents) {
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

            const planet = planetMap.get(planetId);
            const occupation: Occupation = planet && planet.government.id === agent.id ? 'government' : 'company';

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
                        cohort.retiring[edu][NOTICE_PERIOD_MONTHS - 1] += toRetire;

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
                        returnToPopulation(planet, edu, departing, occupation);
                    }

                    // Shift departing + departingFired pipelines down
                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        cohort.departing[edu][i] = cohort.departing[edu][i + 1];
                        cohort.departingFired[edu][i] = cohort.departingFired[edu][i + 1];
                    }
                    cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] = 0;
                    cohort.departingFired[edu][NOTICE_PERIOD_MONTHS - 1] = 0;

                    // --- Retiring pipeline: route to 'unableToWork' ---
                    const retirees = cohort.retiring[edu][0];
                    if (retirees > 0 && planet) {
                        retireToPopulation(planet, edu, retirees, occupation);
                    }

                    for (let i = 0; i < NOTICE_PERIOD_MONTHS - 1; i++) {
                        cohort.retiring[edu][i] = cohort.retiring[edu][i + 1];
                    }
                    cohort.retiring[edu][NOTICE_PERIOD_MONTHS - 1] = 0;
                }
            }
        }
    }
}
