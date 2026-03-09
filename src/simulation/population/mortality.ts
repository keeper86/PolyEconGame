import type { Environment } from '../planet/planet';

import { stochasticRound } from '../utils/stochasticRound';
import type { Population } from './population';
import { convertAnnualToPerTick, forEachPopulationCohort, transferPopulation } from './population';

export const mortalityProbability = (age: number) => {
    const mortalityByThousands: number[] = [
        5.5, 0.4, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1, 0.1, 0.2, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
        1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.3, 3.6, 4.0,
        4.4, 4.8, 5.2, 5.7, 6.2, 6.8, 7.5, 8.2, 9.0, 9.9, 10.9, 12.0, 13.2, 14.5, 15.9, 17.4, 19.0, 20.8, 22.7, 24.7,
        26.8, 29.0, 31.5, 34.0, 36.8, 39.8, 43.0, 46.5, 50.2, 54.2, 58.5, 63.0, 67.8, 72.9, 78.3, 84.0, 90.0, 96.5,
        103.5, 111.0, 119.0, 127.5, 136.5, 146.0, 156.0, 166.5, 177.5, 189.0, 201.0, 213.5, 226.5, 240.0, 254.0, 268.5,
        283.5, 299.0, 315.0,
    ];
    if (age < 0) {
        return 1.0;
    }
    if (age >= mortalityByThousands.length) {
        return 1.0; // cap at 100% for ages beyond the table
    }
    return mortalityByThousands[age] / 1000.0;
};

const expectedLifeExpectancy = () => {
    let remaining = 1.0; // start with 100% alive at birth
    let expectancy = 0;
    for (let age = 0; age < 100; age++) {
        expectancy += remaining;
        remaining *= 1 - mortalityProbability(age);
    }
    return expectancy;
};

console.log('Current life expectancy', expectedLifeExpectancy()); //72 years

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Cap total per-tick mortality to 95 % to avoid complete population
 * wipe-outs in a single tick.
 */
export const MAX_MORTALITY_PER_TICK = 0.8;

/**
 * Acute starvation mapping — an age-independent annual mortality component
 * representing direct deaths from severe malnutrition.  This is capped so
 * that even at S=1 we don't exceed realistic per-year probabilities.
 *
 * The exponent makes the curve strongly convex so moderate shortages have
 * limited acute lethality while severe, sustained famine causes large
 * annual death rates.
 */
export const STARVATION_ACUTE_POWER = 4;

/**
 * Compute the annual mortality contributions from pollution and natural
 * disasters.  These are additive on top of the base age-dependent rate.
 */
export function computeEnvironmentalMortality(environment: Environment): number {
    const { pollution, naturalDisasters } = environment;

    const pollutionMortalityRate = pollution.air * 0.006 + pollution.water * 0.00002 + pollution.soil * 0.00001;

    const disasterDeathProbability =
        naturalDisasters.earthquakes * 0.0005 + naturalDisasters.floods * 0.00005 + naturalDisasters.storms * 0.000015;

    return pollutionMortalityRate + disasterDeathProbability;
}

/**
 * Apply mortality to every age cohort of a population.
 *
 * Now follows the same direct‑per‑cell pattern as disability:
 * for each education×occupation cell, a fraction dies according to the
 * per‑tick mortality probability.  Deaths are recorded in
 * `population.tickDeaths` and `population.tickDeathsByAge`.
 */
export function applyMortality(population: Population, environment: Environment): void {
    const environmentalMortality = computeEnvironmentalMortality(environment);

    population.demography.forEach((cohort, age) => {
        return forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            if (category.total === 0) {
                category.deaths.countThisTick = 0;
                return; // skip empty cells
            }

            const starvationAcuteMortality =
                category.starvationLevel === 0 ? 0 : Math.pow(category.starvationLevel, STARVATION_ACUTE_POWER);

            const perTickMort = Math.min(
                MAX_MORTALITY_PER_TICK,
                convertAnnualToPerTick(
                    mortalityProbability(age) * (1 + category.starvationLevel) +
                        environmentalMortality +
                        starvationAcuteMortality,
                ),
            );

            const dead = stochasticRound(category.total * perTickMort);
            const reallyDead = transferPopulation(population.demography, { age, occ, edu, skill }, undefined, dead);
            category.deaths.countThisMonth += reallyDead;
            category.deaths.countThisTick = reallyDead;
        });
    });
}
