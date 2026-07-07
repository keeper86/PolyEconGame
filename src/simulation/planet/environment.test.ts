import { describe, expect, it } from 'vitest';
import { makeEnvironment, makeGovernmentAgent, makePlanet } from '../utils/testHelper';
import { environmentTick } from './environment';
import { makePool } from '../initialUniverse/resourceClaimFactory';

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

        expect(planet.environment.pollution.air).toBeCloseTo(40);

        expect(planet.environment.pollution.water).toBeCloseTo(3);

        expect(planet.environment.pollution.soil).toBe(0);
    });

    it('regenerates resources up to maximumCapacity and does not exceed it', () => {
        const gov = makeGovernmentAgent();
        const planet = makePlanet({
            id: 'p2',
            governmentId: gov.id,
            resources: {
                iron: {
                    pool: makePool({ type: { name: 'Iron', form: 'solid', level: 'raw', volumePerQuantity: 0.3, massPerQuantity: 1 } as any, quantity: 0, renewable: true }),
                    claims: [
                        {
                            resource: {
                                name: 'Iron',
                                form: 'solid',
                                level: 'raw',
                                volumePerQuantity: 0.3,
                                massPerQuantity: 1,
                            } as any,
                            quantity: 50,
                            id: 'res1',
                            tenantAgentId: 'gov',
                            tenantCostInCoins: 0,
                            costPerTick: 0,
                            claimStatus: 'active' as const,
                            noticePeriodEndsAtTick: null,
                            pausedTicksThisYear: 0,
                            regenerationRate: 20,
                            maximumCapacity: 60,
                        },
                    ],
                },
            },
        });

        environmentTick(planet);

        const entry = planet.resources.iron.claims[0];

        expect(entry.quantity).toBe(60);

        environmentTick(planet);
        expect(planet.resources.iron.claims[0].quantity).toBe(60);
    });
});