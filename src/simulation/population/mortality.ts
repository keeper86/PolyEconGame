/**
 * population/mortality.ts
 *
 * Per-tick mortality calculations: combines base age-dependent mortality with
 * environmental factors (pollution, natural disasters) and starvation to
 * produce a per-tick death rate for each age cohort.
 *
 * ## Starvation → mortality mapping
 *
 * `starvationLevel` (S) now tracks the food shortfall directly (see
 * nutrition.ts).  The mortality contribution uses `S²` (quadratic) so
 * that:
 *
 *   - S = 0   → 0     extra annual mortality (fully fed)
 *   - S = 0.5 → 0.25  (moderate — ~25 % extra annual mortality)
 *   - S = 0.9 → 0.81  (severe — ~81 % extra annual mortality)
 *   - S = 1   → 1     (extreme — doubles+ base mortality)
 *
 * In addition base mortality is amplified by `(1 + S² × 9)` which scales
 * the life-table rate up to 10× at full starvation.  Together these
 * produce heavy but survivable mortality at partial food levels.
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
 * Compute the total extra annual mortality from pollution, disasters, and
 * starvation.  The starvation component uses S² (quadratic) so that
 * partial food shortages produce moderate — but not catastrophic — extra
 * mortality.
 */
export function computeExtraAnnualMortality(
    environmentalMortality: EnvironmentalMortality,
    starvationLevel: number,
): number {
    return (
        environmentalMortality.pollutionMortalityRate +
        environmentalMortality.disasterDeathProbability +
        Math.pow(starvationLevel, 2)
    );
}

/**
 * Compute the per-tick mortality probability for a given age cohort.
 *
 * Combines:
 * - base age-dependent mortality (from life-table), amplified by starvation:
 *       baseMort × (1 + S² × 9)
 *   At S = 1 base mortality is 10× normal; at S = 0.5 it is ~3.25×.
 * - extra annual mortality from pollution + disasters + starvation (additive)
 *
 * Returns a value in [0, MAX_MORTALITY_PER_TICK].
 */
export function perTickMortality(age: number, starvationLevel: number, extraAnnualMortality: number): number {
    const baseAnnualMort = mortalityProbability(age) * (1 + Math.pow(starvationLevel, 2) * 9);
    const combinedAnnualMort = Math.min(1, baseAnnualMort + extraAnnualMortality);
    return Math.min(MAX_MORTALITY_PER_TICK, convertAnnualToPerTick(combinedAnnualMort));
}
