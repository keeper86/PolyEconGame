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
import { mergeGaussianMoments, SKILL } from '../population/population';
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

    // Keep householdDeposits in sync with the per-cell wealth change.
    // Each call increments by the exact aggregate for this cell; summing
    // over all cells for one agent equals the agent's wageBill.
    bank.householdDeposits += aggregateDelta;

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

// ---------------------------------------------------------------------------
// 4. Population-transfer wealth helpers
// ---------------------------------------------------------------------------

/**
 * Merge `count` people from `src` into `dst`, updating both the Gaussian
 * wealth moments of `dst` AND `bank.householdDeposits` by the exact
 * aggregate wealth carried by the transferred people.
 *
 * Use this whenever people move between population categories (occupational
 * transitions, retirement, disability, education graduation) so that the
 * per-capita mean of `dst` is updated correctly AND `householdDeposits`
 * stays consistent.
 *
 * This is a zero-sum operation on aggregate wealth: `src` is not modified
 * here — the caller must also decrement `src.total` (and optionally
 * `src.wealth.mean` if the per-capita wealth of those who leave differs
 * from the cell mean, but in our model we assume they carry the same mean).
 *
 * Because the per-capita mean of the *leaving* sub-group equals `src.wealth.mean`
 * (we model the departure as representative), the aggregate wealth leaving
 * the source is `count * src.wealth.mean`.  The source cell's per-capita mean
 * is unchanged after the departure, but its aggregate drops by that amount.
 * The destination gains `count * src.wealth.mean` in aggregate, and
 * `householdDeposits` is unchanged (zero-sum).  Therefore this function
 * does NOT touch `householdDeposits`.
 *
 * @param dst   Destination population category (mutated).
 * @param src   Source population category (read-only here; caller adjusts total).
 * @param count Number of people transferred.
 */
export function mergeWealthInto(dst: PopulationCategory, src: PopulationCategory, count: number): void {
    if (count <= 0) {
        return;
    }
    dst.wealth = mergeGaussianMoments(dst.total, dst.wealth, count, src.wealth);
}

/**
 * Destroy the monetary wealth of `count` people who are removed from
 * `cat` with no destination (i.e. deaths where `inheritedWealth = 0`
 * because the deceased had non-positive wealth).
 *
 * When people with **positive** wealth die, the caller is responsible for
 * calling `redistributeInheritance` which re-credits that wealth to living
 * people via `creditWealth` — a zero-sum operation that leaves
 * `householdDeposits` unchanged.
 *
 * When people with **negative or zero** wealth die, their absence shrinks
 * aggregate wealth: total drops by `count` while `mean` stays the same,
 * so `Σ(total × mean)` changes by `count × mean` (which is ≤ 0).
 * We must decrement `householdDeposits` by the same amount (negative delta
 * means `householdDeposits` actually *increases* to match the now less-negative
 * population sum).
 *
 * @param bank   Planet bank (householdDeposits adjusted by `count × mean` when mean < 0).
 * @param cat    Population category losing people.
 * @param count  Number of people dying (must be ≤ cat.total).
 * @returns      Aggregate wealth orphaned for redistribution (= count × max(0, mean)).
 */
export function destroyWealthOnDeath(bank: Bank, cat: PopulationCategory, count: number): number {
    if (count <= 0 || cat.total <= 0) {
        return 0;
    }
    const mean = cat.wealth.mean;
    // Wealth orphaned for inheritance redistribution (only positive wealth).
    const inheritedWealth = count * Math.max(0, mean);
    // For negative mean: aggregate wealth increases when people are removed,
    // so householdDeposits must increase by the same delta (delta = count * |mean|).
    // For positive mean: wealth will be redistributed by inheritanceRedistribution
    // (zero-sum), so householdDeposits is unchanged here.
    if (mean < 0) {
        // count * mean is negative; removing count people with negative wealth
        // makes total wealth less negative → householdDeposits must increase.
        bank.householdDeposits -= count * mean; // double-negative → positive increment
    }
    return inheritedWealth;
}
