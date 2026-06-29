import { INPUT_BUFFER_TARGET_TICKS, TICKS_PER_MONTH } from '../constants';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
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

        // Single-pass workforce count: iterate workforce[age][edu][skill] once instead of 8+ times
        for (let age = 0; age < workforce.length; age++) {
            const cohort = workforce[age];
            for (let li = 0; li < educationLevelKeys.length; li++) {
                const edu = educationLevelKeys[li];
                const eduCohort = cohort[edu];
                for (let si = 0; si < SKILL.length; si++) {
                    const skill = SKILL[si];
                    const cat = eduCohort[skill];
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
        }

        if (wageBill <= 0) {
            return;
        }

        assets.monthAcc.wages += wageBill;
        const totalAgentWorkerCount =
            totalWorkersForEdu.none +
            totalWorkersForEdu.primary +
            totalWorkersForEdu.secondary +
            totalWorkersForEdu.tertiary;
        assets.monthAcc.totalWorkersTicks += totalAgentWorkerCount;

        if (assets.deposits < wageBill) {
            const shortfall = 6 * TICKS_PER_MONTH * wageBill - assets.deposits;
            grantLoan(assets, bank, shortfall, 'wageCoverage', tick);
        }

        assets.deposits -= wageBill;

        if (agent.automated) {
            const bufferCost = estimateInputBufferCost(assets, planet);
            if (bufferCost > 0 && assets.deposits < bufferCost) {
                const shortfall = TICKS_PER_MONTH * bufferCost - assets.deposits;
                grantLoan(assets, bank, shortfall, 'bufferCoverage', tick);
            }
        }

        if (totalAgentWorkerCount > 0) {
            const perCapitaWage = wageBill / totalAgentWorkerCount;
            // Fused wage-crediting: iterate workforce and credit corresponding population categories in the same pass
            for (let age = 0; age < workforce.length; age++) {
                const cohort = workforce[age];
                for (let li = 0; li < educationLevelKeys.length; li++) {
                    const edu = educationLevelKeys[li];
                    const eduCohort = cohort[edu];
                    for (let si = 0; si < SKILL.length; si++) {
                        const skill = SKILL[si];
                        const cat = eduCohort[skill];
                        const agentWorkersHere =
                            cat.active +
                            cat.onboarding[0] +
                            cat.onboarding[1] +
                            cat.onboarding[2] +
                            cat.voluntaryDeparting[0] +
                            cat.voluntaryDeparting[1] +
                            cat.voluntaryDeparting[2];
                        if (agentWorkersHere <= 0) {
                            continue;
                        }
                        const popCat = demography[age].employed[edu][skill];
                        if (popCat.total <= 0) {
                            continue;
                        }
                        creditWageIncome(bank, popCat, perCapitaWage, agentWorkersHere);
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

        // If deposits are insufficient, borrow the shortfall so the agent can repay
        const shortfall = totalDue - assets.deposits;
        if (shortfall > 0) {
            remainingLoans.push(grantLoan(assets, bank, shortfall, 'rollover', tick));
        }

        // Repay all matured loans in full
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
        const actualRepayment = repayLoansOldestFirst(assets.activeLoans, maxRepayment);

        assets.deposits -= actualRepayment;
        bank.loans -= actualRepayment;
        bank.deposits -= actualRepayment;
    });
    bank.equity = bank.deposits - bank.loans;
}
