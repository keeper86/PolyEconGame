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

import type { GameState } from '../planet';
import { syncWorkforceWithPopulation } from '../workforce';

import { populationAdvanceYear } from './aging';
import { calculateDemographicStats } from './demographics';
import { applyDisability } from './disability';
import { populationBirthsTick } from './fertility';
import { applyMortality } from './mortality';
import { consumeFood } from './nutrition';

// ---------------------------------------------------------------------------
// Per-tick population update
// ---------------------------------------------------------------------------

export function populationTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const { population } = planet;

        const { populationTotal, fertileWomen, totalInCohort } = calculateDemographicStats(population);

        if (populationTotal === 0) {
            return; // no population, skip
        }

        // 1. Food consumption & starvation tracking
        consumeFood(planet, population, populationTotal, gameState.agents);

        // 2. Mortality — writes population.tickDeaths
        applyMortality(population, planet.environment, totalInCohort);

        // 3. Disability — writes population.tickNewDisabilities
        applyDisability(population, planet.environment);

        // 4. Births
        populationBirthsTick(population, fertileWomen, planet.environment.pollution);

        // 5. Sync workforce with authoritative population deaths & disabilities
        syncWorkforceWithPopulation(gameState.agents, planet.id, population, planet.environment, planet);
    });
}

// ---------------------------------------------------------------------------
// Year-boundary aging
// ---------------------------------------------------------------------------

/**
 * Called at every year boundary.
 * Applies aging and education progression to every planet's population.
 */
export function populationAdvanceYearTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const { totalInCohort } = calculateDemographicStats(planet.population);
        populationAdvanceYear(planet.population, totalInCohort);
    });
}
