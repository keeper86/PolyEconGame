import { pushTickerEvent, type GameState, type Planet } from '../planet/planet';

const MILESTONE_STEPS_PER_MAGNITUDE = 10;

export function populationMilestoneThreshold(total: number): number {
    if (total <= 0) {
        return 0;
    }
    const magnitude = Math.pow(10, Math.floor(Math.log10(total)));
    const step = magnitude / MILESTONE_STEPS_PER_MAGNITUDE;
    return Math.floor(total / step) * step;
}

export function emitPopulationMilestone(gameState: GameState, planet: Planet, populationTotal: number): void {
    const threshold = populationMilestoneThreshold(populationTotal);
    const previous = planet.populationMilestone;

    if (previous === undefined) {
        planet.populationMilestone = threshold;
        return;
    }

    if (threshold <= previous) {
        return;
    }

    planet.populationMilestone = threshold;
    pushTickerEvent(gameState, {
        category: 'populationMilestone',
        planetId: planet.id,
        tick: gameState.tick,
        details: { kind: 'populationMilestone', planetName: planet.name, population: threshold },
    });
}
