/**
 * population/demographics.ts
 *
 * Shared demographic statistics computed once per planet per tick and
 * reused by multiple sub-systems (nutrition, mortality, fertility, …).
 */

import type { Population } from './population';
import { reducePopulationCohort } from './population';
import { START_FERTILE_AGE, END_FERTILE_AGE } from './fertility';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DemographicStats {
    /** Total living population across all age cohorts. */
    populationTotal: number;
    /** Estimated number of fertile women (50 % of cohorts in fertile-age range). */
    fertileWomen: number;
    /** Total people per age index (length = number of cohorts). */
    totalInCohort: number[];
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

/**
 * Compute aggregate demographic statistics from a population's demography
 * array.  This is a pure read — the population is not modified.
 */
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
