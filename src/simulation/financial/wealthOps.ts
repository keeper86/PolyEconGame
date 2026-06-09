import type { Bank } from '../planet/planet';
import type { Cohort, PopulationCategory } from '../population/population';
import { mergeGaussianMoments, SKILL } from '../population/population';
import type { EducationLevelType } from '../population/education';
import type { Occupation } from '../population/population';

export function creditWageIncome(
    bank: Bank,
    cat: PopulationCategory,
    perWorkerWage: number,
    agentWorkersInCell: number,
): number {
    if (cat.total <= 0 || agentWorkersInCell <= 0 || perWorkerWage <= 0) {
        return 0;
    }

    const perCapitaIncrease = perWorkerWage * (agentWorkersInCell / cat.total);
    const aggregateDelta = perCapitaIncrease * cat.total;

    cat.wealth = {
        mean: cat.wealth.mean + perCapitaIncrease,
        variance: cat.wealth.variance,
    };

    bank.householdDeposits += aggregateDelta;

    return aggregateDelta;
}

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

export function debitWealth(cat: PopulationCategory, perCapita: number, floor?: number): number {
    if (cat.total <= 0 || perCapita >= 0) {
        return 0;
    }
    const oldMean = cat.wealth.mean;
    let newMean = oldMean + perCapita;
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

export function mergeWealthInto(dst: PopulationCategory, src: PopulationCategory, count: number): void {
    if (count <= 0) {
        return;
    }
    dst.wealth = mergeGaussianMoments(dst.total, dst.wealth, count, src.wealth);
}

export function destroyWealthOnDeath(cat: PopulationCategory, count: number): number {
    if (count <= 0 || cat.total <= 0) {
        return 0;
    }
    return count * Math.max(0, cat.wealth.mean);
}
