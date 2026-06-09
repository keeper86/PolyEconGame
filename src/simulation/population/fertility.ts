import { TICKS_PER_YEAR } from '../constants';
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
                weightedStarvation += cat.services.grocery.starvationLevel * cat.total;
                totalPop += cat.total;
            }
        });
    }
    return totalPop > 0 ? weightedStarvation / totalPop : 0;
}

export const START_FERTILE_AGE = 18;

export const END_FERTILE_AGE = 45;

export const LIFETIME_FERTILITY = 3.0;

export function fertReductionFromPollution(pollution: Environment['pollution']): number {
    return Math.min(1, pollution.air * 0.01 + pollution.water * 0.002 + pollution.soil * 0.0005);
}

export function computeBirthsThisTick(
    fertileWomen: number,
    starvationLevel: number,
    pollution: Environment['pollution'],
): number {
    if (fertileWomen === 0) {
        return 0;
    }

    const fertReduction = fertReductionFromPollution(pollution);

    const lifetimeFertilityAdjusted =
        LIFETIME_FERTILITY * (1 - 0.75 * Math.pow(starvationLevel, STARVATION_ACUTE_POWER)) * (1 - 0.5 * fertReduction);

    const birthsPerYear = (lifetimeFertilityAdjusted * fertileWomen) / (END_FERTILE_AGE - START_FERTILE_AGE + 1);

    return stochasticRound(birthsPerYear / TICKS_PER_YEAR);
}

export function applyBirths(population: Population, birthsThisTick: number): void {
    if (birthsThisTick > 0) {
        const cat = population.demography[0].education.none.novice;
        const prevTotal = cat.total;
        const newTotal = prevTotal + birthsThisTick;

        cat.wealth.mean = prevTotal > 0 ? (prevTotal * cat.wealth.mean) / newTotal : 0;
        cat.wealth.variance = prevTotal > 0 ? (prevTotal * cat.wealth.variance) / newTotal : 0;
        cat.total = newTotal;

        const prevBuffer = cat.services.grocery.buffer;
        const giftedTicksTotal = birthsThisTick * 30;
        cat.services.grocery.buffer = prevTotal > 0 ? (prevTotal * prevBuffer + giftedTicksTotal) / newTotal : 10;
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
