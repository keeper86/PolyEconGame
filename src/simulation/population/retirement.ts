import { stochasticRound } from '../utils/stochasticRound';
import type { Occupation, Population } from './population';
import { forEachPopulationCohort, transferPopulation } from './population';
import { convertAnnualToPerTick } from '../utils/convertAnnualToPerTick';

const RETIREMENT_SOURCE_OCCUPATIONS: Occupation[] = ['unoccupied', 'education'] as const;

export const RETIREMENT_AGE = 67;

/**
 * Per-tick retirement probability for a given age.
 * Converts the annual rate to a per-tick rate via geometric compounding.
 */
export function perTickRetirement(age: number): number {
    if (age < RETIREMENT_AGE) {
        return 0;
    }
    const yearsOver = age - RETIREMENT_AGE;
    const annualProb = Math.min(1, 0.1 + (yearsOver * 0.9) / 15);
    if (annualProb <= 0) {
        return 0;
    }
    return convertAnnualToPerTick(annualProb);
}

export function applyRetirement(population: Population): void {
    population.demography.forEach((cohort, age) => {
        const prob = perTickRetirement(age);
        if (prob <= 0) {
            return;
        }

        forEachPopulationCohort(cohort, (category, occ, edu, skill) => {
            if (category.total <= 0 || !RETIREMENT_SOURCE_OCCUPATIONS.includes(occ)) {
                category.retirements.countThisTick = 0;
                return;
            }

            const toRetire = stochasticRound(category.total * prob);
            const retired = transferPopulation(
                population,
                { age, occ, edu, skill },
                { age, occ: 'unableToWork', edu, skill },
                toRetire,
            ).count;
            category.retirements.countThisMonth += retired;
            category.retirements.countThisTick = retired;
        });
    });
}
