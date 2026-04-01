import { SERVICE_DEFINITIONS } from '../market/populationDemand';
import { forEachPopulationCohort, type Population } from './population';

export const STARVATION_ADJUST_TICKS = 30;
export const STARVATION_MAX_LEVEL = 1;

export interface ConsumptionResult {
    servicesConsumed: Record<string, number>;
    consumptionFactor: number;
    starvationLevel: number;
}

export function consumeServices(population: Population) {
    population.lastConsumption = {};
    population.demography.forEach((cohort) => {
        return forEachPopulationCohort(cohort, (category, occ) => {
            if (category.total === 0) {
                return;
            }

            const pop = category.total;

            for (const def of SERVICE_DEFINITIONS) {
                const rate = def.consumptionRatePerPersonPerTick;
                const demand = pop * rate;
                const serviceState = category.services[def.serviceKey];
                const available = serviceState.buffer * rate * pop;
                const consumed = Math.min(available, demand);
                const bufferConsumed = consumed / (rate * pop);
                serviceState.buffer = Math.max(0, serviceState.buffer - bufferConsumed);

                if (def.serviceKey === 'education' && occ !== 'education') {
                    console.warn(`Non-education occupation consuming education service: ${occ}`);
                }
                population.lastConsumption[def.resource.name] =
                    (population.lastConsumption[def.resource.name] ?? 0) + consumed;

                if (def.serviceKey === 'grocery') {
                    const consumptionFactor = consumed / demand;
                    category.services.grocery.starvationLevel = updateStarvationLevel(
                        category.services.grocery.starvationLevel,
                        consumptionFactor,
                    );
                }
            }
        });
    });
}

export function updateStarvationLevel(currentLevel: number, consumptionFactor: number): number {
    const equilibrium = Math.max(0, Math.min(STARVATION_MAX_LEVEL, 1 - Math.min(1, consumptionFactor)));
    const delta = (equilibrium - currentLevel) / STARVATION_ADJUST_TICKS;
    return Math.max(0, Math.min(STARVATION_MAX_LEVEL, currentLevel + delta));
}
