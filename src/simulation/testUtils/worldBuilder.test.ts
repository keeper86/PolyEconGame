/**
 * simulation/testUtils/worldBuilder.test.ts
 *
 * Tests for the centralized WorldBuilder utility.
 */

import { describe, it, expect } from 'vitest';
import { WorldBuilder } from './worldBuilder';

describe('WorldBuilder', () => {
    it('builds a minimal world with defaults', () => {
        const { gameState, planet, agents } = new WorldBuilder().build();

        expect(gameState.tick).toBe(0);
        expect(planet.id).toBe('p');
        expect(planet.name).toBe('Test Planet');
        expect(planet.governmentId).toBe('gov-1');
        expect(planet.bank.deposits).toBe(0);
        // Government agent is always created
        expect(agents).toHaveLength(1);
        expect(agents[0].id).toBe('gov-1');
        expect(gameState.agents.size).toBe(1);
        expect(gameState.planets.size).toBe(1);
    });

    it('allows overriding planet id and name', () => {
        const { planet } = new WorldBuilder()
            .withPlanet({ id: 'earth', name: 'Earth' })
            .build();

        expect(planet.id).toBe('earth');
        expect(planet.name).toBe('Earth');
    });

    it('creates population spread across working ages', () => {
        const { planet } = new WorldBuilder()
            .withPlanet({ populationSize: 1000 })
            .build();

        let total = 0;
        for (const cohort of planet.population.demography) {
            total += cohort.none.unoccupied;
        }
        expect(total).toBe(1000);

        // Under-18 and over-64 cohorts should have no unoccupied
        for (let age = 0; age < 18; age++) {
            expect(planet.population.demography[age].none.unoccupied).toBe(0);
        }
    });

    it('applies pollution overrides', () => {
        const { planet } = new WorldBuilder()
            .withPlanet({ pollution: { air: 50, water: 10 } })
            .build();

        expect(planet.environment.pollution.air).toBe(50);
        expect(planet.environment.pollution.water).toBe(10);
        expect(planet.environment.pollution.soil).toBe(0); // default
    });

    it('applies regeneration rate overrides', () => {
        const { planet } = new WorldBuilder()
            .withPlanet({
                regenerationRates: {
                    air: { constant: 5, percentage: 0.1 },
                },
            })
            .build();

        expect(planet.environment.regenerationRates.air.constant).toBe(5);
        expect(planet.environment.regenerationRates.air.percentage).toBe(0.1);
    });

    it('adds agents with default configuration', () => {
        const { agents, gameState } = new WorldBuilder()
            .withAgent('company-1')
            .withAgent('company-2')
            .build();

        // gov-1 + 2 companies
        expect(agents).toHaveLength(3);
        expect(gameState.agents.has('company-1')).toBe(true);
        expect(gameState.agents.has('company-2')).toBe(true);
    });

    it('adds agents with custom options', () => {
        const { agents } = new WorldBuilder()
            .withAgent({ id: 'rich-co', wealth: 5000, allocatedWorkers: { none: 100 } })
            .build();

        const agent = agents.find((a) => a.id === 'rich-co')!;
        expect(agent.wealth).toBe(5000);
        expect(agent.assets.p.allocatedWorkers.none).toBe(100);
    });

    it('agents get workforceDemography by default', () => {
        const { agents } = new WorldBuilder()
            .withAgent('company-1')
            .build();

        const agent = agents.find((a) => a.id === 'company-1')!;
        expect(agent.assets.p.workforceDemography).toBeDefined();
    });

    it('can disable workforceDemography', () => {
        const { agents } = new WorldBuilder()
            .withAgent({ id: 'simple', withWorkforce: false })
            .build();

        const agent = agents.find((a) => a.id === 'simple')!;
        expect(agent.assets.p.workforceDemography).toBeUndefined();
    });

    it('sets the starting tick', () => {
        const { gameState } = new WorldBuilder()
            .atTick(42)
            .build();

        expect(gameState.tick).toBe(42);
    });

    it('planet is present in gameState.planets', () => {
        const { gameState, planet } = new WorldBuilder()
            .withPlanet({ id: 'mars' })
            .build();

        expect(gameState.planets.get('mars')).toBe(planet);
    });

    it('government agent is associated with the planet', () => {
        const { agents, planet } = new WorldBuilder()
            .withPlanet({ id: 'earth', governmentId: 'earth-gov' })
            .build();

        const gov = agents.find((a) => a.id === 'earth-gov')!;
        expect(gov.associatedPlanetId).toBe('earth');
        expect(planet.governmentId).toBe('earth-gov');
    });
});
