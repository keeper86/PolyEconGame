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
        policyRateEma: 0,
        policyMonthInterest: 0,
        policyMonthWriteOffs: 0,
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
        const bank = makeBank({ loans: 1_000_000 });
        bank.writeOffs = 50_000;
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.loanRatePerYear).toBe(LOAN_INTEREST_RATE_PER_YEAR);
    });

    it('does nothing outside a month boundary', () => {
        const bank = makeBank({ loans: 1_000_000 });
        bank.writeOffs = 50_000;
        updatePolicyRate(bank, TICKS_PER_MONTH + 1);
        expect(bank.loanRatePerYear).toBe(LOAN_INTEREST_RATE_PER_YEAR);
    });

    it('does nothing when interest and write-offs balance', () => {
        const bank = makeBank({ loans: 1_000_000 });
        bank.interestCollected = 10_000;
        bank.writeOffs = 10_000;
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.loanRatePerYear).toBe(LOAN_INTEREST_RATE_PER_YEAR);
    });

    it('raises the rate under sustained write-offs', () => {
        const bank = makeBank({ loans: 1_000_000 });
        const initialRate = bank.loanRatePerYear;
        for (let i = 0; i < 12; i++) {
            bank.writeOffs += 10_000;
            bank.loans = 1_000_000;
            runMonths(bank, 1, TICKS_PER_MONTH * (i + 1));
        }
        expect(bank.loanRatePerYear).toBeGreaterThan(initialRate);
        expect(bank.loanRatePerYear).toBeLessThanOrEqual(POLICY_RATE_MAX_PER_YEAR);
    });

    it('lowers the rate under sustained interest income', () => {
        const bank = makeBank({ loans: 1_000_000, loanRatePerYear: POLICY_RATE_MAX_PER_YEAR });
        for (let i = 0; i < 12; i++) {
            bank.interestCollected += 10_000;
            bank.loans = 1_000_000;
            runMonths(bank, 1, TICKS_PER_MONTH * (i + 1));
        }
        expect(bank.loanRatePerYear).toBeLessThan(POLICY_RATE_MAX_PER_YEAR);
        expect(bank.loanRatePerYear).toBeGreaterThanOrEqual(POLICY_RATE_MIN_PER_YEAR);
    });

    it('never steps more than the monthly maximum', () => {
        const bank = makeBank({ loans: 1_000_000 });
        bank.writeOffs = 10_000_000;
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.loanRatePerYear - LOAN_INTEREST_RATE_PER_YEAR).toBeCloseTo(POLICY_RATE_MAX_MONTHLY_STEP, 10);
    });

    it('stays within the band when write-offs persist for years', () => {
        const bank = makeBank({ loans: 1_000_000 });
        for (let i = 0; i < 240; i++) {
            bank.writeOffs += 100_000;
            bank.loans = 1_000_000;
            runMonths(bank, 1, TICKS_PER_MONTH * (i + 1));
        }
        expect(bank.loanRatePerYear).toBe(POLICY_RATE_MAX_PER_YEAR);
    });

    it('stays within the band when interest income persists for years', () => {
        const bank = makeBank({ loans: 1_000_000 });
        for (let i = 0; i < 240; i++) {
            bank.interestCollected += 100_000;
            bank.loans = 1_000_000;
            runMonths(bank, 1, TICKS_PER_MONTH * (i + 1));
        }
        expect(bank.loanRatePerYear).toBe(POLICY_RATE_MIN_PER_YEAR);
    });

    it('rebaselines when month snapshots are missing after a resume', () => {
        const bank = makeBank({ loans: 1_000_000 });
        bank.policyMonthInterest = NaN;
        bank.policyMonthWriteOffs = NaN;
        bank.interestCollected = 5_000_000;
        bank.writeOffs = 5_000_000;
        updatePolicyRate(bank, TICKS_PER_MONTH);
        expect(bank.policyMonthInterest).toBe(5_000_000);
        expect(bank.policyMonthWriteOffs).toBe(5_000_000);
        expect(bank.loanRatePerYear).toBe(LOAN_INTEREST_RATE_PER_YEAR);
    });

    it('is wired into advanceTick at the month boundary', () => {
        seedRng(7);
        const { gameState, planet } = makeWorld({ populationByEdu: { none: 100 }, companyIds: [] });
        planet.bank.loans = 1_000_000;
        gameState.tick = TICKS_PER_MONTH;
        planet.bank.writeOffs = 50_000;
        try {
            setPolicyRateControllerEnabled(true);
            advanceTick(gameState);
            expect(planet.bank.loanRatePerYear).toBeGreaterThan(LOAN_INTEREST_RATE_PER_YEAR);
        } finally {
            setPolicyRateControllerEnabled(false);
        }
    });
});
