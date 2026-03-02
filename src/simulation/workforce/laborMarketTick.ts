/**
 * workforce/laborMarketTick.ts
 *
 * Per-tick labor-market logic:
 * 1. Voluntary quits — a small fraction of active workers enter the departing pipeline.
 * 2. Hiring — compares active headcount vs allocatedWorkers target per education level.
 *    If understaffed, hires the full gap instantly from the planet's unoccupied pool.
 * 3. Firing — if overstaffed, fires excess workers starting from the lowest eligible
 *    tenure (least senior first). Workers in tenure years 0 and 1 are protected from
 *    lay-offs.  Fired workers enter the departing pipeline (12-month notice).
 */

import type { Agent, EducationLevelType, Occupation, Planet } from '../planet';
import { educationLevelKeys } from '../planet';
import {
    MAX_TENURE_YEARS,
    MIN_TENURE_FOR_FIRING,
    NOTICE_PERIOD_MONTHS,
    VOLUNTARY_QUIT_RATE_PER_TICK,
    totalActiveForEdu,
} from './workforceHelpers';
import { hireFromPopulation, totalUnoccupiedForEdu } from './populationBridge';
import { stochasticRound } from '../utils/stochasticRound';

export function laborMarketTick(agents: Agent[], planets: Planet[]): void {
    // Index planets by id for fast lookup
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

            // Reset per-tick hiring / firing counters so the UI always
            // reflects only the most recent tick's activity.
            const hiredThisTick = {} as Record<EducationLevelType, number>;
            const firedThisTick = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                hiredThisTick[edu] = 0;
                firedThisTick[edu] = 0;
            }
            assets.hiredThisTick = hiredThisTick;
            assets.firedThisTick = firedThisTick;

            // --- Voluntary quits ---
            for (const cohort of workforce) {
                for (const edu of educationLevelKeys) {
                    const activeCount = cohort.active[edu];
                    if (activeCount === 0) {
                        continue;
                    }
                    const voluntaryQuitters = stochasticRound(activeCount * VOLUNTARY_QUIT_RATE_PER_TICK);
                    if (voluntaryQuitters > 0) {
                        cohort.active[edu] -= voluntaryQuitters;
                        cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] += voluntaryQuitters;
                    }
                }
            }

            // --- Hiring & Firing ---
            const planet = planetMap.get(planetId);
            if (!planet) {
                continue;
            }

            // Snapshot available (unoccupied) workers on the labor market so
            // the UI can display how deep the hiring pool is per edu level.
            const availableOnMarket = {} as Record<EducationLevelType, number>;
            for (const edu of educationLevelKeys) {
                availableOnMarket[edu] = totalUnoccupiedForEdu(planet, edu);
            }
            assets.availableOnMarket = availableOnMarket;

            const occupation: Occupation = planet.government.id === agent.id ? 'government' : 'company';

            for (const edu of educationLevelKeys) {
                const target = assets.allocatedWorkers[edu] ?? 0;
                const currentActive = totalActiveForEdu(workforce, edu);
                const gap = target - currentActive;

                if (gap > 0) {
                    // --- Hire the full gap instantly ---
                    const result = hireFromPopulation(planet, edu, gap, occupation);
                    const hired = result.count;

                    if (hired > 0) {
                        // Merge age moments for the newly hired workers into tenure year 0
                        const existingCount = workforce[0].active[edu];
                        const totalCount = existingCount + hired;
                        if (existingCount > 0) {
                            const em = workforce[0].ageMoments[edu];
                            const newMean = (existingCount * em.mean + hired * result.meanAge) / totalCount;
                            workforce[0].ageMoments[edu] = {
                                mean: newMean,
                                variance:
                                    (existingCount * (em.variance + (em.mean - newMean) ** 2) +
                                        hired * (result.varAge + (result.meanAge - newMean) ** 2)) /
                                    totalCount,
                            };
                        } else {
                            workforce[0].ageMoments[edu] = { mean: result.meanAge, variance: result.varAge };
                        }
                        workforce[0].active[edu] += hired;
                        hiredThisTick[edu] += hired;
                    }
                } else if (gap < -currentActive * 0.05) {
                    // --- Fire excess workers (lowest tenure first, skip tenure 0 & 1) ---
                    let toFire = -gap;
                    for (let year = MIN_TENURE_FOR_FIRING; year <= MAX_TENURE_YEARS && toFire > 0; year++) {
                        const cohort = workforce[year];
                        const available = cohort.active[edu];
                        const fire = Math.min(toFire, available);
                        if (fire > 0) {
                            cohort.active[edu] -= fire;
                            cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] += fire;
                            cohort.departingFired[edu][NOTICE_PERIOD_MONTHS - 1] += fire;
                            firedThisTick[edu] += fire;
                            toFire -= fire;
                        }
                    }
                }
            }
        }
    }
}
