import type { Planet } from '../planet/planet';
import { computeEnvironmentalDisability, computeTotalDisabilityProbability } from './disability';
import type { InheritanceRecord } from './inheritance';
import { redistributeInheritance } from './inheritance';
import { computeEnvironmentalMortality, computeMortalityProbabilityPerTick } from './mortality';
import { forEachPopulationCohort, transferPopulation } from './population';
import { stochasticRound } from '../utils/stochasticRound';
import type { WorkforceEventAccumulator } from '../workforce/workforceDemographicTick';
import { START_FERTILE_AGE, END_FERTILE_AGE } from './fertility';

export interface PopulationCounters {
    populationTotal: number;
    fertileWomen: number;
    weightedStarvation: number;
}

export function applyMortalityAndDisability(
    planet: Planet,
    workforceEvents: WorkforceEventAccumulator,
): PopulationCounters {
    const environmentalMortality = computeEnvironmentalMortality(planet.environment);
    const environmentalDisability = computeEnvironmentalDisability(planet.environment);
    const population = planet.population;

    const inheritanceByAge = new Map<number, number>();

    let populationTotal = 0;
    let fertileWomen = 0;
    let weightedStarvation = 0;

    population.demography.forEach((cohort, age) => {
        let ageTotal = 0;

        forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            // ── Count (pre-mortality snapshot) ──
            ageTotal += category.total;
            if (category.total > 0) {
                weightedStarvation += category.services.grocery.starvationLevel * category.total;
            }

            if (category.total === 0) {
                category.deaths.countThisTick = 0;
                category.disabilities.countThisTick = 0;
                return;
            }

            // ── Compute death count ──

            let dead = 0;

            if (occ === 'employed') {
                dead = workforceEvents[age][edu][skill].deaths;
            } else {
                const starvationLevel = category.services.grocery.starvationLevel;
                const mortalityPerTick = computeMortalityProbabilityPerTick(
                    starvationLevel,
                    environmentalMortality,
                    age,
                );
                dead = stochasticRound(category.total * mortalityPerTick);
            }

            // ── Apply mortality first (this reduces category.total) ──

            if (dead > 0) {
                if (dead > category.total) {
                    throw new Error(
                        `Mortality count exceeds population at age ${age}, occ ${occ}, edu ${edu}, skill ${skill}: expected at most ${category.total} deaths, but got ${dead}.`,
                    );
                }

                const result = transferPopulation(planet, { age, occ, edu, skill }, undefined, dead);
                if (result.count !== dead) {
                    console.warn(
                        `Mortality transfer mismatch at age ${age}, occ ${occ}, edu ${edu}, skill ${skill}: expected ${dead} deaths, but actually transferred ${result.count}.`,
                    );
                }
                category.deaths.countThisMonth += result.count;
                category.deaths.countThisTick = result.count;

                if (result.inheritedWealth > 0) {
                    inheritanceByAge.set(age, (inheritanceByAge.get(age) ?? 0) + result.inheritedWealth);
                }
            } else {
                category.deaths.countThisTick = 0;
            }

            // ── Compute and apply disability (on post-mortality total) ──

            if (occ === 'unableToWork') {
                category.disabilities.countThisTick = 0;
                return;
            }

            let disabled = 0;

            if (occ === 'employed') {
                disabled = workforceEvents[age][edu][skill].disabilities;
            } else {
                const starvationLevel = category.services.grocery.starvationLevel;
                const perTickDisabilityProb = computeTotalDisabilityProbability(
                    age,
                    starvationLevel,
                    environmentalDisability,
                );
                disabled = stochasticRound(category.total * perTickDisabilityProb);
            }

            if (disabled > 0) {
                const moved = transferPopulation(
                    planet,
                    { age, occ, edu, skill },
                    { age, occ: 'unableToWork', edu, skill },
                    disabled,
                ).count;
                category.disabilities.countThisMonth += moved;
                category.disabilities.countThisTick = moved;
            } else {
                category.disabilities.countThisTick = disabled;
            }
        });

        populationTotal += ageTotal;
        if (age >= START_FERTILE_AGE && age <= END_FERTILE_AGE) {
            fertileWomen += ageTotal * 0.5;
        }
    });

    // ── Inheritance redistribution (same as before) ──
    const records: InheritanceRecord[] = [];
    for (const [sourceAge, amount] of inheritanceByAge) {
        records.push({ sourceAge, amount });
    }
    redistributeInheritance(population.demography, records);

    return { populationTotal, fertileWomen, weightedStarvation };
}
