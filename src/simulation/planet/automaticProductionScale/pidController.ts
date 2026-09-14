import type { PidState } from '../facility';
import { PID_D_ALPHA, PID_IMAX, PID_KD, PID_KI, PID_KP, PID_OUT_MAX_DOWN, PID_OUT_MAX_UP } from './constants';
import { getPidOutMaxDown, getPidOutMaxUp } from './runtimeConfig';

export function getDefaultPidState(): PidState {
    return {
        integral: 0,
        prevError: 0,
        filteredError: 0,
        expansionIntegral: 0,
        contractionIntegral: 0,
        smoothedSignal: 0,
    };
}

export function computePidDelta(signal: number, state: PidState): number {
    const outMaxDown = getPidOutMaxDown() ?? PID_OUT_MAX_DOWN;
    const outMaxUp = getPidOutMaxUp() ?? PID_OUT_MAX_UP;
    state.filteredError = PID_D_ALPHA * signal + (1 - PID_D_ALPHA) * state.filteredError;

    const P = PID_KP * signal;
    const D = PID_KD * (state.filteredError - state.prevError);
    state.prevError = state.filteredError;

    const tentativeOutput = P + state.integral + D;
    const outSat = Math.max(-outMaxDown, Math.min(outMaxUp, tentativeOutput));
    const saturatedUp = signal > 0 && outSat >= outMaxUp;
    const saturatedDown = signal < 0 && outSat <= -outMaxDown;
    if (!saturatedUp && !saturatedDown) {
        state.integral = Math.max(-PID_IMAX, Math.min(PID_IMAX, state.integral + PID_KI * signal));
    }

    const output = Math.max(-outMaxDown, Math.min(outMaxUp, P + state.integral + D));
    return output;
}
