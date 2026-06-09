import type { Population } from './population';
import { reducePopulationCohort } from './population';
import { START_FERTILE_AGE, END_FERTILE_AGE } from './fertility';

export interface DemographicStats {
    populationTotal: number;

    fertileWomen: number;

    totalInCohort: number[];
}

export function calculateDemographicStats(population: Population): DemographicStats {
    let populationTotal = 0;
    let fertileWomen = 0;

    const totalInCohort: number[] = population.demography.map((cohort, age) => {
        const cohortTotal = reducePopulationCohort(cohort).total;
        if (age >= START_FERTILE_AGE && age <= END_FERTILE_AGE) {
            fertileWomen += cohortTotal * 0.5;
        }
        populationTotal += cohortTotal;
        return cohortTotal;
    });

    return { populationTotal, fertileWomen, totalInCohort };
}
