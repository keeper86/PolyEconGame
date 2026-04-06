export const START_YEAR = 2200;
export const TICKS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR; // = 360, derived — never set independently

/** Service consumption per person per tick (1 unit/person/tick for all services) */
export const SERVICE_PER_PERSON_PER_TICK = 1 / 30;

/** Minimum age at which a person can be employed. People below this age are never hireable. */
export const MIN_EMPLOYABLE_AGE = 14;

export const RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY = 1.25;

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
// Grocery service market constants
// ---------------------------------------------------------------------------

/**
 * Household grocery service buffer target expressed in ticks of consumption.
 * Population tries to maintain this many ticks worth of grocery service.
 * 1 month = TICKS_PER_MONTH ticks.
 */
export const GROCERY_BUFFER_TARGET_TICKS = TICKS_PER_MONTH;

/**
 * Service buffer targets expressed in ticks of consumption.
 * Each service has its own buffer target for household inventory management.
 */
export const HEALTHCARE_BUFFER_TARGET_TICKS = 4;
export const ADMINISTRATIVE_BUFFER_TARGET_TICKS = 3;
export const LOGISTICS_BUFFER_TARGET_TICKS = 4;
export const RETAIL_BUFFER_TARGET_TICKS = 10;
export const CONSTRUCTION_BUFFER_TARGET_TICKS = 2;
export const EDUCATION_BUFFER_TARGET_TICKS = 2;

/**
 * Grocery starvation level below which education is treated as a valid
 * household need in the intergenerational transfer system.
 * When starvation exceeds this threshold the household is under food stress
 * and education spending is deferred.
 */
export const EDUCATION_STARVATION_THRESHOLD = 0.05;

/**
 * Minimum grocery service price (prevents zero or negative prices).
 */
export const PRICE_FLOOR = 0.01;
export const PRICE_CEIL = 1000000.0;

// ---------------------------------------------------------------------------
// Per-agent food pricing constants
// ---------------------------------------------------------------------------

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
 * Maximum multiplicative price adjustment per tick (downward) when the offer
 * price is within the cost-floor brake zone.  Much smaller than
 * PRICE_ADJUST_MAX_DOWN so that prices descend very slowly near production
 * cost, keeping supply chains alive while downstream demand signals propagate.
 * e.g. 0.99 means at most 1 % decrease per tick at/near the cost floor.
 */
export const PRICE_ADJUST_MAX_DOWN_SOFT = 0.99;

/**
 * Minimum profit-margin markup added on top of estimated production cost to
 * derive the soft cost floor for automatic pricing.
 * e.g. 0.05 → agents target at least 5 % above break-even.
 */
export const AUTOMATED_COST_FLOOR_MARKUP = 0.05;

export const SERVICE_DEPRECIATION_RATE_PER_TICK = 0.2;

/**
 * Width of the cost-floor brake zone, expressed as a fraction of the floor
 * price.  Within this zone the maximum downward adjustment is linearly
 * interpolated from PRICE_ADJUST_MAX_DOWN_SOFT (at the floor) to
 * PRICE_ADJUST_MAX_DOWN (at the top of the zone).
 * e.g. 0.2 → brake zone spans from costFloor to costFloor × 1.2.
 */
export const AUTOMATED_COST_FLOOR_BUFFER = 0.2;

/**
 * Stiffness of the cost-equilibrium spring that couples input and output prices.
 *
 * Implements a symmetric error-correction mechanism (cf. von Cramon-Taubadel 1998,
 * Dosi et al. EURACE): a restoring force proportional to the profitability gap
 * keeps the supply chain anchored near break-even without hard price floors.
 *
 *   Output side: factor += COST_SPRING_STRENGTH × max(0, costFloor/price − 1)
 *     → upward nudge on offer price when selling below production cost.
 *
 *   Input side:  factor −= COST_SPRING_STRENGTH × max(0, totalCost/revenue − 1)
 *     → downward nudge on bid price when facility costs exceed output revenue.
 *
 * Both springs are zero when the facility is profitable, strengthen linearly with
 * the cost gap, and are additive on top of the normal tâtonnement signal.
 * Set to 0 to disable.  A value of 0.1 gives a gentle but persistent pull
 * toward break-even: a 20 % cost overrun adds ~2 % correction per tick.
 */
export const COST_SPRING_STRENGTH = 0.1;

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

/**
 * Number of ticks of input stock an automated agent tries to maintain as a
 * procurement buffer.  Used both in automaticPricing (bid quantity) and in the
 * financial tick (retained-earnings extension + input-buffer loan).
 */
export const INPUT_BUFFER_TARGET_TICKS = 10;

/**
 * Maximum output inventory expressed as ticks of production.
 * When an agent's output storage reaches this threshold, the facility is
 * supply-constrained by lack of demand: input buying is suppressed entirely
 * until inventory drops below this ceiling.
 */
export const OUTPUT_BUFFER_MAX_TICKS = 5;

// ---------------------------------------------------------------------------
// Bank credit / loan origination constants
// ---------------------------------------------------------------------------

/**
 * Maximum loan amount available to a brand-new agent with no prior history.
 * Serves as the baseline "starter loan" for bootstrapping a new company.
 */
export const STARTER_LOAN_AMOUNT = 1_000_000;

/**
 * Multiplier applied to projected monthly net cash flow to determine the
 * credit limit for established agents.
 * E.g. 6 means the bank lends up to 6 months of projected net cash flow.
 */
export const LOAN_CASH_FLOW_MONTHS = 6;

/**
 * Number of ticks in a month used for cash-flow projection in loan decisions.
 * Matches TICKS_PER_MONTH; kept as a separate constant for clarity in the
 * credit-conditions calculation.
 */
export const LOAN_TICKS_PER_MONTH = TICKS_PER_MONTH;

/**
 * Fraction of storage face-value (quantity × market price) the bank accepts
 * as collateral when computing the credit limit.
 */
export const LOAN_COLLATERAL_FACTOR = 1.0;

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
 * Standard deviation (in years) for the Gaussian support weight kernel.
 * The kernel peaks at n × GENERATION_GAP and has non-trivial weight within
 * approximately ±2σ of each peak.  A value of 8 means meaningful support
 * reaches relatives ≈ 9–41 years from each generational peak.
 */
export const SUPPORT_WEIGHT_SIGMA = 6;

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
export const EPSILON = 1e-4;
