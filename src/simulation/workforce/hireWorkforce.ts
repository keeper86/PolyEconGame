import assert from 'node:assert';
import { MIN_EMPLOYABLE_AGE, NOTICE_PERIOD_MONTHS } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { transferPopulation } from '../population/population';
import type { TickProfiler } from '../TickProfiler';
import { distributeProportionally } from '../utils/distributeProportionally';
import { assertPopulationWorkforceConsistency } from '../utils/testHelper';
import {
    ACCEPTABLE_IDLE_FRACTION,
    buildBaseReservationWageMap,
    computeLaborMarket,
    reservationWage,
} from './laborMarket';
import type { WorkforceCohort } from './workforce';
import { nullWorkforceCohortFactory } from './workforce';

export function hireWorkforce(agents: Map<string, Agent>, planet: Planet, profiler?: TickProfiler): void {
    let t: number = 0;

    if (profiler?.isEnabled) {
        t = profiler.mark();
    }
    const costOfLivingMap = buildBaseReservationWageMap(planet);
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
        // Single-pass pre-computation of worker counts for all education levels
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

        if (profiler?.isEnabled) {
            t = profiler.mark();
        }
        for (const edu of educationLevelKeys) {
            const target = assets.allocatedWorkers[edu] ?? 0;
            const currentActive = currentActiveByEdu[edu];

            const gap = target - currentActive;

            if (gap > 0) {
                // --- HIRING ---
                const wage = assets.wagePerEdu[edu] ?? 0;

                type Bucket = { age: number; avail: number; probToAccept: number };
                const buckets: Bucket[] = [];
                let totalWilling = 0;

                for (let age = MIN_EMPLOYABLE_AGE; age < workforce.length; age++) {
                    const avail = demography[age].unoccupied[edu].total;
                    if (avail <= 0) {
                        continue;
                    }

                    const workerReservationWage = reservationWage(
                        costOfLivingMap,
                        age,
                        edu,
                        0,
                        laborMarket.tightness[edu],
                        laborMarket.marketWage[edu],
                    );
                    assert(workerReservationWage > 0, `reservationWage must be > 0, got ${workerReservationWage}`);

                    const probToAccept = (1.0 / (1 + Math.exp(-(wage / workerReservationWage - 1)))) * 0.05;
                    buckets.push({ age, avail, probToAccept });
                    totalWilling += avail * probToAccept;
                }

                const toHire = Math.floor(Math.min(gap, totalWilling));
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
                                { age, occ: 'unoccupied', edu },
                                { age, occ: 'employed', edu },
                                actual,
                            );

                            workforce[age][edu].onboarding[NOTICE_PERIOD_MONTHS - 1] += actual;
                        }
                    }
                }
            } else if (gap < -currentActive * ACCEPTABLE_IDLE_FRACTION) {
                // --- FIRING ---
                let toFire = -gap;

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

export const nullWageMapFactory = (): WorkforceCohort<number> => nullWorkforceCohortFactory(() => 0);
