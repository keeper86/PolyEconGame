import { MIN_EMPLOYABLE_AGE } from '../constants';
import type { Planet } from '../planet/planet';
import { stochasticRound } from '../utils/stochasticRound';
import type { Skill } from './population';
import { transferPopulation } from './population';

export type EducationLevelType = 'none' | 'primary' | 'secondary' | 'tertiary';
export type EducationLevel = {
    type: EducationLevelType;
    name: string;
    nextEducation: () => EducationLevel | null;
    description: string;
    graduationAge: number;
    graduationPreAgeProbability: number; // probability of a year earlier graduation. two years  => probability**2 ...
    graduationProbability: number;
    genericDropoutProbability: number;
    transitionProbability: number;
};
export const educationLevels: { [key in EducationLevelType]: EducationLevel } = {
    none: {
        name: 'None',
        type: 'none',
        nextEducation: () => educationLevels.primary,
        description: 'No formal education. Attending Elementary school.',
        graduationAge: 9,
        graduationPreAgeProbability: 0.1, // graduation = starting primary school at age 5,6,7
        graduationProbability: 0.65, // ~35% still in elementary past age 9 each year; some reach 14 without graduating
        genericDropoutProbability: 0,
        transitionProbability: 0.9,
    },
    primary: {
        name: 'Primary',
        type: 'primary',
        nextEducation: () => educationLevels.secondary,
        description: 'Primary education. Attending High School.',
        graduationAge: 17,
        graduationPreAgeProbability: 0.1, // graduation can occur between 16 and 18
        graduationProbability: 0.75,
        genericDropoutProbability: 0,
        transitionProbability: 0.4,
    },
    secondary: {
        name: 'Secondary',
        type: 'secondary',
        nextEducation: () => educationLevels.tertiary,
        description: 'Secondary education. Attending University.',
        graduationAge: 22,
        graduationPreAgeProbability: 0.15, // graduation can occur between 18 and 26
        graduationProbability: 0.5,
        genericDropoutProbability: 0.06,
        transitionProbability: 0.3,
    },
    tertiary: {
        name: 'Tertiary',
        type: 'tertiary',
        nextEducation: () => null,
        description: 'Tertiary education. Finished all education levels.',
        graduationAge: 27,
        graduationPreAgeProbability: 0.1, // graduation can occur between 27 and 33
        graduationProbability: 0.1,
        genericDropoutProbability: 0.1,
        transitionProbability: 0,
    },
} as const;
export const educationLevelKeys = Object.keys(educationLevels) as EducationLevelType[];

export const educationGraduationProbabilityForAge = (age: number, level: EducationLevelType): number => {
    const { graduationAge, graduationPreAgeProbability, graduationProbability } = educationLevels[level];
    const ageDifferenceToGraduation = graduationAge - age;
    if (ageDifferenceToGraduation > 0) {
        return Math.pow(graduationPreAgeProbability, ageDifferenceToGraduation);
    }
    const yearsOverdue = age - graduationAge;
    return graduationProbability * Math.pow(1 - graduationPreAgeProbability, yearsOverdue);
};

// at which age will education dropouts occur?
export const ageDropoutProbabilityForEducation = (age: number, level: EducationLevelType): number => {
    if (age < MIN_EMPLOYABLE_AGE) {
        return 0;
    }
    const {
        graduationAge,
        graduationPreAgeProbability: graduationAgeSpread,
        genericDropoutProbability,
    } = educationLevels[level];
    if (age < graduationAge + graduationAgeSpread) {
        return genericDropoutProbability; // very low dropout chance before graduation age + spread
    }
    if (age == graduationAge + graduationAgeSpread) {
        return 0.5; // dropout chance spikes at graduation age + spread (e.g. 9 for primary)
    }
    return 0.95; // high dropout chance after graduation age + spread (e.g. 9 for primary)
};

export function applyEducationTransition(
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
        const dropouts = sourceAge < MIN_EMPLOYABLE_AGE ? 0 : stochasticRound(stay * dropOutProb);
        const remainers = stay - dropouts;

        if (dropouts > 0) {
            if (sourceAge <= 13) {
                throw new Error(
                    `Unexpected dropout at age 13 for education level ${edu} — check dropout probabilities and graduation ages.` +
                        ` (gradAge=${educationLevel.graduationAge}, gradSpread=${educationLevel.graduationPreAgeProbability}, dropProb=${dropOutProb})`,
                );
            }
            transferPopulation(
                planet,
                { age: sourceAge, occ: 'education', edu, skill },
                { age: targetAge, occ: 'unoccupied', edu, skill },
                dropouts,
            );
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
