import {
    MONTHS_PER_YEAR,
    POLICY_RATE_DEAD_BAND,
    POLICY_RATE_EMA_ALPHA,
    POLICY_RATE_GAIN,
    POLICY_RATE_MAX_MONTHLY_STEP,
    POLICY_RATE_MAX_PER_YEAR,
    POLICY_RATE_MIN_PER_YEAR,
    POLICY_RATE_TARGET,
    isMonthBoundary,
} from '../constants';
import type { Bank } from '../planet/planet';

let policyRateControllerEnabled = false;

export function setPolicyRateControllerEnabled(enabled: boolean): void {
    policyRateControllerEnabled = enabled;
}

export function updatePolicyRate(bank: Bank, tick: number): void {
    if (!policyRateControllerEnabled || !isMonthBoundary(tick)) {
        return;
    }

    if (!Number.isFinite(bank.policyRateEma)) {
        bank.policyRateEma = 0;
    }
    if (!Number.isFinite(bank.policyMonthInterest) || !Number.isFinite(bank.policyMonthWriteOffs)) {
        bank.policyMonthInterest = bank.interestCollected;
        bank.policyMonthWriteOffs = bank.writeOffs;
        return;
    }

    const monthlyInterest = bank.interestCollected - bank.policyMonthInterest;
    const monthlyWriteOffs = bank.writeOffs - bank.policyMonthWriteOffs;
    bank.policyMonthInterest = bank.interestCollected;
    bank.policyMonthWriteOffs = bank.writeOffs;

    if (bank.loans <= 0) {
        return;
    }

    const annualNetPerLoans = ((monthlyInterest - monthlyWriteOffs) * MONTHS_PER_YEAR) / bank.loans;
    bank.policyRateEma = POLICY_RATE_EMA_ALPHA * annualNetPerLoans + (1 - POLICY_RATE_EMA_ALPHA) * bank.policyRateEma;

    const error = POLICY_RATE_TARGET - bank.policyRateEma;
    if (Math.abs(error) <= POLICY_RATE_DEAD_BAND) {
        return;
    }

    const unclampedStep = POLICY_RATE_GAIN * error;
    const step = Math.max(-POLICY_RATE_MAX_MONTHLY_STEP, Math.min(POLICY_RATE_MAX_MONTHLY_STEP, unclampedStep));
    bank.loanRatePerYear = Math.max(
        POLICY_RATE_MIN_PER_YEAR,
        Math.min(POLICY_RATE_MAX_PER_YEAR, bank.loanRatePerYear + step),
    );
}
