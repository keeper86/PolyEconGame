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

export const PRICE_NO_TRADE_CONVERGENCE_RATE = 1 / TICKS_PER_MONTH;

export const SERVICE_DEPRECIATION_RATE_PER_TICK = 0.1;

export const COST_SPRING_STRENGTH = PRICE_ADJUST_MAX_UP - PRICE_ADJUST_MAX_DOWN;

export const BID_OFFER_MAX_COST_MULTIPLIER = 6;

export const RETAINED_EARNINGS_THRESHOLD = 1.5;

export const INPUT_BUFFER_TARGET_TICKS = 30;
export const INPUT_BUFFER_TARGET_TICKS_SERVICES = 3;
export const OUTPUT_BUFFER_MAX_TICKS = 20;
export const INVENTORY_SMOOTHING_MAX_EXTRA = 2;

export const STARTER_LOAN_AMOUNT = 1_000_000;

export const MIN_WAGE = 1.0;
export const MAX_WAGE = 1000.0;

export const WAGE_ADJUSTMENT_RATE = 0.02;

export const LOAN_CASH_FLOW_MONTHS = 6;
export const LOAN_TICKS_PER_MONTH = TICKS_PER_MONTH;

export const LOAN_COLLATERAL_FACTOR = 1.0;

export const GENERATION_GAP = 25;

export const SUPPORT_WEIGHT_SIGMA = 6;

export const GENERATION_KERNEL_N = 2;

export const EPSILON = 1e-4;

export const MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE = 0.01;

export const MAX_DISPATCH_TIMEOUT_TICKS = 60;

export const SHIP_MARKET_EMA_ALPHA = 0.3;

export const NOVICE_EFFICIENCY = 1.0;
export const PROFESSIONAL_EFFICIENCY = 1.5;
export const EXPERT_EFFICIENCY = 2.0;

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
export const FOREX_MM_ARBITRAGE_THRESHOLD = 0.005;
export const FOREX_MM_MAX_ARBITRAGE_FRACTION = 0.25;
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
export const RECYCLER_BASE_RECOVERY_EFFICIENCY = 0.75;
export const RECYCLER_PAYMENT_RATIO = 0.95;
