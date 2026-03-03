import { describe, it, expect } from 'vitest';
import { environmentTick } from './environment';
import type { GameState, Planet } from './planet';
import type { Resource } from './facilities';

describe('environmentTick', () => {
    it('reduces pollution by constant and percentage and not below zero', () => {
        const p1 = {
            id: 'p1',
            name: 'P1',
            position: { x: 0, y: 0, z: 0 },
            population: { demography: [], starvationLevel: 0 },
            resources: {},
            governmentId: 'g1',
            infrastructure: {
                primarySchools: 0,
                secondarySchools: 0,
                universities: 0,
                hospitals: 0,
                mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
                energy: { production: 0 },
            },
            environment: {
                naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
                pollution: { air: 50, water: 10, soil: 2 },
                regenerationRates: {
                    air: { constant: 5, percentage: 0.1 },
                    water: { constant: 2, percentage: 0.5 },
                    soil: { constant: 1, percentage: 0.5 },
                },
            },
        } as Planet;
        const state: GameState = {
            tick: 0,
            agents: new Map(),
            planets: new Map([['p1', p1]]),
        };

        environmentTick(state);

        // air: 50 - 5 - 50 * 0.1 = 40
        expect(state.planets.get('p1')!.environment.pollution.air).toBeCloseTo(40);

        // water: 10 - 2 - 10 * 0.5 = 3
        expect(state.planets.get('p1')!.environment.pollution.water).toBeCloseTo(3);

        // soil: 2 - 1 - 2 * 0.5 = 0 -> clamp to 0
        expect(state.planets.get('p1')!.environment.pollution.soil).toBe(0);
    });

    it('regenerates resources up to maximumCapacity and does not exceed it', () => {
        const p2 = {
            id: 'p2',
            name: 'P2',
            position: { x: 0, y: 0, z: 0 },
            population: { demography: [], starvationLevel: 0 },
            resources: {
                iron: [
                    {
                        // small stub Resource object to satisfy the Resource type
                        type: {
                            name: 'Iron',
                            type: 'solid',
                            volumePerQuantity: 0.3,
                            massPerQuantity: 1,
                        } as Resource,
                        quantity: 50,
                        id: 'res1',
                        claim: null,
                        tenant: null,
                        tenantCostInCoins: 0,
                        regenerationRate: 20,
                        maximumCapacity: 60,
                    },
                ],
            },
            governmentId: 'g2',
            infrastructure: {
                primarySchools: 0,
                secondarySchools: 0,
                universities: 0,
                hospitals: 0,
                mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
                energy: { production: 0 },
            },
            environment: {
                naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
                pollution: { air: 0, water: 0, soil: 0 },
                regenerationRates: {
                    air: { constant: 0, percentage: 0 },
                    water: { constant: 0, percentage: 0 },
                    soil: { constant: 0, percentage: 0 },
                },
            },
        } as unknown as Planet;
        const state: GameState = {
            tick: 0,
            agents: new Map(),
            planets: new Map([['p2', p2]]),
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
