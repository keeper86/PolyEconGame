import { NOTICE_PERIOD_MONTHS } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import {
    computeTotalDisabilityProbability as computeDisabilityProbabilityPerTick,
    computeEnvironmentalDisability,
} from '../population/disability';
import { educationLevelKeys } from '../population/education';
import { computeEnvironmentalMortality, computeMortalityProbabilityPerTick } from '../population/mortality';
import type { EducationLevelType } from '../population/population';
import { MAX_AGE } from '../population/population';
import { perTickRetirement } from '../population/retirement';
import { stochasticRound } from '../utils/stochasticRound';
import type { TickProfiler } from '../TickProfiler';
import { betterOfferStats, computeLaborMarket, quitPropensity } from './laborMarket';
import type { WorkforceCategory, WorkforceCohort } from './workforce';
import { subtractProportionalXP } from './workforce';

type EventCounts = {
    deaths: number;
    disabilities: number;
};

function nullEventCounts(): EventCounts {
    return { deaths: 0, disabilities: 0 };
}

export type WorkforceEventAccumulator = WorkforceCohort<EventCounts>[];

export function createWorkforceEventAccumulator(length: number = MAX_AGE + 1): WorkforceEventAccumulator {
    return Array.from({ length }, () => {
        const cohort = {} as WorkforceCohort<EventCounts>;
        for (const edu of educationLevelKeys) {
            cohort[edu] = nullEventCounts();
        }
        return cohort;
    });
}

export function workforceDemographicTick(
    agents: Map<string, Agent>,
    planet: Planet,
    profiler?: TickProfiler,
): WorkforceEventAccumulator {
    const accumulator = createWorkforceEventAccumulator(planet.population.demography.length);
    const laborMarket = computeLaborMarket(agents, planet);

    // Per-planet environmental computations — hoisted once per planet, not per agent
    const environmentalMortality = computeEnvironmentalMortality(planet.environment);
    const environmentalDisability = computeEnvironmentalDisability(planet.environment);

    let t_cell: number = 0;
    if (profiler?.isEnabled) {
        t_cell = profiler.mark();
    }

    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets?.workforceDemography) {
            continue;
        }

        const workforce = assets.workforceDemography;

        const betterByEdu: Record<EducationLevelType, { meanWage: number; share: number }> = {
            none: { meanWage: 0, share: 0 },
            primary: { meanWage: 0, share: 0 },
            secondary: { meanWage: 0, share: 0 },
            tertiary: { meanWage: 0, share: 0 },
        };
        for (const l of educationLevelKeys) {
            betterByEdu[l] = betterOfferStats(laborMarket.reachableVacancySteps[l], assets.wagePerEdu[l] ?? 0);
        }

        for (let age = 0; age < workforce.length; age++) {
            const cohort = workforce[age];

            for (const l of educationLevelKeys) {
                const category = cohort[l];

                // Inline totalOnboarding + totalDeparting — avoids .reduce() closure allocation
                const _totalOnboarding = category.onboarding[0] + category.onboarding[1] + category.onboarding[2];
                const _totalDeparting =
                    category.voluntaryDeparting[0] +
                    category.voluntaryDeparting[1] +
                    category.voluntaryDeparting[2] +
                    category.departingFired[0] +
                    category.departingFired[1] +
                    category.departingFired[2] +
                    category.departingRetired[0] +
                    category.departingRetired[1] +
                    category.departingRetired[2];

                const _totalWorkers = category.active + _totalOnboarding + _totalDeparting;

                // Quick exit: skip entirely empty categories
                if (category.active <= 0 && _totalDeparting <= 0 && _totalOnboarding <= 0) {
                    continue;
                }

                if (category.active > 0) {
                    const better = betterByEdu[l];
                    const quitRate = quitPropensity(
                        assets.wagePerEdu[l] ?? 0,
                        laborMarket.reachableTightness[l] * better.share,
                        better.meanWage,
                    );
                    const voluntaryQuitters = stochasticRound(category.active * quitRate);
                    if (voluntaryQuitters > 0) {
                        category.active -= voluntaryQuitters;
                        category.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1] += voluntaryQuitters;
                    }
                }

                const retirementProb = perTickRetirement(age);
                const populationCategory = planet.population.demography[age]?.employed?.[l];
                const starvationLevel = populationCategory?.services?.grocery?.starvationLevel ?? 0;

                // This should never happen — workforce ↔ population categories are always in sync
                if (populationCategory === undefined) {
                    throw new Error(
                        `Missing population category for age ${age}, edu ${l} in workforce demographic tick.`,
                    );
                }

                const mortalityProbabilityPerTick = computeMortalityProbabilityPerTick(
                    starvationLevel,
                    environmentalMortality,
                    age,
                );

                const disabilityProbabilityPerTick = computeDisabilityProbabilityPerTick(
                    age,
                    starvationLevel,
                    environmentalDisability,
                );

                let deaths = 0;
                let disabilities = 0;

                if (category.active > 0) {
                    if (retirementProb > 0) {
                        const toRetire = stochasticRound(category.active * retirementProb);
                        if (toRetire > 0) {
                            category.active -= toRetire;
                            category.departingRetired[NOTICE_PERIOD_MONTHS - 1] += toRetire;
                        }
                    }

                    const totalBeforeActive = _totalWorkers;

                    if (mortalityProbabilityPerTick > 0) {
                        const dead = stochasticRound(category.active * mortalityProbabilityPerTick);
                        if (dead > 0) {
                            subtractProportionalXP(category, dead, totalBeforeActive);
                            category.active -= dead;
                            deaths += dead;
                        }
                    }

                    if (disabilityProbabilityPerTick > 0) {
                        const disabled = stochasticRound(category.active * disabilityProbabilityPerTick);
                        if (disabled > 0) {
                            subtractProportionalXP(category, disabled, totalBeforeActive);
                            category.active -= disabled;
                            disabilities += disabled;
                        }
                    }
                }

                // Apply demographic events to all pipeline slots (onboarding + departing) in a single pass
                const totalBeforePipeline = _totalWorkers;

                for (let month = 0; month < NOTICE_PERIOD_MONTHS; month++) {
                    // --- Onboarding pipeline ---
                    // Must re-read from the array after each mutation — the original const
                    // would become stale if multiple subtractions occur in the same tick,
                    // producing negative workforce counts (especially under high mortality +
                    // disability when a planet is dying off).
                    if (category.onboarding[month] > 0) {
                        if (mortalityProbabilityPerTick > 0) {
                            const dead = stochasticRound(category.onboarding[month] * mortalityProbabilityPerTick);
                            if (dead > 0) {
                                category.onboarding[month] -= dead;
                                deaths += dead;
                            }
                        }

                        if (disabilityProbabilityPerTick > 0) {
                            const disabled = stochasticRound(category.onboarding[month] * disabilityProbabilityPerTick);
                            if (disabled > 0) {
                                category.onboarding[month] -= disabled;
                                disabilities += disabled;
                            }
                        }
                    }

                    // --- Departing pipeline (voluntary + fired + retired share the same month) ---
                    // Must re-read from the array after each mutation — see onboarding comment above.
                    if (category.voluntaryDeparting[month] > 0) {
                        if (retirementProb > 0) {
                            const toRetire = stochasticRound(category.voluntaryDeparting[month] * retirementProb);
                            category.departingRetired[month] += toRetire;
                            category.voluntaryDeparting[month] -= toRetire;
                        }

                        if (mortalityProbabilityPerTick > 0) {
                            const dead = stochasticRound(
                                category.voluntaryDeparting[month] * mortalityProbabilityPerTick,
                            );
                            if (dead > 0) {
                                subtractProportionalXP(category, dead, totalBeforePipeline);
                                category.voluntaryDeparting[month] -= dead;
                                deaths += dead;
                            }
                        }

                        if (disabilityProbabilityPerTick > 0) {
                            const disabled = stochasticRound(
                                category.voluntaryDeparting[month] * disabilityProbabilityPerTick,
                            );
                            if (disabled > 0) {
                                subtractProportionalXP(category, disabled, totalBeforePipeline);
                                category.voluntaryDeparting[month] -= disabled;
                                disabilities += disabled;
                            }
                        }
                    }

                    // Must re-read from the array after each mutation — see onboarding comment above.
                    if (category.departingFired[month] > 0) {
                        if (retirementProb > 0) {
                            const toRetire = stochasticRound(category.departingFired[month] * retirementProb);
                            category.departingRetired[month] += toRetire;
                            category.departingFired[month] -= toRetire;
                        }

                        if (mortalityProbabilityPerTick > 0) {
                            const dead = stochasticRound(category.departingFired[month] * mortalityProbabilityPerTick);
                            if (dead > 0) {
                                subtractProportionalXP(category, dead, totalBeforePipeline);
                                category.departingFired[month] -= dead;
                                deaths += dead;
                            }
                        }

                        if (disabilityProbabilityPerTick > 0) {
                            const disabled = stochasticRound(
                                category.departingFired[month] * disabilityProbabilityPerTick,
                            );
                            if (disabled > 0) {
                                subtractProportionalXP(category, disabled, totalBeforePipeline);
                                category.departingFired[month] -= disabled;
                                disabilities += disabled;
                            }
                        }
                    }

                    // Must re-read from the array after each mutation — see onboarding comment above.
                    if (category.departingRetired[month] > 0) {
                        if (mortalityProbabilityPerTick > 0) {
                            const dead = stochasticRound(
                                category.departingRetired[month] * mortalityProbabilityPerTick,
                            );
                            if (dead > 0) {
                                subtractProportionalXP(category, dead, totalBeforePipeline);
                                category.departingRetired[month] -= dead;
                                deaths += dead;
                            }
                        }

                        if (disabilityProbabilityPerTick > 0) {
                            const disabled = stochasticRound(
                                category.departingRetired[month] * disabilityProbabilityPerTick,
                            );
                            if (disabled > 0) {
                                subtractProportionalXP(category, disabled, totalBeforePipeline);
                                category.departingRetired[month] -= disabled;
                                disabilities += disabled;
                            }
                        }
                    }
                }

                if (process.env.SIM_DEBUG === '1') {
                    assertWorkforceCategory(category, age, l);
                }

                accumulator[age][l].deaths += deaths;
                accumulator[age][l].disabilities += disabilities;

                if (assets.deaths.thisMonth[l] === undefined) {
                    assets.deaths.thisMonth[l] = 0;
                }
                if (assets.disabilities.thisMonth[l] === undefined) {
                    assets.disabilities.thisMonth[l] = 0;
                }
                assets.deaths.thisMonth[l] += deaths;
                assets.disabilities.thisMonth[l] += disabilities;
            }
        }
    }
    if (profiler?.isEnabled) {
        profiler.markAndAccum('wfDemoCells', '  wfDemo_cells', t_cell);
    }
    return accumulator;
}

const assertWorkforceCategory = (category: WorkforceCategory, age: number, edu: EducationLevelType) => {
    if (category.active < 0) {
        throw new Error(
            `Negative active workforce after demographic tick at age ${age}, edu ${edu}. This should never happen. Active count: ${category.active}`,
        );
    }
    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
        if ((category.voluntaryDeparting[m] ?? 0) < 0) {
            throw new Error(
                `Negative voluntary departing workforce after demographic tick at age ${age}, edu ${edu}, month ${m}. This should never happen. Voluntary departing count: ${category.voluntaryDeparting[m]}`,
            );
        }
        if ((category.departingFired[m] ?? 0) < 0) {
            throw new Error(
                `Negative fired departing workforce after demographic tick at age ${age}, edu ${edu}, month ${m}. This should never happen.
                Fired departing count: ${category.departingFired[m]}`,
            );
        }
        if ((category.departingRetired[m] ?? 0) < 0) {
            throw new Error(
                `Negative retired departing workforce after demographic tick at age ${age}, edu ${edu}, month ${m}. This should never happen.
                Retired departing count: ${category.departingRetired[m]}`,
            );
        }
    }
};
