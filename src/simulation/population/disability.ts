import type { Environment, Planet } from '../planet/planet';
import { forEachPopulationCohort, transferPopulation } from './population';
import { convertAnnualToPerTick } from '../utils/convertAnnualToPerTick';
import { stochasticRound } from '../utils/stochasticRound';
import type { WorkforceEventAccumulator } from '../workforce/workforceDemographicTick';

export const STARVATION_DISABILITY_COEFFICIENT = 0.05;

export function ageDependentBaseDisabilityProb(age: number): number {
    if (age < 15) {
        return 0.001;
    } else if (age < 50) {
        return 0.0005;
    } else if (age < 60) {
        return 0.005;
    } else if (age < 70) {
        return 0.01;
    } else if (age <= 90) {
        return 0.01 + ((age - 70) / 20) * (0.33 - 0.01);
    } else {
        return 0.33;
    }
}

export interface EnvironmentalDisability {
    pollutionDisabilityProb: number;
    disasterDisabilityProb: number;
}

export function computeEnvironmentalDisability(environment: Environment): EnvironmentalDisability {
    const { pollution, naturalDisasters } = environment;

    const pollutionDisabilityProb = Math.min(
        0.5,
        pollution.air * 0.0001 + pollution.water * 0.0001 + pollution.soil * 0.00002,
    );

    const disasterDisabilityProb = Math.min(
        0.3,
        naturalDisasters.earthquakes * 0.00005 +
            naturalDisasters.floods * 0.000005 +
            naturalDisasters.storms * 0.0000015,
    );

    return { pollutionDisabilityProb, disasterDisabilityProb };
}

export function computeTotalDisabilityProbability(
    age: number,
    starvationLevel: number,
    environmentalDisability: EnvironmentalDisability,
): number {
    const starvationDisabilityProb = STARVATION_DISABILITY_COEFFICIENT * starvationLevel * starvationLevel;
    const probPerYear =
        environmentalDisability.pollutionDisabilityProb +
        environmentalDisability.disasterDisabilityProb +
        ageDependentBaseDisabilityProb(age) +
        starvationDisabilityProb;
    return convertAnnualToPerTick(probPerYear);
}

export function applyDisability(planet: Planet, workforceEvents: WorkforceEventAccumulator): void {
    const environmentalDisability = computeEnvironmentalDisability(planet.environment);
    const population = planet.population;

    population.demography.forEach((cohort, age) => {
        return forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            if (occ === 'unableToWork') {
                return;
            }

            let disabilityEvents = 0;
            if (occ === 'employed') {
                disabilityEvents = workforceEvents[age][edu][skill].disabilities;
            } else {
                const perTickDisabilityProb = computeTotalDisabilityProbability(
                    age,
                    category.services.grocery.starvationLevel,
                    environmentalDisability,
                );

                disabilityEvents = stochasticRound(category.total * perTickDisabilityProb);
            }

            const moved = transferPopulation(
                planet,
                { age, occ, edu, skill },
                { age, occ: 'unableToWork', edu, skill },
                disabilityEvents,
            ).count;
            category.disabilities.countThisMonth += moved;
            category.disabilities.countThisTick = moved;
        });
    });
}
