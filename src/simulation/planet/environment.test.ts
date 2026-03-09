import { describe, it, expect } from 'vitest';
import { environmentTick } from './environment';
import type { GameState } from './planet';
import { makePlanet, makeEnvironment, makeGameState, makeGovernmentAgent } from '../utils/testHelper';

describe('environmentTick', () => {
    it('reduces pollution by constant and percentage and not below zero', () => {
        const gov = makeGovernmentAgent();
        const planet = makePlanet({
            governmentId: gov.id,
            environment: makeEnvironment({
                pollution: { air: 50, water: 10, soil: 2 },
                regenerationRates: {
                    air: { constant: 5, percentage: 0.1 },
                    water: { constant: 2, percentage: 0.5 },
                    soil: { constant: 1, percentage: 0.5 },
                },
            }),
        });
        const gameState = makeGameState(planet, [gov]);

        environmentTick(gameState);

        // air: 50 - 5 - 50 * 0.1 = 40
        expect(planet.environment.pollution.air).toBeCloseTo(40);

        // water: 10 - 2 - 10 * 0.5 = 3
        expect(planet.environment.pollution.water).toBeCloseTo(3);

        // soil: 2 - 1 - 2 * 0.5 = 0 -> clamp to 0
        expect(planet.environment.pollution.soil).toBe(0);
    });

    it('regenerates resources up to maximumCapacity and does not exceed it', () => {
        const gov = makeGovernmentAgent();
        const planet = makePlanet({
            id: 'p2',
            governmentId: gov.id,
            resources: {
                iron: [
                    {
                        type: {
                            name: 'Iron',
                            type: 'solid',
                            volumePerQuantity: 0.3,
                            massPerQuantity: 1,
                        },
                        quantity: 50,
                        id: 'res1',
                        claimAgentId: null,
                        tenantAgentId: null,
                        tenantCostInCoins: 0,
                        regenerationRate: 20,
                        maximumCapacity: 60,
                    },
                ],
            },
        });
        const state: GameState = {
            tick: 0,
            agents: new Map(),
            planets: new Map([['p2', planet]]),
        };

        environmentTick(state);

        const entry = state.planets.get('p2')!.resources.iron[0];
        // regenerationRate = 20, capacity left = 10 -> should increase by 10 to reach 60
        expect(entry.quantity).toBe(60);

        // running again should not exceed maximumCapacity
        environmentTick(state);
        expect(state.planets.get('p2')!.resources.iron[0].quantity).toBe(60);
    });
});
