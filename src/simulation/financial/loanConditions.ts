import { LOAN_CASH_FLOW_MONTHS, LOAN_COLLATERAL_FACTOR, STARTER_LOAN_AMOUNT } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import { totalOutstandingLoans } from './loanTypes';
import type { LoanConditions } from '../../server/controller/simulation';
import { computeFacilitiesValue, computeShipsValue } from './assetValuation';
import { constructionServiceResourceType } from '../planet/services';
import type { ShipCapitalMarket } from '../ships/ships';

export function computeLoanConditions(
    agent: Agent,
    planet: Planet,
    shipCapitalMarket?: ShipCapitalMarket,
): LoanConditions {
    const assets = agent.assets[planet.id];
    const bank = planet.bank;

    const annualInterestRate = bank.loanRate * 360;

    const existingLoans = totalOutstandingLoans(assets?.activeLoans ?? []);

    const lastMonthlyRevenue = assets?.lastMonthAcc.revenue ?? 0;
    const lastMonthlyWages = assets?.lastMonthAcc.wages ?? 0;
    const lastMonthlyPurchases = assets?.lastMonthAcc.purchases ?? 0;
    const lastMonthlyClaimPayments = assets?.lastMonthAcc.claimPayments ?? 0;

    const lastMonthlyExpenses = lastMonthlyWages + lastMonthlyPurchases + lastMonthlyClaimPayments;

    const monthlyNetCashFlow = lastMonthlyRevenue - lastMonthlyExpenses;

    const isNewAgent = !agent.starterLoanTaken;

    let storageCollateral = 0;
    if (assets?.storageFacility?.currentInStorage) {
        for (const entry of Object.values(assets.storageFacility.currentInStorage)) {
            if (entry?.quantity && entry.resource.form !== 'services') {
                const price = planet.marketPrices[entry.resource.name] ?? 0;
                storageCollateral += entry.quantity * price * LOAN_COLLATERAL_FACTOR;
            }
        }
    }

    const csPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    const facilitiesCollateral = assets ? computeFacilitiesValue(assets, csPrice) * LOAN_COLLATERAL_FACTOR : 0;
    const shipsCollateral = shipCapitalMarket
        ? computeShipsValue(agent, shipCapitalMarket, planet.marketPrices) * LOAN_COLLATERAL_FACTOR
        : 0;

    let maxLoanAmount: number;
    if (isNewAgent) {
        maxLoanAmount = STARTER_LOAN_AMOUNT;
    } else if (monthlyNetCashFlow <= 0) {
        maxLoanAmount = Math.max(0, storageCollateral + facilitiesCollateral + shipsCollateral - existingLoans);
    } else {
        const projectedCapacity =
            LOAN_CASH_FLOW_MONTHS * monthlyNetCashFlow + storageCollateral + facilitiesCollateral + shipsCollateral;
        maxLoanAmount = Math.max(0, projectedCapacity - existingLoans);
        if (maxLoanAmount < existingLoans / 10) {
            maxLoanAmount = 0;
        }
    }

    return {
        maxLoanAmount: Math.floor(maxLoanAmount),
        annualInterestRate,
        existingLoans,
        lastMonthlyWages,
        lastMonthlyPurchases,
        lastMonthlyClaimPayments,
        lastMonthlyRevenue: lastMonthlyRevenue,
        monthlyNetCashFlow,
        storageCollateral,
        facilitiesCollateral: Math.floor(facilitiesCollateral),
        shipsCollateral: Math.floor(shipsCollateral),
        isNewAgent,
    };
}
