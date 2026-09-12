export const MAX_SCALE_EXPAND_FRACTION = 0.025;
export const EXPANSION_WORKING_CAPITAL_TICKS = 20;
export const EXPANSION_STORAGE_FREE_FRACTION = 0.9;
export const HR_EXPANSION_MIN_PRODUCTIVITY_MULTIPLIER = 0.9;
export const STORAGE_STARVATION_EXPANSION_MAX = 0.05;

export const MIN_SCALE_FRACTION = 0.1;

/**
 * The hard MIN_SCALE_FRACTION floor clips a negative control command, which collapses the
 * loop gain in the contracting direction and produces a sawtooth whose amplitude is set by
 * 1/MIN_SCALE_FRACTION rather than by the dynamics. This soft floor keeps authority as
 * scale approaches zero: it asymptotes toward zeroScaleFraction instead of clamping, so the
 * actuator never loses gain. Commands are mapped through it only when they would take scale
 * below the linear region.
 */
export const SOFT_MIN_SCALE_RANGE = 0.05;

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

export const MAX_SCALE_CONTRACT_FRACTION = 0.005;
export const CONTRACTION_INTEGRAL_THRESHOLD = 30;
export const CONTRACTION_INTEGRAL_MAX = 180;
export const CONTRACTION_INTEGRAL_DECAY = 0.5;

export const STORAGE_EXPANSION_RATE = 0.2;
export const STORAGE_CONTRACTION_RATE = 0.1;
