/**
 * population/retirement.test.ts
 *
 * Unit tests for the population-driven retirement sub-system:
 * age-dependent probability, and population-level retirement orchestration.
 */

import { describe, expect, it } from 'vitest';
import { RETIREMENT_AGE } from './retirement';
import { forEachPopulationCohort } from './population';
import { makePlanet } from '../utils/testHelper';
import { applyRetirement, perTickRetirement } from './retirement';

// ---------------------------------------------------------------------------
// perTickRetirement
// ---------------------------------------------------------------------------

describe('perTickRetirement', () => {
    it('returns 0 for ages below RETIREMENT_AGE', () => {
        expect(perTickRetirement(30)).toBe(0);
        expect(perTickRetirement(66)).toBe(0);
    });

    it('returns a small positive per-tick rate at RETIREMENT_AGE', () => {
        const rate = perTickRetirement(RETIREMENT_AGE);
        expect(rate).toBeGreaterThan(0);
        // 30% annual → small per-tick rate
        expect(rate).toBeLessThan(0.01);
    });

    it('increases with age', () => {
        expect(perTickRetirement(68)).toBeGreaterThan(perTickRetirement(67));
        expect(perTickRetirement(70)).toBeGreaterThan(perTickRetirement(68));
    });
});

// ---------------------------------------------------------------------------
// applyRetirement — population-level
// ---------------------------------------------------------------------------

describe('applyRetirement', () => {
    it('does nothing for ages below RETIREMENT_AGE', () => {
        const planet = makePlanet();
        planet.population.demography[30].employed.none.novice.total = 100;
        planet.population.demography[30].unoccupied.none.novice.total = 50;

        applyRetirement(planet);

        expect(planet.population.demography[30].employed.none.novice.total).toBe(100);
        expect(planet.population.demography[30].unoccupied.none.novice.total).toBe(50);
        expect(planet.population.demography[30].unableToWork.none.novice.total).toBe(0);
    });

    it('does not touch employed population ever', () => {
        const planet = makePlanet();
        planet.population.demography[RETIREMENT_AGE].employed.primary.novice.total = 1000;

        // Run many ticks to see nothing happen to employed population
        let totalRetired = 0;
        for (let tick = 0; tick < 360; tick++) {
            const before = planet.population.demography[RETIREMENT_AGE].employed.primary.novice.total;
            applyRetirement(planet);
            totalRetired += before - planet.population.demography[RETIREMENT_AGE].employed.primary.novice.total;
        }

        expect(totalRetired).toBe(0);
        expect(planet.population.demography[RETIREMENT_AGE].employed.primary.novice.total).toBe(1000);
    });

    it('retires unoccupied workers across education levels', () => {
        const planet = makePlanet();
        planet.population.demography[70].unoccupied.secondary.novice.total = 500;

        for (let tick = 0; tick < 360; tick++) {
            applyRetirement(planet);
        }

        expect(planet.population.demography[70].unableToWork.secondary.novice.total).toBeGreaterThan(0);
        expect(
            planet.population.demography[70].unoccupied.secondary.novice.total +
                planet.population.demography[70].unableToWork.secondary.novice.total,
        ).toBe(500);
    });

    it('does not touch unableToWork population', () => {
        const planet = makePlanet();
        planet.population.demography[70].unableToWork.none.novice.total = 50;

        applyRetirement(planet);

        expect(planet.population.demography[70].unableToWork.none.novice.total).toBe(50);
    });

    it('retires everyone at age 82+ (annual prob = 1.0) over enough ticks', () => {
        const planet = makePlanet();
        planet.population.demography[82].unoccupied.tertiary.novice.total = 100;

        for (let tick = 0; tick < 720; tick++) {
            applyRetirement(planet);
        }

        // At 100% annual rate, 2 years of ticks should retire everyone
        expect(planet.population.demography[82].unoccupied.tertiary.novice.total).toBe(0);
        expect(planet.population.demography[82].unableToWork.tertiary.novice.total).toBe(100);
    });

    it('records retirement events in countThisMonth', () => {
        const planet = makePlanet();
        planet.population.demography[70].unoccupied.none.novice.total = 1000;

        applyRetirement(planet);

        // At age 70, retirement probability is high, so there should be some retirements
        expect(planet.population.demography[70].unoccupied.none.novice.retirements.countThisMonth).toBeGreaterThan(0);
    });

    it('conserves population across all ages', () => {
        const planet = makePlanet();
        const pop = planet.population;
        // Use unoccupied and education — applyRetirement no longer touches employed
        pop.demography[30].unoccupied.none.novice.total = 5000;
        pop.demography[RETIREMENT_AGE].unoccupied.none.novice.total = 1000;
        pop.demography[70].unoccupied.primary.novice.total = 500;
        pop.demography[80].education.secondary.novice.total = 200;

        let totalBefore = 0;
        for (const cohort of pop.demography) {
            forEachPopulationCohort(cohort, (cat) => {
                totalBefore += cat.total;
            });
        }

        for (let tick = 0; tick < 360; tick++) {
            applyRetirement(planet);
        }

        let totalAfter = 0;
        for (const cohort of pop.demography) {
            forEachPopulationCohort(cohort, (cat) => {
                totalAfter += cat.total;
            });
        }

        expect(totalAfter).toBe(totalBefore);
    });
});
