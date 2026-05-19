export const START_YEAR = 2200;

/** One-time upfront fee for a commercial license (bank + storage + market access) on a new planet. */
export const COMMERCIAL_LICENSE_COST = 50_000;
/** One-time upfront fee for a workforce license (hiring + production) on a new planet. */
export const WORKFORCE_LICENSE_COST = 25_000;
export const TICKS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR; // = 360, derived — never set independently

/** Minimum age at which a person can be employed. People below this age are never hireable. */
export const MIN_EMPLOYABLE_AGE = 14;

export const RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY = 2;

export const NOTICE_PERIOD_MONTHS = 3;

/** True only on clean month boundaries (every TICKS_PER_MONTH ticks). */
export const isMonthBoundary = (tick: number): boolean => tick > 0 && tick % TICKS_PER_MONTH === 0;
export const isFirstTickInMonth = (tick: number): boolean => tick % TICKS_PER_MONTH === 1;

/** True only on clean year boundaries (every TICKS_PER_YEAR ticks). */
export const isYearBoundary = (tick: number): boolean => tick > 0 && tick % TICKS_PER_YEAR === 0;

export const PRICE_FLOOR = 0.001;
export const PRICE_CEIL = 1000000.0;

export const PRICE_ADJUST_MAX_UP = 1.05;

export const PRICE_ADJUST_MAX_DOWN = 0.95;

export const PRICE_ADJUST_MAX_DOWN_SOFT = 0.99;

export const AUTOMATED_COST_FLOOR_MARKUP = 0.05;

export const SERVICE_DEPRECIATION_RATE_PER_TICK = 0.2;

export const AUTOMATED_COST_FLOOR_BUFFER = 0.2;
export const COST_SPRING_STRENGTH = 0.04;

export const RETAINED_EARNINGS_THRESHOLD = 1.5;

export const INPUT_BUFFER_TARGET_TICKS = 30;
export const OUTPUT_BUFFER_MAX_TICKS = 20;

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

export const EPSILON = 1e-4;

// ---------------------------------------------------------------------------
// Ship capital market & aging
// ---------------------------------------------------------------------------

/**
 * Fraction by which maxMaintenance degrades each time a ship has been repaired
 * by a cumulative total of 1.0 units (one full repair cycle).
 * At 0.01 a ship fully repaired from ~0 → maxMaintenance each year will reach
 * maxMaintenance = 0 (derelict) after roughly 100 repair cycles.
 */
export const MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE = 0.01;

/**
 * Maximum number of ticks a ship may remain in a loading / boarding state
 * before the mission is automatically aborted and the ship returns to idle.
 * 60 ticks ≈ 2 months at 30 ticks/month.
 */
export const MAX_DISPATCH_TIMEOUT_TICKS = 60;

/**
 * EMA smoothing factor for ship trade prices (0 < α ≤ 1).
 * Higher values weight recent trades more heavily.
 */
export const SHIP_MARKET_EMA_ALPHA = 0.3;

/** Maximum number of trade records kept per ship-type in the capital market history. */
export const SHIP_MARKET_MAX_TRADE_HISTORY = 100;

export const LAND_CLAIM_COST_PER_UNIT: Record<string, number> = {
    'Arable Land': 1,
    'Water Source': 1,
    'Coal Deposit': 1,
    'Oil Reservoir': 1,
    'Natural Gas Field': 1,
    'Forest': 1,
    'Stone Deposit': 1,
    'Copper Deposit': 1,
    'Sand Deposit': 1,
    'Limestone Deposit': 1,
    'Clay Deposit': 1,
    'Iron Ore Deposit': 1,
};

export const CLAIM_CONSUMPTION_PER_TICK_AT_SCALE1: Record<string, number> = {
    'Coal Deposit': 0.5, // coalMine
    'Oil Reservoir': 0.3, // oilWell
    'Natural Gas Field': 0.1, // naturalGasWell
    'Forest': 400, // loggingCamp
    'Stone Deposit': 0.4, // stoneQuarry
    'Copper Deposit': 0.4, // copperMine
    'Sand Deposit': 0.3, // sandMine
    'Limestone Deposit': 0.3, // limestoneQuarry
    'Clay Deposit': 0.4, // clayMine
    'Iron Ore Deposit': 0.4, // ironExtractionFacility
    'Arable Land': 50, // agriculturalFacility
    'Water Source': 800, // waterExtractionFacility
};

export const FOREX_MM_COUNT = 1;
export const FOREX_MM_WORKING_CAPITAL = 1_000_000_000;
export const FOREX_MM_SEED_LOAN = 1_000_000_000;
export const FOREX_MM_TARGET_DEPOSIT = 10_000_000;
export const FOREX_MM_BASE_SPREAD = 0.03;
export const FOREX_MM_RETAIN_RATIO = 0.5;
export const FOREX_MM_ARBITRAGE_THRESHOLD = 0.005;
export const FOREX_MM_MAX_ARBITRAGE_FRACTION = 0.25;
export const FOREX_MM_MAX_TRADE_FRACTION = 0.1;
export const FOREX_MM_MIN_TRADE_AMOUNT = 10_000;

// ---------------------------------------------------------------------------
// Shipbuilder agent constants
// ---------------------------------------------------------------------------

/** Working-capital loan granted to each shipbuilder on their home planet. */
export const SHIPBUILDER_WORKING_CAPITAL = 5_000_000;

/** Loan per bootstrap ship type pre-built at seed time. */
export const SHIPBUILDER_BOOTSTRAP_LOAN = 500_000;

/** Markup over estimated production cost when listing a ship for sale. */
export const SHIPBUILDER_LISTING_MARKUP = 0.2;

/** Minimum ratio of highest bid to estimated production cost required to start an order-driven build. */
export const SHIPBUILDER_PROFIT_THRESHOLD = 1.2;

/** Minimum ratio of EMA price to estimated production cost for a speculative build. */
export const SHIPBUILDER_SPECULATIVE_THRESHOLD = 1.25;

/** When actively building, pre-purchase this many ticks worth of inputs. */
export const SHIPBUILDER_INPUT_BUFFER_TICKS = 20;

// ---------------------------------------------------------------------------
// Arbitrage trader agent constants
// ---------------------------------------------------------------------------

/** Seed deposit granted to each arbitrage trader on every planet. */
export const ARBITRAGE_SEED_DEPOSIT = 1_000_000;

/** Minimum net profit per tick (in currency units) required to activate a route, including any repositioning leg. */
export const ARBITRAGE_MIN_PROFIT_PER_TICK = 0;

/** Minimum total deposits on home planet before buying an additional ship. */
export const ARBITRAGE_MIN_CAPITAL_RESERVE = 100_000;

/** Ticks an idle ship must remain un-routed before the agent considers selling it (6 months). */
export const ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD = 180;

/** Estimated ship lifetime in ticks used for linear depreciation (10 years). */
export const ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS = 3_600;

/** Fixed overhead ticks added to each trip estimate to cover loading and unloading. */
export const ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS = 60;

/**
 * Haircut applied to the mid-market forex rate when the destination-currency
 * bid book at origin is too thin to price the full conversion.  Set below 1
 * to discourage routes whose profitability depends on unrealistically good
 * forex fills.
 */
export const ARBITRAGE_FOREX_THIN_BOOK_HAIRCUT = 0.9;
