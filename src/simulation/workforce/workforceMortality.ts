/**
 * workforce/workforceMortality.ts
 *
 * Age-dependent workforce mortality using moment-based hazard integration.
 * Uses 3-point Gauss-Hermite quadrature to estimate mortality for each
 * (tenure × education) cohort from its age moments.
 */

import { TICKS_PER_YEAR } from '../constants';
import type { Agent } from '../planet';
import { educationLevelKeys } from '../planet';
import { mortalityProbability } from '../population/populationHelpers';
import { stochasticRound } from '../utils/stochasticRound';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert an annual mortality rate to a per-tick rate. */
const annualToPerTick = (annualRate: number): number => {
    if (annualRate >= 1) {
        return 1;
    }
    return 1 - Math.pow(1 - annualRate, 1 / TICKS_PER_YEAR);
};

/**
 * Compute the effective annual mortality for a cohort described by age
 * moments (mean, variance) using 3-point Gauss-Hermite quadrature:
 *   E[h(age)] ≈ (1/6)·h(μ − √3·σ) + (4/6)·h(μ) + (1/6)·h(μ + √3·σ)
 */
function momentBasedAnnualMortality(
    mean: number,
    variance: number,
    starvationLevel: number,
    extraMortalityPerYear: number,
): number {
    const stdDev = Math.sqrt(variance);
    const sqrt3 = Math.sqrt(3);
    const nodes = [mean - sqrt3 * stdDev, mean, mean + sqrt3 * stdDev];
    const weights = [1 / 6, 4 / 6, 1 / 6];

    let effective = 0;
    for (let i = 0; i < 3; i++) {
        const age = Math.max(0, Math.round(nodes[i]));
        const baseMort = mortalityProbability(age) * (1 + Math.pow(starvationLevel, 6) * 99);
        effective += weights[i] * Math.min(1, baseMort + extraMortalityPerYear);
    }
    return Math.min(1, effective);
}

// ---------------------------------------------------------------------------
// Workforce mortality tick
// ---------------------------------------------------------------------------

/**
 * workforceMortalityTick — removes workers who die from workforce cohorts.
 *
 * Called during populationTick after computing the planet-level mortality
 * rates.  Uses moment-based hazard integration to estimate the mortality
 * rate for each (tenure × education) cohort from its age moments.
 *
 * The removed workers are already accounted for in the population mortality
 * pass; this step keeps WorkforceDemography consistent with the population.
 *
 * @param agents            All agents whose workforce should be updated.
 * @param planetId          The planet for which mortality is being applied.
 * @param extraMortalityPerYear  Annual extra mortality from pollution / disasters.
 * @param starvationLevel   Current starvation level for the planet (0..1).
 */
export function workforceMortalityTick(
    agents: Agent[],
    planetId: string,
    extraMortalityPerYear: number,
    starvationLevel: number,
): void {
    for (const agent of agents) {
        const workforce = agent.assets[planetId]?.workforceDemography;
        if (!workforce) {
            continue;
        }

        for (const cohort of workforce) {
            for (const edu of educationLevelKeys) {
                const active = cohort.active[edu];
                if (active === 0) {
                    continue;
                }
                const { mean, variance } = cohort.ageMoments[edu];
                const annualMort = momentBasedAnnualMortality(mean, variance, starvationLevel, extraMortalityPerYear);
                const perTickMort = annualToPerTick(annualMort);
                const deaths = stochasticRound(active * perTickMort);
                if (deaths > 0) {
                    cohort.active[edu] -= deaths;
                }
            }
        }
    }
}
