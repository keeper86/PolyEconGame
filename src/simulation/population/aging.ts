/**
 * population/aging.ts
 *
 * Year-boundary logic: shifts every cohort up by one age year and applies
 * education-progression / dropout transitions.
 */

import { stochasticRound } from '../utils/stochasticRound';
import type { EducationLevelType } from './education';
import { educationGraduationProbabilityForAge, educationLevels, ageDropoutProbabilityForEducation } from './education';
import type { Population, Cohort, PopulationCategory, Skill } from './population';
import {
    MAX_AGE,
    createEmptyCohort,
    nullPopulationCategory,
    forEachPopulationCohort,
    mergeGaussianMoments,
} from './population';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge a source PopulationCategory into a destination, pooling
 * total, wealth (Gaussian moments), foodStock and starvation.
 *
 * Demographic-event counters (deaths, disabilities, retirements) are
 * intentionally reset in the new demography (they are per-tick accumulators).
 */
function mergeCategory(dst: PopulationCategory, src: PopulationCategory, count: number): void {
    if (count <= 0) {
        return;
    }
    const srcWealth = src.wealth;
    dst.wealth = mergeGaussianMoments(dst.total, dst.wealth, count, srcWealth);
    const srcFoodPer = src.total > 0 ? src.foodStock / src.total : 0;
    dst.foodStock += srcFoodPer * count;
    // Weighted average starvation
    const totalAfter = dst.total + count;
    if (totalAfter > 0) {
        dst.starvationLevel = (dst.total * dst.starvationLevel + count * src.starvationLevel) / totalAfter;
    }
    dst.total += count;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

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
    const newDemography: Cohort<PopulationCategory>[] = Array.from({ length: MAX_AGE + 1 }, () =>
        createEmptyCohort(nullPopulationCategory),
    );

    // --- Carry over existing maxAge survivors first ---
    const existingMaxAge = population.demography[MAX_AGE];
    if (existingMaxAge) {
        forEachPopulationCohort(existingMaxAge, (category, occ, edu, skill) => {
            if (category.total <= 0) {
                return;
            }
            mergeCategory(newDemography[MAX_AGE][occ][edu][skill], category, category.total);
        });
    }

    // --- Shift each age cohort up by one year ---
    for (let age = 0; age < MAX_AGE; age++) {
        const cohort = population.demography[age];
        const total = totalInCohort[age];
        if (!total || total === 0) {
            continue;
        }

        const targetAge = Math.min(age + 1, MAX_AGE);

        forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            if (category.total <= 0) {
                return;
            }

            if (occ === 'education') {
                processEducationAging(newDemography, targetAge, age, category, edu, skill);
            } else {
                // Non-education occupations simply move to the next age
                mergeCategory(newDemography[targetAge][occ][edu][skill], category, category.total);
            }
        });
    }

    population.demography = newDemography;
};

// ---------------------------------------------------------------------------
// Education graduation / dropout transitions
// ---------------------------------------------------------------------------

/**
 * Handle education-related transitions during the yearly age shift.
 *
 * People in the 'education' occupation may:
 * 1. Graduate and transition to the next education level (still in education),
 * 2. Graduate but voluntarily drop out (become unoccupied),
 * 3. Remain at the current education level, or
 * 4. Drop out due to age (become unoccupied, or stay in education if < 6).
 */
function processEducationAging(
    newDemography: Cohort<PopulationCategory>[],
    targetAge: number,
    sourceAge: number,
    category: PopulationCategory,
    edu: EducationLevelType,
    skill: Skill,
): void {
    const count = category.total;
    const gradProb = educationGraduationProbabilityForAge(sourceAge, edu);
    const graduates = stochasticRound(count * gradProb);
    const stay = count - graduates;

    const educationLevel = educationLevels[edu];
    const nextEducation = educationLevel.nextEducation();

    // --- Graduates ---
    if (graduates > 0 && nextEducation) {
        const nextEdu = nextEducation.type;
        const transitionProbability = educationLevel.transitionProbability;
        const transitioners = stochasticRound(graduates * transitionProbability);
        const voluntaryDropouts = graduates - transitioners;

        // Transitioners continue education at the next level
        if (transitioners > 0) {
            mergeCategory(newDemography[targetAge].education[nextEdu][skill], category, transitioners);
        }
        // Voluntary dropouts become unoccupied at the graduated level
        if (voluntaryDropouts > 0) {
            mergeCategory(newDemography[targetAge].unoccupied[nextEdu][skill], category, voluntaryDropouts);
        }
    }

    // --- Non-graduates (stayers) ---
    if (stay > 0) {
        const dropOutProb = ageDropoutProbabilityForEducation(sourceAge, edu);
        const dropouts = Math.ceil(stay * dropOutProb);
        const remainers = stay - dropouts;

        if (dropouts > 0) {
            if (sourceAge < 6) {
                // Very young children who "drop out" stay in education at same level
                mergeCategory(newDemography[targetAge].education[edu][skill], category, dropouts);
            } else {
                // Older dropouts become unoccupied
                mergeCategory(newDemography[targetAge].unoccupied[edu][skill], category, dropouts);
            }
        }
        if (remainers > 0) {
            mergeCategory(newDemography[targetAge].education[edu][skill], category, remainers);
        }
    }
}
