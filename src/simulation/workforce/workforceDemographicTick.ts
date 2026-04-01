import { NOTICE_PERIOD_MONTHS } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import {
    computeTotalDisabilityProbability as computeDisabilityProbabilityPerTick,
    computeEnvironmentalDisability,
} from '../population/disability';
import { educationLevelKeys } from '../population/education';
import { computeEnvironmentalMortality, computeMortalityProbabilityPerTick } from '../population/mortality';
import type { EducationLevelType, Skill } from '../population/population';
import { MAX_AGE, SKILL } from '../population/population';
import { perTickRetirement } from '../population/retirement';
import { stochasticRound } from '../utils/stochasticRound';
import type { WorkforceCategory, WorkforceCohort } from './workforce';
import { forEachWorkforceCohort, totalDeparting } from './workforce';

export const VOLUNTARY_QUIT_RATE_PER_TICK = 0.0003;

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
            cohort[edu] = {} as Record<Skill, EventCounts>;
            for (const skill of SKILL) {
                cohort[edu][skill] = nullEventCounts();
            }
        }
        return cohort;
    });
}

function applyVoluntaryQuits(category: WorkforceCategory): void {
    if (category.active <= 0) {
        return;
    }
    const voluntaryQuitters = stochasticRound(category.active * VOLUNTARY_QUIT_RATE_PER_TICK);
    if (voluntaryQuitters > 0) {
        category.active -= voluntaryQuitters;
        category.voluntaryDeparting[NOTICE_PERIOD_MONTHS - 1] += voluntaryQuitters;
    }
}

export function workforceDemographicTick(agents: Map<string, Agent>, planet: Planet): WorkforceEventAccumulator {
    const accumulator = createWorkforceEventAccumulator(planet.population.demography.length);

    for (const agent of agents.values()) {
        const assets = agent.assets[planet.id];
        if (!assets?.workforceDemography) {
            continue;
        }

        const workforce = assets.workforceDemography;
        const environmentalMortality = computeEnvironmentalMortality(planet.environment);
        const environmentalDisability = computeEnvironmentalDisability(planet.environment);

        for (let age = 0; age < workforce.length; age++) {
            forEachWorkforceCohort(workforce[age], (category, edu, skill) => {
                applyVoluntaryQuits(category);

                if (category.active <= 0 && totalDeparting(category) <= 0) {
                    return;
                }

                const retirementProb = perTickRetirement(age);
                const populationCategory = planet.population.demography[age]?.employed?.[edu]?.[skill];
                const starvationLevel = populationCategory?.services?.grocery?.starvationLevel ?? 0;

                if (populationCategory === undefined) {
                    throw new Error(
                        `Missing population category for age ${age}, edu ${edu}, skill ${skill} in workforce demographic tick. This should never happen because the workforce category should always be in sync with the population cell.`,
                    );
                }

                const mortalityProbabilityPerTick = computeMortalityProbabilityPerTick(
                    starvationLevel,
                    environmentalMortality,
                    age,
                );
                let deaths = 0;

                const disabilityProbabilityPerTick = computeDisabilityProbabilityPerTick(
                    age,
                    starvationLevel,
                    environmentalDisability,
                );
                let disabilities = 0;

                if (category.active > 0) {
                    if (retirementProb > 0) {
                        const toRetire = stochasticRound(category.active * retirementProb);
                        if (toRetire > 0) {
                            category.active -= toRetire;
                            category.departingRetired[NOTICE_PERIOD_MONTHS - 1] += toRetire;
                        }
                    }

                    if (mortalityProbabilityPerTick > 0) {
                        const dead = stochasticRound(category.active * mortalityProbabilityPerTick);
                        category.active -= dead;
                        deaths += dead;
                    }

                    if (disabilityProbabilityPerTick > 0) {
                        const disabled = stochasticRound(category.active * disabilityProbabilityPerTick);
                        category.active -= disabled;
                        disabilities += disabled;
                    }
                }

                const applyEventsToPipelineSlot = (
                    month: number,
                    departing: number[],
                    alreadyInRetirement: false | 'alreadyInRetirement' = false,
                ): void => {
                    if (departing[month] > 0) {
                        if (retirementProb > 0 && alreadyInRetirement === false) {
                            const toRetire = stochasticRound(departing[month] * retirementProb);
                            category.departingRetired[month] += toRetire;
                            departing[month] -= toRetire;
                        }

                        if (mortalityProbabilityPerTick > 0) {
                            const dead = stochasticRound(departing[month] * mortalityProbabilityPerTick);
                            departing[month] -= dead;
                            deaths += dead;
                        }

                        if (disabilityProbabilityPerTick > 0) {
                            const disabled = stochasticRound(departing[month] * disabilityProbabilityPerTick);
                            departing[month] -= disabled;
                            disabilities += disabled;
                        }
                    }
                };

                for (let month = 0; month < NOTICE_PERIOD_MONTHS; month++) {
                    applyEventsToPipelineSlot(month, category.voluntaryDeparting);
                    applyEventsToPipelineSlot(month, category.departingFired);
                    applyEventsToPipelineSlot(month, category.departingRetired, 'alreadyInRetirement');
                }

                if (process.env.SIM_DEBUG === '1') {
                    assertWorkforceCategory(category, age, edu, skill);
                }

                accumulator[age][edu][skill].deaths += deaths;
                accumulator[age][edu][skill].disabilities += disabilities;

                if (assets.deaths.thisMonth[edu] === undefined) {
                    assets.deaths.thisMonth[edu] = 0;
                }
                if (assets.disabilities.thisMonth[edu] === undefined) {
                    assets.disabilities.thisMonth[edu] = 0;
                }
                assets.deaths.thisMonth[edu] += deaths;
                assets.disabilities.thisMonth[edu] += disabilities;
            });
        }
    }
    return accumulator;
}

const assertWorkforceCategory = (category: WorkforceCategory, age: number, edu: EducationLevelType, skill: Skill) => {
    if (category.active < 0) {
        throw new Error(
            `Negative active workforce after demographic tick at age ${age}, edu ${edu}, skill ${skill}. This should never happen. Active count: ${category.active}`,
        );
    }
    for (let m = 0; m < NOTICE_PERIOD_MONTHS; m++) {
        if ((category.voluntaryDeparting[m] ?? 0) < 0) {
            throw new Error(
                `Negative voluntary departing workforce after demographic tick at age ${age}, edu ${edu}, skill ${skill}, month ${m}. This should never happen. Voluntary departing count: ${category.voluntaryDeparting[m]}`,
            );
        }
        if ((category.departingFired[m] ?? 0) < 0) {
            throw new Error(
                `Negative fired departing workforce after demographic tick at age ${age}, edu ${edu}, skill ${skill}, month ${m}. This should never happen.
                Fired departing count: ${category.departingFired[m]}`,
            );
        }
        if ((category.departingRetired[m] ?? 0) < 0) {
            throw new Error(
                `Negative retired departing workforce after demographic tick at age ${age}, edu ${edu}, skill ${skill}, month ${m}. This should never happen.
                Retired departing count: ${category.departingRetired[m]}`,
            );
        }
    }
};
