import { describe, expect, it } from 'vitest';
import { createEmptyAccumulator } from '../planet/planet';
import { computeNetIncome, netIncomeFromAccumulator } from './netIncome';

describe('computeNetIncome', () => {
    it('subtracts every cost factor from revenue', () => {
        const netIncome = computeNetIncome({
            revenue: 1000,
            wages: 300,
            purchases: 200,
            claimPayments: 50,
            interestPaid: 20,
            wealthTaxPaid: 10,
        });
        expect(netIncome).toBe(420);
    });

    it('counts interest and wealth tax as costs', () => {
        const withoutNewCosts = computeNetIncome({
            revenue: 1000,
            wages: 300,
            purchases: 200,
            claimPayments: 50,
            interestPaid: 0,
            wealthTaxPaid: 0,
        });
        const withNewCosts = computeNetIncome({
            revenue: 1000,
            wages: 300,
            purchases: 200,
            claimPayments: 50,
            interestPaid: 20,
            wealthTaxPaid: 10,
        });
        expect(withoutNewCosts - withNewCosts).toBe(30);
    });

    it('is negative when costs exceed revenue', () => {
        const netIncome = computeNetIncome({
            revenue: 100,
            wages: 50,
            purchases: 40,
            claimPayments: 20,
            interestPaid: 5,
            wealthTaxPaid: 5,
        });
        expect(netIncome).toBe(-20);
    });
});

describe('netIncomeFromAccumulator', () => {
    it('derives net income from a month accumulator', () => {
        const accumulator = createEmptyAccumulator();
        accumulator.revenue = 100;
        accumulator.wages = 30;
        accumulator.purchases = 20;
        accumulator.claimPayments = 10;
        accumulator.interestPaid = 5;
        accumulator.wealthTaxPaid = 5;
        expect(netIncomeFromAccumulator(accumulator)).toBe(30);
    });
});
