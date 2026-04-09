import { describe, expect, it } from 'vitest';
import { makeEnvironment, makeGovernmentAgent, makePlanet } from '../utils/testHelper';
import { environmentTick } from './environment';

describe('environmentTick', () => {
    it('reduces pollution by constant and percentage and not below zero', () => {
        const planet = makePlanet({
            governmentId: 'gov1',
            environment: makeEnvironment({
                pollution: { air: 50, water: 10, soil: 2 },
                regenerationRates: {
                    air: { constant: 5, percentage: 0.1 },
                    water: { constant: 2, percentage: 0.5 },
                    soil: { constant: 1, percentage: 0.5 },
                },
            }),
        });

        environmentTick(planet);

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
                            form: 'solid',
                            level: 'raw',
                            volumePerQuantity: 0.3,
                            massPerQuantity: 1,
                        },
                        quantity: 50,
                        id: 'res1',
                        tenantAgentId: null,
                        tenantCostInCoins: 0,
                        costPerTick: 0,
                        claimStatus: 'active' as const,
                        noticePeriodEndsAtTick: null,
                        pausedSinceTick: null,
                        regenerationRate: 20,
                        maximumCapacity: 60,
                    },
                ],
            },
        });

        environmentTick(planet);

        const entry = planet.resources.iron[0];
        // regenerationRate = 20, capacity left = 10 -> should increase by 10 to reach 60
        expect(entry.quantity).toBe(60);

        // running again should not exceed maximumCapacity
        environmentTick(planet);
        expect(planet.resources.iron[0].quantity).toBe(60);
    });
});
