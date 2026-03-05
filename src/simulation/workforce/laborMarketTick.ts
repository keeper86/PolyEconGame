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
    mergeAgeMoments,
    extractRandomSample,
} from './workforceHelpers';
import { hireFromPopulation, totalUnoccupiedForEdu } from './populationBridge';
import { stochasticRound } from '../utils/stochasticRound';

export function laborMarketTick(agents: Map<string, Agent>, planets: Map<string, Planet>): void {
    for (const agent of agents.values()) {
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
                    const activeCount = cohort.active[edu].count;
                    if (activeCount === 0) {
                        continue;
                    }
                    const voluntaryQuitters = stochasticRound(activeCount * VOLUNTARY_QUIT_RATE_PER_TICK);
                    if (voluntaryQuitters > 0) {
                        // Quitters are a random sample — extract proportionally
                        // from the cohort so that both mean and variance are
                        // preserved in the remaining active pool.
                        const { remaining, sample } = extractRandomSample(cohort.active[edu], voluntaryQuitters);
                        cohort.active[edu] = remaining;
                        cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] = mergeAgeMoments(
                            cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1],
                            sample,
                        );
                    }
                }
            }

            // --- Hiring & Firing ---
            const planet = planets.get(planetId);
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

            const occupation: Occupation = planet.governmentId === agent.id ? 'government' : 'company';

            for (const edu of educationLevelKeys) {
                const target = assets.allocatedWorkers[edu] ?? 0;
                const currentActive = totalActiveForEdu(workforce, edu);
                const gap = target - currentActive;

                if (gap > 0) {
                    // --- Hire the full gap instantly ---
                    const result = hireFromPopulation(planet, edu, gap, occupation);
                    const hired = result.count;

                    if (hired > 0) {
                        // Merge raw age moments for the newly hired workers into tenure year 0.
                        const hiredMoments = { count: hired, sumAge: result.sumAge, sumAgeSq: result.sumAgeSq };
                        workforce[0].active[edu] = mergeAgeMoments(workforce[0].active[edu], hiredMoments);
                        hiredThisTick[edu] += hired;
                    }
                } else if (gap < -currentActive * 0.05) {
                    // --- Fire excess workers (lowest tenure first, skip tenure 0 & 1) ---
                    let toFire = -gap;
                    for (let year = MIN_TENURE_FOR_FIRING; year <= MAX_TENURE_YEARS && toFire > 0; year++) {
                        const cohort = workforce[year];
                        const available = cohort.active[edu].count;
                        const fire = Math.min(toFire, available);
                        if (fire > 0) {
                            // Fired workers are a random sample — extract
                            // proportionally to preserve mean and variance.
                            const { remaining, sample } = extractRandomSample(cohort.active[edu], fire);
                            cohort.active[edu] = remaining;
                            cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1] = mergeAgeMoments(
                                cohort.departing[edu][NOTICE_PERIOD_MONTHS - 1],
                                sample,
                            );
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
