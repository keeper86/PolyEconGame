import { describe, expect, it } from 'vitest';
import type { GameState, Planet } from '../planet/planet';
import { emitPopulationMilestone, populationMilestoneThreshold } from './populationMilestone';

function makeState(): GameState {
    return { tick: 5, planets: new Map(), agents: new Map(), tickerEvents: [], nextEventId: 1 } as unknown as GameState;
}

function makePlanet(): Planet {
    return { id: 'p1', name: 'Gune' } as unknown as Planet;
}

describe('populationMilestoneThreshold', () => {
    it('snaps to a tenth of the current magnitude', () => {
        expect(populationMilestoneThreshold(8_000_000_000)).toBe(8_000_000_000);
        expect(populationMilestoneThreshold(8_240_000_000)).toBe(8_200_000_000);
        expect(populationMilestoneThreshold(250_000)).toBe(250_000);
        expect(populationMilestoneThreshold(243_100)).toBe(240_000);
    });

    it('returns zero for an empty population', () => {
        expect(populationMilestoneThreshold(0)).toBe(0);
        expect(populationMilestoneThreshold(-5)).toBe(0);
    });
});

describe('emitPopulationMilestone', () => {
    it('records the baseline without emitting on the first observation', () => {
        const state = makeState();
        const planet = makePlanet();

        emitPopulationMilestone(state, planet, 8_000_000_000);

        expect(state.tickerEvents).toHaveLength(0);
        expect(planet.populationMilestone).toBe(8_000_000_000);
    });

    it('emits once the threshold advances', () => {
        const state = makeState();
        const planet = makePlanet();
        emitPopulationMilestone(state, planet, 8_000_000_000);

        emitPopulationMilestone(state, planet, 8_240_000_000);

        expect(state.tickerEvents).toHaveLength(1);
        expect(state.tickerEvents[0].category).toBe('populationMilestone');
        expect(state.tickerEvents[0].planetId).toBe('p1');
        expect(state.tickerEvents[0].details).toEqual({
            kind: 'populationMilestone',
            planetName: 'Gune',
            population: 8_200_000_000,
        });
    });

    it('stays silent while the threshold is unchanged', () => {
        const state = makeState();
        const planet = makePlanet();
        emitPopulationMilestone(state, planet, 8_200_000_000);

        emitPopulationMilestone(state, planet, 8_200_000_001);

        expect(state.tickerEvents).toHaveLength(0);
    });
});
