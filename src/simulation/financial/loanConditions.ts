import { STARTER_LOAN_AMOUNT, LOAN_CASH_FLOW_MONTHS, LOAN_COLLATERAL_FACTOR, TICKS_PER_MONTH } from '../constants';
import type { Agent, Planet } from '../planet/planet';

export type LoanConditions = {
    /** Maximum additional amount the agent may borrow right now. */
    maxLoanAmount: number;
    /** Annual interest rate (matches planet.bank.loanRate, expressed as a
     *  per-tick rate but shown to the player annualised). */
    annualInterestRate: number;
    /** Outstanding loan balance already held by this agent. */
    existingLoans: number;
    /** Blended monthly wage cost used in the projection (informational). */
    blendedMonthlyWages: number;
    /** Blended monthly market revenue used in the projection (informational). */
    blendedMonthlyRevenue: number;
    /** Net monthly cash flow = blendedMonthlyRevenue − blendedMonthlyWages. */
    monthlyNetCashFlow: number;
    /** Storage collateral value added to the credit limit. */
    storageCollateral: number;
    /** Whether this agent qualifies as a "new" agent (starter-loan path). */
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

    const ticksPerYear = 360;
    const annualInterestRate = bank.loanRate * ticksPerYear;

    const existingLoans = assets?.loans ?? 0;

    const progress = (((tick - 1) % TICKS_PER_MONTH) + 1) / TICKS_PER_MONTH;

    const blendedMonthlyRevenue = blendMonthly(
        assets?.lastMonthAcc.revenueValue ?? 0,
        assets?.monthAcc.revenueValue ?? 0,
        progress,
    );
    const blendedMonthlyWages = blendMonthly(
        assets?.lastMonthAcc.wagesBill ?? 0,
        assets?.monthAcc.wagesBill ?? 0,
        progress,
    );

    const monthlyNetCashFlow = blendedMonthlyRevenue - blendedMonthlyWages;

    const isNewAgent = blendedMonthlyRevenue === 0 && existingLoans === 0;

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
    }

    return {
        maxLoanAmount: Math.floor(maxLoanAmount),
        annualInterestRate,
        existingLoans,
        blendedMonthlyWages,
        blendedMonthlyRevenue,
        monthlyNetCashFlow,
        storageCollateral,
        isNewAgent,
    };
}
