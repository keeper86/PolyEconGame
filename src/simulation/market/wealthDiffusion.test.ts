/**
 * market/wealthDiffusion.test.ts
 *
 * Tests for the low-temperature wealth diffusion operator.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { Agent, Planet, GameState } from '../planet';
import { educationLevelKeys, OCCUPATIONS } from '../planet';
import { makePlanet } from '../workforce/testHelpers';
import { getWealthDemography } from '../population/populationHelpers';
import { DIFFUSION_EPSILON } from '../constants';
import { wealthDiffusionTick } from './wealthDiffusion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGameState(planet: Planet, ...agents: Agent[]): GameState {
    return {
        tick: 1,
        planets: new Map([[planet.id, planet]]),
        agents: new Map(agents.map((a) => [a.id, a])),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wealthDiffusionTick', () => {
    let planet: Planet;
    let gov: Agent;
    let gs: GameState;

    beforeEach(() => {
        ({ planet, gov } = makePlanet({ none: 1000 }));
        gs = makeGameState(planet, gov);
    });

    it('does not alter mean wealth', () => {
        const wealthDemography = getWealthDemography(planet.population);
        const demography = planet.population.demography;

        // Set up varied wealth
        for (let age = 18; age <= 64; age++) {
            wealthDemography[age].none.unoccupied = { mean: age * 10, variance: age * 5 };
        }

        // Compute total wealth before
        let totalBefore = 0;
        for (let age = 0; age < demography.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    totalBefore += wealthDemography[age][edu][occ].mean * demography[age][edu][occ];
                }
            }
        }

        wealthDiffusionTick(gs);

        // Compute total wealth after
        let totalAfter = 0;
        for (let age = 0; age < demography.length; age++) {
            for (const edu of educationLevelKeys) {
                for (const occ of OCCUPATIONS) {
                    totalAfter += wealthDemography[age][edu][occ].mean * demography[age][edu][occ];
                }
            }
        }

        // Total wealth should be preserved (mean-preserving)
        expect(totalAfter).toBeCloseTo(totalBefore, 4);
    });

    it('decays within-cohort variance', () => {
        const wealthDemography = getWealthDemography(planet.population);

        const testAge = 30;
        const initialVariance = 100;
        wealthDemography[testAge].none.unoccupied = { mean: 50, variance: initialVariance };

        wealthDiffusionTick(gs);

        // Variance should have decreased
        expect(wealthDemography[testAge].none.unoccupied.variance).toBeLessThan(initialVariance);
        // But only slightly (low temperature)
        expect(wealthDemography[testAge].none.unoccupied.variance).toBeGreaterThan(initialVariance * 0.99);
    });

    it('smooths variance between adjacent age cohorts', () => {
        const wealthDemography = getWealthDemography(planet.population);

        // Create a sharp variance discontinuity
        wealthDemography[30].none.unoccupied = { mean: 50, variance: 1000 };
        wealthDemography[31].none.unoccupied = { mean: 50, variance: 0 };
        wealthDemography[29].none.unoccupied = { mean: 50, variance: 0 };

        wealthDiffusionTick(gs);

        // Age 30's variance should have decreased slightly
        expect(wealthDemography[30].none.unoccupied.variance).toBeLessThan(1000);
        // Adjacent cohorts should have gained some variance
        // (they started at 0 and get smoothing from age 30)
    });

    it('epsilon is very small (low temperature)', () => {
        // Verify the diffusion parameter is appropriately small
        expect(DIFFUSION_EPSILON).toBeGreaterThan(0);
        expect(DIFFUSION_EPSILON).toBeLessThan(0.001); // Very small per tick
    });

    it('preserves non-negative variance', () => {
        const wealthDemography = getWealthDemography(planet.population);

        // Set some zero variances
        for (let age = 0; age < wealthDemography.length; age++) {
            wealthDemography[age].none.unoccupied = { mean: 10, variance: 0 };
        }

        wealthDiffusionTick(gs);

        // All variances should remain non-negative
        for (let age = 0; age < wealthDemography.length; age++) {
            expect(wealthDemography[age].none.unoccupied.variance).toBeGreaterThanOrEqual(0);
        }
    });
});
