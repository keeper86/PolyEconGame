import { EMERGENCY_LOAN_WAGE_MONTHS, MIN_WAGE, TICKS_PER_MONTH, TICKS_PER_YEAR } from '../constants';
import type { Agent, AgentPlanetAssets, GameState, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import type { Loan } from './loanTypes';
import { hasOutstandingEmergencyLoan, repayLoansEmergencyFirst, totalOutstandingLoans } from './loanTypes';
import { grantAutomaticLoan } from './loanConditions';
import { creditWageIncome } from './wealthOps';
import { isCurrencyResource } from '../market/currencyResources';
import { validateAndPrepareBuyBid } from '../market/validation';
import { queryStorageFacility } from '../planet/facility';

export const DEFAULT_WAGE_PER_EDU = MIN_WAGE;

export function estimateWorkingCapitalCost(assets: AgentPlanetAssets): number {
    let cost = 0;
    for (const [resourceName, bid] of Object.entries(assets.market.buy)) {
        if (isCurrencyResource(bid.resource) || bid.resource.form === 'internal') {
            continue;
        }
        const inventory = queryStorageFacility(assets.storage, resourceName);
        const validated = validateAndPrepareBuyBid(bid, assets, inventory);
        if (validated) {
            cost += validated.maxCost;
        }
    }
    return cost;
}

export function preProductionFinancialTick(
    agents: Map<string, Agent>,
    planet: Planet,
    tick = 1,
    gameState: GameState,
): void {
    const bank = planet.bank;
    const demography = planet.population.demography;

    const wageEntries: Record<EducationLevelType, Array<{ wage: number; workers: number }>> = {
        none: [],
        primary: [],
        secondary: [],
        tertiary: [],
    };
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
                totalPlanetWorkersForEdu[edu] += totalWorkers;
                wageEntries[edu].push({ wage: assets.wagePerEdu[edu] ?? 0, workers: totalWorkers });
            }
        }

        if (wageBill <= 0) {
            continue;
        }

        const wageLoanAmount =
            assets.deposits < wageBill ? EMERGENCY_LOAN_WAGE_MONTHS * TICKS_PER_MONTH * wageBill - assets.deposits : 0;
        if (wageLoanAmount > 0) {
            const result = grantAutomaticLoan(gameState, agent, planet, wageLoanAmount, 'wageCoverage', tick);
            if (result.kind === 'bankrupt') {
                continue;
            }
        }

        assets.monthAcc.wages += wageBill;
        const totalAgentWorkerCount =
            totalWorkersForEdu.none +
            totalWorkersForEdu.primary +
            totalWorkersForEdu.secondary +
            totalWorkersForEdu.tertiary;
        assets.monthAcc.totalWorkersTicks += totalAgentWorkerCount;

        assets.deposits -= wageBill;

        if (agent.automated) {
            const workingCapitalCost = estimateWorkingCapitalCost(assets);
            if (workingCapitalCost > 0 && assets.deposits < workingCapitalCost) {
                const shortfall = workingCapitalCost - assets.deposits;
                const result = grantAutomaticLoan(gameState, agent, planet, shortfall, 'bufferCoverage', tick);
                if (result.kind === 'bankrupt') {
                    continue;
                }
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
            planet.wagePerEdu[edu] = weightedMedianWage(wageEntries[edu]);
        }
    }
}

function weightedMedianWage(entries: Array<{ wage: number; workers: number }>): number {
    if (entries.length === 0) {
        return 0;
    }
    const sorted = [...entries].sort((a, b) => a.wage - b.wage);
    const total = sorted.reduce((sum, entry) => sum + entry.workers, 0);
    let cumulative = 0;
    for (const entry of sorted) {
        cumulative += entry.workers;
        if (cumulative >= total / 2) {
            return entry.wage;
        }
    }
    return sorted[sorted.length - 1].wage;
}

function collectLoanInterest(agents: Map<string, Agent>, planet: Planet, tick: number, gameState: GameState): void {
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
            const result = grantAutomaticLoan(gameState, agent, planet, uncovered, 'rollover', tick);
            if (result.kind === 'bankrupt') {
                return;
            }
        }

        assets.deposits -= interestDue;
        bank.deposits -= interestDue;
        collected += interestDue;
        assets.monthAcc.interestPaid += interestDue;
    });
    bank.interestCollected += collected;
    bank.profit += collected;
}

export function maturesLoans(agents: Map<string, Agent>, planet: Planet, tick: number, gameState: GameState): void {
    const bank = planet.bank;

    collectLoanInterest(agents, planet, tick, gameState);

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
        // Routed through the collateral checker so an over-capacity renewal escalates to
        // emergency/restructuring instead of minting unbounded principal. An emergency
        // renewal keeps its emergency flag so the warning persists.
        const shortfall = totalDue - assets.deposits;
        if (shortfall > 0) {
            const rolloverPurpose = hasOutstandingEmergencyLoan(maturedLoans) ? 'emergency' : 'rollover';
            const result = grantAutomaticLoan(gameState, agent, planet, shortfall, rolloverPurpose, tick);
            if (result.kind === 'bankrupt') {
                return;
            }
            remainingLoans.push(result.loan);
        }

        assets.deposits -= totalDue;
        bank.loans -= totalDue;
        bank.deposits -= totalDue;

        assets.activeLoans = remainingLoans;
    });
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
        if (
            agent.agentRole === 'arbitrage_trader' ||
            agent.agentRole === 'shipbuilder' ||
            agent.agentRole === 'buffer_trader'
        ) {
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
}
