/**
 * financial/wealthOps.ts
 *
 * Centralised household wealth mutation API.
 *
 * Every operation that changes per-capita `wealth.mean` in the population
 * demography MUST also update `bank.householdDeposits` by the exact same
 * aggregate amount.  This module provides the single authoritative set of
 * helpers that enforce that invariant:
 *
 *   bank.householdDeposits === Σ (category.total × category.wealth.mean)
 *
 * ## Operations
 *
 * | Function                  | ΔhouseholdDeposits | Use-site                       |
 * |---------------------------|--------------------|---------------------------------|
 * | creditWageIncome          | +wageBill          | preProductionFinancialTick       |
 * | debitFoodPurchase         | −totalCost         | foodMarketTick                   |
 * | transferWealthZeroSum     | 0                  | intergenerationalTransfers,      |
 * |                           |                    | inheritance redistribution       |
 *
 * ## Design Rules
 *
 * 1. **No naked `wealth.mean = …` mutations** — every subsystem that
 *    changes household monetary wealth must go through this module.
 *
 * 2. **Exact tracking** — the delta applied to `householdDeposits` is
 *    computed from the *actual* wealth change (not the requested one),
 *    so floor-clamping, population caps, etc. are automatically
 *    accounted for.
 *
 * 3. **Zero-sum transfers** — `transferWealthZeroSum` changes
 *    `wealth.mean` on multiple cells but guarantees the aggregate
 *    change is zero, so `householdDeposits` is untouched.
 */

import type { Bank } from '../planet/planet';
import type { Cohort, PopulationCategory } from '../population/population';
import { SKILL } from '../population/population';
import type { EducationLevelType } from '../population/education';
import type { Occupation } from '../population/population';

// ---------------------------------------------------------------------------
// 1. Credit wage income
// ---------------------------------------------------------------------------

/**
 * Credit wage income to a specific population cell, correctly scaled by
 * the fraction of the cell's population that belongs to the paying agent.
 *
 * The wealth increase per person in the cell is:
 *   `perWorkerWage × (agentWorkersInCell / cellTotal)`
 *
 * This ensures that if only 10 out of 100 employed people in a cell work
 * for this agent, only 10 % of the cell's mean is increased — not 100 %.
 *
 * @param bank              Planet bank (householdDeposits is incremented).
 * @param cat               The population category to credit.
 * @param perWorkerWage     Wage per worker (= wageBill / totalAgentWorkers).
 * @param agentWorkersInCell Number of this agent's workers in the cell.
 * @returns The aggregate wealth added (for bookkeeping / assertions).
 */
export function creditWageIncome(
    bank: Bank,
    cat: PopulationCategory,
    perWorkerWage: number,
    agentWorkersInCell: number,
): number {
    if (cat.total <= 0 || agentWorkersInCell <= 0 || perWorkerWage <= 0) {
        return 0;
    }
    // The per-capita mean increase must be scaled by the fraction of the
    // cell that this agent employs.
    const perCapitaIncrease = perWorkerWage * (agentWorkersInCell / cat.total);
    const aggregateDelta = perCapitaIncrease * cat.total; // = perWorkerWage * agentWorkersInCell

    cat.wealth = {
        mean: cat.wealth.mean + perCapitaIncrease,
        variance: cat.wealth.variance,
    };

    // Keep householdDeposits in sync — NOT done here.
    // The caller (preProductionFinancialTick) already does
    // bank.householdDeposits += wageBill once for the entire agent.
    // That single bulk increment is correct because:
    //   Σ(perWorkerWage * agentWorkersInCell) across all cells = wageBill
    // So we don't touch householdDeposits here to avoid double-counting.

    return aggregateDelta;
}

// ---------------------------------------------------------------------------
// 2. Debit food purchase
// ---------------------------------------------------------------------------

/**
 * Debit wealth from a population cell for food purchases and update
 * `bank.householdDeposits` by the exact same aggregate amount.
 *
 * Unlike a naive `Math.max(0, mean - cost)` clamp, this function tracks
 * the *actual* amount removed so that `householdDeposits` stays in sync
 * even when wealth is insufficient to cover the full cost.
 *
 * @param bank              Planet bank (householdDeposits is decremented).
 * @param cat               The population category to debit.
 * @param perPersonCost     Cost per person (currency units).
 * @returns The aggregate wealth actually removed.
 */
export function debitFoodPurchase(bank: Bank, cat: PopulationCategory, perPersonCost: number): number {
    if (cat.total <= 0 || perPersonCost <= 0) {
        return 0;
    }
    const oldMean = cat.wealth.mean;
    const newMean = Math.max(0, oldMean - perPersonCost);
    const actualPerCapitaDebit = oldMean - newMean;
    const aggregateDebit = actualPerCapitaDebit * cat.total;

    cat.wealth = {
        mean: newMean,
        variance: cat.wealth.variance,
    };

    bank.householdDeposits -= aggregateDebit;

    return aggregateDebit;
}

// ---------------------------------------------------------------------------
// 3. Zero-sum transfer helpers (intergenerational, inheritance)
// ---------------------------------------------------------------------------

/**
 * Credit per-capita wealth to a population cell.  This is one side of a
 * zero-sum transfer — the caller is responsible for ensuring an equal
 * debit elsewhere.  `householdDeposits` is NOT modified.
 *
 * @returns The aggregate wealth added (positive).
 */
export function creditWealth(cat: PopulationCategory, perCapita: number): number {
    if (cat.total <= 0 || perCapita === 0) {
        return 0;
    }
    const aggregate = perCapita * cat.total;
    cat.wealth = {
        mean: cat.wealth.mean + perCapita,
        variance: cat.wealth.variance,
    };
    return aggregate;
}

/**
 * Debit per-capita wealth from a population cell with an optional floor.
 * This is one side of a zero-sum transfer — the caller is responsible
 * for ensuring an equal credit elsewhere.  `householdDeposits` is NOT
 * modified.
 *
 * @returns The aggregate wealth actually removed (positive).
 *          May be less than `|perCapita| * pop` if the floor is hit.
 */
export function debitWealth(cat: PopulationCategory, perCapita: number, floor?: number): number {
    if (cat.total <= 0 || perCapita >= 0) {
        return 0;
    }
    const oldMean = cat.wealth.mean;
    let newMean = oldMean + perCapita; // perCapita is negative
    if (floor !== undefined && newMean < floor) {
        newMean = floor;
    }
    const actualPerCapitaDebit = oldMean - newMean;
    const aggregate = actualPerCapitaDebit * cat.total;

    cat.wealth = {
        mean: newMean,
        variance: cat.wealth.variance,
    };
    return aggregate;
}

/**
 * Distribute a per-capita wealth change across all skill levels for a
 * given (age, occ, edu) cell, proportionally by each skill's population.
 *
 * This is used by intergenerational transfers.  The returned actual
 * aggregate delta accounts for floor-clamping so the caller can track
 * the true zero-sum balance.
 *
 * @returns The actual aggregate wealth change (positive = credited,
 *          negative = debited).
 */
export function distributeWealthChangeTracked(
    demography: Cohort<PopulationCategory>[],
    age: number,
    occ: Occupation,
    edu: EducationLevelType,
    perCapita: number,
    floor?: number,
): number {
    let actualAggregate = 0;
    for (const skill of SKILL) {
        const cat = demography[age][occ][edu][skill];
        if (cat.total <= 0) {
            continue;
        }
        const oldMean = cat.wealth.mean;
        let newMean = oldMean + perCapita;
        if (floor !== undefined && newMean < floor) {
            newMean = floor;
        }
        const actualPerCapita = newMean - oldMean;
        actualAggregate += actualPerCapita * cat.total;
        cat.wealth = {
            mean: newMean,
            variance: cat.wealth.variance,
        };
    }
    return actualAggregate;
}
