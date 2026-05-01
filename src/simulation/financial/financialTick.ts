import { INPUT_BUFFER_TARGET_TICKS, RETAINED_EARNINGS_THRESHOLD, TICKS_PER_MONTH, TICKS_PER_YEAR } from '../constants';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { totalActiveForEdu, totalDepartingForEdu } from '../workforce/workforceAggregates';
import { creditWageIncome } from './wealthOps';
import { makeLoan, repayLoansOldestFirst, totalOutstandingLoans } from './loanTypes';

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
            const shortfall = wageBill - assets.deposits;
            bank.loans += shortfall;
            bank.deposits += shortfall;
            assets.deposits += shortfall;
            assets.activeLoans.push(
                makeLoan('wageCoverage', shortfall, bank.loanRate * TICKS_PER_YEAR, tick, tick + TICKS_PER_YEAR, true),
            );
        }

        assets.deposits -= wageBill;

        if (agent.automated) {
            const bufferCost = estimateInputBufferCost(assets, planet);
            if (bufferCost > 0 && assets.deposits < bufferCost) {
                const shortfall = bufferCost - assets.deposits;
                bank.loans += shortfall;
                bank.deposits += shortfall;
                assets.deposits += shortfall;
                assets.activeLoans.push(
                    makeLoan(
                        'bufferCoverage',
                        shortfall,
                        bank.loanRate * TICKS_PER_YEAR,
                        tick,
                        tick + TICKS_PER_YEAR,
                        true,
                    ),
                );
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

export function automaticLoanRepayment(agents: Map<string, Agent>, planet: Planet, tick = 1): void {
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
        const progress = (((tick - 1) % TICKS_PER_MONTH) + 1) / TICKS_PER_MONTH;
        const lastMonthExpenses =
            (assets.lastMonthAcc.wages ?? 0) +
            (assets.lastMonthAcc.purchases ?? 0) +
            (assets.lastMonthAcc.claimPayments ?? 0);
        const thisMonthExpenses =
            (assets.monthAcc.wages ?? 0) + (assets.monthAcc.purchases ?? 0) + (assets.monthAcc.claimPayments ?? 0);
        const blendedMonthlyExpenses =
            progress <= 0 || thisMonthExpenses === 0
                ? lastMonthExpenses
                : lastMonthExpenses * (1 - progress) + (thisMonthExpenses / progress) * progress;

        if (blendedMonthlyExpenses <= 0) {
            // No cost history — hold off on repayment
            return;
        }
        const retainedThreshold = RETAINED_EARNINGS_THRESHOLD * 12 * blendedMonthlyExpenses;
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
