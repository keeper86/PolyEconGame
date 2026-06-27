import type { Planet } from '../planet/planet';
import type { WorkforceEventAccumulator } from '../workforce/workforceDemographicTick';
import type { TickProfiler } from '../TickProfiler';

import { populationAdvanceYear } from './aging';
import { populationBirthsTick } from './fertility';
import { applyMortalityAndDisability } from './mortalityAndDisability';
import { consumeServices } from './consumption';
import { applyRetirement } from './retirement';
import { OCCUPATIONS, SKILL } from './population';
import { educationLevelKeys } from './education';
import { START_FERTILE_AGE, END_FERTILE_AGE } from './fertility';

export function populationTick(
    planet: Planet,
    workforceEvents: WorkforceEventAccumulator,
    profiler?: TickProfiler,
): void {
    const { population } = planet;

    // Lightweight population count — avoids reducePopulationCohort overhead (no service merges per category)
    let populationTotal = 0;
    let fertileWomen = 0;
    const demography = population.demography;
    for (let age = 0; age < demography.length; age++) {
        let ageTotal = 0;
        const cohort = demography[age];
        for (let oi = 0; oi < OCCUPATIONS.length; oi++) {
            const occ = OCCUPATIONS[oi];
            const occCohort = cohort[occ];
            for (let li = 0; li < educationLevelKeys.length; li++) {
                const l = educationLevelKeys[li];
                const eduCohort = occCohort[l];
                for (let si = 0; si < SKILL.length; si++) {
                    ageTotal += eduCohort[SKILL[si]].total;
                }
            }
        }
        populationTotal += ageTotal;
        if (age >= START_FERTILE_AGE && age <= END_FERTILE_AGE) {
            fertileWomen += ageTotal * 0.5;
        }
    }

    if (populationTotal === 0) {
        return;
    }

    let t: number = 0;

    // Combined mortality + disability pass (previously two separate iterations)
    if (profiler?.isEnabled) {
        t = profiler.mark();
    }
    applyMortalityAndDisability(planet, workforceEvents);
    if (profiler?.isEnabled) {
        t = profiler.markAndAccum('popMortalityAndDisability', '  popMortality + popDisability', t);
    }

    if (profiler?.isEnabled) {
        t = profiler.mark();
    }
    applyRetirement(planet);
    if (profiler?.isEnabled) {
        t = profiler.markAndAccum('popRetirement', '  popRetirement', t);
    }

    if (profiler?.isEnabled) {
        t = profiler.mark();
    }
    consumeServices(planet);
    if (profiler?.isEnabled) {
        t = profiler.markAndAccum('popConsumption', '  popConsumption', t);
    }

    if (profiler?.isEnabled) {
        t = profiler.mark();
    }

    // Compute average starvation for births in a single lightweight pass
    // (avoiding the separate full iteration that averageStarvationLevel did via forEachPopulationCohort)
    let weightedStarvation = 0;
    for (let age = 0; age < demography.length; age++) {
        const cohort = demography[age];
        for (let oi = 0; oi < OCCUPATIONS.length; oi++) {
            const occ = OCCUPATIONS[oi];
            const occCohort = cohort[occ];
            for (let li = 0; li < educationLevelKeys.length; li++) {
                const l = educationLevelKeys[li];
                const eduCohort = occCohort[l];
                for (let si = 0; si < SKILL.length; si++) {
                    const cat = eduCohort[SKILL[si]];
                    if (cat.total > 0) {
                        weightedStarvation += cat.services.grocery.starvationLevel * cat.total;
                    }
                }
            }
        }
    }
    const avgStarvation = populationTotal > 0 ? weightedStarvation / populationTotal : 0;

    populationBirthsTick(population, fertileWomen, planet.environment.pollution, avgStarvation);
    if (profiler?.isEnabled) {
        profiler.markAndAccum('popBirths', '  popBirths', t);
    }
}

export function populationAdvanceYearTick(planet: Planet): void {
    populationAdvanceYear(planet);
}
