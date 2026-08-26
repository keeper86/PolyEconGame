import {
    EMERGENCY_LOAN_WAGE_MONTHS,
    INPUT_BUFFER_TARGET_TICKS,
    MIN_WAGE,
    TICKS_PER_MONTH,
    TICKS_PER_YEAR,
} from '../constants';
import type { Agent, AgentPlanetAssets, GameState, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import type { Loan } from './loanTypes';
import { grantLoan, hasOutstandingEmergencyLoan, repayLoansEmergencyFirst, totalOutstandingLoans } from './loanTypes';
import { creditWageIncome } from './wealthOps';
import { terminateAndRefound } from './bankruptcy';

export const DEFAULT_WAGE_PER_EDU = MIN_WAGE;

function estimateInputBufferCost(assets: AgentPlanetAssets, planet: Planet): number {
    let cost = 0;
    for (const facility of assets.productionFacilities) {
        for (const { resource, quantity } of facility.needs) {
            if (resource.form === 'landBoundResource') {
                continue;
            }
            const price = planet.marketPrices[resource.name];
            cost += quantity * facility.scale * INPUT_BUFFER_TARGET_TICKS * price;
        }
    }
    return cost;
}

export function preProductionFinancialTick(
    agents: Map<string, Agent>,
    planet: Planet,
    tick = 1,
    gameState?: GameState,
): void {
    const bank = planet.bank;
    const demography = planet.population.demography;

    const weightedWageSum: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const totalPlanetWorkersForEdu: Record<EducationLevelType, number> = {
        none: 0,
        primary: 0,
        secondary: 0,
        tertiary: 0,
    };

    for (const agent of [...agents.values()]) {
        const assets = agent.assets[planet.id];
        if (!assets) {
            continue;
        }

        if (!assets.workforceDemography) {
            continue;
        }

        const workforce = assets.workforceDemography;

        let wageBill = 0;
        const totalWorkersForEdu: Record<EducationLevelType, number> = {
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        };

        // Single-pass workforce count
        for (let age = 0; age < workforce.length; age++) {
            const cohort = workforce[age];
            for (let li = 0; li < educationLevelKeys.length; li++) {
                const edu = educationLevelKeys[li];
                const cat = cohort[edu];
                const totalWorkers =
                    cat.active +
                    cat.onboarding[0] +
                    cat.onboarding[1] +
                    cat.onboarding[2] +
                    cat.voluntaryDeparting[0] +
                    cat.voluntaryDeparting[1] +
                    cat.voluntaryDeparting[2] +
                    cat.departingFired[0] +
                    cat.departingFired[1] +
                    cat.departingFired[2] +
                    cat.departingRetired[0] +
                    cat.departingRetired[1] +
                    cat.departingRetired[2];
                if (totalWorkers <= 0) {
                    continue;
                }
                totalWorkersForEdu[edu] += totalWorkers;
                wageBill += totalWorkers * assets.wagePerEdu[edu];
                weightedWageSum[edu] += assets.wagePerEdu[edu] * totalWorkers;
                totalPlanetWorkersForEdu[edu] += totalWorkers;
            }
        }

        if (wageBill <= 0) {
            continue;
        }

        if (
            agent.id !== planet.governmentId &&
            assets.deposits < wageBill &&
            hasOutstandingEmergencyLoan(assets.activeLoans) &&
            gameState
        ) {
            terminateAndRefound(gameState, planet, agent, tick);
            continue;
        }

        assets.monthAcc.wages += wageBill;
        const totalAgentWorkerCount =
            totalWorkersForEdu.none +
            totalWorkersForEdu.primary +
            totalWorkersForEdu.secondary +
            totalWorkersForEdu.tertiary;
        assets.monthAcc.totalWorkersTicks += totalAgentWorkerCount;

        if (assets.deposits < wageBill) {
            const shortfall = EMERGENCY_LOAN_WAGE_MONTHS * TICKS_PER_MONTH * wageBill - assets.deposits;
            grantLoan(assets, bank, shortfall, 'emergency', tick);
            planet.emergencyLoansGranted += 1;
        }

        assets.deposits -= wageBill;

        if (agent.automated) {
            const bufferCost = estimateInputBufferCost(assets, planet);
            if (bufferCost > 0 && assets.deposits < bufferCost) {
                const shortfall = bufferCost - assets.deposits;
                grantLoan(assets, bank, shortfall, 'bufferCoverage', tick);
            }
        }

        const perCapitaWage = wageBill / totalAgentWorkerCount;
        for (let age = 0; age < workforce.length; age++) {
            const cohort = workforce[age];
            for (let li = 0; li < educationLevelKeys.length; li++) {
                const edu = educationLevelKeys[li];
                const cat = cohort[edu];
                const agentWorkersHere =
                    cat.active +
                    cat.onboarding[0] +
                    cat.onboarding[1] +
                    cat.onboarding[2] +
                    cat.voluntaryDeparting[0] +
                    cat.voluntaryDeparting[1] +
                    cat.voluntaryDeparting[2] +
                    cat.departingFired[0] +
                    cat.departingFired[1] +
                    cat.departingFired[2] +
                    cat.departingRetired[0] +
                    cat.departingRetired[1] +
                    cat.departingRetired[2];
                if (agentWorkersHere <= 0) {
                    continue;
                }
                const popCat = demography[age].employed[edu];
                if (popCat.total <= 0) {
                    continue;
                }
                creditWageIncome(bank, popCat, perCapitaWage, agentWorkersHere);
            }
        }
    }

    for (const edu of educationLevelKeys) {
        if (totalPlanetWorkersForEdu[edu] > 0) {
            planet.wagePerEdu[edu] = weightedWageSum[edu] / totalPlanetWorkersForEdu[edu];
        }
    }

    bank.equity = bank.deposits - bank.loans;
}

function collectLoanInterest(agents: Map<string, Agent>, planet: Planet, tick: number): void {
    const bank = planet.bank;
    let collected = 0;
    agents.forEach((agent) => {
        if (agent.id === planet.governmentId) {
            return;
        }
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        let interestDue = 0;
        for (const loan of assets.activeLoans) {
            interestDue += (loan.remainingPrincipal * loan.annualInterestRate) / TICKS_PER_YEAR;
        }
        if (interestDue <= 0) {
            return;
        }

        const debit = Math.min(interestDue, assets.deposits);
        if (debit < interestDue) {
            const uncovered = interestDue - debit;
            const rolloverType = hasOutstandingEmergencyLoan(assets.activeLoans) ? 'emergency' : 'rollover';
            grantLoan(assets, bank, uncovered, rolloverType, tick);
        }

        assets.deposits -= interestDue;
        bank.deposits -= interestDue;
        collected += interestDue;
    });
    planet.loanInterestCollected += collected;
    planet.bankProfit += collected;
}

export function maturesLoans(agents: Map<string, Agent>, planet: Planet, tick: number): void {
    const bank = planet.bank;

    collectLoanInterest(agents, planet, tick);

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        const maturedLoans: Loan[] = [];
        const remainingLoans: Loan[] = [];

        for (const loan of assets.activeLoans) {
            if (loan.maturityTick > 0 && tick >= loan.maturityTick) {
                maturedLoans.push(loan);
            } else {
                remainingLoans.push(loan);
            }
        }

        if (maturedLoans.length === 0) {
            return;
        }

        const totalDue = maturedLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);

        // If deposits are insufficient, borrow the shortfall so the agent can repay.
        // An emergency loan rolls over as an emergency loan so the warning persists.
        const shortfall = totalDue - assets.deposits;
        if (shortfall > 0) {
            const rolloverType = hasOutstandingEmergencyLoan(maturedLoans) ? 'emergency' : 'rollover';
            remainingLoans.push(grantLoan(assets, bank, shortfall, rolloverType, tick));
        }

        assets.deposits -= totalDue;
        bank.loans -= totalDue;
        bank.deposits -= totalDue;

        assets.activeLoans = remainingLoans;
    });

    bank.equity = bank.deposits - bank.loans;
}

export function automaticLoanRepayment(agents: Map<string, Agent>, planet: Planet): void {
    const bank = planet.bank;

    if (bank.loans <= 0) {
        return;
    }

    agents.forEach((agent) => {
        if (!agent.automated) {
            return;
        }
        if (agent.agentRole === 'arbitrage_trader' || agent.agentRole === 'shipbuilder') {
            return;
        }
        const assets = agent.assets[planet.id];
        if (!assets?.workforceDemography) {
            return;
        }
        const deposits = assets.deposits;
        const agentLoanTotal = totalOutstandingLoans(assets.activeLoans);
        if (deposits <= 0 || bank.loans <= 0 || agentLoanTotal <= 0) {
            return;
        }

        if (bank.loans < agentLoanTotal - 1e-6) {
            throw new Error(
                `Bank loan balance (${bank.loans}) is less than agent ${agent.id} loan principal (${agentLoanTotal}). ` +
                    `This should never happen and indicates a bug in the financial tick logic.`,
            );
        }

        const lastMonthExpenses =
            (assets.lastMonthAcc.wages ?? 0) +
            (assets.lastMonthAcc.purchases ?? 0) +
            (assets.lastMonthAcc.claimPayments ?? 0);

        const retainedThreshold = 12 * lastMonthExpenses;
        const excessDeposits = deposits - retainedThreshold;

        if (excessDeposits <= 0) {
            return;
        }

        const maxRepayment = Math.min(agentLoanTotal, excessDeposits);
        const actualRepayment = repayLoansEmergencyFirst(assets.activeLoans, maxRepayment);

        assets.deposits -= actualRepayment;
        bank.loans -= actualRepayment;
        bank.deposits -= actualRepayment;
    });
    bank.equity = bank.deposits - bank.loans;
}
