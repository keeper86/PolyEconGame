/**
 * population/aging.ts
 *
 * Year-boundary logic: shifts every cohort up by one age year and applies
 * education-progression / dropout transitions.
 */

import type { Population, Cohort } from '../planet';
import { educationLevelKeys, educationLevels, maxAge, OCCUPATIONS } from '../planet';
import {
    ageDropoutProbabilityForEducation,
    educationGraduationProbabilityForAge,
    emptyCohort,
} from './populationHelpers';
import { stochasticRound } from '../utils/stochasticRound';

/**
 * Advance the population by one year: shift every cohort to age + 1 and
 * process education graduation / dropout transitions.
 *
 * Cohort 0 is left empty — it will be filled over the coming year by
 * per-tick births.
 *
 * People at maxAge remain at maxAge (they cannot age further) and will
 * eventually die via per-tick mortality.  Workers aging from maxAge-1 to
 * maxAge are merged with any survivors already at maxAge.
 *
 * @param population     the population to mutate
 * @param totalInCohort  pre-computed totals per age (used to skip empty cohorts)
 */
export const populationAdvanceYear = (population: Population, totalInCohort: number[]): void => {
    const newdemography: Cohort[] = Array.from({ length: maxAge + 1 }, () => emptyCohort());

    // --- Carry over existing maxAge survivors first ---
    // People already at maxAge stay at maxAge (they can't age further).
    // They will be merged with new arrivals from age maxAge-1 below.
    const existingMaxAge = population.demography[maxAge];
    if (existingMaxAge) {
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                newdemography[maxAge][edu][occ] += existingMaxAge[edu][occ];
            }
        }
    }

    for (let age = 0; age < maxAge; age++) {
        const cohort = population.demography[age];
        const total = totalInCohort[age];
        if (!total || total === 0) {
            continue;
        }

        const nextAgeCohort = emptyCohort();

        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                const count = cohort[edu][occ];
                if (count === 0) {
                    continue;
                }

                if (occ === 'education') {
                    const gradProb = educationGraduationProbabilityForAge(age, edu);
                    const graduates = stochasticRound(count * gradProb);
                    const stay = count - graduates;

                    const educationLevel = educationLevels[edu];
                    const nextEducation = educationLevel.nextEducation();

                    if (graduates > 0 && nextEducation) {
                        const transitionProbability = educationLevel.transitionProbability;
                        const transitioners = stochasticRound(graduates * transitionProbability);
                        const voluntaryDropouts = graduates - transitioners;

                        nextAgeCohort[nextEducation.type][occ] += transitioners;
                        nextAgeCohort[nextEducation.type].unoccupied += voluntaryDropouts;
                    }

                    if (stay > 0) {
                        const dropOutProb = ageDropoutProbabilityForEducation(age, edu);
                        const dropouts = Math.ceil(stay * dropOutProb);
                        const remainers = stay - dropouts;

                        if (age < 6) {
                            // Before age 6, children cannot drop out of education
                            nextAgeCohort[edu][occ] += dropouts;
                        } else {
                            nextAgeCohort[edu].unoccupied += dropouts;
                        }
                        nextAgeCohort[edu][occ] += remainers;
                    }
                } else {
                    nextAgeCohort[edu][occ] += count;
                }
            }
        }

        // Age maxAge-1 → maxAge: merge with existing maxAge survivors
        // All other ages just shift up by 1
        if (age + 1 === maxAge) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    newdemography[maxAge][edu][occ] += nextAgeCohort[edu][occ];
                }
            }
        } else {
            newdemography[age + 1] = nextAgeCohort;
        }
    }

    population.demography = newdemography;
};
