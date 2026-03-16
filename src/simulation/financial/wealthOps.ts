import type { Bank } from '../planet/planet';
import type { Cohort, PopulationCategory } from '../population/population';
import { mergeGaussianMoments, SKILL } from '../population/population';
import type { EducationLevelType } from '../population/education';
import type { Occupation } from '../population/population';

/**
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
// 2. Debit consumption purchase
// ---------------------------------------------------------------------------

/**
 * @param bank              Planet bank (householdDeposits is decremented).
 * @param cat               The population category to debit.
 * @param perPersonCost     Cost per person (currency units).
 * @returns The aggregate wealth actually removed.
 */
export function debitConsumptionPurchase(bank: Bank, cat: PopulationCategory, perPersonCost: number): number {
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

/**
 * @param cat Population category to credit (mutated).
 * @param perCapita Per-capita wealth change to apply (positive = credit).
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
 * @param cat Population category to debit (mutated).
 * @param perCapita Per-capita wealth change to apply (negative = debit).
 * @param floor Optional floor for the new mean wealth (if hit, the actual per-capita debit is less than `|perCapita|`).
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
 * @param demography        Population demography (mutated).
 * @param age               Age group index.
 * @param occ               Occupation index.
 * @param edu               Education level index.
 * @param perCapita         Per-capita wealth change to apply (positive = credit, negative = debit).
 * @param floor             Optional floor for the new mean wealth (only applies to debits).
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

/**
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
 * @param bank   Planet bank (householdDeposits adjusted by `count × mean` when mean < 0).
 * @param cat    Population category losing people.
 * @param count  Number of people dying (must be ≤ cat.total).
 * @returns      Aggregate wealth orphaned for redistribution (= count × max(0, mean)).
 */
export function destroyWealthOnDeath(cat: PopulationCategory, count: number): number {
    if (count <= 0 || cat.total <= 0) {
        return 0;
    }
    return count * Math.max(0, cat.wealth.mean);
}
