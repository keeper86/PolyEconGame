export const START_YEAR = 2200;
export const TICKS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR; // = 360, derived — never set independently
export const FOOD_PER_PERSON_PER_TICK = 1 / TICKS_PER_YEAR; // tons per person per tick

/** Minimum age at which a person can be employed. People below this age are never hireable. */
export const MIN_EMPLOYABLE_AGE = 14;

/**
 * Number of months in the departing/firing pipeline.
 * Fired workers enter this pipeline and work at reduced efficiency
 * for its duration before leaving entirely.
 * Voluntary quits also use this pipeline.
 */
export const NOTICE_PERIOD_MONTHS = 3;

/** True only on clean month boundaries (every TICKS_PER_MONTH ticks). */
export const isMonthBoundary = (tick: number): boolean => tick > 0 && tick % TICKS_PER_MONTH === 0;

/** True only on clean year boundaries (every TICKS_PER_YEAR ticks). */
export const isYearBoundary = (tick: number): boolean => tick > 0 && tick % TICKS_PER_YEAR === 0;

// ---------------------------------------------------------------------------
// Food market constants
// ---------------------------------------------------------------------------

/**
 * Household food buffer target expressed as days of consumption.
 * Each cohort-class will try to maintain this many days of food stock.
 */
export const FOOD_BUFFER_TARGET_DAYS = 30;

/**
 * Household food buffer target expressed in ticks of consumption.
 * foodTarget per person = FOOD_BUFFER_TARGET_TICKS × FOOD_PER_PERSON_PER_TICK
 */
export const FOOD_BUFFER_TARGET_TICKS = FOOD_BUFFER_TARGET_DAYS;

/**
 * Price adjustment rate when inventory is *below* target (scarcity → price rises).
 */
export const FOOD_PRICE_ALPHA = 0.002;

/**
 * Price adjustment rate when inventory is *above* target (surplus → price falls).
 */
export const FOOD_PRICE_BETA = 0.001;

/**
 * Minimum food price (prevents zero or negative prices).
 */
export const FOOD_PRICE_FLOOR = 0.01;
export const FOOD_PRICE_CEIL = 1000000.0;

/**
 * Initial food price per unit (currency units per ton of agricultural product).
 */
export const INITIAL_FOOD_PRICE = 1.0;

/**
 * Firm inventory target expressed as a multiple of one tick's production output.
 * E.g. 60 means the firm wants to hold 60 ticks (~2 months) worth of production.
 */
export const FIRM_INVENTORY_TARGET_TICKS = 60;

// ---------------------------------------------------------------------------
// Per-agent food pricing constants
// ---------------------------------------------------------------------------

/**
 * Weight of the inventory-penalty term in the pricing AI metric.
 *
 * The agent minimises:  M = (produced − sold)² − INVENTORY_PENALTY_WEIGHT × inventory
 *
 * A higher value makes agents prefer keeping inventory low (sell more aggressively).
 */
export const INVENTORY_PENALTY_WEIGHT = 0.5;

/**
 * Maximum multiplicative price adjustment per tick (upward).
 * e.g. 1.05 means price can increase at most 5 % per tick.
 */
export const PRICE_ADJUST_MAX_UP = 1.05;

/**
 * Maximum multiplicative price adjustment per tick (downward).
 * e.g. 0.95 means price can decrease at most 5 % per tick.
 */
export const PRICE_ADJUST_MAX_DOWN = 0.95;

/**
 * Sensitivity of the multiplicative price factor to the gradient of M.
 * Larger values make agents change prices faster in response to the metric.
 */
export const PRICE_ADJUST_SENSITIVITY = 0.01;

// ---------------------------------------------------------------------------
// Persistent money / loan repayment constants
// ---------------------------------------------------------------------------

/**
 * Retained earnings threshold as a fraction of the last wage bill.
 * Firms only repay loans when deposits exceed this multiple of their wage bill.
 * E.g. 1.5 means firms keep 1.5× wage-bill as buffer before repaying.
 */
export const RETAINED_EARNINGS_THRESHOLD = 1.5;

// ---------------------------------------------------------------------------
// Intergenerational transfer constants
// ---------------------------------------------------------------------------

/**
 * The generational gap (in years) between parents and children.
 */
export const GENERATION_GAP = 25;

/**
 * Maximum age for "child" dependents (inclusive).
 * Ages 0–CHILD_MAX_AGE are considered children who may receive support.
 */
export const CHILD_MAX_AGE = 25;

/**
 * Minimum age for "elderly" dependents.
 * Ages >= ELDERLY_MIN_AGE are considered elderly who may receive support.
 */
export const ELDERLY_MIN_AGE = 67;

/**
 * Precautionary reserve as a multiple of per-tick consumption cost.
 * Supporters keep at least this much before transferring to dependents.
 * E.g. 60 × FOOD_PER_PERSON_PER_TICK × price ≈ 2 months food budget.
 */
export const PRECAUTIONARY_RESERVE_TICKS = 30;

/**
 * Fraction of the food buffer target that a supporter must retain for
 * their own survival before transferring anything.  A supporter with
 * foodStock below this fraction × foodTarget cannot afford to give away
 * food money without risking starvation / disability.
 *
 * Set to ~55 %: physiologically sustainable, but clearly under-fed.
 * Low starvation levels (< 0.4) are sustainable in the mortality model,
 * higher values lead to death or disability.
 */
export const SUPPORTER_SURVIVAL_FRACTION = 0.1;

/**
 * Standard deviation (in years) for the Gaussian support weight kernel.
 * The kernel peaks at n × GENERATION_GAP and has non-trivial weight within
 * approximately ±2σ of each peak.  A value of 8 means meaningful support
 * reaches relatives ≈ 9–41 years from each generational peak.
 */
export const SUPPORT_WEIGHT_SIGMA = 4;

/**
 * Number of generational harmonics in the multi-modal support kernel.
 * The kernel has peaks at 1×GENERATION_GAP, 2×GENERATION_GAP, …, N×GENERATION_GAP.
 *
 *   N=1 → parent ↔ child only
 *   N=2 → parent ↔ child + grandparent ↔ grandchild
 *
 * With maxAge=100 and GENERATION_GAP=25, N=3 covers the full age range.
 */
export const GENERATION_KERNEL_N = 2;

/**
 * Fraction of the food buffer target that an *elderly* supporter must
 * retain for their own survival.  Lower than SUPPORTER_SURVIVAL_FRACTION
 * for working-age supporters, reflecting that elderly are less productive
 * and under starvation should deplete faster — producing emergent
 * age-selective mortality without explicit parameters.
 *
 * Set to 30 % of food target (vs 55 % for working age).
 */
export const ELDERLY_FLOOR_FRACTION = 0;
