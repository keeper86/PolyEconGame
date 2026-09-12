import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import { transferPopulation } from '../population/population';
import type { TickProfiler } from '../TickProfiler';
import { distributeProportionally } from '../utils/distributeProportionally';
import { assertPopulationWorkforceConsistency } from '../utils/testHelper';
import {
    ACCEPTABLE_IDLE_FRACTION,
    acceptProbability,
    computeLaborMarket,
    reservationWage,
    smoothedReachableVacancyWage,
} from './laborMarket';
import { totalActiveForEdu } from './workforceAggregates';

export function assertBackfillProgress(
    slotEdu: EducationLevelType,
    workerEdu: EducationLevelType,
    remainingGap: number,
    totalWilling: number,
    toHire: number,
): void {
    if (process.env.SIM_DEBUG === '1' && toHire === 0 && remainingGap > 0 && totalWilling >= 1) {
        throw new Error(
            `[hireWorkforce] backfill stall: slot edu=${slotEdu} worker edu=${workerEdu} ` +
                `remainingGap=${remainingGap} willing=${totalWilling} — willing workers skipped while slots remain ` +
                `(cross-tier double-deduction regression)`,
        );
    }
}

export function hireWorkforce(agents: Map<string, Agent>, planet: Planet, profiler?: TickProfiler): void {
    let t: number = 0;

    if (profiler?.isEnabled) {
        t = profiler.mark();
    }
    const laborMarket = computeLaborMarket(agents, planet);
    if (profiler?.isEnabled) {
        t = profiler.markAndAccum('hireMinWage', '  hire_minWageMap', t);
    }

    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }
        if (!hasActiveLicense(assets, 'workforce')) {
            continue;
        }
        const workforce = assets.workforceDemography;
        if (!workforce) {
            continue;
        }

        // Pre-fetch demography and market prices for the bucket loop
        const demography = planet.population.demography;

        if (profiler?.isEnabled) {
            t = profiler.mark();
        }
        // Snapshot of current worker counts (active + in training), taken before this tick's hires so
        // cross-tier backfilling does not feed back into the firing decision of the same tick.
        const currentActiveByEdu = { none: 0, primary: 0, secondary: 0, tertiary: 0 } as Record<string, number>;
        for (let age = 0; age < workforce.length; age++) {
            for (const edu of educationLevelKeys) {
                const cat = workforce[age][edu];
                if (!cat) {
                    continue;
                }
                currentActiveByEdu[edu] += cat.active + cat.onboarding[0] + cat.onboarding[1] + cat.onboarding[2];
            }
        }
        if (profiler?.isEnabled) {
            t = profiler.markAndAccum('hirePreCount', '  hire_preCount', t);
        }

        const eduIndex = new Map(educationLevelKeys.map((edu, i) => [edu, i]));

        for (const edu of educationLevelKeys) {
            const target = assets.allocatedWorkers[edu] ?? 0;
            const currentActive = currentActiveByEdu[edu];
            const activeOnly = totalActiveForEdu(workforce, edu);

            const gap = target - currentActive;
            const gapActive = target - activeOnly;

            if (gap > 0) {
                // --- HIRING (with cross-tier fallback: when a lower tier's native pool is depleted,
                // higher-tier workers backfill the remaining slots at their own tier's wage) ---
                let remainingGap = gap;
                for (let wi = eduIndex.get(edu)!; wi < educationLevelKeys.length && remainingGap > 0; wi++) {
                    const workerEdu = educationLevelKeys[wi];
                    const wage = assets.wagePerEdu[workerEdu] ?? 0;
                    const threshold = reservationWage(
                        laborMarket.reachableTightness[workerEdu],
                        smoothedReachableVacancyWage(planet, workerEdu, laborMarket.reachableVacancyWage[workerEdu]),
                    );

                    type Bucket = { age: number; avail: number; probToAccept: number };
                    const buckets: Bucket[] = [];
                    let totalWilling = 0;

                    for (let age = MIN_EMPLOYABLE_AGE; age < workforce.length; age++) {
                        const avail = demography[age].unoccupied[workerEdu].total;
                        if (avail <= 0) {
                            continue;
                        }

                        const probToAccept = acceptProbability(wage, threshold);
                        buckets.push({ age, avail, probToAccept });
                        totalWilling += avail * probToAccept;
                    }

                    const toHire = Math.floor(Math.min(remainingGap, totalWilling));
                    assertBackfillProgress(edu, workerEdu, remainingGap, totalWilling, toHire);
                    if (toHire > 0) {
                        const allocatedBuckets = distributeProportionally(
                            toHire,
                            buckets.map((b) => b.avail * b.probToAccept),
                        );

                        for (let i = 0; i < buckets.length; i++) {
                            const { age } = buckets[i];
                            const actual = allocatedBuckets[i];
                            if (actual > 0) {
                                transferPopulation(
                                    planet,
                                    { age, occ: 'unoccupied', edu: workerEdu },
                                    { age, occ: 'employed', edu: workerEdu },
                                    actual,
                                );

                                workforce[age][workerEdu].onboarding[NOTICE_PERIOD_MONTHS - 1] += actual;
                            }
                        }
                        remainingGap -= toHire;
                    }
                }
            } else if (gapActive < -activeOnly * ACCEPTABLE_IDLE_FRACTION) {
                // --- FIRING (active-only, so in-training workers are never fired) ---
                let toFire = -gapActive;
                for (let age = 0; age < workforce.length && toFire > 0; age++) {
                    const cat = workforce[age][edu];
                    const fire = Math.min(toFire, cat.active);
                    if (fire > 0) {
                        cat.active -= fire;
                        cat.departingFired[NOTICE_PERIOD_MONTHS - 1] += fire;
                        toFire -= fire;
                    }
                }
            }
        }
        if (profiler?.isEnabled) {
            t = profiler.markAndAccum('hireMatch', '  hire_match', t);
        }
    }

    if (process.env.SIM_DEBUG === '1') {
        assertPopulationWorkforceConsistency(agents, planet, 'performLaborMatching');
    }
    if (profiler?.isEnabled) {
        t = profiler.markAndAccum('hireAfter', '  hire_after', t);
    }
}
