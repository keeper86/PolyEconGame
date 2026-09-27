import type { MonthAccumulator } from '../planet/planet';

export type NetIncomeComponents = {
    revenue: number;
    wages: number;
    purchases: number;
    claimPayments: number;
    interestPaid: number;
    wealthTaxPaid: number;
};

export function computeNetIncome(components: NetIncomeComponents): number {
    return (
        components.revenue -
        components.wages -
        components.purchases -
        components.claimPayments -
        components.interestPaid -
        components.wealthTaxPaid
    );
}

export function netIncomeFromAccumulator(accumulator: MonthAccumulator): number {
    return computeNetIncome({
        revenue: accumulator.revenue,
        wages: accumulator.wages,
        purchases: accumulator.purchases,
        claimPayments: accumulator.claimPayments,
        interestPaid: accumulator.interestPaid,
        wealthTaxPaid: accumulator.wealthTaxPaid,
    });
}
