import { INPUT_BUFFER_TARGET_TICKS, TICKS_PER_MONTH } from '../constants';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { totalDepartingForEdu, totalWorkingForEdu } from '../workforce/workforceAggregates';
import type { Loan } from './loanTypes';
import { grantLoan, repayLoansOldestFirst, totalOutstandingLoans } from './loanTypes';
import { creditWageIncome } from './wealthOps';

export const DEFAULT_WAGE_PER_EDU = 10.0;

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

export function preProductionFinancialTick(agents: Map<string, Agent>, planet: Planet, tick = 1): void {
    const bank = planet.bank;
    const demography = planet.population.demography;

    const weightedWageSum: Record<EducationLevelType, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    const totalPlanetWorkersForEdu: Record<EducationLevelType, number> = {
        none: 0,
        primary: 0,
        secondary: 0,
        tertiary: 0,
    };

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        if (!assets.workforceDemography) {
            return;
        }

        const workforce = assets.workforceDemography;

        let wageBill = 0;
        const totalWorkersForEdu: Record<EducationLevelType, number> = {
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        };
        for (const edu of educationLevelKeys) {
            const activeWorkers = totalWorkingForEdu(workforce, edu);
            const departingWorkers = totalDepartingForEdu(workforce, edu);
            const totalWorkers = activeWorkers + departingWorkers;
            totalWorkersForEdu[edu] = totalWorkers;
            wageBill += totalWorkers * assets.wagePerEdu[edu];
            weightedWageSum[edu] += assets.wagePerEdu[edu] * totalWorkers;
            totalPlanetWorkersForEdu[edu] += totalWorkers;
        }

        if (wageBill <= 0) {
            return;
        }

        assets.monthAcc.wages += wageBill;
        assets.monthAcc.totalWorkersTicks += Object.values(totalWorkersForEdu).reduce((s, n) => s + n, 0);

        if (assets.deposits < wageBill) {
            const shortfall = 6 * TICKS_PER_MONTH * wageBill - assets.deposits;
            grantLoan(assets, bank, shortfall, 'wageCoverage', tick);
        }

        assets.deposits -= wageBill;

        if (assets.profitShareBonus > 0) {
            const totalWorkers = Object.values(totalWorkersForEdu).reduce((s, n) => s + n, 0);
            if (totalWorkers > 0) {
                const perWorkerBonus = assets.profitShareBonus / totalWorkers;
                for (let age = 0; age < demography.length; age++) {
                    for (const edu of educationLevelKeys) {
                        for (const skill of SKILL) {
                            const agentWorkers = workforce[age]?.[edu]?.[skill];
                            if (!agentWorkers) {
                                continue;
                            }
                            const activeWorkers = agentWorkers.active;
                            const onboardingWorkers = agentWorkers.onboarding.reduce((s, n) => s + n, 0);
                            const departingWorkers = agentWorkers.voluntaryDeparting.reduce((s, n) => s + n, 0);
                            const agentWorkersHere = activeWorkers + onboardingWorkers + departingWorkers;
                            if (agentWorkersHere <= 0) {
                                continue;
                            }
                            const cat = demography[age].employed[edu][skill];
                            if (cat.total <= 0) {
                                continue;
                            }

                            creditWageIncome(bank, cat, perWorkerBonus, agentWorkersHere);
                        }
                    }
                }
            }
            assets.monthAcc.profitShareBonuses += assets.profitShareBonus;
            assets.profitShareBonus = 0;
        }

        if (agent.automated) {
            const bufferCost = estimateInputBufferCost(assets, planet);
            if (bufferCost > 0 && assets.deposits < bufferCost) {
                const shortfall = TICKS_PER_MONTH * bufferCost - assets.deposits;
                grantLoan(assets, bank, shortfall, 'bufferCoverage', tick);
            }
        }

        let totalAgentWorkerCount = 0;
        for (const edu of educationLevelKeys) {
            totalAgentWorkerCount += totalWorkersForEdu[edu];
        }

        if (totalAgentWorkerCount > 0) {
            const perCapitaWage = wageBill / totalAgentWorkerCount;
            for (let age = 0; age < demography.length; age++) {
                for (const edu of educationLevelKeys) {
                    for (const skill of SKILL) {
                        const agentWorkers = workforce[age]?.[edu]?.[skill];
                        if (!agentWorkers) {
                            continue;
                        }
                        const activeWorkers = agentWorkers.active;
                        const onboardingWorkers = agentWorkers.onboarding.reduce((s, n) => s + n, 0);
                        const departingWorkers = agentWorkers.voluntaryDeparting.reduce((s, n) => s + n, 0);
                        const agentWorkersHere = activeWorkers + onboardingWorkers + departingWorkers;
                        if (agentWorkersHere <= 0) {
                            continue;
                        }
                        const cat = demography[age].employed[edu][skill];
                        if (cat.total <= 0) {
                            continue;
                        }

                        creditWageIncome(bank, cat, perCapitaWage, agentWorkersHere);
                    }
                }
            }
        }
    });

    for (const edu of educationLevelKeys) {
        if (totalPlanetWorkersForEdu[edu] > 0) {
            planet.wagePerEdu[edu] = weightedWageSum[edu] / totalPlanetWorkersForEdu[edu];
        }
    }

    bank.equity = bank.deposits - bank.loans;
}

export const ROLLOVER_FEE_RATE = 0.05;

export function maturesLoans(agents: Map<string, Agent>, planet: Planet, tick: number): void {
    const bank = planet.bank;

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

        const canRepay = Math.min(totalDue, assets.deposits);
        const shortfall = totalDue - canRepay;

        if (canRepay > 0) {
            assets.deposits -= canRepay;
            bank.loans -= canRepay;
            bank.deposits -= canRepay;
        }

        if (shortfall > 0) {
            const rolloverPrincipal = shortfall;

            grantLoan(assets, bank, rolloverPrincipal, 'discretionary', tick);

            assets.deposits -= shortfall;
            bank.loans -= shortfall;
            bank.deposits -= shortfall;

            const rolloverLoan = assets.activeLoans.pop()!;
            remainingLoans.push(rolloverLoan);
        }

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
        const actualRepayment = repayLoansOldestFirst(assets.activeLoans, maxRepayment);

        assets.deposits -= actualRepayment;
        bank.loans -= actualRepayment;
        bank.deposits -= actualRepayment;
    });
    bank.equity = bank.deposits - bank.loans;
}
