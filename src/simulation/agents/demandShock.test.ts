import { describe, expect, it } from 'vitest';

import { forEachPopulationCohort } from '../population/population';
import type { Planet } from '../planet/planet';
import { makeGameState, makePlanetWithPopulation } from '../utils/testHelper';
import { demandShockTick, setDemandShock } from './demandShock';

const totalWealth = (planet: Planet): number => {
    let sum = 0;
    for (const cohort of planet.population.demography) {
        forEachPopulationCohort(cohort, (cat) => {
            sum += cat.wealth.mean * cat.total;
        });
    }
    return sum;
};

describe('demandShockTick', () => {
    it('transfers the configured per-capita flow to every cohort inside the window', () => {
        const { planet, gov } = makePlanetWithPopulation({ none: 1_000 });
        const gameState = makeGameState([planet], [gov], 10);
        setDemandShock(10, 5, 0.5);

        const before = totalWealth(planet);
        const injected = demandShockTick(gameState, planet);

        expect(injected).toBeCloseTo(0.5 * 1_000, 6);
        expect(totalWealth(planet) - before).toBeCloseTo(injected, 6);
        expect(planet.governmentSupportVolume).toBeCloseTo(injected, 6);
        expect(planet.bank.householdDeposits).toBeCloseTo(injected, 6);
    });

    it('does nothing outside the window', () => {
        const { planet, gov } = makePlanetWithPopulation({ none: 1_000 });
        const gameState = makeGameState([planet], [gov], 20);
        setDemandShock(10, 5, 0.5);

        expect(demandShockTick(gameState, planet)).toBe(0);
        expect(totalWealth(planet)).toBe(0);
    });

    it('funds the transfer with a government loan', () => {
        const { planet, gov } = makePlanetWithPopulation({ none: 1_000 });
        const gameState = makeGameState([planet], [gov], 10);
        setDemandShock(10, 5, 0.5);

        demandShockTick(gameState, planet);

        const govAssets = gov.assets[planet.id]!;
        expect(govAssets.activeLoans.length).toBeGreaterThan(0);
        expect(planet.bank.loans).toBeGreaterThan(0);
        expect(govAssets.deposits).toBeGreaterThanOrEqual(0);
    });
});
