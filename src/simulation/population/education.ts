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
        graduationProbability: 0.9,
        genericDropoutProbability: 0.01,
        transitionProbability: 0.95,
    },
    primary: {
        name: 'Primary',
        type: 'primary',
        nextEducation: () => educationLevels.secondary,
        description: 'Primary education. Attending High School.',
        graduationAge: 17,
        graduationPreAgeProbability: 0.1, // graduation can occur between 16 and 18
        graduationProbability: 0.75,
        genericDropoutProbability: 0.02,
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
        // before graduation age
        return Math.pow(graduationPreAgeProbability, ageDifferenceToGraduation);
    }
    return graduationProbability;
};

// at which age will education dropouts occur?
export const ageDropoutProbabilityForEducation = (age: number, level: EducationLevelType): number => {
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
