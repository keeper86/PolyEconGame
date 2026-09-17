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

/**
 * Soft lower bound on operating scale. A hard Math.max(minScale, ...) makes the scale slam into
 * the floor and sit there (a relaxation wall), which is what feeds the floor-to-ceiling relay.
 * With a soft floor the downward delta is attenuated below minScale instead of clamped, so the
 * facility can idle deeper with less authority instead of over-supplying against a wall. 0 = hard
 * floor (old behaviour), 1 = no floor. It never drives scale below zero.
 */
export const SOFT_FLOOR_RELAXATION = 0.5;

export const PID_KP = 0.001;

export const PID_KI = 0.00001;

export const PID_KD = 0.001;
export const PID_IMAX = 0.0001;

// There is no replenishment transport lag: scale acts on production within the same tick and
// inventory integrates it directly, so the plant is a pure first-order integrator with a
// rate-limited actuator. The cycle is a relay: the signal saturates (tanh of a +/-1-month zoom)
// far faster than the actuator can reverse, so scale slews between its rails as a square wave.
// Slew rate is what is tuned here, not a lead-time ratio.
export const STORAGE_TARGET_MONTHS = 12;
export const STORAGE_CAPACITY_MONTHS = 13;

/**
 * The storage error is normalised by the full target so the tanh signal stays proportional over
 * the whole reachable inventory range (storage caps at STORAGE_CAPACITY_MONTHS, so the surplus
 * side only reaches ~tanh(-1/12)). The old 1-month zoom saturated the signal to +/-1 for any
 * error beyond ~2 months, turning the PID into a relay for over-built facilities.
 */
export const STORAGE_ERROR_ZOOM_MONTHS = STORAGE_TARGET_MONTHS;

/**
 * Forward-looking storage term. The plant is `inv_dot = q*s - d`, so the measured imbalance (own
 * production minus the smoothed market take) IS the inventory rate: no differencing needed. That
 * matters because with the actuator as the input the plant is a double integrator
 * (`G = q*e^-pT/p^2`), and P-only control on a double integrator has no damping at all
 * (characteristic `p^2 + Kp/Z` - purely imaginary roots), which is what the observed scale relay is.
 * Acting on the inventory predicted this many months ahead adds `Td/Z * inv_dot`, turning the
 * characteristic into `p^2 + (Kp*Td/Z)p + Kp/Z`, hence zeta = (Td/2)*sqrt(Kp/Z).
 *
 * One month, i.e. the zoom window's own scale, was the best of the horizons tried over y30-50 of the
 * single-agent run: the scale swing (p5-p95) falls 19% (0.36 -> 0.29), actuator time-at-limit 33%
 * (15.6% -> 10.5%) and the food price standard deviation 29% (0.220 -> 0.157), for 2.8x the switches
 * (all small dithers). The 3- and 12-month leads shrink the swing further but wreck the economy
 * (food std x2.3/x2.6, wealth -34%/-31%), so the lead is deliberately kept near the noise floor.
 */
export const STORAGE_TREND_HORIZON_MONTHS = 1;

export const PID_OUT_MAX_UP = 0.001;
export const PID_OUT_MAX_DOWN = 0.001;
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
 * capacity. This is the soft-ceiling knob: the higher the fraction, the harder the operating
 * scale must be pressed against maxScale before growth becomes eligible, which incentivises
 * dwelling at the ceiling. A 0.999 threshold sat inside the PID's frozen band and blocked
 * expansion for decades (a settled facility freezes just below full capacity). 0.85 arms growth
 * while the plant is still 85% utilised, so capacity grows before the scale has to slam into the
 * ceiling - trading a little idle-capacity slack for a much softer upper bound.
 */
export const EXPANSION_AT_CAPACITY_FRACTION = 0.98;

export const MAX_SCALE_CONTRACT_FRACTION = 0.01;
export const CONTRACTION_AT_SCALE_FRACTION = 0.5;
export const CONTRACTION_INTEGRAL_THRESHOLD = 15;
export const CONTRACTION_INTEGRAL_MAX = 180;
export const CONTRACTION_INTEGRAL_DECAY = 0.05;

export const STORAGE_EXPANSION_RATE = 0.2;
export const STORAGE_CONTRACTION_RATE = 0.1;
