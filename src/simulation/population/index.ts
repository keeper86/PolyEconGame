/**
 * population/index.ts
 *
 * Barrel file — re-exports the public API so that external consumers can
 * continue to import from `./population` (which now resolves to this
 * directory's index).
 */

// Orchestrator (main entry points used by the engine)
export { populationTick } from './populationTick';

// Sub-modules re-exported for direct use / testing
export { populationAdvanceYear } from './aging';
export { calculateDemographicStats } from './demographics';
export type { DemographicStats } from './demographics';
export { consumeFood, updateStarvationLevel, STARVATION_ADJUST_TICKS } from './nutrition';
export type { NutritionResult } from './nutrition';
export {
    convertAnnualToPerTick,
    computeEnvironmentalMortality,
    computeExtraAnnualMortality,
    perTickMortality,
    applyMortality,
    MAX_MORTALITY_PER_TICK,
} from './mortality';
export type { EnvironmentalMortality } from './mortality';
export {
    ageDependentBaseDisabilityProb,
    computeEnvironmentalDisability,
    applyDisabilityTransitions,
    applyDisability,
    STARVATION_DISABILITY_COEFFICIENT,
} from './disability';
export type { EnvironmentalDisability } from './disability';
export { retirementProbByAge, perTickRetirement, applyRetirementTransitions, applyRetirement } from './retirement';
export {
    computeBirthsThisTick,
    applyBirths,
    populationBirthsTick,
    fertReductionFromPollution,
    START_FERTILE_AGE,
    END_FERTILE_AGE,
    LIFETIME_FERTILITY,
} from './fertility';
export {
    emptyAccumulator,
    emptyWealthCohort,
    mergeWealthMoments,
    getWealthDemography,
    ZERO_WEALTH,
} from './populationHelpers';
