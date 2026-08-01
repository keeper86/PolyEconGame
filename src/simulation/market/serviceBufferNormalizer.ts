import type { Planet } from '../planet/planet';
import { educationLevelKeys } from '../population/education';
import { OCCUPATIONS, SKILL, type ServiceName } from '../population/population';
import { SERVICE_DEFINITIONS } from './serviceDefinitions';

export function computeNormalizedBuffer(planet: Planet, serviceName: ServiceName): number {
    let bufferSum = 0;
    let consumerPop = 0;
    for (let age = 0; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        if (!cohort) {
            continue;
        }
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    if (cat.total <= 0) {
                        continue;
                    }
                    const rate = SERVICE_DEFINITIONS[serviceName].consumptionRatePerPersonPerTick(age, occ, cat.wealth);
                    if (rate > 0) {
                        bufferSum += cat.services[serviceName].buffer * cat.total;
                        consumerPop += cat.total;
                    }
                }
            }
        }
    }
    const target = SERVICE_DEFINITIONS[serviceName].bufferTargetTicks;
    if (consumerPop <= 0 || target <= 0) {
        return 0;
    }
    return Math.min(1, bufferSum / (consumerPop * target));
}
