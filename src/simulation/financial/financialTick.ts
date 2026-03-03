/**
 * financial/financialTick.ts
 *
 * Implements the two-part financial tick that runs each simulation tick:
 *
 * A) Pre-production financial tick (after labor market, before production):
 *    1. Compute each firm's wage bill.
 *    2. Issue working-capital loans if firm deposits < wage bill (money creation).
 *    3. Pay wages: debit firm deposits, credit household wealth.
 *
 * B) Post-production financial tick (after production, before population tick):
 *    1. Determine the price level P = C_nom / Q.
 *    2. Compute household consumption and update wealth.
 *    3. Distribute revenue to firms proportional to their output.
 *    4. Firms repay outstanding loans (money destruction).
 *
 * Money supply = sum of all household wealth + sum of firm deposits + bank equity.
 * Changes only via loan creation/repayment.
 */

import type { GameState, Planet, Agent, EducationLevelType, WealthMoments } from '../planet';
import { educationLevelKeys } from '../planet';
import { totalActiveForEdu, totalDepartingForEdu } from '../workforce/workforceHelpers';
import { getWealthDemography, mergeWealthMoments } from '../population/populationHelpers';

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
        planet.bank = { loans: 0, deposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
    }
    return planet.bank;
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
            if (!assets?.workforceDemography) return;
            const workforce = assets.workforceDemography;

            // 1. Compute wage bill
            let wageBill = 0;
            const wagesPerEdu: Partial<Record<EducationLevelType, number>> = {};
            for (const edu of educationLevelKeys) {
                const activeWorkers = totalActiveForEdu(workforce, edu);
                const departingWorkers = totalDepartingForEdu(workforce, edu);
                const totalWorkers = activeWorkers + departingWorkers;
                const wage = getWage(planet, edu);
                wagesPerEdu[edu] = totalWorkers * wage;
                wageBill += totalWorkers * wage;
            }

            if (wageBill <= 0) return;

            // 2. Working-capital loan if needed
            const currentDeposits = agent.deposits ?? 0;
            if (currentDeposits < wageBill) {
                const shortfall = wageBill - currentDeposits;
                // Bank creates money: increase loans and firm deposits
                bank.loans += shortfall;
                bank.deposits += shortfall;
                agent.deposits = currentDeposits + shortfall;
            }

            // 3. Pay wages
            agent.deposits = (agent.deposits ?? 0) - wageBill;
            if (agent.deposits < 0) agent.deposits = 0; // safety clamp

            // 4. Distribute wages to household wealth
            //    For each education level, distribute wage_edu evenly among active workers.
            //    Workers are assumed identical within a tenure cohort, so each worker's
            //    wealth_mean increases by wage_edu. We use the workforce's wealthMoments
            //    (per tenure cohort per edu) to find the workers, then map them to
            //    population cells via the demography (occupation = company or government).
            const occ = planet.governmentId === agent.id ? 'government' : 'company';

            for (const edu of educationLevelKeys) {
                const totalWorkers = totalActiveForEdu(workforce, edu) + totalDepartingForEdu(workforce, edu);
                if (totalWorkers <= 0) continue;
                const wage = getWage(planet, edu);

                // Add wage to workforce wealth moments (all workers receive the same wage,
                // so wealth_mean increases by wage, variance unchanged).
                for (const cohort of workforce) {
                    const activeCount = cohort.active[edu];
                    if (activeCount > 0) {
                        cohort.wealthMoments[edu] = {
                            mean: cohort.wealthMoments[edu].mean + wage,
                            variance: cohort.wealthMoments[edu].variance,
                        };
                    }
                    // Also credit workers in the departing pipeline
                    for (let m = 0; m < cohort.departing[edu].length; m++) {
                        if (cohort.departing[edu][m] > 0) {
                            cohort.departingWealth[edu][m] = {
                                mean: cohort.departingWealth[edu][m].mean + wage,
                                variance: cohort.departingWealth[edu][m].variance,
                            };
                        }
                    }
                }

                // Also update population wealth demography for these workers
                // (population tracks edu×occ cells; for employed workers, occ = company/government).
                // Distribute wage proportionally across all ages that have workers in this occupation.
                let totalPopOccCount = 0;
                for (let age = 0; age < demography.length; age++) {
                    totalPopOccCount += demography[age][edu]?.[occ] ?? 0;
                }
                if (totalPopOccCount > 0) {
                    for (let age = 0; age < demography.length; age++) {
                        const ageCount = demography[age][edu]?.[occ] ?? 0;
                        if (ageCount <= 0) continue;
                        // Each worker in this cell receives wage_edu; wealth_mean += wage_edu, var unchanged.
                        wealthDemography[age][edu][occ] = {
                            mean: wealthDemography[age][edu][occ].mean + wage,
                            variance: wealthDemography[age][edu][occ].variance,
                        };
                    }
                }
            }
        });

        // Update bank equity
        bank.equity = bank.deposits - bank.loans;
    });
}

// ---------------------------------------------------------------------------
// B) Post-production financial tick
// ---------------------------------------------------------------------------

/**
 * Step B: price determination, household consumption, firm revenue, and
 * loan repayment.
 *
 * Called after the production tick and before the population tick.
 */
export function postProductionFinancialTick(gameState: GameState): void {
    gameState.planets.forEach((planet) => {
        const bank = ensureBank(planet);
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // 1. Compute total nominal consumption spending C_nom
        //    Consumption per person = c_inc * wage_edu + c_wealth * wealth_mean,
        //    capped at current wealth_mean (cannot consume more than you have).
        //    With c_inc=1 and c_wealth=0 (initial values), each worker spends
        //    exactly wage_edu this tick (their current-tick wage income),
        //    leaving any previously accumulated wealth untouched.
        //    NOTE: We use the actual wage paid this tick rather than total wealth
        //    to avoid depleting accumulated savings in this first implementation.

        // Collect total nominal consumption and per-agent output share
        let cNom = 0;

        // Compute nominal consumption from each edu×occ×age cell for employed workers
        for (let age = 0; age < demography.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occStr of ['company', 'government'] as const) {
                    const count = demography[age][edu]?.[occStr] ?? 0;
                    if (count <= 0) continue;
                    const wm = wealthDemography[age][edu][occStr];
                    // Consumption = c_inc * wages_received + c_wealth * wealth_mean * count
                    // For first pass: wages_received this tick = wage_edu (already added to wealth_mean),
                    // so consumption per person = min(wage_edu, wealth_mean).
                    const wageEdu = getWage(planet, edu);
                    const consumptionPerPerson = Math.min(C_INC * wageEdu + C_WEALTH * wm.mean, wm.mean);
                    const totalConsumption = consumptionPerPerson * count;
                    cNom += totalConsumption;
                    // Deduct consumption from household wealth
                    wealthDemography[age][edu][occStr] = {
                        mean: Math.max(0, wm.mean - consumptionPerPerson),
                        variance: wm.variance, // uniform deduction → variance unchanged
                    };
                }
            }
        }

        if (cNom <= 0) {
            // No household spending this tick; still process loan repayments.
            if (bank.loans > 0) {
                gameState.agents.forEach((agent) => {
                    const assets = agent.assets[planet.id];
                    if (!assets?.workforceDemography) return;
                    const deposits = agent.deposits ?? 0;
                    if (deposits <= 0) return;
                    const repayment = Math.min(bank.loans, deposits);
                    agent.deposits = deposits - repayment;
                    bank.loans -= repayment;
                    bank.deposits -= repayment;
                });
            }
            bank.equity = bank.deposits - bank.loans;
            return;
        }

        // 2. Determine price level P = C_nom / Q
        //    Q = total physical output produced this tick (from storage changes or production).
        //    For the first implementation, if we can't easily obtain Q, we keep P = 1.0
        //    and treat the revenue as equal to C_nom.
        if (!planet.priceLevel) {
            planet.priceLevel = 1.0;
        }
        // Price level updated next tick once we have physical output Q.
        // For now P stays at its previous value (initialized to 1.0).

        // 3. Distribute revenue to firms proportionally to their workforce share.
        //    (Simple proxy: share proportional to total active workers across all edu levels.)
        let totalAgentWorkers = 0;
        const agentWorkerCounts: Map<string, number> = new Map();
        gameState.agents.forEach((agent) => {
            const assets = agent.assets[planet.id];
            if (!assets?.workforceDemography) return;
            let workerCount = 0;
            for (const edu of educationLevelKeys) {
                workerCount += totalActiveForEdu(assets.workforceDemography, edu);
            }
            agentWorkerCounts.set(agent.id, workerCount);
            totalAgentWorkers += workerCount;
        });

        if (totalAgentWorkers > 0) {
            gameState.agents.forEach((agent) => {
                const workerCount = agentWorkerCounts.get(agent.id) ?? 0;
                if (workerCount <= 0) return;
                const share = workerCount / totalAgentWorkers;
                const revenue = cNom * share;
                agent.deposits = (agent.deposits ?? 0) + revenue;
                bank.deposits += revenue;
            });
            // Consumer spending flows out of bank deposits (households' side); offset the double-count.
            // Actually, money flows: households → firms (C_nom deducted from household wealth above,
            // and added to firm deposits). The bank is just the accounting entity.
            // We need to ALSO debit household deposits from the bank total, but since we track
            // household wealth outside the bank, we just reduce bank deposits by C_nom.
            bank.deposits -= cNom;
        }

        // 4. Loan repayment: firms repay outstanding loans from deposits.
        if (bank.loans > 0) {
            gameState.agents.forEach((agent) => {
                const assets = agent.assets[planet.id];
                if (!assets?.workforceDemography) return;
                const deposits = agent.deposits ?? 0;
                if (deposits <= 0) return;
                // Repay as much as possible
                const repayment = Math.min(bank.loans, deposits);
                agent.deposits = deposits - repayment;
                bank.loans -= repayment;
                bank.deposits -= repayment;
            });
        }

        // Update bank equity
        bank.equity = bank.deposits - bank.loans;
    });
}
