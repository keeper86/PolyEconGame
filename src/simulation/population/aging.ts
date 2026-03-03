/**
 * population/aging.ts
 *
 * Year-boundary logic: shifts every cohort up by one age year and applies
 * education-progression / dropout transitions.
 */

import type { Population, Cohort, EducationLevelType, Occupation } from '../planet';
import { educationLevelKeys, educationLevels, maxAge, OCCUPATIONS } from '../planet';
import {
    ageDropoutProbabilityForEducation,
    educationGraduationProbabilityForAge,
    emptyCohort,
    emptyWealthCohort,
    getWealthDemography,
    mergeWealthMoments,
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

    // Build a new wealth demography parallel to the new demography.
    const oldWealth = getWealthDemography(population);
    const newWealth = Array.from({ length: maxAge + 1 }, () => emptyWealthCohort());
    // Counts accumulated in newdemography, used for wealth merging
    const newCounts: Array<Record<EducationLevelType, Record<Occupation, number>>> = Array.from(
        { length: maxAge + 1 },
        () => {
            const c = {} as Record<EducationLevelType, Record<Occupation, number>>;
            for (const l of educationLevelKeys) {
                c[l] = {} as Record<Occupation, number>;
                for (const o of OCCUPATIONS) {
                    c[l][o] = 0;
                }
            }
            return c;
        },
    );

    // Helper: add `addCount` people with wealth `srcW` into slot (targetAge, edu, occ)
    // in the new structures, using parallel-axis merge.
    function addToNew(
        targetAge: number,
        edu: EducationLevelType,
        occ: Occupation,
        addCount: number,
        srcW: { mean: number; variance: number },
    ): void {
        if (targetAge < 0 || targetAge > maxAge || addCount <= 0) return;
        const existing = newCounts[targetAge][edu][occ];
        newWealth[targetAge][edu][occ] = mergeWealthMoments(existing, newWealth[targetAge][edu][occ], addCount, srcW);
        newCounts[targetAge][edu][occ] += addCount;
    }

    // --- Carry over existing maxAge survivors first ---
    const existingMaxAge = population.demography[maxAge];
    if (existingMaxAge) {
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                const n = existingMaxAge[edu][occ];
                newdemography[maxAge][edu][occ] += n;
                addToNew(maxAge, edu, occ, n, oldWealth[maxAge][edu][occ]);
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
        const targetAge = Math.min(age + 1, maxAge);

        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                const count = cohort[edu][occ];
                if (count === 0) {
                    continue;
                }
                const srcW = oldWealth[age][edu][occ];

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
                        addToNew(targetAge, nextEducation.type, occ, transitioners, srcW);
                        nextAgeCohort[nextEducation.type].unoccupied += voluntaryDropouts;
                        addToNew(targetAge, nextEducation.type, 'unoccupied', voluntaryDropouts, srcW);
                    }

                    if (stay > 0) {
                        const dropOutProb = ageDropoutProbabilityForEducation(age, edu);
                        const dropouts = Math.ceil(stay * dropOutProb);
                        const remainers = stay - dropouts;

                        if (age < 6) {
                            nextAgeCohort[edu][occ] += dropouts;
                            addToNew(targetAge, edu, occ, dropouts, srcW);
                        } else {
                            nextAgeCohort[edu].unoccupied += dropouts;
                            addToNew(targetAge, edu, 'unoccupied', dropouts, srcW);
                        }
                        nextAgeCohort[edu][occ] += remainers;
                        addToNew(targetAge, edu, occ, remainers, srcW);
                    }
                } else {
                    nextAgeCohort[edu][occ] += count;
                    addToNew(targetAge, edu, occ, count, srcW);
                }
            }
        }

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
    population.wealthDemography = newWealth;
};
