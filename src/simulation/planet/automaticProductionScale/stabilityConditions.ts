import {
    MIN_SCALE_FRACTION,
    PID_OUT_MAX_DOWN,
    PID_OUT_MAX_UP,
    STORAGE_CAPACITY_MONTHS,
    STORAGE_TARGET_MONTHS,
} from './constants';
import { getMinScaleFraction } from './runtimeConfig';

const TICKS_PER_MONTH = 30;

export interface StabilityCondition {
    name: string;
    satisfied: boolean;
    detail: string;
}

export function storageLeadTimeTicks(): number {
    return STORAGE_TARGET_MONTHS * TICKS_PER_MONTH;
}

export function correctionTimeTicks(): number {
    return 1 / PID_OUT_MAX_UP;
}

export function limitCycleRatio(): number {
    return correctionTimeTicks() / storageLeadTimeTicks();
}

/**
 * Spiegler & Naim (2016) Eq. 21/22: a saturated stock-control loop sustains stable limit
 * cycles for 0.5*Tp <= Tw <= Tp, with amplitude growing as Tw falls toward 0.5*Tp, and
 * unbounded responses below that. Tw above Tp is overdamped and cannot cycle.
 */
/**
 * The floor does not decide whether the loop cycles, only how deep the excursion goes.
 * Measured across three independent floor values the operating-scale swing follows
 * 1/effectiveFloor: 0.10 -> 10.0-12.1x, ~0.058 (soft) -> 14.1-17.3x, 0.25 -> 4.2-4.8x.
 * Anything that still cycles will therefore use the whole range the floor affords it.
 */
export function predictedExcursionAmplitude(): number {
    return 1 / (getMinScaleFraction() ?? MIN_SCALE_FRACTION);
}

export function checkLimitCycleBand(): StabilityCondition {
    const ratio = limitCycleRatio();
    const satisfied = ratio >= 0.5;
    return {
        name: 'limitCycleBand',
        satisfied,
        detail:
            `Tw/Tp = ${ratio.toFixed(3)} (Tw=${correctionTimeTicks().toFixed(1)} ticks from ` +
            `PID_OUT_MAX_UP=${PID_OUT_MAX_UP}, Tp=${storageLeadTimeTicks()} ticks from ` +
            `STORAGE_TARGET_MONTHS=${STORAGE_TARGET_MONTHS}). Requires >= 0.5.`,
    };
}

/**
 * An asymmetric rate limit makes the describing function multi-valued: the expand and
 * contract halves of a cycle have different effective gains, which produces a relaxation
 * (sawtooth) oscillation instead of a smooth one and moves the amplitude beyond what the
 * symmetric analysis predicts.
 */
export function checkSymmetricRateLimit(): StabilityCondition {
    const ratio = PID_OUT_MAX_UP / PID_OUT_MAX_DOWN;
    const satisfied = Math.abs(ratio - 1) < 1e-9;
    return {
        name: 'symmetricRateLimit',
        satisfied,
        detail: `PID_OUT_MAX_UP/PID_OUT_MAX_DOWN = ${ratio.toFixed(4)}. Requires exactly 1.`,
    };
}

/**
 * The storage target is the loop's lead time, so the shells must be able to physically
 * hold the buffer the controller is steering toward.
 */
export function checkCapacityCoversTarget(): StabilityCondition {
    const satisfied = STORAGE_CAPACITY_MONTHS >= STORAGE_TARGET_MONTHS;
    return {
        name: 'capacityCoversTarget',
        satisfied,
        detail:
            `STORAGE_CAPACITY_MONTHS=${STORAGE_CAPACITY_MONTHS} must be >= ` +
            `STORAGE_TARGET_MONTHS=${STORAGE_TARGET_MONTHS}.`,
    };
}

export function evaluateStabilityConditions(): StabilityCondition[] {
    return [checkLimitCycleBand(), checkSymmetricRateLimit(), checkCapacityCoversTarget()];
}

export function assertStabilityConditions(): void {
    const violations = evaluateStabilityConditions().filter((condition) => !condition.satisfied);
    if (violations.length > 0) {
        throw new Error(
            `Autoscale control-law stability violated:\n${violations
                .map((condition) => `  ${condition.name}: ${condition.detail}`)
                .join('\n')}`,
        );
    }
}
