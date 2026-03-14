import type { Environment, Planet } from '../planet/planet';
import { forEachPopulationCohort, transferPopulation } from './population';
import { convertAnnualToPerTick } from '../utils/convertAnnualToPerTick';
import { stochasticRound } from '../utils/stochasticRound';
import type { WorkforceEventAccumulator } from '../workforce/workforceDemographicTick';

/**
 * Coefficient for starvation-driven disability: `c × S²`.
 * Chosen to be small relative to the pollution term so that chronic famine
 * produces meaningful but not catastrophic workforce degradation.
 * At S = 1: 0.05 annual disability probability.
 * At S = 0.5: 0.05 × 0.25 = 0.0125.
 */
export const STARVATION_DISABILITY_COEFFICIENT = 0.05;

/**
 * Genuine disability probability by age (annual).
 *
 * This only captures real medical / occupational disability transitions.
 * Retirement is handled by a separate workforce pipeline.
 */
export function ageDependentBaseDisabilityProb(age: number): number {
    if (age < 15) {
        return 0.001; // children: baseline (congenital conditions)
    } else if (age < 50) {
        return 0.0005; // working-age adults: low baseline
    } else if (age < 60) {
        return 0.005; // 50–59: slight increase
    } else if (age < 70) {
        return 0.01; // 60–69: moderate genuine disability
    } else if (age <= 90) {
        // 70–90: linear ramp from 0.01 to 0.33
        return 0.01 + ((age - 70) / 20) * (0.33 - 0.01);
    } else {
        return 0.33; // 90+: cap at 0.33
    }
}

export interface EnvironmentalDisability {
    pollutionDisabilityProb: number;
    disasterDisabilityProb: number;
}

/**
 * Compute annual disability probabilities from pollution and natural
 * disasters.
 */
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
                return; // skip already disabled
            }

            let disabilityEvents = 0;
            if (occ === 'employed') {
                disabilityEvents = workforceEvents[age][edu][skill].disabilities;
            } else {
                const perTickDisabilityProb = computeTotalDisabilityProbability(
                    age,
                    category.starvationLevel,
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
