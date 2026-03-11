/**
 * population/populationTick.ts
 *
 * Orchestrates the per-tick population update by composing the independent
 * sub-systems (nutrition → mortality → disability → fertility).
 *
 * Each step operates on the shared `Population` state and writes its
 * results (e.g. `tickDeaths`, `tickNewDisabilities`) into population
 * fields so that downstream systems (workforce sync, snapshots) can
 * consume them without requiring threaded accumulators.
 *
 * Year-boundary aging is handled separately by `populationAdvanceYearTick`.
 */

import type { Agent, Planet } from '../planet/planet';
import { assertPopulationWorkforceConsistency } from '../workforce/populationBridge';
import { syncWorkforceWithPopulation } from '../workforce/workforceSync';

import { populationAdvanceYear } from './aging';
import { calculateDemographicStats } from './demographics';
import { applyDisability } from './disability';
import { populationBirthsTick } from './fertility';
import { applyMortality } from './mortality';
import { consumeFood } from './nutrition';
import type { Population } from './population';
import { applyRetirement } from './retirement';

// ---------------------------------------------------------------------------
// Per-tick population update
// ---------------------------------------------------------------------------

export function populationTick(agents: Map<string, Agent>, planet: Planet): void {
    const { population } = planet;

    const { populationTotal, fertileWomen } = calculateDemographicStats(population);

    if (populationTotal === 0) {
        return; // no population, skip
    }

    // 1. Food consumption & starvation tracking
    consumeFood(population);

    // 2. Mortality — writes population.tickDeaths
    applyMortality(population, planet.environment);

    // 3. Disability — writes population.tickNewDisabilities
    applyDisability(population, planet.environment);

    // 4. Retirement — writes population.tickNewRetirements
    applyRetirement(population);

    // 5. Births
    populationBirthsTick(population, fertileWomen, planet.environment.pollution);

    // 6. Sync workforce with authoritative population deaths, disabilities & retirements
    syncWorkforceWithPopulation(agents, planet.id, population, planet.environment);

    // Verify population↔workforce consistency after sync
    if (process.env.SIM_DEBUG === '1') {
        assertPopulationWorkforceConsistency(agents, planet, 'populationTick/syncWorkforce');
    }
}

// ---------------------------------------------------------------------------
// Year-boundary aging
// ---------------------------------------------------------------------------

/**
 * Called at every year boundary.
 * Applies aging and education progression to every planet's population.
 */
export function populationAdvanceYearTick(population: Population): void {
    const { totalInCohort } = calculateDemographicStats(population);
    populationAdvanceYear(population, totalInCohort);
}
