/**
 * population/disability.ts
 *
 * Per-tick disability transition logic.  Workers in non-disabled occupations
 * may transition to 'unableToWork' based on age, pollution, natural
 * disasters, and starvation.
 */

import type { Cohort, Occupation, Environment, Population } from '../planet';
import { educationLevelKeys, maxAge, OCCUPATIONS } from '../planet';
import { emptyAccumulator, sumCohort } from './populationHelpers';
import { convertAnnualToPerTick } from './mortality';
import { stochasticRound } from '../utils/stochasticRound';

// ---------------------------------------------------------------------------
// Starvation disability coefficient
// ---------------------------------------------------------------------------

/**
 * Coefficient for starvation-driven disability: `c × S²`.
 * Chosen to be small relative to the pollution term so that chronic famine
 * produces meaningful but not catastrophic workforce degradation.
 * At S = 1: 0.05 annual disability probability.
 * At S = 0.5: 0.05 × 0.25 = 0.0125.
 */
export const STARVATION_DISABILITY_COEFFICIENT = 0.05;

// ---------------------------------------------------------------------------
// Age-dependent base disability
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Environmental disability contributions (annual probabilities)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Per-tick disability transition
// ---------------------------------------------------------------------------

/** Occupations from which people can transition to 'unableToWork'. */
const DISABILITY_SOURCE_OCCUPATIONS: Occupation[] = ['company', 'government', 'education', 'unoccupied'];

/**
 * Apply disability transitions to a single age-cohort (in place).
 *
 * For each education × eligible occupation, a fraction of people is moved
 * to `unableToWork` based on the combined annual disability probability
 * converted to a per-tick rate.
 *
 * Starvation contributes `STARVATION_DISABILITY_COEFFICIENT × S²` to the
 * annual probability.  Recovery lag is automatic because S itself adjusts
 * gradually (see nutrition.ts), so no extra state variable is needed.
 */
export function applyDisabilityTransitions(
    cohort: Cohort,
    age: number,
    environmentalDisability: EnvironmentalDisability,
    starvationLevel: number = 0,
): void {
    const { pollutionDisabilityProb, disasterDisabilityProb } = environmentalDisability;
    const starvationDisabilityProb = STARVATION_DISABILITY_COEFFICIENT * Math.pow(starvationLevel, 2);
    const totalDisabilityProb =
        pollutionDisabilityProb +
        disasterDisabilityProb +
        ageDependentBaseDisabilityProb(age) +
        starvationDisabilityProb;
    const perTickDisabilityProb = convertAnnualToPerTick(totalDisabilityProb);

    for (const edu of educationLevelKeys) {
        for (const occ of DISABILITY_SOURCE_OCCUPATIONS) {
            const occCount = cohort[edu][occ];
            const moveFromOcc = stochasticRound(occCount * perTickDisabilityProb);
            if (moveFromOcc > 0) {
                cohort[edu][occ] -= moveFromOcc;
                cohort[edu].unableToWork += moveFromOcc;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Population-level disability step
// ---------------------------------------------------------------------------

/**
 * Apply disability transitions to every age cohort of a population.
 *
 * - Computes environmental + starvation disability per cohort.
 * - Moves affected people from source occupations to 'unableToWork'.
 * - Records new disability transitions per education × source-occupation
 *   in `population.tickNewDisabilities` for downstream consumption (e.g.
 *   workforce sync, snapshots).
 *
 * This is the **only** place where disability transitions happen — the
 * orchestrator does not need any inline loop.
 */
export function applyDisability(population: Population, environment: Environment): void {
    const environmentalDisability = computeEnvironmentalDisability(environment);
    const tickNewDisabilities = emptyAccumulator();
    // Age-resolved disability accumulator for exact workforce moment updates
    const tickDisabilitiesByAge: Record<number, Record<string, Record<string, number>>> = {};

    for (let age = maxAge; age >= 0; age--) {
        const cohort = population.demography[age];
        if (!cohort) {
            continue;
        }
        if (sumCohort(cohort) === 0) {
            continue;
        }

        // Snapshot occupation counts before the transition
        const before: Record<string, Record<string, number>> = {};
        for (const edu of educationLevelKeys) {
            before[edu] = {};
            for (const occ of OCCUPATIONS) {
                before[edu][occ] = cohort[edu][occ];
            }
        }

        applyDisabilityTransitions(cohort, age, environmentalDisability, population.starvationLevel);

        // Record net transitions into unableToWork per edu × source-occ
        let anyMoved = false;
        for (const edu of educationLevelKeys) {
            for (const occ of DISABILITY_SOURCE_OCCUPATIONS) {
                const moved = Math.max(0, before[edu][occ] - cohort[edu][occ]);
                if (moved > 0) {
                    tickNewDisabilities[edu][occ] += moved;
                    anyMoved = true;
                }
            }
        }
        if (anyMoved) {
            tickDisabilitiesByAge[age] = {} as Record<string, Record<string, number>>;
            for (const edu of educationLevelKeys) {
                tickDisabilitiesByAge[age][edu] = {} as Record<string, number>;
                for (const occ of DISABILITY_SOURCE_OCCUPATIONS) {
                    tickDisabilitiesByAge[age][edu][occ] = Math.max(0, before[edu][occ] - cohort[edu][occ]);
                }
            }
        }
    }

    population.tickNewDisabilities = tickNewDisabilities;
    population.tickDisabilitiesByAge = tickDisabilitiesByAge;
}
