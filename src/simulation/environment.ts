import { regenerateRenewableResources } from './entities';
import type { GameState } from './planet';

export function environmentTick(gameState: GameState) {
    gameState.planets.forEach((planet) => {
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

        regenerateRenewableResources(planet);
    });
}
