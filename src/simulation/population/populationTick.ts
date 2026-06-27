import type { Planet } from '../planet/planet';
import type { WorkforceEventAccumulator } from '../workforce/workforceDemographicTick';
import type { TickProfiler } from '../TickProfiler';

import { populationAdvanceYear } from './aging';
import { calculateDemographicStats } from './demographics';
import { applyDisability } from './disability';
import { populationBirthsTick } from './fertility';
import { applyMortality } from './mortality';
import { consumeServices } from './consumption';
import { applyRetirement } from './retirement';

export function populationTick(
    planet: Planet,
    workforceEvents: WorkforceEventAccumulator,
    profiler?: TickProfiler,
): void {
    const { population } = planet;

    const { populationTotal, fertileWomen } = calculateDemographicStats(population);

    if (populationTotal === 0) {
        return;
    }

    let t: number = 0;

    if (profiler?.isEnabled) {
        t = profiler.mark();
    }
    applyMortality(planet, workforceEvents);
    if (profiler?.isEnabled) {
        t = profiler.markAndAccum('popMortality', '  popMortality', t);
    }

    if (profiler?.isEnabled) {
        t = profiler.mark();
    }
    applyDisability(planet, workforceEvents);
    if (profiler?.isEnabled) {
        t = profiler.markAndAccum('popDisability', '  popDisability', t);
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
    populationBirthsTick(population, fertileWomen, planet.environment.pollution);
    if (profiler?.isEnabled) {
        profiler.markAndAccum('popBirths', '  popBirths', t);
    }
}

export function populationAdvanceYearTick(planet: Planet): void {
    populationAdvanceYear(planet);
}
