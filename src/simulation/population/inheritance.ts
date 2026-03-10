/**
 * population/inheritance.ts
 *
 * Redistributes monetary wealth from deceased people to younger generations
 * using a Gaussian kernel centred GENERATION_GAP years below the deceased's
 * age.  This is a zero-sum transfer within household wealth: no money is
 * created or destroyed, and `bank.householdDeposits` is unchanged.
 *
 * The Gaussian kernel uses the same SUPPORT_WEIGHT_SIGMA as the
 * intergenerational transfer system for consistency.
 *
 * Food stock of the deceased is destroyed (perishable).
 */

import { GENERATION_GAP, SUPPORT_WEIGHT_SIGMA } from '../constants';
import type { Cohort, PopulationCategory } from './population';
import { forEachPopulationCohort } from './population';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A record of inherited wealth to be redistributed after mortality.
 * One entry per source age that had deaths with positive wealth.
 */
export interface InheritanceRecord {
    /** Age of the deceased cohort. */
    sourceAge: number;
    /** Total monetary wealth orphaned (count × perCapitaMean). */
    amount: number;
}

// ---------------------------------------------------------------------------
// Gaussian kernel
// ---------------------------------------------------------------------------

/**
 * Unnormalised Gaussian weight for an heir at `heirAge` inheriting from
 * a deceased at `sourceAge`.
 *
 * The kernel peaks at `sourceAge − GENERATION_GAP` (i.e. one generation
 * younger) and falls off with σ = SUPPORT_WEIGHT_SIGMA.
 */
function inheritanceWeight(sourceAge: number, heirAge: number): number {
    const target = sourceAge - GENERATION_GAP;
    const delta = heirAge - target;
    const sigma = SUPPORT_WEIGHT_SIGMA;
    return Math.exp(-(delta * delta) / (2 * sigma * sigma));
}

// ---------------------------------------------------------------------------
// Redistribution
// ---------------------------------------------------------------------------

/**
 * Redistribute inherited wealth from deceased people to living population
 * cohorts using a Gaussian kernel.
 *
 * For each `InheritanceRecord`, the wealth is spread across all
 * population categories at ages near `sourceAge − GENERATION_GAP`,
 * weighted by the Gaussian kernel and by each cell's population count.
 *
 * This is a **zero-sum** operation: the total monetary wealth across
 * all population categories remains unchanged.  `bank.householdDeposits`
 * is not modified.
 *
 * @param demography   The population demography array (mutated in place).
 * @param records      Inheritance records from mortality (one per source age).
 */
export function redistributeInheritance(demography: Cohort<PopulationCategory>[], records: InheritanceRecord[]): void {
    if (records.length === 0) {
        return;
    }

    for (const record of records) {
        if (record.amount <= 0) {
            continue;
        }

        // Compute weights for each age based on Gaussian kernel × population
        const weightedPop: { age: number; weight: number; pop: number }[] = [];
        let totalWeight = 0;

        for (let age = 0; age < demography.length; age++) {
            const w = inheritanceWeight(record.sourceAge, age);
            if (w < 1e-10) {
                continue;
            }

            // Sum population at this age across all occupations/edu/skill
            let agePop = 0;
            forEachPopulationCohort(demography[age], (cat) => {
                agePop += cat.total;
            });

            if (agePop <= 0) {
                continue;
            }

            const combined = w * agePop;
            weightedPop.push({ age, weight: combined, pop: agePop });
            totalWeight += combined;
        }

        if (totalWeight <= 0) {
            // No living heirs found — wealth is truly orphaned.
            // This should be extremely rare (near-extinction scenario).
            continue;
        }

        // Distribute wealth proportionally to each age's weight
        for (const entry of weightedPop) {
            const share = (entry.weight / totalWeight) * record.amount;
            const perCapita = share / entry.pop;

            // Credit each cell at this age proportionally by its population
            forEachPopulationCohort(demography[entry.age], (cat) => {
                if (cat.total <= 0) {
                    return;
                }
                cat.wealth = {
                    mean: cat.wealth.mean + perCapita,
                    variance: cat.wealth.variance,
                };
            });
        }
    }
}
