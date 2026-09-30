import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    LOAN_INTEREST_RATE_PER_YEAR,
    POLICY_RATE_MAX_MONTHLY_STEP,
    POLICY_RATE_MAX_PER_YEAR,
    POLICY_RATE_MIN_PER_YEAR,
    TICKS_PER_MONTH,
} from '../constants';
import type { Bank } from '../planet/planet';
import { advanceTick, seedRng } from '../engine';
import { makeWorld } from '../utils/testHelper';
import { setPolicyRateControllerEnabled, updatePolicyRate } from './policyRateController';

function makeBank(overrides: Partial<Bank> = {}): Bank {
    return {
        loans: 0,
        deposits: 0,
        householdDeposits: 0,
        loanRatePerYear: LOAN_INTEREST_RATE_PER_YEAR,
        depositRatePerYear: 0,
        profit: 0,
        interestCollected: 0,
        writeOffs: 0,
        bankruptcies: 0,
        emergencyLoansGranted: 0,
        policyEquityEma: 0,
        ...overrides,
    };
}

function runMonths(bank: Bank, months: number, firstTick = TICKS_PER_MONTH): void {
    for (let i = 0; i < months; i++) {
        updatePolicyRate(bank, firstTick + i * TICKS_PER_MONTH);
    }
}

describe('policyRateController', () => {
    beforeEach(() => {
        setPolicyRateControllerEnabled(true);
    });

    afterEach(() => {
        setPolicyRateControllerEnabled(false);
    });

    it('does nothing while disabled', () => {
        setPolicyRateControllerEnabled(false);
        const bank = makeBank({ loans: 1_000_000, deposits: 2_000_000 });
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.loanRatePerYear).toBe(LOAN_INTEREST_RATE_PER_YEAR);
    });

    it('does nothing outside a month boundary', () => {
        const bank = makeBank({ loans: 1_000_000, deposits: 2_000_000 });
        updatePolicyRate(bank, TICKS_PER_MONTH + 1);
        expect(bank.loanRatePerYear).toBe(LOAN_INTEREST_RATE_PER_YEAR);
    });

    it('does nothing when there are no loans', () => {
        const bank = makeBank({ loans: 0, deposits: 5 });
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.loanRatePerYear).toBe(LOAN_INTEREST_RATE_PER_YEAR);
    });

    it('does nothing while equity is inside the dead band', () => {
        const bank = makeBank({ loans: 1_000_000, deposits: 1_005_000, policyEquityEma: -0.005 });
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.loanRatePerYear).toBe(LOAN_INTEREST_RATE_PER_YEAR);
    });

    it('raises the rate when equity is negative', () => {
        const bank = makeBank({ loans: 1_000_000, deposits: 1_050_000, policyEquityEma: -0.05 });
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.loanRatePerYear).toBeGreaterThan(LOAN_INTEREST_RATE_PER_YEAR);
    });

    it('lowers the rate when equity is positive', () => {
        const bank = makeBank({
            loans: 1_000_000,
            deposits: 900_000,
            policyEquityEma: 0.1,
            loanRatePerYear: POLICY_RATE_MAX_PER_YEAR,
        });
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.loanRatePerYear).toBeLessThan(POLICY_RATE_MAX_PER_YEAR);
    });

    it('never steps more than the monthly maximum', () => {
        const bank = makeBank({ loans: 1_000_000, deposits: 11_000_000, policyEquityEma: -10 });
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.loanRatePerYear - LOAN_INTEREST_RATE_PER_YEAR).toBeCloseTo(POLICY_RATE_MAX_MONTHLY_STEP, 10);
    });

    it('clamps at the ceiling under sustained negative equity', () => {
        const bank = makeBank({ loans: 1_000_000 });
        for (let i = 0; i < 240; i++) {
            bank.deposits = 2_000_000;
            runMonths(bank, 1, TICKS_PER_MONTH * (i + 1));
        }
        expect(bank.loanRatePerYear).toBe(POLICY_RATE_MAX_PER_YEAR);
    });

    it('clamps at the floor under sustained positive equity', () => {
        const bank = makeBank({ loans: 1_000_000, loanRatePerYear: POLICY_RATE_MAX_PER_YEAR });
        for (let i = 0; i < 240; i++) {
            bank.deposits = 500_000;
            runMonths(bank, 1, TICKS_PER_MONTH * (i + 1));
        }
        expect(bank.loanRatePerYear).toBe(POLICY_RATE_MIN_PER_YEAR);
    });

    it('rebaselines the equity EMA when it is missing after a resume', () => {
        const bank = makeBank({ loans: 1_000_000, deposits: 1_500_000 });
        bank.policyEquityEma = NaN;
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(Number.isFinite(bank.policyEquityEma)).toBe(true);
    });

    it('smooths the equity ratio instead of chasing a single month', () => {
        const bank = makeBank({ loans: 1_000_000, deposits: 1_000_000, policyEquityEma: 0 });
        bank.deposits = 2_000_000;
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.policyEquityEma).toBeGreaterThan(-1);
        expect(bank.policyEquityEma).toBeLessThan(0);
    });

    it('is wired into advanceTick at the month boundary', () => {
        seedRng(7);
        const { gameState, planet } = makeWorld({ populationByEdu: { none: 100 }, companyIds: [] });
        planet.bank.loans = 1_000_000;
        planet.bank.deposits = 2_000_000;
        gameState.tick = TICKS_PER_MONTH;
        try {
            setPolicyRateControllerEnabled(true);
            advanceTick(gameState);
            expect(planet.bank.loanRatePerYear).toBeGreaterThan(LOAN_INTEREST_RATE_PER_YEAR);
        } finally {
            setPolicyRateControllerEnabled(false);
        }
    });
});
