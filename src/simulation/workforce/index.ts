/**
 * workforce/index.ts
 *
 * Barrel file — re-exports the public API of the workforce module so that
 * external consumers (engine, production, tests) can continue to import
 * from `./workforce` (which now resolves to this directory's index).
 */

// ---------------------------------------------------------------------------
// Helpers, constants, data-structure factories & aggregation
// ---------------------------------------------------------------------------
export {
    // Constants
    MAX_TENURE_YEARS,
    NOTICE_PERIOD_MONTHS,
    VOLUNTARY_QUIT_RATE_PER_TICK,
    MIN_TENURE_FOR_FIRING,
    DEPARTING_EFFICIENCY,
    DEFAULT_HIRE_AGE_MEAN,
    RETIREMENT_AGE,
    ACCEPTABLE_IDLE_FRACTION,
    // Productivity multipliers
    ageProductivityMultiplier,
    experienceMultiplier,
    // Math (legacy, kept for visualization)
    normalCdf,
    expectedRateForMoments,
    // Raw moment helpers
    ageMean,
    ageVariance,
    emptyAgeMoments,
    ageMomentsForAge,
    mergeAgeMoments,
    removeFromAgeMoments,
    removeRandomSample,
    extractRandomSample,
    ageAgeMomentsByOneYear,
    // Data-structure factories
    emptyTenureCohort,
    createWorkforceDemography,
    // Aggregation helpers
    totalActiveForEdu,
    totalDepartingForEdu,
    totalDepartingFiredForEdu,
} from './workforceHelpers';

// ---------------------------------------------------------------------------
// Population ↔ Workforce bridge
// ---------------------------------------------------------------------------
export { totalUnoccupiedForEdu, hireFromPopulation, returnToPopulation, retireToPopulation } from './populationBridge';

// ---------------------------------------------------------------------------
// Per-tick labor-market logic
// ---------------------------------------------------------------------------
export { laborMarketTick } from './laborMarketTick';

// ---------------------------------------------------------------------------
// Allocated-worker target computation
// ---------------------------------------------------------------------------
export { updateAllocatedWorkers } from './allocatedWorkers';

// ---------------------------------------------------------------------------
// Per-month labor-market logic
// ---------------------------------------------------------------------------
export { laborMarketMonthTick } from './laborMarketMonthTick';

// ---------------------------------------------------------------------------
// Per-year labor-market logic
// ---------------------------------------------------------------------------
export { laborMarketYearTick } from './laborMarketYearTick';

// ---------------------------------------------------------------------------
// Workforce ↔ Population sync
// ---------------------------------------------------------------------------
export { syncWorkforceWithPopulation, applyPopulationDeathsToWorkforce } from './workforceSync';
