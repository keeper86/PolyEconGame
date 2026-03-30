import { SERVICE_PER_PERSON_PER_TICK, TICKS_PER_YEAR } from '../constants';
import { groceryServiceResourceType } from '../planet/services';
import type { Environment } from '../planet/planet';
import { stochasticRound } from '../utils/stochasticRound';
import { STARVATION_ACUTE_POWER } from './mortality';
import type { Population } from './population';
import { forEachPopulationCohort } from './population';

function averageStarvationLevel(population: Population): number {
    let totalPop = 0;
    let weightedStarvation = 0;
    for (const cohort of population.demography) {
        forEachPopulationCohort(cohort, (cat) => {
            if (cat.total > 0) {
                weightedStarvation += cat.starvationLevel * cat.total;
                totalPop += cat.total;
            }
        });
    }
    return totalPop > 0 ? weightedStarvation / totalPop : 0;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const START_FERTILE_AGE = 18;

export const END_FERTILE_AGE = 45;

export const LIFETIME_FERTILITY = 3.0;

export function fertReductionFromPollution(pollution: Environment['pollution']): number {
    return Math.min(1, pollution.air * 0.01 + pollution.water * 0.002 + pollution.soil * 0.0005);
}

/**
 * Compute the number of births for this tick.
 *
 * @param fertileWomen   estimated number of fertile women in the population
 * @param starvationLevel current starvation level (0–1)
 * @param pollution      planet pollution levels
 * @returns number of newborns to add to age-cohort 0 this tick
 */
export function computeBirthsThisTick(
    fertileWomen: number,
    starvationLevel: number,
    pollution: Environment['pollution'],
): number {
    if (fertileWomen === 0) {
        return 0;
    }

    const fertReduction = fertReductionFromPollution(pollution);
    // Nonlinear starvation suppression: S^1.5 gives steeper drop under severe famine
    const lifetimeFertilityAdjusted =
        LIFETIME_FERTILITY * (1 - 0.75 * Math.pow(starvationLevel, STARVATION_ACUTE_POWER)) * (1 - 0.5 * fertReduction);

    const birthsPerYear = (lifetimeFertilityAdjusted * fertileWomen) / (END_FERTILE_AGE - START_FERTILE_AGE + 1);

    // Single stochastic round at the end — avoids the systematic downward
    // bias of the previous double-floor which would permanently suppress
    // births on small planets (e.g. expected 0.8 → always 0).
    return stochasticRound(birthsPerYear / TICKS_PER_YEAR);
}

export function applyBirths(population: Population, birthsThisTick: number): void {
    if (birthsThisTick > 0) {
        const cat = population.demography[0].education.none.novice;
        const prevTotal = cat.total;
        const newTotal = prevTotal + birthsThisTick;
        // Newborns arrive with zero wealth.  Preserve existing aggregate wealth
        // (prevTotal × mean) by scaling the mean down — do NOT touch
        // bank.householdDeposits because no money entered or left the system.
        cat.wealth.mean = prevTotal > 0 ? (prevTotal * cat.wealth.mean) / newTotal : 0;
        cat.wealth.variance = prevTotal > 0 ? (prevTotal * cat.wealth.variance) / newTotal : 0;
        cat.total = newTotal;
        // Newborns arrive with a small grocery service buffer gifted by their "neighbors" to get them started.
        const groceryServiceName = groceryServiceResourceType.name;
        cat.inventory[groceryServiceName] =
            (cat.inventory[groceryServiceName] ?? 0) + birthsThisTick * 10 * SERVICE_PER_PERSON_PER_TICK;
    }
}

export function populationBirthsTick(
    population: Population,
    fertileWomen: number,
    pollution: Environment['pollution'],
): void {
    const births = computeBirthsThisTick(fertileWomen, averageStarvationLevel(population), pollution);
    applyBirths(population, births);
}
