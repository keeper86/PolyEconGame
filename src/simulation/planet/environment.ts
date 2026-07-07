import type { Planet } from './planet';

export function environmentTick(planet: Planet) {
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

    for (const entry of Object.values(planet.resources)) {
        const pool = entry.pool;
        if (pool.regenerationRate > 0) {
            const toRegenerate = Math.min(pool.regenerationRate, pool.maximumCapacity - pool.quantity);
            pool.quantity += toRegenerate;
        }
        for (const claim of entry.claims) {
            if (claim.regenerationRate > 0) {
                const toRegenerate = Math.min(claim.regenerationRate, claim.maximumCapacity - claim.quantity);
                claim.quantity += toRegenerate;
            }
        }
    }
}
