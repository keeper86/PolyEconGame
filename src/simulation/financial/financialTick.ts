import { INPUT_BUFFER_TARGET_TICKS, RETAINED_EARNINGS_THRESHOLD } from '../constants';
import type { Agent, AgentPlanetAssets, Planet } from '../planet/planet';
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
        // householdDeposits is now updated inside creditWageIncome, per cell,
        // so no bulk increment here.
        assets.lastWageBill = wageBill;

        // 3. Input-buffer procurement loan (MONEY CREATION)
        //    Automated agents need capital to purchase production inputs every
        //    tick.  If their deposits fall below the estimated buffer cost, the
        //    bank tops them up so they can participate in the commodity market.
        //    The retained-earnings threshold in automaticLoanRepayment ensures
        //    this balance is never repaid below the buffer floor.
        if (agent.automated) {
            const bufferCost = estimateInputBufferCost(assets, planet);
            if (bufferCost > 0 && assets.deposits < bufferCost) {
                const shortfall = bufferCost - assets.deposits;
                bank.loans += shortfall;
                bank.deposits += shortfall;
                assets.deposits += shortfall;
                assets.loans += shortfall;
            }
        }

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
        const agentLoan = assets.loans;
        if (deposits <= 0 || bank.loans <= 0 || agentLoan <= 0) {
            return;
        }

        if (bank.loans < agentLoan) {
            throw new Error(
                `Bank loan balance (${bank.loans}) is less than agent ${agent.id} loan principal (${agentLoan}). ` +
                    `This should never happen and indicates a bug in the financial tick logic.`,
            );
        }

        const wageBill = assets.lastWageBill ?? 0;
        const bufferCost = estimateInputBufferCost(assets, planet);
        const retainedThreshold = RETAINED_EARNINGS_THRESHOLD * (wageBill + bufferCost);
        const excessDeposits = deposits - retainedThreshold;

        const repayment = excessDeposits <= 0 ? excessDeposits : Math.min(agentLoan, excessDeposits);
        assets.deposits -= repayment;
        assets.loans -= repayment;
        bank.loans -= repayment;
        bank.deposits -= repayment;
    });
    bank.equity = bank.deposits - bank.loans;
}
