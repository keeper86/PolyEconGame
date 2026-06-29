import type { Planet } from '../planet/planet';
import type { WorkforceEventAccumulator } from '../workforce/workforceDemographicTick';
import type { TickProfiler } from '../TickProfiler';

import { populationAdvanceYear } from './aging';
import { populationBirthsTick } from './fertility';
import { applyMortalityAndDisability } from './mortalityAndDisability';
import { consumeServices } from './consumption';
import { applyRetirement } from './retirement';

export function populationTick(
    planet: Planet,
    workforceEvents: WorkforceEventAccumulator,
    profiler?: TickProfiler,
): void {
    const { population } = planet;

    let t: number = 0;

    // Merged counting + mortality/disability pass
    // (counts population, fertile women, and weighted starvation in the same
    //  iteration that applies mortality and disability — saves ~100ms)
    if (profiler?.isEnabled) {
        t = profiler.mark();
    }
    const counters = applyMortalityAndDisability(planet, workforceEvents);
    if (profiler?.isEnabled) {
        t = profiler.markAndAccum('popMortalityAndDisability', '  popMortality + popDisability + counting', t);
    }

    if (counters.populationTotal === 0) {
        return;
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

    const avgStarvation = counters.populationTotal > 0 ? counters.weightedStarvation / counters.populationTotal : 0;

    populationBirthsTick(population, counters.fertileWomen, planet.environment.pollution, avgStarvation);
    if (profiler?.isEnabled) {
        profiler.markAndAccum('popBirths', '  popBirths', t);
    }
}

export function populationAdvanceYearTick(planet: Planet): void {
    populationAdvanceYear(planet);
}
