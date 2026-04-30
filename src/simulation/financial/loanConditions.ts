import { LOAN_CASH_FLOW_MONTHS, LOAN_COLLATERAL_FACTOR, STARTER_LOAN_AMOUNT } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { totalOutstandingLoans } from './loanTypes';

export type LoanConditions = {
    maxLoanAmount: number;
    annualInterestRate: number;
    existingLoans: number;
    lastMonthlyExpenses: number;
    lastMonthlyRevenue: number;
    monthlyNetCashFlow: number;
    storageCollateral: number;
    isNewAgent: boolean;
};

export function computeLoanConditions(agent: Agent, planet: Planet): LoanConditions {
    const assets = agent.assets[planet.id];
    const bank = planet.bank;

    const annualInterestRate = bank.loanRate * 360;

    const existingLoans = totalOutstandingLoans(assets?.activeLoans ?? []);

    const lastMonthlyRevenue = assets?.lastMonthAcc.revenue ?? 0;
    const lastMonthlyExpenses =
        (assets?.lastMonthAcc.wages ?? 0) +
        (assets?.lastMonthAcc.purchases ?? 0) +
        (assets?.lastMonthAcc.claimPayments ?? 0);

    const monthlyNetCashFlow = lastMonthlyRevenue - lastMonthlyExpenses;

    const isNewAgent = !agent.starterLoanTaken;

    let storageCollateral = 0;
    if (assets?.storageFacility?.currentInStorage) {
        for (const entry of Object.values(assets.storageFacility.currentInStorage)) {
            if (entry?.quantity) {
                const price = planet.marketPrices[entry.resource.name] ?? 0;
                storageCollateral += entry.quantity * price * LOAN_COLLATERAL_FACTOR;
            }
        }
    }

    let maxLoanAmount: number;
    if (isNewAgent) {
        maxLoanAmount = STARTER_LOAN_AMOUNT;
    } else if (monthlyNetCashFlow <= 0) {
        maxLoanAmount = Math.max(0, storageCollateral - existingLoans);
    } else {
        const projectedCapacity = LOAN_CASH_FLOW_MONTHS * monthlyNetCashFlow + storageCollateral;
        maxLoanAmount = Math.max(0, projectedCapacity - existingLoans);
        if (maxLoanAmount < existingLoans / 10) {
            maxLoanAmount = 0;
        }
    }

    return {
        maxLoanAmount: Math.floor(maxLoanAmount),
        annualInterestRate,
        existingLoans,
        lastMonthlyExpenses: lastMonthlyExpenses,
        lastMonthlyRevenue: lastMonthlyRevenue,
        monthlyNetCashFlow,
        storageCollateral,
        isNewAgent,
    };
}
