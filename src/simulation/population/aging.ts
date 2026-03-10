/**
 * population/aging.ts
 *
 * Year-boundary logic: shifts every cohort up by one age year and applies
 * education-progression / dropout transitions.
 */

import { stochasticRound } from '../utils/stochasticRound';
import type { EducationLevelType } from './education';
import { educationGraduationProbabilityForAge, educationLevels, ageDropoutProbabilityForEducation } from './education';
import type { Population, Cohort, PopulationCategory, Skill, Occupation } from './population';
import {
    MAX_AGE,
    createEmptyCohort,
    nullPopulationCategory,
    forEachPopulationCohort,
    mergePopulationCategory,
} from './population';

type CategoryWithIndex = {
    occ: Occupation;
    edu: EducationLevelType;
    skill: Skill;
    cat: PopulationCategory;
};
/**
 * Advance the population by one year: shift every cohort to age + 1 and
 * process education graduation / dropout transitions.
 *
 * Cohort 0 is left empty — it will be filled over the coming year by
 * per-tick births.
 *
 * People at MAX_AGE are carried forward (they remain at MAX_AGE).
 * Per-tick mortality already handles killing them.
 *
 */
export const populationAdvanceYear = (population: Population, totalInCohort: number[]): void => {
    const demo = population.demography;

    const maxAgeSnapshot: CategoryWithIndex[] = [];
    forEachPopulationCohort(demo[MAX_AGE], (category, occ, edu, skill) => {
        if (category.total > 0) {
            // Shallow-copy so the later zero-reset of slot MAX_AGE doesn't corrupt.
            maxAgeSnapshot.push({ occ, edu, skill, cat: { ...category, wealth: { ...category.wealth } } });
        }
    });

    // --- Descending shift: age MAX_AGE-1 down to 0 ---
    // Processing descending means slot k+1 is written BEFORE slot k is read as
    // a source for any subsequent step — there is no aliasing.
    for (let age = MAX_AGE - 1; age >= 0; age--) {
        const total = totalInCohort[age];
        const targetAge = age + 1;

        if (!total || total === 0) {
            // Source is empty: zero-reset target slot so last year's data is gone.
            resetCohortInPlace(demo[targetAge]);
            // Still need to restore carried-forward MAX_AGE people even when
            // age MAX_AGE-1 is empty.
            if (targetAge === MAX_AGE) {
                for (const { occ, edu, skill, cat } of maxAgeSnapshot) {
                    mergePopulationCategory(demo[MAX_AGE][occ][edu][skill], cat, cat.total);
                }
            }
            continue;
        }

        // Collect non-empty source cells.
        const srcCells: CategoryWithIndex[] = [];
        forEachPopulationCohort(demo[age], (category, occ, edu, skill) => {
            if (category.total > 0) {
                srcCells.push({ occ, edu, skill, cat: { ...category, wealth: { ...category.wealth } } });
            }
        });

        // Zero-reset the target slot.  Its previous contents have already been
        // processed (we go descending, so targetAge was already shifted up).
        resetCohortInPlace(demo[targetAge]);

        // Merge carry-forward MAX_AGE people into slot MAX_AGE when targetAge === MAX_AGE.
        if (targetAge === MAX_AGE) {
            for (const { occ, edu, skill, cat } of maxAgeSnapshot) {
                mergePopulationCategory(demo[MAX_AGE][occ][edu][skill], cat, cat.total);
            }
        }

        // Write source cells into target.
        for (const { occ, edu, skill, cat } of srcCells) {
            if (occ === 'education') {
                processEducationAging(demo, targetAge, age, cat, edu, skill);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                mergePopulationCategory((demo[targetAge] as any)[occ][edu][skill], cat, cat.total);
            }
        }
    }

    demo[0] = createEmptyCohort(nullPopulationCategory);
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Zero-reset every leaf PopulationCategory cell of a cohort in-place,
 * without allocating any new objects.
 */
function resetCohortInPlace(cohort: Cohort<PopulationCategory>): void {
    forEachPopulationCohort(cohort, (cat) => {
        cat.total = 0;
        cat.wealth.mean = 0;
        cat.wealth.variance = 0;
        cat.foodStock = 0;
        cat.starvationLevel = 0;
        cat.deaths.countThisTick = 0;
        cat.deaths.countThisMonth = 0;
        cat.deaths.countLastMonth = 0;
        cat.disabilities.countThisTick = 0;
        cat.disabilities.countThisMonth = 0;
        cat.disabilities.countLastMonth = 0;
        cat.retirements.countThisTick = 0;
        cat.retirements.countThisMonth = 0;
        cat.retirements.countLastMonth = 0;
    });
}

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
            mergePopulationCategory(newDemography[targetAge].education[nextEdu][skill], category, transitioners);
        }
        // Voluntary dropouts become unoccupied at the graduated level
        if (voluntaryDropouts > 0) {
            mergePopulationCategory(newDemography[targetAge].unoccupied[nextEdu][skill], category, voluntaryDropouts);
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
                mergePopulationCategory(newDemography[targetAge].education[edu][skill], category, dropouts);
            } else {
                // Older dropouts become unoccupied
                mergePopulationCategory(newDemography[targetAge].unoccupied[edu][skill], category, dropouts);
            }
        }
        if (remainers > 0) {
            mergePopulationCategory(newDemography[targetAge].education[edu][skill], category, remainers);
        }
    }
}
