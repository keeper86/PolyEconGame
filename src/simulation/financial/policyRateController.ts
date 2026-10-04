import {
    POLICY_EQUITY_DEAD_BAND,
    POLICY_EQUITY_EMA_ALPHA,
    POLICY_EQUITY_TARGET,
    POLICY_RATE_GAIN,
    POLICY_RATE_MAX_MONTHLY_STEP,
    POLICY_RATE_MAX_PER_YEAR,
    POLICY_RATE_MIN_PER_YEAR,
    isMonthBoundary,
} from '../constants';
import type { Bank } from '../planet/planet';

let policyRateControllerEnabled = true;
let policyRateMaxPerYearOverride: number | null = null;

export function setPolicyRateControllerEnabled(enabled: boolean): void {
    policyRateControllerEnabled = enabled;
}

export function setPolicyRateMaxPerYear(value: number | null): void {
    policyRateMaxPerYearOverride = value;
}

export const getPolicyRateMaxPerYear = (): number => policyRateMaxPerYearOverride ?? POLICY_RATE_MAX_PER_YEAR;

export function updatePolicyRate(bank: Bank, tick: number): void {
    if (!policyRateControllerEnabled || !isMonthBoundary(tick) || bank.loans <= 0) {
        return;
    }

    const equityRatio = (bank.loans - bank.deposits) / bank.loans;
    if (!Number.isFinite(bank.policyEquityEma)) {
        bank.policyEquityEma = equityRatio;
    }
    bank.policyEquityEma = POLICY_EQUITY_EMA_ALPHA * equityRatio + (1 - POLICY_EQUITY_EMA_ALPHA) * bank.policyEquityEma;

    const error = POLICY_EQUITY_TARGET - bank.policyEquityEma;
    if (Math.abs(error) <= POLICY_EQUITY_DEAD_BAND) {
        return;
    }

    const unclampedStep = POLICY_RATE_GAIN * error;
    const step = Math.max(-POLICY_RATE_MAX_MONTHLY_STEP, Math.min(POLICY_RATE_MAX_MONTHLY_STEP, unclampedStep));
    const next = bank.loanRatePerYear + step;
    const maxRate = getPolicyRateMaxPerYear();
    if (next >= maxRate) {
        bank.loanRatePerYear = maxRate;
        return;
    }
    if (next <= POLICY_RATE_MIN_PER_YEAR) {
        bank.loanRatePerYear = POLICY_RATE_MIN_PER_YEAR;
        return;
    }
    bank.loanRatePerYear = next;
}
