import {
    BANKRUPTCY_TRIGGER_MULTIPLE,
    LOAN_CASH_FLOW_MONTHS,
    LOAN_COLLATERAL_FACTOR,
    STARTER_LOAN_AMOUNT,
} from '../constants';
import type { Agent, GameState, Planet } from '../planet/planet';
import { grantLoan, hasOutstandingEmergencyLoan, totalOutstandingLoans, type Loan, type LoanType } from './loanTypes';
import type { LoanConditions } from '../../server/controller/simulation';
import { computeFacilitiesValue, computeShipsValue, constructionValuationPrice } from './assetValuation';
import type { ShipCapitalMarket } from '../ships/ships';
import { processBankruptcy } from './bankruptcy';

export function computeLoanConditions(
    agent: Agent,
    planet: Planet,
    shipCapitalMarket?: ShipCapitalMarket,
): LoanConditions {
    const assets = agent.assets[planet.id];
    const bank = planet.bank;

    const annualInterestRate = bank.loanRatePerYear;

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

    const csPrice = constructionValuationPrice(planet);
    const facilitiesCollateral = assets ? computeFacilitiesValue(assets, csPrice) * LOAN_COLLATERAL_FACTOR : 0;
    const shipsCollateral = shipCapitalMarket
        ? computeShipsValue(agent, shipCapitalMarket, planet.marketPrices) * LOAN_COLLATERAL_FACTOR
        : 0;

    const cashFlowCapacity = monthlyNetCashFlow > 0 ? LOAN_CASH_FLOW_MONTHS * monthlyNetCashFlow : 0;
    const lendingCapacity = STARTER_LOAN_AMOUNT + facilitiesCollateral + shipsCollateral + cashFlowCapacity;
    const bankruptcyTrigger = Math.floor(BANKRUPTCY_TRIGGER_MULTIPLE * lendingCapacity);

    let maxLoanAmount = Math.max(0, lendingCapacity - existingLoans);
    if (maxLoanAmount < existingLoans / 10) {
        maxLoanAmount = 0;
    } else {
        maxLoanAmount = Math.floor(maxLoanAmount);
    }

    return {
        maxLoanAmount,
        bankruptcyTrigger,
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

export function automaticLoanType(conditions: LoanConditions, amount: number, purpose: LoanType): LoanType {
    return amount > conditions.maxLoanAmount ? 'emergency' : purpose;
}

export type AutomaticLoanResult = { kind: 'granted'; loan: Loan } | { kind: 'bankrupt' };

export function grantAutomaticLoan(
    gameState: GameState,
    agent: Agent,
    planet: Planet,
    amount: number,
    purpose: LoanType,
    tick: number,
): AutomaticLoanResult {
    const conditions = computeLoanConditions(agent, planet, gameState.shipCapitalMarket);
    const type = automaticLoanType(conditions, amount, purpose);
    if (
        type === 'emergency' &&
        hasOutstandingEmergencyLoan(agent.assets[planet.id].activeLoans) &&
        totalOutstandingLoans(agent.assets[planet.id].activeLoans) > conditions.bankruptcyTrigger &&
        agent.id !== planet.governmentId
    ) {
        processBankruptcy(gameState, planet, agent, tick);
        return { kind: 'bankrupt' };
    }
    return { kind: 'granted', loan: grantLoan(agent.assets[planet.id], planet.bank, amount, type, tick) };
}
