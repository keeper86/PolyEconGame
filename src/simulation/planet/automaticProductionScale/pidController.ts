import type { PidState } from '../facility';
import { PID_D_ALPHA, PID_IMAX, PID_KD, PID_KI, PID_KP, PID_OUT_MAX_DOWN, PID_OUT_MAX_UP } from './constants';

export function getDefaultPidState(): PidState {
    return {
        integral: 0,
        prevError: 0,
        filteredError: 0,
        expansionIntegral: 0,
        contractionIntegral: 0,
        smoothedSignal: 0,
        profitEMA: 0,
    };
}

export function computePidDelta(signal: number, state: PidState, maxScale: number): number {
    state.filteredError = PID_D_ALPHA * signal + (1 - PID_D_ALPHA) * state.filteredError;

    const P = PID_KP * signal;
    const D = PID_KD * (state.filteredError - state.prevError);
    state.prevError = state.filteredError;

    if (signal > 0 && state.integral < 0) {
        state.integral = 0;
    }

    const tentativeOutput = P + state.integral + D;
    const outSat = Math.max(-PID_OUT_MAX_DOWN, Math.min(PID_OUT_MAX_UP, tentativeOutput));
    const saturatedUp = signal > 0 && outSat >= PID_OUT_MAX_UP;
    const saturatedDown = signal < 0 && outSat <= -PID_OUT_MAX_DOWN;
    if (!saturatedUp && !saturatedDown) {
        state.integral = Math.max(-PID_IMAX, Math.min(PID_IMAX, state.integral + PID_KI * signal));
    }

    const output = Math.max(-PID_OUT_MAX_DOWN, Math.min(PID_OUT_MAX_UP, P + state.integral + D));
    return output * maxScale;
}
