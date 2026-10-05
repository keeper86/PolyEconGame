import {
    FIRE_RATE_LIMIT_PER_MONTH,
    HIRE_HR_SERVICE_PER_WORKER,
    HIRE_RAMP_MONTHS,
    MIN_EMPLOYABLE_AGE,
    NOTICE_PERIOD_MONTHS,
    TICKS_PER_MONTH,
} from '../constants';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import { hasActiveLicense } from '../planet/planet';
import { ESTIMATED_HR_OVERHEAD, PRODUCED_HR_QUANTITY } from '../planet/specialFacilities';
import { educationLevelKeys, type EducationLevelType } from '../population/education';
import { transferPopulation } from '../population/population';
import type { TickProfiler } from '../TickProfiler';
import { distributeProportionally } from '../utils/distributeProportionally';
import { stochasticRound } from '../utils/stochasticRound';
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
                `remainingGap=${remainingGap} willing=${totalWilling} — willing workers skipped while slots remain`,
        );
    }
}

export function perTickLimit(stock: number, fractionPerMonth: number): number {
    return Math.max(1, (stock * fractionPerMonth) / TICKS_PER_MONTH);
}

let fireRateLimitPerMonth = FIRE_RATE_LIMIT_PER_MONTH;

export const setFireRateLimitPerMonth = (value: number): void => {
    fireRateLimitPerMonth = value;
};

let hireFlowMultiplier = 1;

export const setHireFlowMultiplier = (value: number): void => {
    hireFlowMultiplier = value;
};

export const maxHiresPerTick = (assets: AgentPlanetAssets): number => {
    if (!Number.isFinite(hireFlowMultiplier)) {
        return Number.POSITIVE_INFINITY;
    }
    const hrScale = assets.humanResourcesDepartment?.scale ?? 0;
    const servedWorkforce = (hrScale * PRODUCED_HR_QUANTITY) / ESTIMATED_HR_OVERHEAD;
    return Math.max(1, (hireFlowMultiplier * servedWorkforce) / (HIRE_RAMP_MONTHS * TICKS_PER_MONTH));
};

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

        let carriedJobs = 0;

        for (const edu of educationLevelKeys) {
            const cover = (assets.allocatedWorkers[edu] ?? 0) + carriedJobs;
            const currentActive = currentActiveByEdu[edu];
            const activeOnly = totalActiveForEdu(workforce, edu);

            const shortfall = cover - currentActive;

            let hires = 0;
            let totalAvail = 0;

            if (shortfall > 0) {
                const wage = assets.wagePerEdu[edu] ?? 0;
                const threshold = reservationWage(
                    laborMarket.reachableTightness[edu],
                    smoothedReachableVacancyWage(planet, edu, laborMarket.reachableVacancyWage[edu]),
                );

                type Bucket = { age: number; avail: number; probToAccept: number };
                const buckets: Bucket[] = [];
                let totalWilling = 0;

                for (let age = MIN_EMPLOYABLE_AGE; age < workforce.length; age++) {
                    const avail = demography[age].unoccupied[edu].total;
                    if (avail <= 0) {
                        continue;
                    }
                    const probToAccept = acceptProbability(wage, threshold);
                    buckets.push({ age, avail, probToAccept });
                    totalWilling += avail * probToAccept;
                    totalAvail += avail;
                }

                const maxHires = maxHiresPerTick(assets);
                const hrDepartment = assets.humanResourcesDepartment;
                const maxByHrPoints = hrDepartment
                    ? Math.floor(hrDepartment.hrBuffer / HIRE_HR_SERVICE_PER_WORKER)
                    : Number.POSITIVE_INFINITY;
                const toHire = Math.floor(Math.min(shortfall, totalWilling, maxHires, maxByHrPoints));
                assertBackfillProgress(edu, edu, shortfall, totalWilling, toHire);
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
                    if (hrDepartment) {
                        hrDepartment.hrBuffer = Math.max(
                            0,
                            hrDepartment.hrBuffer - toHire * HIRE_HR_SERVICE_PER_WORKER,
                        );
                    }
                    hires = toHire;
                }
            } else if (shortfall < -activeOnly * ACCEPTABLE_IDLE_FRACTION) {
                let toFire = Math.min(-shortfall, perTickLimit(activeOnly, fireRateLimitPerMonth));
                for (let age = 0; age < workforce.length && toFire > 0; age++) {
                    const cat = workforce[age][edu];
                    const fire = Math.min(stochasticRound(toFire), cat.active);
                    if (fire > 0) {
                        cat.active -= fire;
                        cat.departingFired[NOTICE_PERIOD_MONTHS - 1] += fire;
                        toFire -= fire;
                    }
                }
            }
            carriedJobs = totalAvail <= hires ? Math.max(0, shortfall - hires) : 0;
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
