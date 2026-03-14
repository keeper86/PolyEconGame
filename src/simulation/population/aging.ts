/**
 * population/aging.ts
 *
 * Year-boundary logic: shifts every cohort up by one age year and applies
 * education-progression / dropout transitions.
 *
 * All moves go through `transferPopulation` — the single authoritative API
 * that keeps `summedPopulation`, food stock, wealth moments, and
 * `bank.householdDeposits` consistent in one place.
 */

import type { Planet } from '../planet/planet';
import { stochasticRound } from '../utils/stochasticRound';
import type { EducationLevelType } from './education';
import { ageDropoutProbabilityForEducation, educationGraduationProbabilityForAge, educationLevels } from './education';
import type { Skill } from './population';
import {
    MAX_AGE,
    OCCUPATIONS,
    SKILL,
    forEachPopulationCohort,
    transferPopulation,
} from './population';
import { educationLevelKeys } from './education';

/**
 * Advance the population by one year: shift every cohort from age A to A+1,
 * apply education graduation / dropout transitions, and clear cohort 0 for
 * the coming year's births.
 *
 * Rules:
 * - People at MAX_AGE stay at MAX_AGE (per-tick mortality handles them).
 * - Processing is descending (MAX_AGE-1 → 0) to avoid aliasing: the
 *   destination slot (A+1) has already been fully written and vacated as a
 *   source before we read age A, so no temporary copies are needed.
 * - Every move goes through `transferPopulation` so that `summedPopulation`,
 *   wealth moments and `bank.householdDeposits` all stay in sync.
 */
export const populationAdvanceYear = (planet: Planet): void => {
    const demo = planet.population.demography;

    // Descending loop: write age+1 before reading age, so there is no aliasing.
    for (let age = MAX_AGE - 1; age >= 0; age--) {
        const targetAge = age + 1;

        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const count = demo[age][occ][edu][skill].total;
                    if (count <= 0) {
                        continue;
                    }

                    if (occ === 'education') {
                        applyEducationTransition(planet, age, targetAge, edu, skill);
                    } else {
                        // Plain cohort shift — zero-sum wealth move, no bank change.
                        transferPopulation(
                            planet,
                            { age, occ, edu, skill },
                            { age: targetAge, occ, edu, skill },
                            count,
                        );
                    }
                }
            }
        }
    }

    // Cohort 0 is now empty (all people were just moved to age 1).
    // Explicitly verify and leave it clean for per-tick births.
    // (transferPopulation already cleared the totals; this is a safety guard.)
    forEachPopulationCohort(demo[0], (cat) => {
        if (cat.total !== 0) {
            console.warn('[populationAdvanceYear] age-0 cohort not empty after shift — forcing zero');
            cat.total = 0;
            cat.wealth = { mean: 0, variance: 0 };
            cat.foodStock = 0;
        }
    });
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Apply education graduation and dropout transitions for a single
 * (age, edu, skill) cell moving from `sourceAge` to `targetAge`.
 *
 * All sub-moves use `transferPopulation` so wealth / summedPopulation /
 * householdDeposits stay consistent.
 */
function applyEducationTransition(
    planet: Planet,
    sourceAge: number,
    targetAge: number,
    edu: EducationLevelType,
    skill: Skill,
): void {
    const count = planet.population.demography[sourceAge].education[edu][skill].total;
    if (count <= 0) {
        return;
    }

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

        // Transitioners continue education at the next level.
        if (transitioners > 0) {
            transferPopulation(
                planet,
                { age: sourceAge, occ: 'education', edu, skill },
                { age: targetAge, occ: 'education', edu: nextEdu, skill },
                transitioners,
            );
        }
        // Voluntary dropouts enter the unoccupied pool at the graduated level.
        if (voluntaryDropouts > 0) {
            transferPopulation(
                planet,
                { age: sourceAge, occ: 'education', edu, skill },
                { age: targetAge, occ: 'unoccupied', edu: nextEdu, skill },
                voluntaryDropouts,
            );
        }
    }

    // --- Non-graduates (stayers and dropouts) ---
    if (stay > 0) {
        const dropOutProb = ageDropoutProbabilityForEducation(sourceAge, edu);
        const dropouts = Math.ceil(stay * dropOutProb);
        const remainers = stay - dropouts;

        if (dropouts > 0) {
            if (sourceAge < 6) {
                // Very young children who "drop out" stay in education at the same level.
                transferPopulation(
                    planet,
                    { age: sourceAge, occ: 'education', edu, skill },
                    { age: targetAge, occ: 'education', edu, skill },
                    dropouts,
                );
            } else {
                // Older dropouts become unoccupied.
                transferPopulation(
                    planet,
                    { age: sourceAge, occ: 'education', edu, skill },
                    { age: targetAge, occ: 'unoccupied', edu, skill },
                    dropouts,
                );
            }
        }
        if (remainers > 0) {
            transferPopulation(
                planet,
                { age: sourceAge, occ: 'education', edu, skill },
                { age: targetAge, occ: 'education', edu, skill },
                remainers,
            );
        }
    }
}
