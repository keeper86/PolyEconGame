import { GENERATION_GAP, SUPPORT_WEIGHT_SIGMA } from '../constants';
import type { Cohort, PopulationCategory } from './population';
import { forEachPopulationCohort } from './population';
import { creditWealth } from '../financial/wealthOps';

export interface InheritanceRecord {
    sourceAge: number;

    amount: number;
}

function inheritanceWeight(sourceAge: number, heirAge: number): number {
    const target = sourceAge - GENERATION_GAP;
    const delta = heirAge - target;
    const sigma = SUPPORT_WEIGHT_SIGMA;
    return Math.exp(-(delta * delta) / (2 * sigma * sigma));
}

export function redistributeInheritance(demography: Cohort<PopulationCategory>[], records: InheritanceRecord[]): void {
    if (records.length === 0) {
        return;
    }

    for (const record of records) {
        if (record.amount <= 0) {
            continue;
        }

        const weightedPop: { age: number; weight: number; pop: number }[] = [];
        let totalWeight = 0;

        for (let age = 0; age < demography.length; age++) {
            const w = inheritanceWeight(record.sourceAge, age);
            if (w < 1e-10) {
                continue;
            }

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
            let totalPop = 0;
            for (let age = 0; age < demography.length; age++) {
                forEachPopulationCohort(demography[age], (cat) => {
                    totalPop += cat.total;
                });
            }
            if (totalPop <= 0) {
                continue;
            }
            const perCapita = record.amount / totalPop;
            for (let age = 0; age < demography.length; age++) {
                forEachPopulationCohort(demography[age], (cat) => {
                    if (cat.total <= 0) {
                        return;
                    }
                    creditWealth(cat, perCapita);
                });
            }
            continue;
        }

        for (const entry of weightedPop) {
            const share = (entry.weight / totalWeight) * record.amount;
            const perCapita = share / entry.pop;

            forEachPopulationCohort(demography[entry.age], (cat) => {
                if (cat.total <= 0) {
                    return;
                }
                creditWealth(cat, perCapita);
            });
        }
    }
}
