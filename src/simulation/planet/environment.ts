import type { Planet } from './planet';

export function environmentTick(planet: Planet) {
    // Apply natural regeneration to pollution indices (decrease pollution by regenerationRates)
    planet.environment.pollution.air = Math.max(
        0,
        planet.environment.pollution.air -
            planet.environment.regenerationRates.air.constant -
            planet.environment.pollution.air * planet.environment.regenerationRates.air.percentage,
    );
    planet.environment.pollution.water = Math.max(
        0,
        planet.environment.pollution.water -
            planet.environment.regenerationRates.water.constant -
            planet.environment.pollution.water * planet.environment.regenerationRates.water.percentage,
    );
    planet.environment.pollution.soil = Math.max(
        0,
        planet.environment.pollution.soil -
            planet.environment.regenerationRates.soil.constant -
            planet.environment.pollution.soil * planet.environment.regenerationRates.soil.percentage,
    );

    for (const resourceEntries of Object.values(planet.resources)) {
        for (const entry of resourceEntries) {
            if (entry.regenerationRate > 0) {
                const toRegenerate = Math.min(entry.regenerationRate, entry.maximumCapacity - entry.quantity);
                entry.quantity += toRegenerate;
            }
        }
    }
}
