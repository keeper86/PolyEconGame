import type { Planet } from '../planet/planet';
import { applyEducationTransition, educationLevelKeys } from './education';
import { MAX_AGE, OCCUPATIONS, SKILL, forEachPopulationCohort, transferPopulation } from './population';

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
            // Reset all service buffers and starvation levels
            for (const serviceName of Object.keys(cat.services) as (keyof typeof cat.services)[]) {
                cat.services[serviceName] = { buffer: 0, starvationLevel: 0 };
            }
        }
    });
};
