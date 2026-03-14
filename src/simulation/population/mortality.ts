import type { Environment, Planet } from '../planet/planet';

import { convertAnnualToPerTick } from '../utils/convertAnnualToPerTick';
import { stochasticRound } from '../utils/stochasticRound';
import type { WorkforceEventAccumulator } from '../workforce/workforceDemographicTick';
import type { InheritanceRecord } from './inheritance';
import { redistributeInheritance } from './inheritance';
import { forEachPopulationCohort, transferPopulation } from './population';

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

export const computeMortalityProbabilityPerTick = (
    starvationLevel: number,
    environmentalMortality: number,
    age: number,
): number => {
    const starvationAcuteMortality = starvationLevel === 0 ? 0 : Math.pow(starvationLevel, STARVATION_ACUTE_POWER);

    return Math.min(
        MAX_MORTALITY_PER_TICK,
        convertAnnualToPerTick(
            mortalityProbability(age) * (1 + starvationLevel) + environmentalMortality + starvationAcuteMortality,
        ),
    );
};

export function applyMortality(planet: Planet, workforceEvents: WorkforceEventAccumulator): void {
    const environmentalMortality = computeEnvironmentalMortality(planet.environment);
    const population = planet.population;

    // Collect inheritance records per source age
    const inheritanceByAge = new Map<number, number>();

    population.demography.forEach((cohort, age) => {
        return forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            if (category.total === 0) {
                category.deaths.countThisTick = 0;
                return; // skip empty cells
            }

            let dead = 0;

            if (occ === 'employed') {
                dead = workforceEvents[age][edu][skill].deaths;
                if (dead > category.total) {
                    throw new Error(
                        `Mortality count exceeds population at age ${age}, occ ${occ}, edu ${edu}, skill ${skill}: expected at most ${category.total} deaths, but got ${dead}.`,
                    );
                }
            } else {
                const mortalityPerTick = computeMortalityProbabilityPerTick(
                    category.starvationLevel,
                    environmentalMortality,
                    age,
                );
                dead = stochasticRound(category.total * mortalityPerTick);
            }

            const result = transferPopulation(planet, { age, occ, edu, skill }, undefined, dead);
            if (result.count !== dead) {
                console.warn(
                    `Mortality transfer mismatch at age ${age}, occ ${occ}, edu ${edu}, skill ${skill}: expected ${dead} deaths, but actually transferred ${result.count}.`,
                );
            }
            category.deaths.countThisMonth += result.count;
            category.deaths.countThisTick = result.count;

            // Accumulate inherited wealth for this source age
            if (result.inheritedWealth > 0) {
                inheritanceByAge.set(age, (inheritanceByAge.get(age) ?? 0) + result.inheritedWealth);
            }
        });
    });

    // Redistribute accumulated inherited wealth to younger generations
    const records: InheritanceRecord[] = [];
    for (const [sourceAge, amount] of inheritanceByAge) {
        records.push({ sourceAge, amount });
    }
    redistributeInheritance(population.demography, records);
}
