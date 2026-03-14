import { RETAINED_EARNINGS_THRESHOLD } from '../constants';
import type { Agent, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import { totalActiveForEdu, totalDepartingForEdu } from '../workforce/workforceAggregates';
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

// ---------------------------------------------------------------------------
// A) Pre-production financial tick
// ---------------------------------------------------------------------------

export function preProductionFinancialTick(agents: Map<string, Agent>, planet: Planet): void {
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
            assets.lastWageBill = 0;
            return;
        }

        // Record wage bill for retained-earnings threshold
        assets.lastWageBill = wageBill;

        // 2. Working-capital loan if needed (MONEY CREATION)
        //    bank.loans↑  bank.deposits↑  agent.deposits↑
        if (assets.deposits < wageBill) {
            const shortfall = wageBill - assets.deposits;
            // Record aggregate bank loan and per-agent loan principal
            bank.loans += shortfall;
            bank.deposits += shortfall;
            assets.deposits += shortfall;
            assets.loans += shortfall;
        }

        assets.deposits -= wageBill;
        bank.householdDeposits += wageBill;
        assets.lastWageBill = wageBill;

        // Count only THIS agent's employed workers (from their workforce demography),
        // so that wages are distributed only to workers employed by this agent.
        // Using the global demography count would cause double-counting when multiple
        // agents each distribute their own wage bill across all employed workers.
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

// ---------------------------------------------------------------------------
// B) Post-production financial tick
// ---------------------------------------------------------------------------

/**
 * Step B: loan repayment and balance-sheet reconciliation.
 *
 *   1. Loan repayment (money destruction) with retained-earnings threshold.
 *   2. Balance-sheet invariant verification, when SIM_DEBUG=1 is enabled.
 *
 * Called after the food market tick and wealth diffusion, as the final
 * financial reconciliation step.
 */
export function postProductionFinancialTick(agents: Map<string, Agent>, planet: Planet): void {
    const bank = planet.bank;

    if (bank.loans <= 0) {
        return;
    }

    agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.workforceDemography) {
            return;
        }
        const deposits = assets.deposits;
        const agentLoan = assets.loans;
        if (deposits <= 0 || bank.loans <= 0 || agentLoan <= 0) {
            return;
        }
        // Retained earnings threshold: only repay from deposits exceeding
        // RETAINED_EARNINGS_THRESHOLD × lastWageBill.
        const wageBill = assets.lastWageBill ?? 0;
        const retainedThreshold = wageBill * RETAINED_EARNINGS_THRESHOLD;
        const excessDeposits = Math.max(0, deposits - retainedThreshold);
        if (excessDeposits <= 0) {
            return;
        }
        // Agents only repay up to their own loan principal and available excess.
        const repayment = Math.min(agentLoan, excessDeposits, bank.loans);
        assets.deposits -= repayment;
        assets.loans -= repayment;
        bank.loans -= repayment;
        bank.deposits -= repayment;
    });
    bank.equity = bank.deposits - bank.loans;
}
