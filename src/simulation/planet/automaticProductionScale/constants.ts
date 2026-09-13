export const MAX_SCALE_EXPAND_FRACTION = 0.025;
export const EXPANSION_WORKING_CAPITAL_TICKS = 20;
export const HR_EXPANSION_MIN_PRODUCTIVITY_MULTIPLIER = 0.9;
export const STORAGE_STARVATION_EXPANSION_MAX = 0.05;

/**
 * Dev default floor. Setting this above the 0.1 that produced the original sawtooth is a
 * deliberate trade: the operating-scale swing of a facility that still cycles follows
 * 1/floor (measured at 0.10 -> 10-12x, ~0.058 -> 14-17x, 0.25 -> 4.2-4.8x), so a higher
 * floor bounds the excursion. The cost is that a facility can never idle below this
 * fraction of its capacity, i.e. contraction authority is given up to buy a smaller swing.
 */
export const MIN_SCALE_FRACTION = 0.25;

export const PID_KP = 0.1;

export const PID_KI = 0.001;

export const PID_KD = 0.01;
export const PID_IMAX = 0.025;

// Spiegler & Naim (2016) Eq. 21/22: a saturated stock-control loop limit cycles when the
// correction time constant Tw falls below half the replenishment lead time Tp. Tp is
// STORAGE_TARGET_MONTHS of own-capacity output and Tw is 1/PID_OUT_MAX_UP ticks for a
// full-scale excursion, so the limit is Tw >= 0.5*Tp. STORAGE_TARGET_MONTHS = 12 and a
// 0.005/tick symmetric limit give Tw = 200 against 0.5*Tp = 180, inside the stable region
// with margin. The guard test in automaticProductionScaleDynamics.test.ts enforces the ratio.
export const STORAGE_TARGET_MONTHS = 12;
export const STORAGE_CAPACITY_MONTHS = 13;

export const PID_OUT_MAX_UP = 0.005;
export const PID_OUT_MAX_DOWN = 0.005;
export const PID_D_ALPHA = 0.3;
export const SIGNAL_EMA_ALPHA = 0.3;

export const EXPANSION_INTEGRAL_THRESHOLD = 30;
export const EXPANSION_INTEGRAL_MAX = 180;
export const EXPANSION_INTEGRAL_DECAY = 0.05;
export const EXPANSION_PRICE_INFLATION_THRESHOLD = 3.0;
export const EXPANSION_WORKER_RESERVE_MARGIN = 0.3;

export const DYNAMIC_EXPANSION_CAP_FRACTION = 0.1;

/**
 * A facility only arms an expansion when its operating scale has reached this fraction of its
 * capacity. The PID's proportional term saturates at signal ~0.05 (PID_KP=0.1 against
 * PID_OUT_MAX=0.005), so a facility can settle a hair below full capacity and freeze there: its
 * signal decays to zero, the D term leaks off geometrically, and scale stops moving within
 * float64 resolution. A 0.999 threshold sat inside that frozen band and blocked expansion for
 * decades. 0.98 sits clear of the band a settled facility actually occupies.
 */
export const EXPANSION_AT_CAPACITY_FRACTION = 0.98;

export const MAX_SCALE_CONTRACT_FRACTION = 0.005;
export const CONTRACTION_INTEGRAL_THRESHOLD = 30;
export const CONTRACTION_INTEGRAL_MAX = 180;
export const CONTRACTION_INTEGRAL_DECAY = 0.5;

export const STORAGE_EXPANSION_RATE = 0.2;
export const STORAGE_CONTRACTION_RATE = 0.1;
