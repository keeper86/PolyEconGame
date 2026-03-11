import type { Agent, Planet } from '../planet/planet';
import { assertPopulationWorkforceConsistency } from '../utils/testHelper';
import type { WorkforceEventAccumulator } from '../workforce/workforceDemographicTick';

import { populationAdvanceYear } from './aging';
import { calculateDemographicStats } from './demographics';
import { applyDisability } from './disability';
import { populationBirthsTick } from './fertility';
import { applyMortality } from './mortality';
import { consumeFood } from './nutrition';
import type { Population } from './population';
import { applyRetirement } from './retirement';

/**
 * Advance the population state of a planet by one simulation tick.
 *
 * @param planet - The planet whose population is being updated.
 * @param workforceEvents - Accumulator for workforce-related events during this tick.
 */
export function populationTick(planet: Planet, workforceEvents: WorkforceEventAccumulator): void {
    const { population } = planet;

    const { populationTotal, fertileWomen } = calculateDemographicStats(population);

    if (populationTotal === 0) {
        return; // no population, skip
    }

    applyMortality(population, planet.environment, workforceEvents);
    applyDisability(population, planet.environment, workforceEvents);
    applyRetirement(population); // no workforceEvents required, this applies only to education/unoccupied

    // After applying mortality/disability/retirement so workforceEvents are still consistent with population
    consumeFood(population);
    populationBirthsTick(population, fertileWomen, planet.environment.pollution);
}

export function populationAdvanceYearTick(population: Population): void {
    const { totalInCohort } = calculateDemographicStats(population);
    populationAdvanceYear(population, totalInCohort);
}
