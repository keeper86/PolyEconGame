/**
 * population/mortality.ts
 *
 * Per-tick mortality calculations: combines base age-dependent mortality with
 * environmental factors (pollution, natural disasters) and starvation to
 * produce a per-tick death rate for each age cohort.
 *
 * ## Starvation → mortality mapping
 *
 * Starvation (S) affects mortality ONLY via base amplification:
 *
 *     baseAnnualMort(age) = lifetableRate(age) × (1 + S² × k)
 *
 * where k = 9.  This keeps mortality effects in a single place and avoids
 * double counting.  The S² (convex) scaling means:
 *
 *   - S = 0   → no amplification      (fully fed)
 *   - S = 0.5 → 3.25× base mortality  (moderate famine)
 *   - S = 0.9 → 9.29× base mortality  (severe famine)
 *   - S = 1   → 10×  base mortality   (total famine)
 *
 * Extra annual mortality (pollution + disasters) is additive on top of the
 * amplified base rate.  Starvation does NOT appear again here.
 */

import { TICKS_PER_YEAR } from '../constants';
import type { Environment } from '../planet';
import { mortalityProbability } from '../populationHelpers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Cap total per-tick mortality to 95 % to avoid complete population
 * wipe-outs in a single tick.
 */
export const MAX_MORTALITY_PER_TICK = 0.95;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an annual probability to its per-tick equivalent so that
 * compounding over `TICKS_PER_YEAR` ticks yields the same annual rate.
 *
 *   1 - (1 - annualRate)^(1 / TICKS_PER_YEAR)
 */
export const convertAnnualToPerTick = (annualRate: number): number => {
    if (annualRate >= 1) {
        return 1;
    }
    return 1 - Math.pow(1 - annualRate, 1 / TICKS_PER_YEAR);
};

// ---------------------------------------------------------------------------
// Environmental mortality contributions (annual rates)
// ---------------------------------------------------------------------------

export interface EnvironmentalMortality {
    pollutionMortalityRate: number;
    disasterDeathProbability: number;
}

/**
 * Compute the annual mortality contributions from pollution and natural
 * disasters.  These are additive on top of the base age-dependent rate.
 */
export function computeEnvironmentalMortality(environment: Environment): EnvironmentalMortality {
    const { pollution, naturalDisasters } = environment;

    const pollutionMortalityRate = pollution.air * 0.006 + pollution.water * 0.00002 + pollution.soil * 0.00001;

    const disasterDeathProbability =
        naturalDisasters.earthquakes * 0.0005 + naturalDisasters.floods * 0.00005 + naturalDisasters.storms * 0.000015;

    return { pollutionMortalityRate, disasterDeathProbability };
}

/**
 * Compute the total extra annual mortality from pollution and disasters.
 * Starvation is NOT included here — it affects mortality only via base
 * amplification in `perTickMortality`, preventing double counting.
 */
export function computeExtraAnnualMortality(environmentalMortality: EnvironmentalMortality): number {
    return environmentalMortality.pollutionMortalityRate + environmentalMortality.disasterDeathProbability;
}

/**
 * Compute the per-tick mortality probability for a given age cohort.
 *
 * Combines:
 * - base age-dependent mortality (from life-table), amplified by starvation:
 *       baseMort × (1 + S² × 9)
 *   At S = 1 base mortality is 10× normal; at S = 0.5 it is ~3.25×.
 *   Using S² (convex curve) gives a biologically realistic damage response:
 *   mild shortage → moderate increase; severe famine → extreme mortality.
 * - extra annual mortality from pollution + disasters (additive)
 *   Starvation does NOT appear in extraAnnualMortality to avoid double counting.
 *
 * Returns a value in [0, MAX_MORTALITY_PER_TICK].
 */
export function perTickMortality(age: number, starvationLevel: number, extraAnnualMortality: number): number {
    const baseAnnualMort = mortalityProbability(age) * (1 + Math.pow(starvationLevel, 2) * 9);
    const combinedAnnualMort = Math.min(1, baseAnnualMort + extraAnnualMortality);
    return Math.min(MAX_MORTALITY_PER_TICK, convertAnnualToPerTick(combinedAnnualMort));
}
