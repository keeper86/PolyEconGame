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

import type { GameState, Planet, EducationLevelType } from '../planet';
import { educationLevelKeys } from '../planet';
import { totalActiveForEdu, totalDepartingForEdu } from '../workforce/workforceHelpers';
import { getWealthDemography } from '../population/populationHelpers';
import {
    getAgentDepositsForPlanet,
    setAgentDepositsForPlanet,
    addAgentDepositsForPlanet,
    getAgentLoansForPlanet,
    setAgentLoansForPlanet,
    addAgentLoansForPlanet,
} from './depositHelpers';
import { RETAINED_EARNINGS_THRESHOLD } from '../constants';

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
 * Ensure the planet has a Bank object, creating it with zero balances if absent.
 */
function ensureBank(planet: Planet): NonNullable<Planet['bank']> {
    if (!planet.bank) {
        planet.bank = {
            loans: 0,
            deposits: 0,
            householdDeposits: 0,
            equity: 0,
            loanRate: 0,
            depositRate: 0,
        };
    }
    return planet.bank;
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
    const diff = Math.abs(bank.deposits - (firmDepositsSum + bank.householdDeposits));
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
        const bank = ensureBank(planet);
        const wealthDemography = getWealthDemography(planet.population);
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
            const occ = planet.governmentId === agent.id ? 'government' : 'company';

            for (const edu of educationLevelKeys) {
                const totalWorkers = totalActiveForEdu(workforce, edu) + totalDepartingForEdu(workforce, edu);
                if (totalWorkers <= 0) {
                    continue;
                }
                const wage = getWage(planet, edu);

                // Credit workforce wealth moments
                for (const cohort of workforce) {
                    const activeCount = cohort.active[edu];
                    if (activeCount > 0) {
                        cohort.wealthMoments[edu] = {
                            mean: cohort.wealthMoments[edu].mean + wage,
                            variance: cohort.wealthMoments[edu].variance,
                        };
                    }
                    for (let m = 0; m < cohort.departing[edu].length; m++) {
                        if (cohort.departing[edu][m] > 0) {
                            cohort.departingWealth[edu][m] = {
                                mean: cohort.departingWealth[edu][m].mean + wage,
                                variance: cohort.departingWealth[edu][m].variance,
                            };
                        }
                    }
                }

                // Credit population wealth demography
                let totalPopOccCount = 0;
                for (let age = 0; age < demography.length; age++) {
                    totalPopOccCount += demography[age][edu]?.[occ] ?? 0;
                }
                if (totalPopOccCount > 0) {
                    for (let age = 0; age < demography.length; age++) {
                        const ageCount = demography[age][edu]?.[occ] ?? 0;
                        if (ageCount <= 0) {
                            continue;
                        }
                        wealthDemography[age][edu][occ] = {
                            mean: wealthDemography[age][edu][occ].mean + wage,
                            variance: wealthDemography[age][edu][occ].variance,
                        };
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
 * Previously handled consumption, revenue, and pricing — those are now in
 * the food market subsystem (market/foodMarket.ts).  This function now
 * only handles:
 *   1. Loan repayment (money destruction) with retained-earnings threshold.
 *   2. Balance-sheet invariant verification.
 *   3. Price level update (from food market).
 *
 * Called after the food market tick and wealth diffusion, as the final
 * financial reconciliation step.
 */
export function postProductionFinancialTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const bank = ensureBank(planet);

        // Update price level from food market
        if (planet.foodMarket) {
            planet.priceLevel = planet.foodMarket.foodPrice;
        }

        // Loan repayment (MONEY DESTRUCTION)
        repayLoans(gameState, planet, bank);

        // Verify invariant & compute equity
        assertBalanceSheet(bank, sumFirmDeposits(gameState, planet.id), 'postProductionFinancialTick');
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
