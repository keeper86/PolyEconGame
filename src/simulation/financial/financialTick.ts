/**
 * financial/financialTick.ts
 *
 * Implements the two-part financial tick that runs each simulation tick:
 *
 * A) Pre-production financial tick (after labor market, before production):
 *    1. Compute each firm's wage bill.
 *    2. Issue working-capital loans if firm deposits < wage bill (money creation).
 *    3. Pay wages: debit firm deposits, credit household deposits.
 *
 * B) Post-production financial tick (after production, before population tick):
 *    1. Determine the price level P = C_nom / Q.
 *    2. Compute household consumption and update wealth moments.
 *    3. Distribute revenue to firms: debit household deposits, credit firm deposits.
 *    4. Firms repay outstanding loans (money destruction).
 *
 * Accounting model (double-entry, all per-planet):
 *   bank.loans              – asset side: total outstanding loans to firms.
 *   bank.deposits           – liability side: total money in the system.
 *   bank.householdDeposits  – subset of deposits held by households.
 *   Σ agent.deposits        – subset of deposits held by firms.
 *
 * Invariant (checked after every sub-step in debug mode):
 *   bank.deposits ≈ Σ agent.deposits + bank.householdDeposits
 *
 * Money is created only via loan issuance and destroyed only via repayment.
 * All other operations are internal transfers between firm and household
 * deposit accounts (bank.deposits stays constant during transfers).
 */

import type { GameState, Planet } from '../planet/planet';
import type { EducationLevelType } from '../population/education';
import { educationLevelKeys } from '../population/education';
import { SKILL } from '../population/population';
import {
    getAgentDepositsForPlanet,
    setAgentDepositsForPlanet,
    addAgentDepositsForPlanet,
    getAgentLoansForPlanet,
    setAgentLoansForPlanet,
    addAgentLoansForPlanet,
} from './depositHelpers';
import { RETAINED_EARNINGS_THRESHOLD } from '../constants';
import { totalActiveForEdu, totalDepartingForEdu } from '../workforce/workforceAggregates';

// ---------------------------------------------------------------------------
// Constants (propensities & defaults)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWage(planet: Planet, edu: EducationLevelType): number {
    return planet.wagePerEdu?.[edu] ?? DEFAULT_WAGE_PER_EDU;
}

/**
 * Compute the sum of all agent firm-deposit balances for a given planet.
 * Only counts agents that have assets on the planet.
 */
function sumFirmDeposits(gameState: GameState, planetId: string): number {
    // Use Kahan summation to reduce floating-point error when summing many
    // potentially large and small deposit values. This avoids tiny
    // balance-sheet mismatches due to summation order/rounding.
    let sum = 0;
    let c = 0; // compensation
    gameState.agents.forEach((agent) => {
        if (agent.assets[planetId]) {
            const y = getAgentDepositsForPlanet(agent, planetId) - c;
            const t = sum + y;
            c = t - sum - y;
            sum = t;
        }
    });
    return sum;
}

/**
 * Assert the fundamental balance-sheet invariant.
 * In debug mode throws on mismatch; in production silently warns.
 */
function assertBalanceSheet(bank: NonNullable<Planet['bank']>, firmDepositsSum: number, label: string): void {
    const totalDeposits = firmDepositsSum + bank.householdDeposits;
    const diff =
        bank.deposits === 0 && totalDeposits === 0
            ? 0
            : bank.deposits === 0
              ? 1
              : Math.abs(1 - totalDeposits / bank.deposits);
    if (diff > 0.01) {
        const msg =
            `[financialTick] balance-sheet violation after ${label}: ` +
            `bank.deposits=${bank.deposits.toFixed(4)}, ` +
            `firmDeposits=${firmDepositsSum.toFixed(4)}, ` +
            `householdDeposits=${bank.householdDeposits.toFixed(4)}, ` +
            `diff=${diff.toFixed(6)}`;
        if (process.env.SIM_DEBUG === '1') {
            throw new Error(msg);
        }

        console.warn(msg);
    }
}

// ---------------------------------------------------------------------------
// A) Pre-production financial tick
// ---------------------------------------------------------------------------

/**
 * Step A: wage-bill calculation, working-capital loans, and wage payment.
 *
 * Called after the labor-market tick and before the production tick.
 */
export function preProductionFinancialTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const bank = planet.bank;
        const demography = planet.population.demography;

        gameState.agents.forEach((agent) => {
            const assets = agent.assets[planet.id];
            if (!assets?.workforceDemography) {
                return;
            }
            const workforce = assets.workforceDemography;

            // 1. Compute wage bill
            let wageBill = 0;
            for (const edu of educationLevelKeys) {
                const activeWorkers = totalActiveForEdu(workforce, edu);
                const departingWorkers = totalDepartingForEdu(workforce, edu);
                const totalWorkers = activeWorkers + departingWorkers;
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
            const currentDeposits = getAgentDepositsForPlanet(agent, planet.id);
            if (currentDeposits < wageBill) {
                const shortfall = wageBill - currentDeposits;
                // Record aggregate bank loan and per-agent loan principal
                bank.loans += shortfall;
                bank.deposits += shortfall;
                setAgentDepositsForPlanet(agent, planet.id, currentDeposits + shortfall);
                addAgentLoansForPlanet(agent, planet.id, shortfall);
            }

            // 3. Pay wages (INTERNAL TRANSFER: firm → household)
            //    agent.deposits↓  bank.householdDeposits↑
            //    bank.deposits is unchanged (money moves between sub-accounts).
            addAgentDepositsForPlanet(agent, planet.id, -wageBill);
            bank.householdDeposits += wageBill;

            // 4. Distribute wages to household wealth moments
            //    In the new model, wealth is tracked on PopulationCategory.wealth
            //    per demography[age][occupation][edu][skill].
            //    All hired workers are under the 'employed' occupation.
            for (const edu of educationLevelKeys) {
                const totalWorkers = totalActiveForEdu(workforce, edu) + totalDepartingForEdu(workforce, edu);
                if (totalWorkers <= 0) {
                    continue;
                }
                const wage = getWage(planet, edu);

                // Credit wealth to employed population cohorts (across all skills)
                let totalPopEmployedCount = 0;
                for (let age = 0; age < demography.length; age++) {
                    for (const skill of SKILL) {
                        totalPopEmployedCount += demography[age].employed[edu][skill].total;
                    }
                }
                if (totalPopEmployedCount > 0) {
                    for (let age = 0; age < demography.length; age++) {
                        for (const skill of SKILL) {
                            const cat = demography[age].employed[edu][skill];
                            if (cat.total <= 0) {
                                continue;
                            }
                            // Add per-capita wage to wealth mean
                            cat.wealth = {
                                mean: cat.wealth.mean + wage,
                                variance: cat.wealth.variance,
                            };
                        }
                    }
                }
            }
        });

        // Verify invariant & compute equity
        assertBalanceSheet(bank, sumFirmDeposits(gameState, planet.id), 'preProductionFinancialTick');
        bank.equity = bank.deposits - bank.loans;
    });
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
export function postProductionFinancialTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const bank = planet.bank;

        // Loan repayment (MONEY DESTRUCTION)
        repayLoans(gameState, planet, bank);

        if (process.env.SIM_DEBUG === '1') {
            assertBalanceSheet(bank, sumFirmDeposits(gameState, planet.id), 'postProductionFinancialTick');
        }
        bank.equity = bank.deposits - bank.loans;
    });
}

// ---------------------------------------------------------------------------
// Loan repayment helper
// ---------------------------------------------------------------------------

/**
 * Firms repay their own outstanding loans from their deposits (money destruction).
 * agent.deposits↓  agent.loans↓  bank.loans↓  bank.deposits↓
 *
 * Persistent money: firms only repay when deposits exceed a retained
 * earnings threshold (RETAINED_EARNINGS_THRESHOLD × lastWageBill).
 * This allows persistent firm balances and prevents the "perfect
 * monetary circle" where all money is created and destroyed each tick.
 */
function repayLoans(gameState: GameState, planet: Planet, bank: NonNullable<Planet['bank']>): void {
    if (bank.loans <= 0) {
        return;
    }
    gameState.agents.forEach((agent) => {
        const assets = agent.assets[planet.id];
        if (!assets?.workforceDemography) {
            return;
        }
        const deposits = getAgentDepositsForPlanet(agent, planet.id);
        const agentLoan = getAgentLoansForPlanet(agent, planet.id);
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
        setAgentDepositsForPlanet(agent, planet.id, deposits - repayment);
        setAgentLoansForPlanet(agent, planet.id, agentLoan - repayment);
        bank.loans -= repayment;
        bank.deposits -= repayment;
    });
}
