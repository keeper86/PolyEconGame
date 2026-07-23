import { allServices } from '@/simulation/market/serviceDefinitions';
import { MAX_AGE } from '@/simulation/population/population';

const POPULATION_AGE_DISTRIBUTION_CACHE = new Map<number, Record<string, number>>();

function computeAgeOccupationDistribution(total: number): Record<string, number> {
    const cached = POPULATION_AGE_DISTRIBUTION_CACHE.get(total);
    if (cached) {
        return cached;
    }

    const perAge = Math.floor(total / (MAX_AGE + 1));
    const result: Record<string, number> = {};

    for (let age = 0; age <= MAX_AGE; age++) {
        const ageCount = Math.floor(perAge * 2 * (1 - age / MAX_AGE));
        if (ageCount <= 0) {
            continue;
        }

        if (age === 0) {
            // newborn, no consumption
        } else if (age < 15) {
            const noneEdu = Math.floor(ageCount * 0.8);
            addTo(result, age, 'education', 'none', noneEdu);
            addTo(result, age, 'education', 'primary', ageCount - noneEdu);
        } else if (age < 25) {
            const primaryEdu = Math.floor(ageCount * 0.2);
            const secondaryEdu = Math.floor(ageCount * 0.6);
            const tertiaryEdu = Math.floor(ageCount * 0.05);
            const unoccupied = ageCount - (primaryEdu + secondaryEdu + tertiaryEdu);
            addTo(result, age, 'education', 'primary', primaryEdu);
            addTo(result, age, 'education', 'secondary', secondaryEdu);
            addTo(result, age, 'education', 'tertiary', tertiaryEdu);
            addTo(result, age, 'unoccupied', 'primary', unoccupied);
        } else if (age < 45) {
            const noneUnocc = Math.floor(ageCount * 0.1);
            const primaryUnocc = Math.floor(ageCount * 0.27);
            const secondaryUnocc = Math.floor(ageCount * 0.36);
            const tertiaryUnocc = ageCount - noneUnocc - primaryUnocc - secondaryUnocc;
            addTo(result, age, 'unoccupied', 'none', noneUnocc);
            addTo(result, age, 'unoccupied', 'primary', primaryUnocc);
            addTo(result, age, 'unoccupied', 'secondary', secondaryUnocc);
            addTo(result, age, 'unoccupied', 'tertiary', tertiaryUnocc);
        } else if (age < 65) {
            const noneUnocc = Math.floor(ageCount * 0.1);
            const primaryUnocc = Math.floor(ageCount * 0.36);
            const secondaryUnocc = Math.floor(ageCount * 0.36);
            const tertiaryUnocc = ageCount - noneUnocc - primaryUnocc - secondaryUnocc;
            addTo(result, age, 'unoccupied', 'none', noneUnocc);
            addTo(result, age, 'unoccupied', 'primary', primaryUnocc);
            addTo(result, age, 'unoccupied', 'secondary', secondaryUnocc);
            addTo(result, age, 'unoccupied', 'tertiary', tertiaryUnocc);
        } else {
            const noneUnable = Math.floor(ageCount * 0.1);
            const primaryUnocc = Math.floor(ageCount * 0.41);
            const secondaryUnocc = Math.floor(ageCount * 0.24);
            const tertiaryUnocc = ageCount - noneUnable - primaryUnocc - secondaryUnocc;
            addTo(result, age, 'unableToWork', 'none', noneUnable);
            addTo(result, age, 'unableToWork', 'primary', primaryUnocc);
            addTo(result, age, 'unableToWork', 'secondary', secondaryUnocc);
            addTo(result, age, 'unableToWork', 'tertiary', tertiaryUnocc);
        }
    }

    POPULATION_AGE_DISTRIBUTION_CACHE.set(total, result);
    return result;
}

function addTo(
    result: Record<string, number>,
    age: number,
    occ: 'unoccupied' | 'employed' | 'education' | 'unableToWork',
    edu: 'none' | 'primary' | 'secondary' | 'tertiary',
    count: number,
): void {
    const key = `${age}|${occ}|${edu}`;
    result[key] = (result[key] ?? 0) + count;
}

/**
 * Computes population-weighted service demand per tick for a given total population.
 * Uses the same age/occupation/education distribution logic as `createPopulation` in helpers.ts.
 *
 * Returns a map of service resource name → total quantity demanded per tick.
 */
export function computePopulationServiceDemand(totalPopulation: number): Record<string, number> {
    if (totalPopulation <= 0) {
        return {};
    }

    const distribution = computeAgeOccupationDistribution(totalPopulation);
    const demand: Record<string, number> = {};

    for (const [key, count] of Object.entries(distribution)) {
        const parts = key.split('|');
        const age = Number(parts[0]);
        const occ = parts[1] as 'unoccupied' | 'employed' | 'education' | 'unableToWork';
        const _edu = parts[2];

        if (count <= 0) {
            continue;
        }

        for (const service of allServices) {
            const rate = service.consumptionRatePerPersonPerTick(age, occ);
            if (rate <= 0) {
                continue;
            }
            demand[service.resource.name] = (demand[service.resource.name] ?? 0) + rate * count;
        }
    }

    return demand;
}
