import { STARTER_LOAN_AMOUNT, LOAN_CASH_FLOW_MONTHS, LOAN_COLLATERAL_FACTOR, TICKS_PER_MONTH } from '../constants';
import type { Agent, Planet } from '../planet/planet';

export type LoanConditions = {
    maxLoanAmount: number;
    annualInterestRate: number;
    existingLoans: number;
    blendedMonthlyExpenses: number;
    blendedMonthlyRevenue: number;
    monthlyNetCashFlow: number;
    storageCollateral: number;
    isNewAgent: boolean;
};

function blendMonthly(lastMonth: number, currentMonth: number, progress: number): number {
    if (progress <= 0 || currentMonth === 0) {
        return lastMonth;
    }
    const extrapolated = currentMonth / progress;
    return lastMonth * (1 - progress) + extrapolated * progress;
}

export function computeLoanConditions(agent: Agent, planet: Planet, tick: number): LoanConditions {
    const assets = agent.assets[planet.id];
    const bank = planet.bank;

    const annualInterestRate = bank.loanRate * 360;

    const existingLoans = assets?.loans ?? 0;

    const progress = (((tick - 1) % TICKS_PER_MONTH) + 1) / TICKS_PER_MONTH;

    const blendedMonthlyRevenue = blendMonthly(
        assets?.lastMonthAcc.revenue ?? 0,
        assets?.monthAcc.revenue ?? 0,
        progress,
    );
    const blendedMonthlyExpenses = blendMonthly(
        (assets?.lastMonthAcc.wages ?? 0) +
            (assets?.lastMonthAcc.purchases ?? 0) +
            (assets?.lastMonthAcc.claimPayments ?? 0),
        (assets?.monthAcc.wages ?? 0) + (assets?.monthAcc.purchases ?? 0) + (assets?.monthAcc.claimPayments ?? 0),
        progress,
    );

    const monthlyNetCashFlow = blendedMonthlyRevenue - blendedMonthlyExpenses;

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
        blendedMonthlyExpenses,
        blendedMonthlyRevenue,
        monthlyNetCashFlow,
        storageCollateral,
        isNewAgent,
    };
}
