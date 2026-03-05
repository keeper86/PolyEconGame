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
import type { Environment, Population } from '../planet';
import { maxAge, educationLevelKeys, OCCUPATIONS } from '../planet';
import { distributeLike, emptyCohort, emptyAccumulator, mortalityProbability } from './populationHelpers';
import { stochasticRound } from '../utils/stochasticRound';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Cap total per-tick mortality to 95 % to avoid complete population
 * wipe-outs in a single tick.
 */
export const MAX_MORTALITY_PER_TICK = 0.95;

/**
 * Acute starvation mapping — an age-independent annual mortality component
 * representing direct deaths from severe malnutrition.  This is capped so
 * that even at S=1 we don't exceed realistic per-year probabilities.
 *
 * The exponent makes the curve strongly convex so moderate shortages have
 * limited acute lethality while severe, sustained famine causes large
 * annual death rates.
 */
export const STARVATION_ACUTE_POWER = 3;
export const STARVATION_ACUTE_MAX_ANNUAL = 0.9; // up to 90% annual

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
    // Chronic amplification of age-dependent baseline mortality
    const baseAnnualMort = mortalityProbability(age) * (1 + Math.pow(starvationLevel, 2) * 9);

    // Acute, age-independent starvation mortality (direct deaths from
    // malnutrition).  This is additive to the amplified base rate and to
    // environmental extra mortality.  Using a convex exponent ensures
    // moderate shortages remain survivable while severe famine causes
    // much higher annual death probabilities.
    const starvationAcuteAnnual = Math.min(
        STARVATION_ACUTE_MAX_ANNUAL,
        Math.pow(starvationLevel, STARVATION_ACUTE_POWER) * STARVATION_ACUTE_MAX_ANNUAL,
    );

    const combinedAnnualMort = Math.min(1, baseAnnualMort + starvationAcuteAnnual + extraAnnualMortality);
    return Math.min(MAX_MORTALITY_PER_TICK, convertAnnualToPerTick(combinedAnnualMort));
}

// ---------------------------------------------------------------------------
// Population-level mortality step
// ---------------------------------------------------------------------------

/**
 * Apply mortality to every age cohort of a population.
 *
 * - Computes environmental + starvation mortality per cohort.
 * - Removes the dead from each cohort (proportional redistribution via
 *   `distributeLike`).
 * - Records deaths per education × occupation in `population.tickDeaths`
 *   so that downstream steps (workforce sync) can consume them.
 *
 * This is the **only** place where demography shrinks due to death — the
 * orchestrator does not need to carry any accumulator.
 */
export function applyMortality(population: Population, environment: Environment, totalInCohort: number[]): void {
    const environmentalMortality = computeEnvironmentalMortality(environment);
    const extraAnnualMortality = computeExtraAnnualMortality(environmentalMortality);

    // Reset / create the tick-level death accumulator
    const tickDeaths = emptyAccumulator();
    // Age-resolved death accumulator for exact workforce moment updates
    const tickDeathsByAge: Record<number, Record<string, Record<string, number>>> = {};

    for (let age = maxAge; age >= 0; age--) {
        const cohort = population.demography[age];
        if (!cohort) {
            continue;
        }
        const total = totalInCohort[age];
        if (total === 0) {
            continue;
        }

        const totalPerTickMort = perTickMortality(age, population.starvationLevel, extraAnnualMortality);
        const survivors = stochasticRound(total * (1 - totalPerTickMort));

        if (survivors === 0) {
            // Everyone in this cohort died — record all as deaths
            let anyDead = false;
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    const dead = cohort[edu][occ] ?? 0;
                    tickDeaths[edu][occ] += dead;
                    if (dead > 0) {
                        anyDead = true;
                    }
                }
            }
            if (anyDead) {
                tickDeathsByAge[age] = {} as Record<string, Record<string, number>>;
                for (const edu of educationLevelKeys) {
                    tickDeathsByAge[age][edu] = {} as Record<string, number>;
                    for (const occ of OCCUPATIONS) {
                        tickDeathsByAge[age][edu][occ] = cohort[edu][occ] ?? 0;
                    }
                }
            }
            population.demography[age] = emptyCohort();
            continue;
        }

        const survivorsCohort = distributeLike(survivors, cohort);

        // Record deaths (before − after) per edu × occ
        let anyDead = false;
        for (const edu of educationLevelKeys) {
            for (const occ of OCCUPATIONS) {
                const dead = Math.max(0, (cohort[edu][occ] ?? 0) - (survivorsCohort[edu][occ] ?? 0));
                tickDeaths[edu][occ] += dead;
                if (dead > 0) {
                    anyDead = true;
                }
            }
        }
        if (anyDead) {
            tickDeathsByAge[age] = {} as Record<string, Record<string, number>>;
            for (const edu of educationLevelKeys) {
                tickDeathsByAge[age][edu] = {} as Record<string, number>;
                for (const occ of OCCUPATIONS) {
                    tickDeathsByAge[age][edu][occ] = Math.max(
                        0,
                        (cohort[edu][occ] ?? 0) - (survivorsCohort[edu][occ] ?? 0),
                    );
                }
            }
        }

        population.demography[age] = survivorsCohort;
    }

    population.tickDeaths = tickDeaths;
    population.tickDeathsByAge = tickDeathsByAge;
}
