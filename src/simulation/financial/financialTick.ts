import { INPUT_BUFFER_TARGET_TICKS, TICKS_PER_MONTH } from '../constants';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { totalActiveForEdu, totalDepartingForEdu } from '../workforce/workforceAggregates';
import type { Loan } from './loanTypes';
import { grantLoan, repayLoansOldestFirst, totalOutstandingLoans } from './loanTypes';
import { creditWageIncome } from './wealthOps';

/**
 * Default wage per education level per tick (currency units per worker).
 * All levels start at 1.0; can be overridden via `planet.wagePerEdu`.
 */
export const DEFAULT_WAGE_PER_EDU = 1.0;

/**
 * Marginal propensity to consume out of income (disposable income consumed
 * each tick).  At 1.0 all wages are immediately spent.
 */
export const C_INC = 1.0;

/**
 * Marginal propensity to consume out of existing wealth.
 * 0.0 means no wealth-based consumption (minimal first implementation).
 */
export const C_WEALTH = 0.0;

function getWage(planet: Planet, edu: EducationLevelType): number {
    return planet.wagePerEdu?.[edu] ?? DEFAULT_WAGE_PER_EDU;
}

/**
 * Estimate the cost to purchase a full input buffer for all production
 * facilities of an agent on a planet.
 *
 * inputBufferCost = Σ_facility Σ_input  qty × scale × INPUT_BUFFER_TARGET_TICKS × marketPrice
 *
 * Land-bound resources (deposits) are excluded because they are not purchased
 * on the spot market.
 */
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

// ---------------------------------------------------------------------------
// A) Pre-production financial tick
// ---------------------------------------------------------------------------

export function preProductionFinancialTick(agents: Map<string, Agent>, planet: Planet, tick = 1): void {
    const bank = planet.bank;
    const demography = planet.population.demography;

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.workforceDemography) {
            return;
        }
        const workforce = assets.workforceDemography;

        // 1. Compute wage bill
        let wageBill = 0;
        const totalWorkersForEdu: Record<EducationLevelType, number> = {
            none: 0,
            primary: 0,
            secondary: 0,
            tertiary: 0,
        };
        for (const edu of educationLevelKeys) {
            const activeWorkers = totalActiveForEdu(workforce, edu);
            const departingWorkers = totalDepartingForEdu(workforce, edu);
            const totalWorkers = activeWorkers + departingWorkers;
            totalWorkersForEdu[edu] = totalWorkers;
            const wage = getWage(planet, edu);
            wageBill += totalWorkers * wage;
        }

        if (wageBill <= 0) {
            return;
        }

        assets.monthAcc.wages += wageBill;
        assets.monthAcc.totalWorkersTicks += Object.values(totalWorkersForEdu).reduce((s, n) => s + n, 0);

        // 2. Working-capital loan if needed (MONEY CREATION)
        //    bank.loans↑  bank.deposits↑  agent.deposits↑
        if (assets.deposits < wageBill) {
            const shortfall = TICKS_PER_MONTH * wageBill - assets.deposits; // loan to cover wage bill for 1 year
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

        let totalAgentWorkerCount = 0;
        for (const edu of educationLevelKeys) {
            totalAgentWorkerCount += totalWorkersForEdu[edu];
        }

        if (totalAgentWorkerCount > 0) {
            const perCapitaWage = wageBill / totalAgentWorkerCount;
            for (let age = 0; age < demography.length; age++) {
                for (const edu of educationLevelKeys) {
                    for (const skill of SKILL) {
                        // Only update cohorts that have workers employed by this agent.
                        const agentWorkers = workforce[age]?.[edu]?.[skill];
                        if (!agentWorkers) {
                            continue;
                        }
                        const activeWorkers = agentWorkers.active;
                        const departingWorkers = agentWorkers.voluntaryDeparting.reduce((s, n) => s + n, 0);
                        const agentWorkersHere = activeWorkers + departingWorkers;
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

    bank.equity = bank.deposits - bank.loans;
}

export function maturesLoans(agents: Map<string, Agent>, planet: Planet, tick: number): void {
    const bank = planet.bank;

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets) {
            return;
        }

        const maturedLoans: Loan[] = [];
        const remainingLoans: Loan[] = [];

        // Partition loans into matured (maturityTick > 0 && tick >= maturityTick) and not-yet-matured
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

        // Calculate total amount due from matured loans
        const totalDue = maturedLoans.reduce((sum, l) => sum + l.remainingPrincipal, 0);

        // Try to repay from deposits
        const canRepay = Math.min(totalDue, assets.deposits);
        const shortfall = totalDue - canRepay;

        // Repay what we can
        if (canRepay > 0) {
            assets.deposits -= canRepay;
            bank.loans -= canRepay;
            bank.deposits -= canRepay;
        }

        // If there's a shortfall, create a rollover loan
        if (shortfall > 0) {
            grantLoan(assets, bank, shortfall, 'discretionary', tick);
            // The rollover loan was pushed onto assets.activeLoans by grantLoan,
            // but we need to keep it in remainingLoans instead. Move it over.
            const rolloverLoan = assets.activeLoans.pop()!;
            remainingLoans.push(rolloverLoan);
        }

        // Replace active loans with the remaining (non-matured + rollover) ones
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

        // Liquidity buffer: keep 12 months of blended total expenses before repaying.
        // If no history is available yet (expenses === 0) skip repayment entirely.
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
