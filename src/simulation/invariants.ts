/**
 * simulation/invariants.ts
 *
 * Invariant checks for the simulation engine.
 * Each function returns an array of discrepancy messages (empty = healthy).
 */

import type { Agent, Planet } from './planet/planet';
import { educationLevelKeys } from './population/education';
import { SKILL, forEachPopulationCohort } from './population/population';

// ---------------------------------------------------------------------------
// Population ↔ Workforce consistency
// ---------------------------------------------------------------------------

/**
 * Verify that the total number of 'employed' people in each planet's
 * population demography matches the sum of workforce (active + departing)
 * across all agents on that planet, for every education level.
 */
export function checkPopulationWorkforceConsistency(
    agents: Map<string, Agent>,
    planets: Map<string, Planet>,
): string[] {
    const discrepancies: string[] = [];

    for (const [planetId, planet] of planets) {
        for (const edu of educationLevelKeys) {
            // Sum employed in population
            let popEmployed = 0;
            for (const cohort of planet.population.demography) {
                for (const skill of SKILL) {
                    popEmployed += cohort.employed[edu][skill].total;
                }
            }

            // Sum workforce across all agents on this planet.
            // NOTE: departingFired is a *subset tag* on departing (tracks
            // which departing workers were fired vs voluntary quits) — it
            // is NOT an additional pool.  Only active + departing count.
            let wfTotal = 0;
            for (const agent of agents.values()) {
                const wf = agent.assets[planetId]?.workforceDemography;
                if (!wf) {
                    continue;
                }
                for (let age = 0; age < wf.length; age++) {
                    for (const skill of SKILL) {
                        const cell = wf[age][edu][skill];
                        wfTotal += cell.active;
                        for (const d of cell.departing) {
                            wfTotal += d;
                        }
                    }
                }
            }

            if (popEmployed !== wfTotal) {
                discrepancies.push(
                    `planet=${planetId} edu=${edu}: population(employed)=${popEmployed} ≠ workforce=${wfTotal}`,
                );
            }
        }
    }

    return discrepancies;
}

// ---------------------------------------------------------------------------
// Age-moment consistency
// ---------------------------------------------------------------------------

/**
 * Verify that no population category has negative total or nonsensical
 * Gaussian moments (negative variance, NaN values).
 */
export function checkAgeMomentConsistency(agents: Map<string, Agent>, planets: Map<string, Planet>): string[] {
    const discrepancies: string[] = [];

    for (const [planetId, planet] of planets) {
        for (let age = 0; age < planet.population.demography.length; age++) {
            forEachPopulationCohort(planet.population.demography[age], (cat, occ, edu, skill) => {
                if (cat.total < 0) {
                    discrepancies.push(
                        `planet=${planetId} age=${age} occ=${occ} edu=${edu} skill=${skill}: negative total=${cat.total}`,
                    );
                }
                if (Number.isNaN(cat.wealth.mean) || Number.isNaN(cat.wealth.variance)) {
                    discrepancies.push(
                        `planet=${planetId} age=${age} occ=${occ} edu=${edu} skill=${skill}: NaN wealth moments`,
                    );
                }
                if (cat.wealth.variance < 0) {
                    discrepancies.push(
                        `planet=${planetId} age=${age} occ=${occ} edu=${edu} skill=${skill}: negative variance=${cat.wealth.variance}`,
                    );
                }
            });
        }
    }

    return discrepancies;
}

// ---------------------------------------------------------------------------
// Monetary conservation: householdDeposits + Σ(agent.deposits) − bank.loans === 0
// ---------------------------------------------------------------------------

/**
 * Verify the fundamental monetary conservation invariant for each planet.
 *
 * All money is created via bank loans and destroyed via repayment.
 * At any point in time:
 *
 *   bank.loans === bank.deposits                         (balance sheet)
 *   bank.deposits === Σ(agent.deposits) + householdDeposits  (deposit decomposition)
 *
 * Combining these:
 *   householdDeposits + Σ(agent.deposits) − bank.loans === 0
 *
 * A non-zero residual indicates a monetary leak (money created or
 * destroyed outside of the loan/repayment mechanism).
 *
 * @param tolerance  Relative tolerance for floating-point comparison
 *                   (default 0.01 = 1%).
 */
export function checkMonetaryConservation(
    agents: Map<string, Agent>,
    planets: Map<string, Planet>,
    tolerance = 0.01,
): string[] {
    const discrepancies: string[] = [];

    for (const [planetId, planet] of planets) {
        const bank = planet.bank;

        // Sum firm deposits across all agents on this planet (Kahan summation)
        let firmDeposits = 0;
        let c = 0;
        for (const agent of agents.values()) {
            if (agent.assets[planetId]) {
                const d = (agent.assets[planetId].deposits ?? 0) - c;
                const t = firmDeposits + d;
                c = t - firmDeposits - d;
                firmDeposits = t;
            }
        }

        // Invariant 1: bank.deposits === firmDeposits + householdDeposits
        const depositSum = firmDeposits + bank.householdDeposits;
        const depositDiff =
            bank.deposits === 0 && depositSum === 0
                ? 0
                : bank.deposits === 0
                  ? Math.abs(depositSum)
                  : Math.abs(1 - depositSum / bank.deposits);

        if (depositDiff > tolerance) {
            discrepancies.push(
                `planet=${planetId}: deposit decomposition violated: ` +
                    `bank.deposits=${bank.deposits.toFixed(4)}, ` +
                    `firmDeposits=${firmDeposits.toFixed(4)}, ` +
                    `householdDeposits=${bank.householdDeposits.toFixed(4)}, ` +
                    `relDiff=${depositDiff.toFixed(6)}`,
            );
        }

        // Invariant 2: householdDeposits + firmDeposits - bank.loans === 0
        const residual = bank.householdDeposits + firmDeposits - bank.loans;
        const residualRel =
            bank.loans === 0 && residual === 0
                ? 0
                : bank.loans === 0
                  ? Math.abs(residual)
                  : Math.abs(residual / bank.loans);

        if (residualRel > tolerance) {
            discrepancies.push(
                `planet=${planetId}: monetary conservation violated: ` +
                    `householdDeposits + firmDeposits - loans = ${residual.toFixed(4)}, ` +
                    `loans=${bank.loans.toFixed(4)}, relResidual=${residualRel.toFixed(6)}`,
            );
        }
    }

    return discrepancies;
}

// ---------------------------------------------------------------------------
// Wealth ↔ householdDeposits consistency
// ---------------------------------------------------------------------------

/**
 * Verify that the sum of population wealth matches `bank.householdDeposits`.
 *
 *   bank.householdDeposits ≈ Σ (category.total × category.wealth.mean)
 *
 * A divergence means that wealth moments are being mutated without a
 * corresponding change to the bank's householdDeposits (or vice versa).
 *
 * @param tolerance  Absolute tolerance (default 1.0 monetary units).
 */
export function checkWealthBankConsistency(planets: Map<string, Planet>, tolerance = 1.0): string[] {
    const discrepancies: string[] = [];

    for (const [planetId, planet] of planets) {
        const bank = planet.bank;
        const demography = planet.population.demography;

        // Sum total population wealth: Σ (category.total × category.wealth.mean)
        let totalWealth = 0;
        for (const cohort of demography) {
            forEachPopulationCohort(cohort, (cat) => {
                if (cat.total > 0) {
                    totalWealth += cat.total * cat.wealth.mean;
                }
            });
        }

        const diff = Math.abs(bank.householdDeposits - totalWealth);
        if (diff > tolerance) {
            discrepancies.push(
                `planet=${planetId}: wealth/bank divergence: ` +
                    `householdDeposits=${bank.householdDeposits.toFixed(4)}, ` +
                    `populationWealth=${totalWealth.toFixed(4)}, ` +
                    `diff=${diff.toFixed(4)}`,
            );
        }
    }

    return discrepancies;
}
