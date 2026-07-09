import { allServices, serviceKeyOf, SERVICE_DEFINITIONS } from '../market/serviceDefinitions';
import type { Planet } from '../planet/planet';
import { forEachPopulationCohort } from './population';

export const STARVATION_ADJUST_TICKS = 30;
export const STARVATION_MAX_LEVEL = 1;

export interface ConsumptionResult {
    servicesConsumed: Record<string, number>;
    consumptionFactor: number;
    starvationLevel: number;
}

export function consumeServices(planet: Planet) {
    const constructionDef = SERVICE_DEFINITIONS.construction;

    planet.population.demography.forEach((cohort, age) => {
        return forEachPopulationCohort(cohort, (category, occ) => {
            if (category.total === 0) {
                return;
            }

            const pop = category.total;

            // Pre-compute construction buffer ratio for maintenance scaling
            const constructionBuffer = category.services.construction?.buffer ?? 0;
            const constructionBufferRatio =
                constructionDef.bufferTargetTicks > 0
                    ? Math.min(1, constructionBuffer / constructionDef.bufferTargetTicks)
                    : 0;

            for (const def of allServices) {
                const rate = def.consumptionRatePerPersonPerTick;

                // Apply age multiplier
                const ageMult = def.ageMultiplier(age, occ);
                let effectiveRate = rate * ageMult;

                // For maintenance, scale by construction buffer ratio
                if (serviceKeyOf(def) === 'maintenance') {
                    effectiveRate = rate * ageMult * constructionBufferRatio;
                }

                if (effectiveRate <= 0) {
                    continue;
                }

                const demand = pop * effectiveRate;
                const serviceState = category.services[serviceKeyOf(def)];
                const available = serviceState.buffer * rate * pop; // Note: we still use `rate` here to match buffer units
                const consumed = Math.min(available, demand);
                const bufferConsumed = consumed / (rate * pop);
                serviceState.buffer = Math.max(0, serviceState.buffer - bufferConsumed);

                if (serviceKeyOf(def) === 'education' && occ !== 'education' && consumed > 0) {
                    console.warn(`Non-education occupation consuming education service: ${occ}`);
                }
                planet.consumedResources[def.resource.name] =
                    (planet.consumedResources[def.resource.name] ?? 0) + consumed;

                const consumptionFactor = consumed / demand;
                serviceState.starvationLevel = updateStarvationLevel(serviceState.starvationLevel, consumptionFactor);
            }
        });
    });
}

export function updateStarvationLevel(currentLevel: number, consumptionFactor: number): number {
    const equilibrium = Math.max(0, Math.min(STARVATION_MAX_LEVEL, 1 - Math.min(1, consumptionFactor)));
    const delta = (equilibrium - currentLevel) / STARVATION_ADJUST_TICKS;
    return Math.max(0, Math.min(STARVATION_MAX_LEVEL, currentLevel + delta));
}
