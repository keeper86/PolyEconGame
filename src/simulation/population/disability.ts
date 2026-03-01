/**
 * population/disability.ts
 *
 * Per-tick disability transition logic.  Workers in non-disabled occupations
 * may transition to 'unableToWork' based on age, pollution, and natural
 * disasters.
 */

import type { Cohort, Occupation, Environment } from '../planet';
import { educationLevelKeys } from '../planet';
import { convertAnnualToPerTick } from './mortality';

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
 */
export function applyDisabilityTransitions(
    cohort: Cohort,
    age: number,
    environmentalDisability: EnvironmentalDisability,
): void {
    const { pollutionDisabilityProb, disasterDisabilityProb } = environmentalDisability;
    const totalDisabilityProb = pollutionDisabilityProb + disasterDisabilityProb + ageDependentBaseDisabilityProb(age);
    const perTickDisabilityProb = convertAnnualToPerTick(totalDisabilityProb);

    for (const edu of educationLevelKeys) {
        for (const occ of DISABILITY_SOURCE_OCCUPATIONS) {
            const occCount = cohort[edu][occ];
            const moveFromOcc = Math.floor(occCount * perTickDisabilityProb);
            if (moveFromOcc > 0) {
                cohort[edu][occ] -= moveFromOcc;
                cohort[edu].unableToWork += moveFromOcc;
            }
        }
    }
}
