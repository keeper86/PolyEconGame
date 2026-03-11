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

// @param agents - all agents that have assets on this planet. We guarantuee that only data for these assests are changed
// @param planet - the planet whose population is being updated
export function populationTick(
    agents: Map<string, Agent>,
    planet: Planet,
    workforceEvents: WorkforceEventAccumulator,
): void {
    const { population } = planet;

    const { populationTotal, fertileWomen } = calculateDemographicStats(population);

    if (populationTotal === 0) {
        return; // no population, skip
    }

    consumeFood(population);

    applyMortality(population, planet.environment, workforceEvents);
    applyDisability(population, planet.environment, workforceEvents);
    applyRetirement(population); // no workforceEvents required, this applies only to education/unoccupied

    populationBirthsTick(population, fertileWomen, planet.environment.pollution);

    if (process.env.SIM_DEBUG === '1') {
        assertPopulationWorkforceConsistency(agents, planet, 'populationTick');
    }
}

export function populationAdvanceYearTick(population: Population): void {
    const { totalInCohort } = calculateDemographicStats(population);
    populationAdvanceYear(population, totalInCohort);
}
