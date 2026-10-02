export const START_YEAR = 2200;

export const COMMERCIAL_LICENSE_COST = 50_000;

export const WORKFORCE_LICENSE_COST = 25_000;
export const TICKS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR;

export const MIN_EMPLOYABLE_AGE = 14;

export const RELATIVE_PRICE_WILLING_TO_PAY_WHEN_BUFFER_EMPTY = 2;

export const NOTICE_PERIOD_MONTHS = 3;

export const isMonthBoundary = (tick: number): boolean => tick > 0 && tick % TICKS_PER_MONTH === 0;
export const isFirstTickInMonth = (tick: number): boolean => tick % TICKS_PER_MONTH === 1;

export const isYearBoundary = (tick: number): boolean => tick > 0 && tick % TICKS_PER_YEAR === 0;

export const PRICE_FLOOR = 0.01;
export const PRICE_CEIL = 1000000.0;

export const PRICE_ADJUST_MAX_UP = 1.05;

export const PRICE_ADJUST_MAX_DOWN = 0.95;

export const SPRING_NORMALIZATION = 1 / 7;
export const DEFAULT_COST_SPRING_STRENGTH = 0.5;

export const BID_ANCHOR_MULTIPLE = 7;

export const BID_OFFER_MAX_COST_MULTIPLIER = BID_ANCHOR_MULTIPLE / 2;

export const AUTOMATED_COST_FLOOR_BUFFER = 1.5;

export const THEORETICAL_PRODUCTION_COST_FACTOR = 1.0;

export const PRICE_NO_TRADE_CONVERGENCE_RATE = 1 / TICKS_PER_MONTH;

export const SERVICE_DEPRECIATION_RATE_PER_TICK = 0.1;

export const SERVICE_OUTPUT_SHIELD_FACTOR = 1;

export const BID_VOLUME_FLOOR_FRACTION = 0.1;
export const ASK_VOLUME_FLOOR_FRACTION = 0;

export const INPUT_BUFFER_TARGET_TICKS = 30;
export const INPUT_BUFFER_TARGET_TICKS_SERVICES = 3;
export const INVENTORY_SMOOTHING_MAX_EXTRA = 2;
export const FREE_QUANTITY_SMOOTHING_MAX_EXTRA = 10;

export const SELL_PRODUCTION_SMOOTHING = 4;

export const SERVICE_DEPRECIATION_COST_MULTIPLIER =
    1 / Math.pow(1 - SERVICE_DEPRECIATION_RATE_PER_TICK, INPUT_BUFFER_TARGET_TICKS_SERVICES);

export const STORAGE_MOVEMENT_FACTOR = 2;

export const TARGET_FILL_RATE = 0.86;
export const TARGET_FILL_RATE_SERVICES = TARGET_FILL_RATE;
export const TARGET_SELL_THROUGH = 1.2;
export const TARGET_SELL_THROUGH_SERVICES = TARGET_FILL_RATE;

export const HR_BUFFER_CAPACITY_MULTIPLIER = 5;

export const STORAGE_BUFFER_CAPACITY_MULTIPLIER = 10;
export const SS_RELAXATION_RATE = 0.95;
export const SR_HOLDING_COST_PER_TON = 0.001;

export const GROCERY_WEALTH_SATURATION_MONTHS = 16;
export const HEALTHCARE_WEALTH_SATURATION_MONTHS = 27;
export const LOGISTICS_WEALTH_SATURATION_MONTHS = 33;
export const EDUCATION_WEALTH_SATURATION_MONTHS = 13;
export const RETAIL_WEALTH_SATURATION_MONTHS = 33;
export const HOUSING_LIFETIME_MONTHS = 600;
export const HOUSING_BUILD_MONTHS = 6;
export const HOUSING_BASE_RATE_PER_MONTH = 0.1;
export const HOUSING_WEALTH_THRESHOLD_MONTHS = 12;
export const HOUSING_ENGEL_GAIN = 0.05;

export const STARTER_LOAN_AMOUNT = 1_000_000;

export const LOAN_INTEREST_RATE_PER_YEAR = 0.01;

export const POLICY_RATE_MIN_PER_YEAR = 0;
export const POLICY_RATE_MAX_PER_YEAR = 0.07;
export const POLICY_RATE_MAX_MONTHLY_STEP = 0.0025;
export const POLICY_EQUITY_TARGET = 0;
export const POLICY_EQUITY_DEAD_BAND = 0.01;
export const POLICY_RATE_GAIN = 0.05;
export const POLICY_EQUITY_EMA_ALPHA = 1 / (MONTHS_PER_YEAR * 5);

export const EMERGENCY_LOAN_WAGE_MONTHS = 2;
export const BANKRUPTCY_TRIGGER_MULTIPLE = 2;
export const BANKRUPTCY_ASSET_FRACTION = 0.975;
export const BANKRUPTCY_RESTRUCTURE_MARKET_SHARE = 0.001;
export const BANKRUPTCY_DEBT_WRITE_OFF_FRACTION = 1;

const WEALTH_TAX_ANNUAL_RATE = 0.02;
export const WEALTH_TAX_MONTHLY_RATE = WEALTH_TAX_ANNUAL_RATE / MONTHS_PER_YEAR;
export const WEALTH_TAX_ALLOWANCE = 1_000_000_000;
export const GOVERNMENT_OPERATING_BUFFER = 1_000_000_000;

const POPULATION_WEALTH_TAX_ANNUAL_RATE = 0.02;
export const POPULATION_WEALTH_TAX_MONTHLY_RATE = POPULATION_WEALTH_TAX_ANNUAL_RATE / MONTHS_PER_YEAR;
export const POPULATION_WEALTH_TAX_ALLOWANCE_MONTHS = 36;
export const UNEMPLOYMENT_INSURANCE_RATE_EDUCATION = 0.5;
export const UNEMPLOYMENT_INSURANCE_RATE_UNOCCUPIED = 0.5;
export const UNEMPLOYMENT_INSURANCE_RATE_UNABLE = 0.5;

export const CONSTRUCTION_VALUATION_PRICE_CAP = 2;

export const MIN_WAGE = 1.0;
export const MAX_WAGE = 1000.0;

export const DEFAULT_REFERENCE_MONTHLY_INCOME = MIN_WAGE * TICKS_PER_MONTH;

export const WAGE_ADJUSTMENT_RATE = 0.05;

export const VACANCY_WAGE_SMOOTHING = 0.1;

export const WAGE_SHARE = 0.6;
export const WAGE_CHURN_GAIN = 3;
export const WAGE_CEILING_SMOOTHING = 0.1;

export const HIRE_RATE_LIMIT_PER_MONTH = 0.05;
export const FIRE_RATE_LIMIT_PER_MONTH = 0.05;

export const SEARCH_HORIZON_TICKS = TICKS_PER_MONTH / 2;

export const QUIT_OUTSIDE_SENSITIVITY = 0.05;
export const QUIT_FAIRNESS_SENSITIVITY = 0.005;
export const QUIT_OUTSIDE_WAGE_BIAS = 0.9;
export const QUIT_TARGET_RATE = 0.009;

export const ACCEPT_BASE = 0.05;

export const WAGE_ACCEPT_SCALE = 1.0;

// Worker reservation wage is a fraction of the going (reachable) tier wage,
// eroded by expected search duration, so that prolonged joblessness drives the
// reservation DOWN and no CoL/wage lock can keep a worker refusing forever.
export const WAGE_ACCEPT_FRACTION = 0.8;
export const WAGE_DURATION_DECAY = 0.8;

export const LOAN_CASH_FLOW_MONTHS = 6;

export const LOAN_COLLATERAL_FACTOR = 1.0;

export const GENERATION_GAP = 25;

export const SUPPORT_WEIGHT_SIGMA = 6;

export const GENERATION_KERNEL_N = 2;

export const EPSILON = 1e-4;

export const MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE = 0.01;

export const FACILITY_MAINTENANCE_DECREASE_PER_YEAR = 0.5;
export const FACILITY_MAINTENANCE_REPAIR_PER_TICK = 0.05;
export const FACILITY_CONDITION_EFFICIENCY_EXPONENT = 3;

export const RESTORATION_COST_FACTOR_SIGMOID_STEEPNESS = 12;

export const MAINTENANCE_SERVICE_PER_STATUS_UNIT = 100;

const FACILITY_MAINTENANCE_USAGE_FACTOR_AT_FULL_EFFICIENCY = 2;
export const FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK =
    ((FACILITY_MAINTENANCE_USAGE_FACTOR_AT_FULL_EFFICIENCY * FACILITY_MAINTENANCE_DECREASE_PER_YEAR) / TICKS_PER_YEAR) *
    MAINTENANCE_SERVICE_PER_STATUS_UNIT;

export const MAX_DISPATCH_TIMEOUT_TICKS = 60;

export const SHIP_MARKET_EMA_ALPHA = 0.3;
export const SELL_THROUGH_EMA_ALPHA = 0.3;
export const FILL_RATE_EMA_ALPHA = 0.3;

/**
 * Smoothing for the demand half of the storage trend (`q*s - d`). The production half is exact, so
 * only the market take is filtered. One month, matching the storage error's zoom window: fast enough
 * to keep the trend's phase up to the loop's own period, slow enough that the tick-to-tick market
 * noise does not print straight through into the scale command.
 */
export const STORAGE_TREND_DEMAND_EMA_ALPHA = 2 / (TICKS_PER_MONTH + 1);

export const SHIP_MARKET_MAX_TRADE_HISTORY = 100;

export const CLAIM_CONSUMPTION_PER_TICK_AT_SCALE1: Record<string, number> = {
    'Coal Deposit': 0.5,
    'Oil Reservoir': 0.3,
    'Natural Gas Field': 0.1,
    'Forest': 400,
    'Stone Deposit': 0.4,
    'Copper Deposit': 0.4,
    'Sand Deposit': 0.3,
    'Limestone Deposit': 0.3,
    'Clay Deposit': 0.4,
    'Iron Ore Deposit': 0.4,
    'Arable Land': 50,
    'Water Source': 800,
};

export const FOREX_MM_COUNT = 1;
export const FOREX_MM_WORKING_CAPITAL = 1_000_000_000;
export const FOREX_MM_SEED_LOAN = 1_000_000_000;
export const FOREX_MM_TARGET_DEPOSIT = 10_000_000;
export const FOREX_MM_BASE_SPREAD = 0.03;
export const FOREX_MM_RETAIN_RATIO = 0.5;
export const FOREX_MM_MAX_TRADE_FRACTION = 0.1;
export const FOREX_MM_MIN_TRADE_AMOUNT = 10_000;

export const SHIPBUILDER_WORKING_CAPITAL = 5_000_000;

export const SHIPBUILDER_BOOTSTRAP_LOAN = 500_000;

export const SHIPBUILDER_LISTING_MARKUP = 0.2;

export const SHIPBUILDER_PROFIT_THRESHOLD = 1.2;

export const SHIPBUILDER_SPECULATIVE_THRESHOLD = 1.25;

export const SHIPBUILDER_INPUT_BUFFER_TICKS = 20;

export const ARBITRAGE_SEED_DEPOSIT = 1_000_000;

export const ARBITRAGE_MIN_PROFIT_PER_TICK = 0;

export const ARBITRAGE_MIN_CAPITAL_RESERVE = 100_000;

export const ARBITRAGE_IDLE_SHIP_SELL_THRESHOLD = 180;

export const ARBITRAGE_SHIP_ESTIMATED_LIFETIME_TICKS = 3_600;

export const ARBITRAGE_LOAD_UNLOAD_OVERHEAD_TICKS = 60;

export const ARBITRAGE_FOREX_THIN_BOOK_HAIRCUT = 0.9;

// ── Recycler Agent ──────────────────────────────────────────────────────────
export const RECYCLER_BASE_RECOVERY_EFFICIENCY = 0.85;
export const RECYCLER_PAYMENT_RATIO = 0.85;
