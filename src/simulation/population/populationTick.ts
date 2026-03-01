/**
 * population/populationTick.ts
 *
 * Orchestrates the per-tick population update by composing the independent
 * sub-systems (nutrition → mortality → disability → fertility).
 *
 * Year-boundary aging is handled separately by `populationAdvanceYearTick`.
 */

import type { EducationLevelType, GameState, Occupation } from '../planet';
import { educationLevelKeys, maxAge, OCCUPATIONS } from '../planet';
import { distributeLike, emptyCohort } from '../populationHelpers';
import { applyPopulationDeathsToWorkforce } from '../workforce';

import { calculateDemographicStats } from './demographics';
import { consumeFood } from './nutrition';
import { computeEnvironmentalMortality, computeExtraAnnualMortality, perTickMortality } from './mortality';
import { applyDisabilityTransitions, computeEnvironmentalDisability } from './disability';
import { applyBirths, computeBirthsThisTick } from './fertility';
import { populationAdvanceYear } from './aging';

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
        consumeFood(planet, population, populationTotal);

        // 2. Pre-compute environmental factors (used by mortality & disability)
        const environmentalMortality = computeEnvironmentalMortality(planet.environment);
        const extraAnnualMortality = computeExtraAnnualMortality(environmentalMortality);
        const environmentalDisability = computeEnvironmentalDisability(planet.environment);

        // Accumulator of deaths per education × occupation for workforce sync
        const deathsByEduOcc: Record<EducationLevelType, Record<Occupation, number>> = {} as Record<
            EducationLevelType,
            Record<Occupation, number>
        >;
        for (const edu of educationLevelKeys) {
            deathsByEduOcc[edu] = {} as Record<Occupation, number>;
            for (const occ of OCCUPATIONS) {
                deathsByEduOcc[edu][occ] = 0;
            }
        }

        // 3. Apply mortality & disability per age cohort
        for (let age = maxAge; age >= 0; age--) {
            const cohort = population.demography[age];
            if (!cohort) {
                continue;
            }
            const total = totalInCohort[age];
            if (total === 0) {
                continue;
            }

            // --- Mortality ---
            const totalPerTickMort = perTickMortality(age, population.starvationLevel, extraAnnualMortality);
            const survivors = Math.floor(total * (1 - totalPerTickMort));

            if (survivors === 0) {
                population.demography[age] = emptyCohort();
                continue;
            }

            const survivorsCohort = distributeLike(survivors, cohort);

            // --- Disability ---
            applyDisabilityTransitions(survivorsCohort, age, environmentalDisability, population.starvationLevel);

            // --- Record deaths for workforce sync ---
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    const before = cohort[edu][occ] ?? 0;
                    const after = survivorsCohort[edu][occ] ?? 0;
                    const dead = Math.max(0, before - after);
                    deathsByEduOcc[edu][occ] += dead;
                }
            }

            population.demography[age] = survivorsCohort;
        }

        // 4. Births
        const birthsThisTick = computeBirthsThisTick(
            fertileWomen,
            population.starvationLevel,
            planet.environment.pollution,
        );
        applyBirths(population, birthsThisTick);

        // 5. Sync workforce with authoritative population deaths
        applyPopulationDeathsToWorkforce(gameState.agents, planet.id, deathsByEduOcc);
    });
}

// ---------------------------------------------------------------------------
// Year-boundary aging
// ---------------------------------------------------------------------------

/**
 * Called by `advanceTick` at every year boundary.
 * Applies aging and education progression to every planet's population.
 */
export function populationAdvanceYearTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const { totalInCohort } = calculateDemographicStats(planet.population);
        populationAdvanceYear(planet.population, totalInCohort);
    });
}
