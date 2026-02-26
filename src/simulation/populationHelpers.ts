import type { EducationLevelType, Cohort, Occupation, Population } from './planet';
import { educationLevels, educationLevelKeys, OCCUPATIONS } from './planet';

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

// Helper: create an empty cohort (all keys present, zeroed)
export function emptyCohort(): Cohort {
    const cohort = {} as Cohort;
    for (const l of educationLevelKeys) {
        cohort[l] = {} as Record<Occupation, number>;
        for (const o of OCCUPATIONS) {
            cohort[l][o] = 0;
        }
    }
    return cohort;
}

// Helper: sum a cohort
export function sumCohort(c: Cohort): number {
    let total = 0;
    for (const l of educationLevelKeys) {
        for (const o of OCCUPATIONS) {
            total += c[l][o];
        }
    }
    return total;
}

// Helper: distribute a total count according to the percentages of a source cohort
export function distributeLike(total: number, source: Cohort): Cohort {
    if (total === 0) {
        return emptyCohort();
    }
    const srcTotal = sumCohort(source);
    if (srcTotal === 0) {
        throw new Error('Cannot distribute from empty cohort');
    }
    const percentages: number[] = [];
    // Maintain a consistent order: EDUCATION_LEVELS x OCCUPATIONS
    for (const l of educationLevelKeys) {
        for (const o of OCCUPATIONS) {
            percentages.push(source[l][o] / srcTotal);
        }
    }

    // Use the largest-remainder method (Hamilton method) to avoid biasing
    // all rounding remainder into the last cell. This computes exact quotas,
    // floors them, then distributes remaining units to cells with largest
    // fractional parts.
    const quotas: number[] = percentages.map((p) => p * total);
    const floors: number[] = quotas.map((q) => Math.floor(q));
    const fractions: { idx: number; frac: number }[] = quotas.map((q, i) => ({ idx: i, frac: q - Math.floor(q) }));

    const allocated = floors.reduce((s, v) => s + v, 0);
    const remaining = total - allocated;

    // Sort indices by descending fractional part, tie-breaker by index to be deterministic
    fractions.sort((a, b) => {
        if (b.frac !== a.frac) {
            return b.frac - a.frac;
        }
        return a.idx - b.idx;
    });

    const counts = floors.slice();
    for (const f of fractions.slice(0, remaining)) {
        counts[f.idx] += 1;
    }

    const result = emptyCohort();
    let idx = 0;
    for (const l of educationLevelKeys) {
        for (const o of OCCUPATIONS) {
            result[l][o] = counts[idx++];
        }
    }
    return result;
}

export const mortalityProbability = (age: number) => {
    const mortalityByThousands: number[] = [
        5.5, 0.4, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1, 0.1, 0.2, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
        1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.3, 3.6, 4.0,
        4.4, 4.8, 5.2, 5.7, 6.2, 6.8, 7.5, 8.2, 9.0, 9.9, 10.9, 12.0, 13.2, 14.5, 15.9, 17.4, 19.0, 20.8, 22.7, 24.7,
        26.8, 29.0, 31.5, 34.0, 36.8, 39.8, 43.0, 46.5, 50.2, 54.2, 58.5, 63.0, 67.8, 72.9, 78.3, 84.0, 90.0, 96.5,
        103.5, 111.0, 119.0, 127.5, 136.5, 146.0, 156.0, 166.5, 177.5, 189.0, 201.0, 213.5, 226.5, 240.0, 254.0, 268.5,
        283.5, 299.0, 315.0,
    ];
    if (age < 0) {
        return 1.0;
    }
    if (age >= mortalityByThousands.length) {
        return 1.0; // cap at 100% for ages beyond the table
    }
    return mortalityByThousands[age] / 1000.0;
};

const expectedLifeExpectancy = () => {
    let remaining = 1.0; // start with 100% alive at birth
    let expectancy = 0;
    for (let age = 0; age < 100; age++) {
        expectancy += remaining;
        remaining *= 1 - mortalityProbability(age);
    }
    return expectancy;
};

console.log('Current life expectancy', expectedLifeExpectancy()); //72 years

// --- Food/resource helpers ---

export function totalPopulation(pop: Population): number {
    let total = 0;
    for (const c of pop.demography) {
        total += sumCohort(c);
    }
    return total;
}
